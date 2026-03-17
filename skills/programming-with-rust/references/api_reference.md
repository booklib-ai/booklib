# Programming with Rust — Chapter Reference

All 23 chapters from Donis Marshall's "Programming with Rust" with key topics and priority levels.

## Ch 1: Introduction to Rust
**Key topics:** Functional programming, expression-oriented, pattern-oriented, safeness, ownership, lifetimes, fearless concurrency, zero-cost abstraction, Rust terminology, tools
**Priority:** Foundation

## Ch 2: Getting Started
**Key topics:** Cargo, crates, library vs binary, `main` function, command-line arguments, comments, `rustup`
**Priority:** Foundation

## Ch 3: Variables
**Key topics:** Immutability by default (`let` vs `let mut`), integer types, overflow behavior, floating point, boolean, char, pointers, references, operators
**Priority:** Important — immutability by default is a key Rust safety idiom

## Ch 4: Strings
**Key topics:** `&str` (string slice, stack) vs `String` (heap-allocated, owned), deref coercion, `format!`, helpful string functions
**Idiom:** Accept `&str` in function parameters — `String` derefs to `&str` automatically
**Priority:** Important

## Ch 5: Console
**Key topics:** `println!`, positional/variable/named arguments, padding/alignment, `Display` trait, `Debug` trait, `format!`, `write!`
**Priority:** Suggestion

## Ch 6: Control Flow
**Key topics:** `if` as expression, `while`, `for`/`in` (iterator-based), `loop`, `break`/`continue`, loop labels, `Iterator` trait
**Idiom:** Use `for item in collection` over manual indexing; use iterator adapters over manual loops
**Priority:** Important

## Ch 7: Collections
**Key topics:** Arrays (fixed-size, stack), slices, Vecs (heap, growable), multidimensional, `HashMap` (entry API, iteration, update)
**Priority:** Important

## Ch 8: Ownership
**Key topics:** Stack vs heap, shallow vs deep copy, move semantics, borrow, copy semantics, `Clone` trait, `Copy` trait
**Critical rules:**
- Each value has exactly one owner
- When owner goes out of scope, value is dropped
- Move transfers ownership — old binding is invalid
- `Copy` types (primitives) are copied instead of moved
**Priority:** Critical

## Ch 9: Lifetimes
**Key topics:** Lifetime annotation syntax (`'a`), lifetime elision rules, function headers, complex lifetimes, `'static`, structs/methods with lifetimes, subtyping, anonymous lifetimes, generics and lifetimes
**Idiom:** Rely on elision; annotate only when compiler cannot infer (multiple reference params with ambiguous output lifetime)
**Priority:** Critical

## Ch 10: References
**Key topics:** Declaration, borrowing, dereferencing, comparing references, reference notation, mutability, limits to multiple borrowers
**Critical rules:**
- At any time: one `&mut T` OR any number of `&T` — never both
- References must not outlive the referent
**Priority:** Critical

## Ch 11: Functions
**Key topics:** Function definition, parameters, return values, `const fn`, nested functions, function pointers, function aliases
**Priority:** Important

## Ch 12: Error Handling
**Key topics:** `Result<T, E>`, `Option<T>`, panics, `panic!` macro, handling panics, `.unwrap()`, `.expect()`, `?` operator, `match` on Result/Option, `.map()`, rich errors, custom error types
**Critical rules:**
- Library code: always `Result`, never panic
- Use `?` for propagation, not `.unwrap()`
- Define custom error types implementing `std::error::Error`
- Implement `From<E>` for automatic `?` conversion
**Priority:** Critical

## Ch 13: Structures
**Key topics:** Struct definition, alternate initialization, move semantics with structs, mutability, methods (`&self`, `&mut self`, `self`), associated functions (`new`), `impl` blocks, operator overloading, tuple structs, unit-like structs
**Priority:** Important

## Ch 14: Generics
**Key topics:** Generic functions, trait bounds, `where` clause, generic structs, associated functions, generic enums, generic traits, explicit specialization
**Idiom:** Use `where` clause for complex bounds; prefer narrowest possible bounds
**Priority:** Important

