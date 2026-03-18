# Spring Boot in Action — Practices Catalog

Before/after examples from each chapter group.

---

## Auto-Configuration: Let Boot Do Its Job (Ch 2, 3)

**Before — manual DataSource fighting auto-config:**
```java
@Configuration
public class DatabaseConfig {
    @Bean
    public DataSource dataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setUrl("jdbc:postgresql://localhost/mydb");
        ds.setUsername("user");
        ds.setPassword("pass");
        return ds;
    }
}
```
**After — delete the class; use properties:**
```properties
spring.datasource.url=jdbc:postgresql://localhost/mydb
spring.datasource.username=${DB_USER}
spring.datasource.password=${DB_PASS}
```
Spring Boot auto-configures a connection pool (HikariCP) from these properties automatically.

---

## Overriding Auto-Configuration Surgically (Ch 3)

**When auto-config is not enough — extend, don't replace:**
```java
// Wrong: replaces all security auto-config
@Configuration
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.authorizeRequests().anyRequest().permitAll();  // disables everything
    }
}

// Right: override only what differs (Ch 3)
@Configuration
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
            .authorizeRequests()
                .antMatchers("/api/public/**").permitAll()
                .anyRequest().authenticated()
            .and()
            .httpBasic();
    }
}
```

---

## Externalized Configuration (Ch 3)

**Before — hardcoded values:**
```java
@Service
public class MailService {
    private String host = "smtp.gmail.com";   // hardcoded
    private int port = 587;                    // hardcoded
    private int timeout = 5000;               // hardcoded
}
```
**After — `@ConfigurationProperties` (type-safe, testable):**
```java
@ConfigurationProperties(prefix = "app.mail")
@Component
public class MailProperties {
    private String host;
    private int port = 587;
    private int timeoutMs = 5000;
    // getters + setters
}
```
```properties
# application.properties
app.mail.host=smtp.gmail.com
app.mail.port=587
app.mail.timeout-ms=5000
```

---

## Profiles for Environment Differences (Ch 3)

**Before — environment check in code:**
```java
@Bean
public DataSource dataSource() {
    if (System.getProperty("env").equals("dev")) {
        return new EmbeddedDatabaseBuilder().setType(H2).build();
    }
    return productionDataSource();  // messy
}
```
**After — profile-specific properties files:**
```properties
# application.properties (defaults)
spring.datasource.url=jdbc:postgresql://${DB_HOST:localhost}/myapp

# application-dev.properties (activated by: spring.profiles.active=dev)
spring.datasource.url=jdbc:h2:mem:myapp
spring.jpa.hibernate.ddl-auto=create-drop
logging.level.org.springframework=DEBUG

# application-production.properties
spring.jpa.hibernate.ddl-auto=validate
logging.level.root=WARN
```
```java
// Profile-specific beans (Ch 3)
@Bean
@Profile("dev")
public DataSource devDataSource() { ... }

@Bean
@Profile("production")
public DataSource prodDataSource() { ... }
```

---

## Constructor Injection (Ch 2)

**Before — field injection, untestable:**
```java
@Service
public class OrderService {
    @Autowired
    private OrderRepository repo;  // can't test without Spring context

    @Autowired
    private PaymentGateway gateway;
}
```
**After — constructor injection:**
```java
@Service
public class OrderService {
    private final OrderRepository repo;
    private final PaymentGateway gateway;

    public OrderService(OrderRepository repo, PaymentGateway gateway) {
        this.repo = repo;
        this.gateway = gateway;
    }
    // Now testable: new OrderService(mockRepo, mockGateway)
}
```

---

## REST Controllers: Status Codes & ResponseEntity (Ch 2)

**Before — always 200, null on missing:**
```java
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id) {
    return repo.findById(id).orElse(null);  // 200 with null body
}

@PostMapping("/users")
public User createUser(@RequestBody User user) {
    return repo.save(user);  // 200, should be 201
}
```
**After — correct HTTP semantics:**
```java
@GetMapping("/users/{id}")
public ResponseEntity<User> getUser(@PathVariable Long id) {
    return repo.findById(id)
               .map(ResponseEntity::ok)
               .orElse(ResponseEntity.notFound().build());  // 404
}

@PostMapping("/users")
public ResponseEntity<User> createUser(@RequestBody User user) {
    User saved = repo.save(user);
    URI location = URI.create("/users/" + saved.getId());
    return ResponseEntity.created(location).body(saved);  // 201 + Location
}
```

---

## Testing: Match Slice to Layer (Ch 4)

