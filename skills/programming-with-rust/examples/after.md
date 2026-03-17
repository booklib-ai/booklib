# After: Programming with Rust

The same service rewritten with idiomatic Rust — proper ownership, Result-based error handling, borrowing over cloning, iterator adapters, and trait bounds.

```rust
use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex};

// Custom error type — callers can match on variants (Ch 12)
#[derive(Debug)]
pub enum ConfigError {
    Io(std::io::Error),
    UserNotFound(String),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::Io(e) => write!(f, "I/O error: {e}"),
            ConfigError::UserNotFound(name) => write!(f, "user not found: {name}"),
        }
    }
}

impl std::error::Error for ConfigError {}

impl From<std::io::Error> for ConfigError {
    fn from(e: std::io::Error) -> Self {
        ConfigError::Io(e)
    }
}

// &str instead of String — works with both literals and String via deref coercion (Ch 4)
// Returns Result — caller decides how to handle failure (Ch 12)
fn load_config(path: &str) -> Result<String, ConfigError> {
    let content = std::fs::read_to_string(path)?;  // ? propagates I/O error (Ch 12)
    Ok(content)
}

// Borrows the map — no clone, caller retains ownership (Ch 8, 10)
fn get_user<'a>(users: &'a HashMap<String, String>, name: &str) -> Result<&'a str, ConfigError> {
    users
        .get(name)
        .map(|s| s.as_str())
        .ok_or_else(|| ConfigError::UserNotFound(name.to_string()))
}

// Iterator adapters replace manual index loop (Ch 6)
fn active_names(users: &[(String, bool)]) -> Vec<&str> {
    users
        .iter()
        .filter(|(_, active)| *active)
        .map(|(name, _)| name.as_str())
        .collect()
}

// Safe shared counter with Arc<Mutex<T>> (Ch 19)
fn make_counter() -> Arc<Mutex<u32>> {
    Arc::new(Mutex::new(0))
}

fn increment(counter: &Arc<Mutex<u32>>) {
    let mut count = counter.lock().expect("mutex poisoned");
    *count += 1;
}

// Trait bound instead of concrete type — accepts anything Display (Ch 14, 17)
fn print_item(item: &impl fmt::Display) {
    println!("{item}");
}

fn main() -> Result<(), ConfigError> {
    let config = load_config("config.toml")?;  // ? instead of unwrap (Ch 12)
    println!("{config}");

    let mut users = HashMap::new();
    users.insert(String::from("alice"), String::from("admin"));

    // Borrow users — still usable after the call (Ch 8)
    let role = get_user(&users, "alice")?;
    println!("{role}");
    println!("{users:?}");  // still valid — was only borrowed

    let items = vec![
        (String::from("alice"), true),
        (String::from("bob"), false),
    ];
    let names = active_names(&items);
    println!("{names:?}");

    let counter = make_counter();
    increment(&counter);
    println!("count: {}", counter.lock().unwrap());

    Ok(())
}
```

**Key improvements:**
- `ConfigError` gives callers structured, matchable errors (Ch 12)
- `?` replaces `.unwrap()` for clean error propagation (Ch 12)
- `&str` / `&HashMap` parameters borrow instead of consuming (Ch 4, 8, 10)
- Iterator adapters replace manual index loops (Ch 6)
- `Arc<Mutex<T>>` replaces `unsafe static mut` for safe shared state (Ch 19)
- `impl fmt::Display` trait bound instead of concrete `String` parameter (Ch 14, 17)
- `main()` returns `Result` so errors surface cleanly (Ch 12)
