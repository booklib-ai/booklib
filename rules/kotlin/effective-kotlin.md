---
description: Always-on Effective Kotlin standards from Marcin Moskała. Apply when writing or reviewing Kotlin code.
---

# Effective Kotlin Standards

Apply these principles from *Effective Kotlin* (Marcin Moskała, 2nd edition) to all Kotlin code.

## Safety

- Prefer `val` over `var`; use `var` only when mutation is genuinely required
- Use nullable types explicitly (`T?`); avoid `!!` — narrow with `?.`, `?:`, `let`, or `checkNotNull()`
- Use `require()` for argument preconditions and `check()` for state preconditions at function entry

## Functions

- Use named arguments when passing more than 2 parameters, especially when they share the same type
- Use default arguments instead of overloads for optional behavior
- Prefer extension functions over utility classes for domain operations on a type you own

## Classes and design

- Use data classes for value objects — they get `equals`, `hashCode`, `copy`, and `toString` for free
- Prefer sealed classes over open hierarchies when the set of subtypes is finite and known
- Use `object` for singletons, `companion object` for factory methods and class-level constants

## Collections

- Use functional operators (`map`, `filter`, `fold`, `groupBy`) over manual loops
- Prefer `Sequence` for large collections or multi-step pipelines — avoids intermediate lists
- Use `buildList { }` / `buildMap { }` instead of a mutable variable followed by `.toList()`

## Coroutines

- Launch coroutines in a structured `CoroutineScope`; never use `GlobalScope` in production
- Use `withContext(Dispatchers.IO)` for blocking I/O; never block the main/UI thread
- Prefer `Flow` over callbacks for asynchronous streams; use `StateFlow` for observable state
