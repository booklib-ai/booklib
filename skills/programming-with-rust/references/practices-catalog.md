# Programming with Rust — Practices Catalog

Deep before/after examples for the most critical Rust idioms from each chapter group.

---

## Ownership: Borrow Instead of Clone (Ch 8)

**Before:**
```rust
fn print_names(names: Vec<String>) {  // consumes the Vec
    for name in names {
        println!("{name}");
    }
}
// names is gone after this call
```
**After:**
```rust
fn print_names(names: &[String]) {  // borrows a slice — Vec<String> derefs to &[String]
    for name in names {
        println!("{name}");
    }
}
// caller keeps ownership
```

---

## Ownership: Move Semantics (Ch 8)

**Before:**
```rust
let s1 = String::from("hello");
let s2 = s1;           // s1 is MOVED into s2
println!("{s1}");      // compile error: s1 was moved
```
**After:**
```rust
let s1 = String::from("hello");
let s2 = s1.clone();   // explicit deep copy — both valid
println!("{s1} {s2}"); // both valid

// Or: borrow instead of cloning
let s3 = &s1;          // borrow — s1 still owns the data
println!("{s1} {s3}");
```

---

## References: Borrow Rules (Ch 10)

```rust
let mut data = vec![1, 2, 3];

// OK: multiple immutable borrows
let a = &data;
let b = &data;
println!("{a:?} {b:?}");

// OK: one mutable borrow (after immutable borrows end)
let c = &mut data;
c.push(4);

// COMPILE ERROR: can't have mutable + immutable borrow at same time
// let d = &data;
// let e = &mut data;  // error
```

---

## Lifetimes: Elision vs Annotation (Ch 9)

**Elision works (no annotation needed):**
```rust
fn first_word(s: &str) -> &str {  // compiler infers output lifetime = input lifetime
    s.split_whitespace().next().unwrap_or("")
}
```

**Annotation required (multiple inputs, ambiguous output):**
```rust
// Without annotation — compiler can't tell which input the output borrows from
fn longer<'a>(s1: &'a str, s2: &'a str) -> &'a str {
    if s1.len() > s2.len() { s1 } else { s2 }
}
```

**Struct holding a reference — must annotate:**
```rust
struct Excerpt<'a> {
    text: &'a str,  // struct can't outlive the string it borrows
}
```

---

## Error Handling: Result + ? (Ch 12)

**Before:**
```rust
fn read_username() -> String {
    let f = std::fs::File::open("username.txt").unwrap();
    let mut s = String::new();
    std::io::Read::read_to_string(&mut std::io::BufReader::new(f), &mut s).unwrap();
    s
}
```
**After:**
```rust
fn read_username() -> Result<String, std::io::Error> {
    std::fs::read_to_string("username.txt")  // ? propagates automatically
}
```

---

## Error Handling: Custom Error Types (Ch 12)

```rust
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Io(std::io::Error),
    Parse(std::num::ParseIntError),
    Custom(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Io(e)     => write!(f, "I/O: {e}"),
            AppError::Parse(e)  => write!(f, "parse: {e}"),
            AppError::Custom(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for AppError {}

// Enables ? to convert std::io::Error → AppError automatically
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { AppError::Io(e) }
}

impl From<std::num::ParseIntError> for AppError {
    fn from(e: std::num::ParseIntError) -> Self { AppError::Parse(e) }
}

fn parse_port(s: &str) -> Result<u16, AppError> {
    let port: i32 = s.parse()?;  // ParseIntError → AppError via From
    if port < 1 || port > 65535 {
        return Err(AppError::Custom(format!("invalid port: {port}")));
    }
    Ok(port as u16)
}
```

---

## Traits: Static vs Dynamic Dispatch (Ch 17)

**Static dispatch — zero cost, preferred:**
```rust
// Monomorphized at compile time — no runtime overhead
fn notify(item: &impl Summary) {
    println!("Breaking news! {}", item.summarize());
}

// Equivalent with explicit generic:
fn notify<T: Summary>(item: &T) {
    println!("Breaking news! {}", item.summarize());
}
```

**Dynamic dispatch — use only for heterogeneous collections or plugins:**
```rust
// Vtable lookup at runtime — small overhead, but enables mixed types
fn notify_all(items: &[Box<dyn Summary>]) {
    for item in items {
        println!("{}", item.summarize());
    }
}
```

---

## Traits: Implementing Standard Traits (Ch 17)

```rust
use std::fmt;

#[derive(Debug, Clone, PartialEq)]  // derive common traits
struct Point {
    x: f64,
    y: f64,
}

// Display for user-facing output
impl fmt::Display for Point {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "({}, {})", self.x, self.y)
    }
}

// From for ergonomic conversion
impl From<(f64, f64)> for Point {
    fn from((x, y): (f64, f64)) -> Self {
        Point { x, y }
    }
}

let p: Point = (1.0, 2.0).into();  // uses From impl
println!("{p}");                    // uses Display
println!("{p:?}");                  // uses Debug
```

---

## Pattern Matching: Exhaustive match (Ch 15)

**Before:**
```rust
let opt: Option<i32> = get_value();
match opt {
    Some(x) => println!("{x}"),
    _ => {}  // silently ignores None — intent unclear
}
```
**After:**
```rust
// if let for single-variant match
if let Some(x) = get_value() {
    println!("{x}");
}

// Exhaustive match when both branches matter
match get_value() {
    Some(x) => println!("got {x}"),
    None    => println!("nothing"),
}
```

---

## Closures: move for Threads (Ch 16, 18)

**Before:**
```rust
let name = String::from("Alice");
let handle = std::thread::spawn(|| {
    println!("{name}");  // error: closure may outlive name
});
```
**After:**
```rust
let name = String::from("Alice");
let handle = std::thread::spawn(move || {
    println!("{name}");  // name is moved into the closure — safe
});
handle.join().unwrap();
```

---

## Concurrency: Arc<Mutex<T>> (Ch 19)

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0u32));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter = Arc::clone(&counter);  // clone the Arc, not the data
        let handle = thread::spawn(move || {
            let mut num = counter.lock().expect("mutex poisoned");
            *num += 1;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("Result: {}", *counter.lock().unwrap());  // 10
}
```

---

## Memory: RefCell for Interior Mutability (Ch 20)

Use `RefCell<T>` when you need mutability inside an otherwise immutable value (single-threaded only):

```rust
use std::cell::RefCell;

struct Cache {
    data: RefCell<Option<String>>,  // interior mutability
}

impl Cache {
    fn get(&self) -> String {
        // borrow_mut even though &self is immutable
        let mut data = self.data.borrow_mut();
        if data.is_none() {
            *data = Some(expensive_computation());
        }
        data.as_ref().unwrap().clone()
    }
}
// For multi-threaded use, replace RefCell with Mutex
```

---

## Modules: Visibility (Ch 23)

```rust
// lib.rs
pub mod api {           // public module
    pub struct Request { /* ... */ }    // public type
    pub(crate) fn validate() { }       // crate-internal only
    fn internal_helper() { }           // private to module
}

mod storage {           // private module — not part of public API
    pub(super) fn save() { }  // accessible to parent module only
}
```
