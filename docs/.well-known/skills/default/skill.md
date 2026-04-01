---
name: booklib-skills
description: >
  BookLib — curated skills from canonical programming books. Covers Kotlin,
  Python, Java, TypeScript, Rust, architecture, DDD, data-intensive systems,
  UI design, and more. Install individual skills via npx skillsadd booklib-ai/booklib/<name>.
version: "1.0"
license: MIT
tags: [books, knowledge, all-languages, architecture, best-practices]
---

# BookLib Skills

Book knowledge distilled into structured AI skills. Install any skill with:

```
npx skillsadd booklib-ai/booklib/<skill-name>
```

## Available Skills

- **animation-at-work**: Apply web animation principles from Animation at Work by Rachel Nabors. Covers human perception of motion, 12 principles
- **clean-code-reviewer**: Reviews code against Robert C. Martin's Clean Code principles. Use when users share code for review, ask for refactoring
- **data-intensive-patterns**: Generate and review data-intensive application code using patterns from Martin Kleppmann's "Designing Data-Intensive App
- **data-pipelines**: Apply Data Pipelines Pocket Reference practices (James Densmore). Covers Infrastructure (Ch 1-2: warehouses, lakes, clou
- **design-patterns**: Apply and review GoF design patterns from Head First Design Patterns. Use for Creational patterns (Factory Method, Abstr
- **domain-driven-design**: Design and review software using patterns from Eric Evans' "Domain-Driven Design." Use for DDD tactical patterns (Entiti
- **effective-java**: Generate and review Java code using patterns and best practices from Joshua Bloch's "Effective Java" (3rd Edition). Use 
- **effective-kotlin**: Apply Effective Kotlin best practices (Marcin Moskała, 2nd Ed). Covers Safety (Items 1-10: mutability, scope, nulls, typ
- **effective-python**: Review existing Python code and write new Python code following the 90 best practices from "Effective Python" by Brett S
- **effective-typescript**: Review existing TypeScript code and write new TypeScript following the 62 items from "Effective TypeScript" by Dan Vande
- **kotlin-in-action**: Apply Kotlin In Action practices (Elizarov, Isakova, Aigner, Jemerov, 2nd Ed). Covers Basics (Ch 1-3: functions, extensi
- **lean-startup**: Apply The Lean Startup practices (Eric Ries). Covers Vision (Ch 1-4: Start, Define, Learn, Experiment — validated learni
- **microservices-patterns**: Generate and review microservices code using patterns from Chris Richardson's "Microservices Patterns." Use this skill w
- **programming-with-rust**: Write and review Rust code using practices from "Programming with Rust" by Donis Marshall. Covers ownership, borrowing, 
- **refactoring-ui**: Apply UI design principles from Refactoring UI by Adam Wathan & Steve Schoger. Covers visual hierarchy (size, weight, co
- **rust-in-action**: Write and review Rust code using systems programming concepts from "Rust in Action" by Tim McNamara. Covers language fou
- **skill-router**: Select the 1-2 most relevant @booklib/skills for a given file, PR, or task. Use before applying any skill when unsure wh
- **spring-boot-in-action**: Write and review Spring Boot applications using practices from "Spring Boot in Action" by Craig Walls. Covers auto-confi
- **storytelling-with-data**: Apply data visualization and storytelling principles from Storytelling with Data by Cole Nussbaumer Knaflic. Covers choo
- **system-design-interview**: Apply system design principles from System Design Interview by Alex Xu. Covers scaling (load balancing, DB replication, 
- **using-asyncio-python**: Apply Using Asyncio in Python practices (Caleb Hattingh). Covers Introducing Asyncio (Ch 1: what it is, I/O-bound concur
- **web-scraping-python**: Apply Web Scraping with Python practices (Ryan Mitchell). Covers First Scrapers (Ch 1: urllib, BeautifulSoup), HTML Pars

## Install Everything

```bash
npm install -g @booklib/skills && booklib init
```
