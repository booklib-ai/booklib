# Skill Catalog

All 19 skills in the `@booklib/skills` library with routing metadata.

## animation-at-work
- **Source:** *Animation at Work* by Rachel Nabors
- **Domain:** Web animation, UI motion design
- **Language:** CSS, JavaScript, any frontend
- **Trigger keywords:** "animation", "motion", "transition", "keyframe", "easing", "12 principles of animation", "web animation", "CSS animation", "performance of animation"
- **Anti-triggers:** Backend code, data processing, non-visual concerns
- **Works well with:** refactoring-ui (visual design context)
- **Conflicts with:** None (niche domain)

## clean-code-reviewer
- **Source:** *Clean Code* by Robert C. Martin
- **Domain:** Code quality, readability, maintainability
- **Language:** Language-agnostic (Java, Python, Kotlin, JavaScript examples used)
- **Trigger keywords:** "review my code", "code quality", "readable", "clean up", "refactor", "naming", "functions", "comments", "smells"
- **Anti-triggers:** Architecture design (too high-level), language-specific idioms (use language-specific skill instead)
- **Works well with:** effective-java, effective-python, effective-kotlin (clean code first, then language idioms)
- **Conflicts with:** domain-driven-design (Clean Code's "small functions" vs DDD's "rich models" — clean code wins for code review, DDD wins for model design)

## data-intensive-patterns
- **Source:** *Designing Data-Intensive Applications* by Martin Kleppmann
- **Domain:** Storage engines, replication, partitioning, distributed systems, transactions, consistency
- **Language:** Language-agnostic (systems-level)
- **Trigger keywords:** "replication", "partitioning", "consistency", "CAP theorem", "event sourcing internals", "storage engine", "LSM tree", "B-tree", "distributed transactions", "ACID", "BASE", "linearizability"
- **Anti-triggers:** Application-level code quality, UI, domain modeling
- **Works well with:** system-design-interview (data layer + high-level architecture)
- **Conflicts with:** system-design-interview (data-intensive-patterns is deeper/lower-level; use it for internals, system-design-interview for high-level)

## data-pipelines
- **Source:** *Data Pipelines Pocket Reference* by James Densmore
- **Domain:** Data ingestion, ETL, streaming, pipeline orchestration
- **Language:** Python, SQL, any data engineering stack
- **Trigger keywords:** "data pipeline", "ETL", "ELT", "ingestion", "Airflow", "dbt", "Spark", "streaming pipeline", "batch processing", "data warehouse", "orchestration"
- **Anti-triggers:** Application code unrelated to data movement, real-time microservices
- **Works well with:** data-intensive-patterns (pipeline + storage), effective-python (Python data code)
- **Conflicts with:** microservices-patterns (pipeline orchestration ≠ service decomposition)