## Ch 15: Patterns
**Key topics:** `let` destructuring, wildcards (`_`), complex patterns, ownership in patterns, irrefutable patterns, ranges, multiple patterns (`|`), control flow patterns, struct destructuring, function parameter patterns, `match` expressions, match guards
**Idiom:** `match` is exhaustive — let the compiler enforce all cases; use `if let` for single-variant matches
**Priority:** Important

## Ch 16: Closures
**Key topics:** Closure syntax, captured variables, closures as arguments/return values, `Fn` (immutable borrow), `FnMut` (mutable borrow), `FnOnce` (move/consume), `move` keyword, `impl` keyword for return types
**Idiom:** Use `move` closures when passing to threads to transfer ownership of captured values
**Priority:** Important

## Ch 17: Traits
**Key topics:** Trait definition, default functions, marker traits (`Send`, `Sync`), associated functions, associated types, extension methods, fully qualified syntax, supertraits, static dispatch (`impl Trait`), dynamic dispatch (`dyn Trait`), enums and traits
**Critical rules:**
- Prefer `impl Trait` (static, zero-cost) over `dyn Trait` (runtime overhead via vtable)
- Use `dyn Trait` only when returning heterogeneous types or building plugin systems
**Priority:** Critical

## Ch 18: Threads 1
**Key topics:** Synchronous vs asynchronous calls, `std::thread::spawn`, thread type, `Builder`, CSP (Communicating Sequential Process), async/sync/rendezvous channels (`mpsc`), `try_recv`, store example
**Idiom:** Prefer message passing (channels) over shared state when possible
**Priority:** Important

## Ch 19: Threads 2
**Key topics:** `Mutex<T>`, nonscoped mutex, mutex poisoning, `RwLock<T>`, condition variables (`Condvar`), atomic operations (`AtomicUsize`, etc.), store/load, fetch-and-modify, compare-and-exchange
**Idiom:** Use `Arc<Mutex<T>>` for shared mutable state; `Arc<RwLock<T>>` for read-heavy workloads
**Priority:** Critical

## Ch 20: Memory
**Key topics:** Stack vs heap allocation, static values, `Box<T>` (heap allocation), interior mutability pattern, `RefCell<T>` (runtime borrow checking, single-threaded), `OnceCell<T>` (lazy initialization)
**Idiom:** Stack-allocate by default; use `Box` only when size is unknown at compile time or for recursive types
**Priority:** Important

## Ch 21: Macros
**Key topics:** Tokens, declarative macros (`macro_rules!`), repetition, multiple matchers, procedural macros (derive, attribute, function-like), `#[derive(...)]`
**Idiom:** Use `#[derive]` before writing manual `impl` blocks; write `macro_rules!` for repeated patterns
**Priority:** Suggestion

## Ch 22: Interoperability
**Key topics:** FFI, `extern "C"`, `unsafe` blocks, `libc` crate, structs across FFI, `bindgen` (C → Rust), `cbindgen` (Rust → C)
**Priority:** Suggestion (only when needed)

## Ch 23: Modules
**Key topics:** Module items, `pub` visibility, module files, `path` attribute, functions and modules, `crate`/`super`/`self` keywords, legacy module model
**Idiom:** Organize by domain, not by type; keep `pub` surface minimal; use `pub(crate)` for internal-only APIs
**Priority:** Important

---

## Priority Summary

**Critical (understand deeply before writing any Rust)**
- Ch 8: Ownership and move semantics
- Ch 9: Lifetimes and elision
- Ch 10: Borrowing rules (one `&mut` OR many `&`)
- Ch 12: Error handling with Result, ?, custom errors
- Ch 17: Trait dispatch (impl vs dyn)
- Ch 19: Thread safety with Mutex/RwLock/Arc

**Important (apply consistently)**
- Ch 3: Immutability by default
- Ch 4: `&str` vs `String`
- Ch 6: Iterator-based loops
- Ch 11: Function design
- Ch 13: Structs and impl blocks
- Ch 14: Generics and bounds
- Ch 15: Exhaustive pattern matching
- Ch 16: Closures and move semantics
- Ch 18: Channels for concurrency
- Ch 20: Stack vs heap, RefCell
- Ch 23: Module visibility

**Suggestion (apply when relevant)**
- Ch 5: Formatting and Display/Debug
- Ch 21: Macros and derive
- Ch 22: FFI/interop
