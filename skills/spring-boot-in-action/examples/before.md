# Before: Spring Boot in Action

A book library REST API with common Spring Boot anti-patterns — manual configuration fighting auto-config, field injection, hardcoded values, missing tests, and no Actuator.

```java
// Main class missing @SpringBootApplication — won't auto-configure anything
@Configuration
@ComponentScan
public class LibraryApp {
    public static void main(String[] args) {
        SpringApplication.run(LibraryApp.class, args);
    }
}

// Manual DataSource bean — fights auto-configuration (Ch 2, 3)
@Configuration
public class DatabaseConfig {
    @Bean
    public DataSource dataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.postgresql.Driver");
        ds.setUrl("jdbc:postgresql://localhost/library");  // hardcoded (Ch 3)
        ds.setUsername("admin");                           // hardcoded credential!
        ds.setPassword("secret123");                       // hardcoded credential!
        return ds;
    }
}

// Field injection — untestable without Spring context (Ch 2)
@RestController
public class BookController {
    @Autowired
    private BookRepository bookRepository;

    @Autowired
    private BookService bookService;

    // Returns null instead of 404 when book not found (Ch 2)
    @GetMapping("/books/{id}")
    public Book getBook(@PathVariable Long id) {
        return bookRepository.findById(id).orElse(null);  // null slips to client
    }

    // No status code — always returns 200 even on create (Ch 2)
    @PostMapping("/books")
    @ResponseBody
    public Book createBook(@RequestBody Book book) {
        return bookRepository.save(book);
    }
}

// Service with field injection and no error handling
@Service
public class BookService {
    @Autowired
    private BookRepository bookRepository;

    public List<Book> search(String query) {
        // Environment check in code instead of using profiles (Ch 3)
        if (System.getProperty("env").equals("dev")) {
            System.out.println("Searching for: " + query);  // println not logger
        }
        return bookRepository.findAll();  // returns everything, ignores query
    }
}

// Test that boots full context just to test one controller method (Ch 4)
@SpringBootTest
public class BookControllerTest {
    @Autowired
    private BookController controller;

    @Test
    public void testGetBook() {
        // Direct controller call — no HTTP semantics, no status code testing
        Book result = controller.getBook(1L);
        assertNotNull(result);
    }
}

// application.properties — missing externalized config
// (no datasource url, credentials baked into Java code above)
// spring.jpa.hibernate.ddl-auto=create  // destroys data on restart!
```