## design-patterns
- **Source:** *Head First Design Patterns* by Freeman & Robson (GoF patterns)
- **Domain:** Object-oriented design patterns (creational, structural, behavioral)
- **Language:** Java primarily, but pattern-agnostic
- **Trigger keywords:** "design pattern", "factory", "singleton", "observer", "strategy", "decorator", "facade", "command", "template method", "composite", "adapter", "proxy", "iterator", "state"
- **Anti-triggers:** Functional programming (patterns don't apply the same way), microservices decomposition
- **Works well with:** clean-code-reviewer (patterns + readability), effective-java (Java idioms + patterns)
- **Conflicts with:** domain-driven-design (GoF patterns are structural; DDD patterns are domain-driven — use DDD for domain modeling, GoF for implementation structure)

## domain-driven-design
- **Source:** *Domain-Driven Design* by Eric Evans
- **Domain:** Domain modeling, tactical patterns (Entities, Value Objects, Aggregates, Repositories), strategic patterns (Bounded Contexts, Context Maps, ACL)
- **Language:** Language-agnostic (OO languages)
- **Trigger keywords:** "DDD", "domain model", "aggregate", "value object", "bounded context", "ubiquitous language", "repository pattern", "domain service", "anticorruption layer", "entity", "anemic domain model", "primitive obsession"
- **Anti-triggers:** Simple CRUD without domain complexity, microservices infrastructure concerns, code quality review
- **Works well with:** microservices-patterns (domain model + service boundaries), clean-code-reviewer (model + code quality)
- **Conflicts with:** clean-code-reviewer (rich models vs small functions — DDD wins for model design; clean code wins for code review)

## effective-java
- **Source:** *Effective Java* (3rd Edition) by Joshua Bloch
- **Domain:** Java best practices and idioms
- **Language:** Java only
- **Trigger keywords:** "effective java", "java best practices", "generics", "enums", "lambdas", "streams", "builders", "serialization", "java concurrency", "checked exceptions", "java item"
- **Anti-triggers:** Non-Java code, architecture concerns, domain modeling
- **Works well with:** clean-code-reviewer (Java idioms + code quality), design-patterns (Java implementation of patterns)
- **Conflicts with:** clean-code-reviewer (both review Java but from different angles — use effective-java for Java-specific items, clean-code-reviewer for general readability)

## effective-kotlin
- **Source:** *Effective Kotlin* (2nd Edition) by Marcin Moskała
- **Domain:** Kotlin best practices, safety, readability
- **Language:** Kotlin only
- **Trigger keywords:** "effective kotlin", "kotlin best practices", "kotlin safety", "null safety", "extension functions best practices", "kotlin idioms", "kotlin item"
- **Anti-triggers:** Non-Kotlin code, architecture concerns
- **Works well with:** kotlin-in-action (best practices + language features), clean-code-reviewer (Kotlin idioms + readability)
- **Conflicts with:** kotlin-in-action (effective-kotlin for best practices; kotlin-in-action for language learning — if user knows Kotlin and wants advice, use effective-kotlin)

## effective-typescript
- **Source:** *Effective TypeScript* by Dan Vanderkam
- **Domain:** TypeScript best practices, type system, type design, any, migration
- **Language:** TypeScript only
- **Trigger keywords:** "effective typescript", "typescript best practices", "type safety", "any type", "type assertions", "type design", "strict mode", "typescript review", "migrate to typescript", "unknown vs any", "type declarations", "tagged union", "branded types", "typescript item"
- **Anti-triggers:** Non-TypeScript code, plain JavaScript without types, architecture concerns
- **Works well with:** clean-code-reviewer (TypeScript idioms + readability), design-patterns (type-safe pattern implementations)
- **Conflicts with:** clean-code-reviewer (effective-typescript wins for TypeScript-specific type system concerns; clean-code-reviewer for general readability)

## programming-with-rust
- **Source:** *Programming with Rust* by Donis Marshall
- **Domain:** Rust language, ownership, borrowing, lifetimes, error handling, traits, concurrency
- **Language:** Rust only
- **Trigger keywords:** "rust", "ownership", "borrow checker", "lifetimes", "Result", "Option", "traits", "fearless concurrency", "cargo", "crate", "unwrap", "move semantics", "Arc", "Mutex", "pattern matching rust", ".rs"
- **Anti-triggers:** Non-Rust code, architecture concerns, domain modeling
- **Works well with:** clean-code-reviewer (Rust idioms + readability), design-patterns (Rust implementation of patterns)
- **Conflicts with:** clean-code-reviewer (programming-with-rust wins for Rust-specific concerns like ownership, lifetimes, and the borrow checker)

## effective-python
- **Source:** *Effective Python* (2nd Edition) by Brett Slatkin
- **Domain:** Python best practices, Pythonic idioms
- **Language:** Python only
- **Trigger keywords:** "effective python", "pythonic", "python best practices", "python idioms", "comprehensions", "generators", "decorators", "metaclasses", "python item"
- **Anti-triggers:** Non-Python code, async Python (use using-asyncio-python instead)
- **Works well with:** clean-code-reviewer (Pythonic + readable), using-asyncio-python (general Python + async)
- **Conflicts with:** using-asyncio-python (using-asyncio-python wins for async topics)

## kotlin-in-action
- **Source:** *Kotlin in Action* (2nd Edition)
- **Domain:** Kotlin language features, learning Kotlin
- **Language:** Kotlin only
- **Trigger keywords:** "kotlin in action", "learn kotlin", "kotlin coroutines", "kotlin lambdas", "kotlin classes", "kotlin functions", "kotlin nullability", "how does kotlin"
- **Anti-triggers:** Best practices advice (use effective-kotlin), non-Kotlin code
- **Works well with:** effective-kotlin (learning + best practices)
- **Conflicts with:** effective-kotlin (kotlin-in-action for learning features; effective-kotlin for best practice advice)

## lean-startup
- **Source:** *The Lean Startup* by Eric Ries
- **Domain:** Startup strategy, MVP, validated learning, Build-Measure-Learn
- **Language:** Not applicable (strategy skill)
- **Trigger keywords:** "lean startup", "MVP", "validated learning", "pivot", "build-measure-learn", "product market fit", "hypothesis", "experiment", "runway"
- **Anti-triggers:** Technical code review, architecture, any pure engineering concern
- **Works well with:** None (strategy domain, not engineering)
- **Conflicts with:** All technical skills (don't apply to code)

## microservices-patterns
- **Source:** *Microservices Patterns* by Chris Richardson
- **Domain:** Microservices architecture, sagas, CQRS, API gateways, event sourcing
- **Language:** Language-agnostic (Java Spring Boot examples)
- **Trigger keywords:** "microservice", "saga", "CQRS", "event sourcing", "API gateway", "service mesh", "decompose monolith", "circuit breaker", "distributed transaction", "choreography", "orchestration"
- **Anti-triggers:** Monolith-only code with no decomposition intent, pure domain modeling without service concerns
- **Works well with:** domain-driven-design (service boundaries + domain model), system-design-interview (microservices + scale)
- **Conflicts with:** domain-driven-design (microservices-patterns for service decomposition; DDD for domain model — apply both for new services)

## refactoring-ui
- **Source:** *Refactoring UI* by Adam Wathan & Steve Schoger
- **Domain:** UI design, visual hierarchy, typography, color, layout, spacing
- **Language:** CSS, HTML, any frontend
- **Trigger keywords:** "UI design", "visual hierarchy", "typography", "color palette", "spacing", "layout", "design system", "refactor UI", "looks bad", "UI review"
- **Anti-triggers:** Backend code, APIs, data processing, animation (use animation-at-work)
- **Works well with:** animation-at-work (UI design + motion)
- **Conflicts with:** animation-at-work (refactoring-ui for static design; animation-at-work for motion — they complement each other)

## storytelling-with-data
- **Source:** *Storytelling with Data* by Cole Nussbaumer Knaflic
- **Domain:** Data visualization, charts, narrative structure
- **Language:** Not applicable (visualization skill)
- **Trigger keywords:** "data visualization", "chart", "graph", "dashboard", "storytelling", "declutter", "visual", "bar chart", "line chart", "scatter plot", "pie chart"
- **Anti-triggers:** Code quality, backend processing, no visual component
- **Works well with:** data-pipelines (pipeline data + visualization)
- **Conflicts with:** None (niche visual domain)

## system-design-interview
- **Source:** *System Design Interview* by Alex Xu
- **Domain:** High-level system architecture, scalability, estimation, real-world system designs
- **Language:** Language-agnostic
- **Trigger keywords:** "system design", "scale", "scalability", "back of envelope", "rate limiting", "CDN", "load balancer", "cache", "sharding", "high availability", "design YouTube", "design Twitter", "design a URL shortener"
- **Anti-triggers:** Code-level review, domain modeling, specific language idioms
- **Works well with:** data-intensive-patterns (high-level + storage internals), microservices-patterns (system design + service architecture)
- **Conflicts with:** data-intensive-patterns (system-design-interview for high-level; data-intensive-patterns for storage internals)

## using-asyncio-python
- **Source:** *Using Asyncio in Python* by Caleb Hattingh
- **Domain:** Python asyncio, coroutines, event loop, async patterns
- **Language:** Python only
- **Trigger keywords:** "asyncio", "async def", "await", "coroutine", "event loop", "aiohttp", "async Python", "concurrent Python", "Python concurrency"
- **Anti-triggers:** Non-async Python, non-Python code
- **Works well with:** effective-python (async + general Python best practices)
- **Conflicts with:** effective-python (using-asyncio-python wins for any async topic)

## web-scraping-python
- **Source:** *Web Scraping with Python* by Ryan Mitchell
- **Domain:** Web scraping, BeautifulSoup, Scrapy, data extraction
- **Language:** Python only
- **Trigger keywords:** "web scraping", "BeautifulSoup", "Scrapy", "requests", "crawl", "parse HTML", "selenium scraping", "extract data from website"
- **Anti-triggers:** Non-scraping Python, general Python best practices
- **Works well with:** effective-python (scraping + Python best practices), data-pipelines (scraping + ingestion)
- **Conflicts with:** None (niche domain)
