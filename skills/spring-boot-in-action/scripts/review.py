#!/usr/bin/env python3
"""
review.py — Pre-analysis script for Spring Boot in Action reviews.
Usage: python review.py <file.java|application.properties|application.yml>

Scans Spring Boot source files for anti-patterns from the book:
field injection, hardcoded credentials, missing ResponseEntity, auto-config
fighting, wrong test annotations, missing Actuator security, and ddl-auto=create.
"""

import re
import sys
from pathlib import Path


JAVA_CHECKS = [
    (
        r"@Autowired\s*\n\s*(private|protected)",
        "Ch 2: Field injection (@Autowired on field)",
        "use constructor injection — fields with @Autowired are not testable without Spring context",
    ),
    (
        r"DriverManagerDataSource|BasicDataSource|HikariDataSource",
        "Ch 2/3: Manual DataSource bean",
        "delete this bean and set spring.datasource.* in application.properties — Boot auto-configures HikariCP",
    ),
    (
        r"orElse\(null\)",
        "Ch 2: orElse(null) returns null to client",
        "use .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND)) or .map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build())",
    ),
    (
        r'setPassword\s*\(\s*"[^"$][^"]*"',
        "Ch 3: Hardcoded password",
        "externalize to environment variable: spring.datasource.password=${DB_PASS}",
    ),
    (
        r'setUsername\s*\(\s*"[^"$][^"]*"',
        "Ch 3: Hardcoded username",
        "externalize to environment variable: spring.datasource.username=${DB_USER}",
    ),
    (
        r"new ObjectMapper\(\)",
        "Ch 2: Manual ObjectMapper construction",
        "Spring Boot auto-configures Jackson — inject ObjectMapper bean or configure via spring.jackson.* properties",
    ),
    (
        r"@SpringBootTest\b(?!.*WebEnvironment)",
        "Ch 4: @SpringBootTest without WebEnvironment",
        "for controller tests use @WebMvcTest; for repository tests use @DataJpaTest; full @SpringBootTest only for integration tests",
    ),
    (
        r"System\.out\.println",
        "Ch 3: System.out.println instead of logger",
        "use SLF4J: private static final Logger log = LoggerFactory.getLogger(MyClass.class)",
    ),
    (
        r'@Value\s*\(\s*"\$\{[^}]+\}"\s*\)(?:[\s\S]{0,200}@Value\s*\(\s*"\$\{){2}',
        "Ch 3: Multiple @Value annotations",
        "group related config values in a @ConfigurationProperties class with a prefix",
    ),
]

PROPERTIES_CHECKS = [
    (
        r"ddl-auto\s*=\s*(create|create-drop)(?!\s*#.*test)",
        "Ch 8: ddl-auto=create or create-drop",
        "destroys data on restart — use 'validate' in production; use Flyway/Liquibase for migrations",
    ),
    (
        r"management\.endpoints\.web\.exposure\.include\s*=\s*\*",
        "Ch 7: Actuator exposes all endpoints",
        "restrict to: management.endpoints.web.exposure.include=health,info — never expose env, beans, or shutdown publicly",
    ),
    (
        r"spring\.security\.user\.password\s*=\s*(?!(\$\{|\s*$))",
        "Ch 3: Hardcoded security password in properties",
        "use environment variable: spring.security.user.password=${ADMIN_PASS}",
    ),
    (
        r"datasource\.password\s*=\s*(?!\$\{)(\S+)",
        "Ch 3: Hardcoded datasource password",
        "use environment variable: spring.datasource.password=${DB_PASS}",
    ),
    (
        r"datasource\.url\s*=\s*jdbc:[a-z]+://(?!(\$\{|localhost|127\.0\.0\.1))\S+",
        "Ch 3: Hardcoded production datasource URL",
        "use environment variable: spring.datasource.url=${DB_URL}",
    ),
]


def scan_java(source: str) -> list[dict]:
    findings = []
    lines = source.splitlines()
    for lineno, line in enumerate(lines, start=1):
        if line.strip().startswith("//"):
            continue
        for pattern, label, advice in JAVA_CHECKS:
            if re.search(pattern, line):
                findings.append({"line": lineno, "text": line.rstrip(), "label": label, "advice": advice})
    return findings


def scan_properties(source: str) -> list[dict]:
    findings = []
    lines = source.splitlines()
    for lineno, line in enumerate(lines, start=1):
        if line.strip().startswith("#"):
            continue
        for pattern, label, advice in PROPERTIES_CHECKS:
            if re.search(pattern, line):
                findings.append({"line": lineno, "text": line.rstrip(), "label": label, "advice": advice})
    return findings


def sep(char="-", width=70) -> str:
    return char * width


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python review.py <file.java|application.properties|application.yml>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"Error: file not found: {path}")
        sys.exit(1)

    source = path.read_text(encoding="utf-8", errors="replace")

    if path.suffix == ".java":
        findings = scan_java(source)
        file_type = "Java"
    elif path.suffix in (".properties", ".yml", ".yaml"):
        findings = scan_properties(source)
        file_type = "Properties/YAML"
    else:
        print(f"Warning: unsupported extension '{path.suffix}' — scanning as Java")
        findings = scan_java(source)
        file_type = "Unknown"

    groups: dict[str, list] = {}
    for f in findings:
        groups.setdefault(f["label"], []).append(f)

    print(sep("="))
    print("SPRING BOOT IN ACTION — PRE-REVIEW REPORT")
    print(sep("="))
    print(f"File   : {path}  ({file_type})")
    print(f"Lines  : {len(source.splitlines())}")
    print(f"Issues : {len(findings)} potential anti-patterns across {len(groups)} categories")
    print()

    if not findings:
        print("  [OK] No common Spring Boot anti-patterns detected.")
        print()
    else:
        for label, items in groups.items():
            print(sep())
            print(f"  {label}  ({len(items)} occurrence{'s' if len(items) != 1 else ''})")
            print(sep())
            print(f"  Advice: {items[0]['advice']}")
            print()
            for item in items[:5]:
                print(f"  line {item['line']:>4}:  {item['text'][:100]}")
            if len(items) > 5:
                print(f"  ... and {len(items) - 5} more")
            print()

    severity = (
        "HIGH" if len(findings) >= 5
        else "MEDIUM" if len(findings) >= 2
        else "LOW" if findings
        else "NONE"
    )
    print(sep("="))
    print(f"SEVERITY: {severity}  |  Key chapters: Ch 2 (injection/REST), Ch 3 (config/profiles), Ch 4 (testing), Ch 7 (Actuator), Ch 8 (deployment)")
    print(sep("="))


if __name__ == "__main__":
    main()
