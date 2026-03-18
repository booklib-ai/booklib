# After: Spring Boot in Action

The same library API rewritten with idiomatic Spring Boot — auto-configuration, constructor injection, externalized config, profiles, proper testing, and Actuator.

```java
// @SpringBootApplication enables auto-config, component scan, config (Ch 1, 2)
@SpringBootApplication
public class LibraryApp {
    public static void main(String[] args) {
        SpringApplication.run(LibraryApp.class, args);
    }
}

// No DatabaseConfig class needed — auto-configuration handles DataSource (Ch 2, 3)
// Credentials externalized to application.properties via environment variables

// Constructor injection — testable without Spring context (Ch 2)
@RestController
@RequestMapping("/api/books")
public class BookController {
    private final BookService service;

    public BookController(BookService service) {
        this.service = service;
    }

    // Returns 404 when not found, not null (Ch 2)
    @GetMapping("/{id}")
    public ResponseEntity<Book> getBook(@PathVariable Long id) {
        return ResponseEntity.ok(service.findById(id));
    }

    // Returns 201 Created with Location header (Ch 2)
    @PostMapping
    public ResponseEntity<Book> createBook(@RequestBody Book book) {
        Book saved = service.save(book);
        URI location = URI.create("/api/books/" + saved.getId());
        return ResponseEntity.created(location).body(saved);
    }

    @GetMapping
    public List<Book> search(@RequestParam(required = false, defaultValue = "") String q) {
        return service.search(q);
    }
}

// Service with constructor injection and proper logging (Ch 2)
@Service
public class BookService {
    private static final Logger log = LoggerFactory.getLogger(BookService.class);
    private final BookRepository repo;

    public BookService(BookRepository repo) {
        this.repo = repo;
    }

    public Book findById(Long id) {
        // Optional — 404 automatically surfaced (Ch 2)
        return repo.findById(id)
                   .orElseThrow(() -> new ResponseStatusException(
                       HttpStatus.NOT_FOUND, "Book " + id + " not found"));
    }

    public Book save(Book book) {
        return repo.save(book);
    }

    public List<Book> search(String query) {
        log.debug("Searching for: {}", query);  // proper logger, not println (Ch 3)
        return query.isBlank()
                ? repo.findAll()
                : repo.findByTitleContainingIgnoreCase(query);
    }
}

// Repository — Spring Data does the rest (Ch 2)
public interface BookRepository extends JpaRepository<Book, Long> {
    List<Book> findByTitleContainingIgnoreCase(String title);
}

// Type-safe configuration object (Ch 3)
@ConfigurationProperties(prefix = "app.library")
@Component
public class LibraryProperties {
    private int maxSearchResults = 50;
    private String defaultSortField = "title";
    // getters + setters
}

// Custom health indicator for critical dependency (Ch 7)
@Component
public class StorageHealthIndicator implements HealthIndicator {
    private final BookRepository repo;
    public StorageHealthIndicator(BookRepository repo) { this.repo = repo; }

    @Override
    public Health health() {
        try {
            long count = repo.count();
            return Health.up().withDetail("books", count).build();
        } catch (Exception e) {
            return Health.down().withDetail("error", e.getMessage()).build();
        }
    }
}

// Controller slice test — no full context, fast (Ch 4)
@WebMvcTest(BookController.class)
public class BookControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BookService service;  // real service replaced with mock (Ch 4)

    @Test
    void getBook_returnsOk() throws Exception {
        Book book = new Book(1L, "Spring Boot in Action", "9781617292545");
        given(service.findById(1L)).willReturn(book);

        mockMvc.perform(get("/api/books/1"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.title").value("Spring Boot in Action"));
    }

    @Test
    void getBook_returns404WhenNotFound() throws Exception {
        given(service.findById(99L))
            .willThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));

        mockMvc.perform(get("/api/books/99"))
               .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(roles = "USER")
    void createBook_returns201() throws Exception {
        Book book = new Book(null, "New Book", "1234567890");
        Book saved = new Book(1L, "New Book", "1234567890");
        given(service.save(any())).willReturn(saved);

        mockMvc.perform(post("/api/books")
                   .contentType(MediaType.APPLICATION_JSON)
                   .content("{\"title\":\"New Book\",\"isbn\":\"1234567890\"}"))
               .andExpect(status().isCreated())
               .andExpect(header().string("Location", "/api/books/1"));
    }
}
```

```properties
# application.properties — base config, all env-specific values externalized (Ch 3)
spring.datasource.url=${DB_URL:jdbc:h2:mem:library}
spring.datasource.username=${DB_USER:sa}
spring.datasource.password=${DB_PASS:}
spring.jpa.hibernate.ddl-auto=validate

# Actuator — health and info only exposed publicly (Ch 7)
management.endpoints.web.exposure.include=health,info
management.endpoint.health.show-details=when-authorized

# application-dev.properties — dev overrides (Ch 3)
# spring.datasource.url=jdbc:h2:mem:library
# spring.jpa.hibernate.ddl-auto=create-drop
# logging.level.com.example=DEBUG
# management.endpoints.web.exposure.include=*

# application-production.properties — production hardening (Ch 8)
# spring.jpa.hibernate.ddl-auto=validate
# logging.level.root=WARN
# management.endpoints.web.exposure.include=health,info
```

**Key improvements:**
- `@SpringBootApplication` enables auto-configuration — no manual `DataSource` bean (Ch 2)
- Credentials externalized to env vars via `${DB_URL}` — never hardcoded (Ch 3)
- Constructor injection throughout — testable without Spring context (Ch 2)
- `ResponseEntity` with correct status codes: 200, 201, 404 (Ch 2)
- `Optional` → `orElseThrow` → `ResponseStatusException` — clean 404 (Ch 2)
- `@ConfigurationProperties` for grouped app config (Ch 3)
- `@WebMvcTest` + `@MockBean` — fast, isolated controller tests (Ch 4)
- `@WithMockUser` — security tested explicitly (Ch 4)
- Custom `HealthIndicator` — DB health visible in Actuator (Ch 7)
- Actuator locked down — only `health` and `info` public (Ch 7)
- Profile-based properties — no env checks in code (Ch 3, 8)