**Before — full context for every test (slow):**
```java
@SpringBootTest  // loads ALL beans — overkill for a controller test
public class ProductControllerTest {
    @Autowired
    private ProductController controller;

    @Test
    public void testGet() {
        // No HTTP semantics, no status code, no content-type testing
        assertNotNull(controller.getProduct(1L));
    }
}
```
**After — slice tests by layer:**
```java
// Controller slice — only web layer, MockMvc, no DB (Ch 4)
@WebMvcTest(ProductController.class)
public class ProductControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ProductService service;

    @Test
    void getProduct_found() throws Exception {
        given(service.findById(1L)).willReturn(new Product(1L, "Widget", 9.99));

        mockMvc.perform(get("/api/products/1").accept(MediaType.APPLICATION_JSON))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.name").value("Widget"))
               .andExpect(jsonPath("$.price").value(9.99));
    }

    @Test
    void getProduct_notFound() throws Exception {
        given(service.findById(99L))
            .willThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));

        mockMvc.perform(get("/api/products/99"))
               .andExpect(status().isNotFound());
    }
}

// Repository slice — real DB (H2 in-memory), no web layer (Ch 4)
@DataJpaTest
public class ProductRepositoryTest {
    @Autowired
    private ProductRepository repo;

    @Test
    void findByName_returnsMatches() {
        repo.save(new Product(null, "Blue Widget", 9.99));
        List<Product> found = repo.findByNameContaining("Widget");
        assertThat(found).hasSize(1);
    }
}

// Full stack test — only when testing HTTP ↔ DB integration (Ch 4)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class ProductIntegrationTest {
    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void createAndFetch() {
        ResponseEntity<Product> created = restTemplate
            .postForEntity("/api/products", new Product(null, "Gadget", 19.99), Product.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }
}
```

---

## Testing Security (Ch 4)

```java
@WebMvcTest(AdminController.class)
public class AdminControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void adminEndpoint_rejectsAnonymous() throws Exception {
        mockMvc.perform(get("/admin/dashboard"))
               .andExpect(status().isUnauthorized());  // or 403 depending on config
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminEndpoint_allowsAdmin() throws Exception {
        mockMvc.perform(get("/admin/dashboard"))
               .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    void adminEndpoint_rejectsUser() throws Exception {
        mockMvc.perform(get("/admin/dashboard"))
               .andExpect(status().isForbidden());
    }
}
```

---

## Actuator: Health, Metrics, Custom Indicators (Ch 7)

```java
// Custom HealthIndicator (Ch 7)
@Component
public class ExternalApiHealthIndicator implements HealthIndicator {
    private final RestTemplate restTemplate;

    public ExternalApiHealthIndicator(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public Health health() {
        try {
            ResponseEntity<String> resp = restTemplate.getForEntity(
                "https://api.partner.com/health", String.class);
            if (resp.getStatusCode().is2xxSuccessful()) {
                return Health.up().withDetail("partner-api", "reachable").build();
            }
            return Health.down().withDetail("status", resp.getStatusCode()).build();
        } catch (Exception e) {
            return Health.down(e).build();
        }
    }
}

// Custom counter metric (Ch 7)
@Service
public class OrderService {
    private final Counter ordersCreated;

    public OrderService(MeterRegistry registry) {
        this.ordersCreated = Counter.builder("orders.created")
            .description("Total orders placed")
            .register(registry);
    }

    public Order place(Order order) {
        Order saved = repo.save(order);
        ordersCreated.increment();  // visible in /actuator/metrics
        return saved;
    }
}
```

```properties
# Secure Actuator — expose only what's needed (Ch 7)
management.endpoints.web.exposure.include=health,info,metrics
management.endpoint.health.show-details=when-authorized
management.endpoint.shutdown.enabled=false
```

---

## Deployment: JAR, Profiles, Flyway (Ch 8)

```xml
<!-- pom.xml: flyway for production migrations (Ch 8) -->
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
</dependency>
```

```sql
-- src/main/resources/db/migration/V1__create_books.sql
CREATE TABLE book (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    isbn VARCHAR(20) UNIQUE NOT NULL
);
```

```properties
# application-production.properties (Ch 8)
# Never use create or create-drop in production
spring.jpa.hibernate.ddl-auto=validate
spring.flyway.enabled=true

# Disable dev tools
spring.devtools.restart.enabled=false

# Tighten logging
logging.level.root=WARN
logging.level.com.example=INFO

# Actuator: health only
management.endpoints.web.exposure.include=health
management.endpoint.health.show-details=never
```

```bash
# Build and run (Ch 8)
mvn clean package -DskipTests
java -jar target/library-1.0.0.jar --spring.profiles.active=production
```
