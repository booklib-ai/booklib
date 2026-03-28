---
name: programming-with-rust
description: >
  Write and review Rust code using practices from "Programming with Rust" by Donis Marshall.
  Covers ownership, borrowing, lifetimes, error handling with Result/Option, traits, generics,
  pattern matching, closures, fearless concurrency, and macros. Use when writing Rust, reviewing
  Rust code, or learning Rust idioms. Trigger on: "Rust", "ownership", "borrow checker",
  "lifetimes", "Result", "Option", "traits", "fearless concurrency", ".rs files", "cargo".
---

# Programming with Rust Skill

Apply the practices from Donis Marshall's "Programming with Rust" to review existing code and write new Rust. This skill operates in two modes: **Review Mode** (analyze code for violations of Rust idioms) and **Write Mode** (produce safe, idiomatic Rust from scratch).

## Reference Files

- `ref-01-fundamentals.md` — Ch 1-3: Rust model, tooling, variables, primitives, references
- `ref-02-types-strings.md` — Ch 4-5: String vs &str, formatting, Display/Debug traits
- `ref-03-control-collections.md` — Ch 6-7: Control flow, iterators, arrays, Vec, HashMap
- `ref-04-ownership-lifetimes.md` — Ch 8-10: Ownership, move semantics, borrowing, lifetimes
- `ref-05-functions-errors.md` — Ch 11-12: Functions, Result, Option, panics, custom errors
- `ref-06-structs-generics.md` — Ch 13-14: Structs, impl blocks, generics, bounds
- `ref-07-patterns-closures.md` — Ch 15-16: Pattern matching, closures, Fn/FnMut/FnOnce
- `ref-08-traits.md` — Ch 17: Trait definition, dispatch, supertraits, associated types
- `ref-09-concurrency.md` — Ch 18-19: Threads, channels, Mutex, RwLock, atomics
- `ref-10-advanced.md` — Ch 20-23: Memory, interior mutability, macros, FFI, modules

## How to Use This Skill

**Before responding**, read the reference files relevant to the code's topic. For ownership/borrowing issues read `ref-04`. For error handling read `ref-05`. For a full review, read all files.

---

## Mode 1: Code Review

When the user asks you to **review** Rust code, follow this process:

### Step 1: Read Relevant References
Identify which chapters apply. If unsure, read all reference files.

### Step 2: Analyze the Code

**CRITICAL: First assess whether the code is already idiomatic.** If the code correctly uses patterns like `Arc<Mutex<T>>` for shared state, `.expect("reason")` for mutex locks, `&str` parameters, custom error types with `Display + Error + From`, iterator adapters like `.find().cloned()`, or proper `Result`/`?` propagation — **acknowledge these as correct and do not manufacture problems**. The goal is accurate assessment, not finding something to criticize.

Check these areas in order of severity:

