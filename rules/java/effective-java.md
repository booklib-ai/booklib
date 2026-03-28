---
description: Always-on Effective Java standards from Joshua Bloch. Apply when writing or reviewing Java code.
---

# Effective Java Standards

Apply these principles from *Effective Java* (Joshua Bloch, 3rd edition) to all Java code.

## Object creation

- Prefer static factory methods over constructors — they have names, can return subtypes, and can cache instances
- Use a builder when a constructor or factory would have more than 3 parameters
- Never create unnecessary objects; reuse `String` literals, prefer `Boolean.valueOf(x)` over `new Boolean(x)`

## Classes and mutability

- Minimize mutability — all fields `private final` by default; add setters only when needed
- Favor composition over inheritance; explicitly document classes designed for extension or mark them `final`
- Override `@Override` on every method that overrides or implements; the annotation catches typos at compile time

## Methods

- Validate parameters at entry; throw `IllegalArgumentException`, `NullPointerException`, or `IndexOutOfBoundsException` with a message
- Return empty collections or `Optional`, never `null`, from methods with a non-primitive return type
- Use `Optional` for return values that may be absent; don't use it for fields or parameters

## Exceptions

- Use checked exceptions for recoverable conditions; unchecked (`RuntimeException`) for programming errors
- Prefer standard exceptions: `IllegalArgumentException`, `IllegalStateException`, `UnsupportedOperationException`, `NullPointerException`
- Don't swallow exceptions — at minimum log with context before ignoring; never `catch (Exception e) {}`

## Generics and collections

- Use generic types and methods; avoid raw types (`List` → `List<E>`)
- Use bounded wildcards (`? extends T` for producers, `? super T` for consumers — PECS)
- Prefer `List` over arrays for type safety; use arrays only for performance-sensitive low-level code

## Concurrency

- Synchronize all accesses to shared mutable state; prefer `java.util.concurrent` utilities over `synchronized`
- Prefer immutable objects and thread confinement over shared mutable state