1. **Ownership & Borrowing** (Ch 8, 10): Unnecessary `.clone()` calls? Mutable borrow conflicts? Move semantics misunderstood? Cloning a single found item (e.g., `.find().cloned()`) is correct and intentional — do not flag it.
2. **Lifetimes** (Ch 9): Missing or incorrect annotations? Can elision rules eliminate them? `'static` used where a shorter lifetime would do?
3. **Error Handling** (Ch 12): Is `.unwrap()` used without a meaningful reason where `?` or proper matching belongs? `.expect("mutex poisoned")` with a descriptive reason string is correct idiomatic Rust — do not flag it. Are custom error types with `Display`, `Error`, and `From` implementations missing where they'd help callers?
4. **Traits & Generics** (Ch 14, 17): Are trait bounds as narrow as possible? When a function could return a single concrete type, `impl Trait` is preferred over `Box<dyn Trait>` for zero-cost static dispatch. However, when a function **must** return one of multiple different concrete types at runtime (e.g., `if condition { Box::new(TypeA) } else { Box::new(TypeB) }`), `Box<dyn Trait>` is the correct and necessary choice — do not flag it as wrong. When reviewing code that uses `Box<dyn Trait>` for multiple-type returns, you should still **note** that if only one type were ever returned, `impl Trait` would be preferred — frame this as a general educational point, not a bug. Also note: trait methods that return `String` via `.clone()` could instead return `&str` with a lifetime annotation (`fn summary(&self) -> &str`) to avoid heap allocation — mention this as a suggestion.
5. **Pattern Matching** (Ch 15): Are `match` arms exhaustive? Can `if let` / `while let` simplify single-arm matches? Are wildcards masking unhandled cases?
6. **Concurrency** (Ch 18, 19): `Arc<Mutex<T>>` for shared mutable state across threads is correct idiomatic Rust — acknowledge it positively. Is shared state protected when it should be? Are channels used correctly? Note: `RwLock` is only preferable over `Mutex` when reads vastly outnumber writes — do not flag `Mutex` as wrong when `RwLock` would merely be an option.
7. **Memory** (Ch 20): Is `RefCell` used outside of single-threaded interior mutability? Is `Box` used unnecessarily when stack allocation would work?
8. **Idioms**: Is `for item in collection` preferred over manual indexing? Are iterator adapters (`map`, `filter`, `collect`) used over manual loops? `&str` parameters with `.to_string()` conversion at the boundary is correct — do not flag it.

### Step 3: Report Findings

If the code is already idiomatic, lead with that assessment and cite the patterns it uses correctly (with chapter references). Then mention any genuine improvements or minor suggestions.

For each real issue, report:
- **Chapter reference** (e.g., "Ch 12: Error Handling")
- **Location** in the code
- **What's wrong** (the anti-pattern)
- **How to fix it** (the idiomatic Rust approach)
- **Priority**: Critical (safety/correctness), Important (idiom/maintainability), Suggestion (polish)

**Priority calibration:**
- Implementing `Default` alongside a `new()` constructor is a **Suggestion** (polish), not Important. It is a minor note, not a real issue.
- `Mutex` vs `RwLock` is a **Suggestion** when the existing `Mutex` is correct.
- Returning `&str` instead of `String` from a trait method is a **Suggestion** when `String` works fine.
- Never elevate suggestions to Important or Critical just to have something to say.

### Step 4: Provide Fixed Code
Offer a corrected version with comments explaining each change.

---

## Mode 2: Writing New Code

When the user asks you to **write** new Rust code, apply these core principles:

### Ownership & Memory Safety

1. **Prefer borrowing over cloning** (Ch 8). Pass `&T` or `&mut T` rather than transferring ownership when the caller still needs the value. Clone only when ownership genuinely needs to be duplicated.

2. **Respect the single-owner rule** (Ch 8). Each value has exactly one owner. When you move a value, the old binding is invalid — design data flow around this.

3. **Use lifetime elision** (Ch 9). Annotate lifetimes only when the compiler cannot infer them. Explicit annotations are for structs holding references and functions with multiple reference parameters where elision is ambiguous.

4. **Prefer `&str` over `String` in function parameters** (Ch 4). Accept `&str` to work with both `String` (via deref coercion) and string literals without allocation.

### Error Handling

5. **Return `Result<T, E>`, never panic in library code** (Ch 12). Panics are for unrecoverable programmer errors. Use `Result` for anything that can fail at runtime.

6. **Use the `?` operator for error propagation** (Ch 12). Replace `.unwrap()` chains with `?` to propagate errors cleanly to callers.

7. **Define custom error types for public APIs** (Ch 12). Implement `std::error::Error` and use `thiserror` or manual `impl` to give callers structured errors they can match on.

8. **Never use `.unwrap()` in production paths** (Ch 12). Use `.expect("reason")` only in tests or where panic is truly the right response. In all other cases, handle with `match`, `if let`, or `?`.

### Traits & Generics

9. **Prefer `impl Trait` over `dyn Trait` for return types when a single concrete type is returned** (Ch 17). Static dispatch is zero-cost. Use `dyn Trait` (typically `Box<dyn Trait>`) only when the function must return one of multiple different concrete types at runtime — that is genuinely the correct tool and should not be changed to `impl Trait`.

10. **Use trait bounds instead of concrete types** (Ch 14). `fn process<T: Display + Debug>(item: T)` is more reusable than accepting a concrete type.

11. **Implement standard traits** (Ch 17). Derive `Debug`, `Clone`, `PartialEq` where appropriate. Implement `Display` for user-facing output, `From`/`Into` for conversions.

### Pattern Matching

12. **Use `match` for exhaustive handling** (Ch 15). The compiler enforces exhaustiveness — treat it as a feature, not a burden.

13. **Use `if let` for single-variant matching** (Ch 15). `if let Some(x) = opt { }` is cleaner than a two-arm `match` when you only care about one case.

14. **Destructure in function parameters** (Ch 15). `fn process(&Point { x, y }: &Point)` avoids manual field access inside the body.

### Concurrency

15. **Use channels for message passing** (Ch 18). Prefer `std::sync::mpsc` channels over shared mutable state when threads can communicate by value.

16. **Wrap shared state in `Arc<Mutex<T>>`** (Ch 19). `Arc` for shared ownership across threads, `Mutex` for mutual exclusion. `Arc<Mutex<T>>` is the correct default — only suggest `RwLock` if there is evidence that reads vastly outnumber writes and contention is a measured concern.

17. **Prefer `Mutex::lock().unwrap()` with `.expect()`** (Ch 19). Poisoned mutexes indicate a panic in another thread — `.expect("mutex poisoned")` makes this explicit.

### Code Structure Template

```rust
use std::fmt;

/// Domain error type for public APIs (Ch 12)
#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    InvalidInput(String),
    Io(std::io::Error),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::NotFound(msg) => write!(f, "not found: {msg}"),
            AppError::InvalidInput(msg) => write!(f, "invalid input: {msg}"),
            AppError::Io(e) => write!(f, "I/O error: {e}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e)
    }
}

/// Accept &str, not String (Ch 4)
pub fn find_user(name: &str) -> Result<User, AppError> {
    // Use ? for propagation (Ch 12)
    let data = load_data()?;
    data.iter()
        .find(|u| u.name == name)
        .cloned()  // clone only the found item (Ch 8)
        .ok_or_else(|| AppError::NotFound(name.to_string()))
}

/// Derive standard traits (Ch 17)
#[derive(Debug, Clone, PartialEq)]
pub struct User {
    pub name: String,
    pub role: Role,
}

/// Enum for valid states (Ch 15)
#[derive(Debug, Clone, PartialEq)]
pub enum Role {
    Admin,
    Viewer,
    Editor,
}
```

---

## Priority of Practices by Impact

### Critical (Safety & Correctness)
- Ch 8: Understand ownership — moving vs borrowing, no use-after-move
- Ch 10: One mutable borrow OR many immutable borrows — never both
- Ch 12: Never `.unwrap()` in production; use `Result` and `?`
- Ch 19: Always protect shared mutable state with `Mutex` or `RwLock`

### Important (Idiom & Maintainability)
- Ch 4: Prefer `&str` params over `String`
- Ch 9: Rely on lifetime elision; annotate only when required
- Ch 12: Custom error types for public APIs
- Ch 14/17: Trait bounds over concrete types; `impl Trait` over `dyn Trait` when returning a single concrete type; `Box<dyn Trait>` is correct when multiple concrete types may be returned
- Ch 15: Exhaustive `match`; use `if let` for single-arm cases
- Ch 17: Derive/implement standard traits (`Debug`, `Display`, `From`)

### Suggestions (Polish)
- Ch 6: Use iterator adapters (`map`, `filter`, `flat_map`) over manual loops
- Ch 16: Use closures with `move` when capturing environment across thread boundaries
- Ch 20: Prefer stack allocation; use `Box` only when size is unknown at compile time
- Ch 21: Use `derive` macros before writing manual `impl` blocks
