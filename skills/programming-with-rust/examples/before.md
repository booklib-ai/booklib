# Before: Programming with Rust

A user service with common Rust anti-patterns — ownership misuse, panic-prone error handling, unnecessary cloning, and poor trait design.

```rust
use std::collections::HashMap;

// No custom error type — callers can't match on failures
fn load_config(path: String) -> String {  // takes owned String unnecessarily
    std::fs::read_to_string(path).unwrap()  // panics on any I/O error
}

// Clones entire map just to read it
fn get_user(users: HashMap<String, String>, name: String) -> String {
    let users_copy = users.clone();  // unnecessary clone of the whole map
    match users_copy.get(&name) {
        Some(user) => user.clone(),
        None => String::from("unknown"),  // silently returns fallback — hides missing users
    }
}

// Accumulates with a manual loop instead of iterator adapters
fn active_names(users: Vec<(String, bool)>) -> Vec<String> {
    let mut result = Vec::new();
    for i in 0..users.len() {
        if users[i].1 == true {
            result.push(users[i].0.clone());
        }
    }
    result
}

// Shared state with no synchronization
static mut COUNTER: u32 = 0;

fn increment() {
    unsafe {
        COUNTER += 1;  // data race — undefined behavior in concurrent code
    }
}

// Concrete type parameter instead of trait bound
fn print_user(user: String) {
    println!("{}", user);
}

fn main() {
    let config = load_config(String::from("config.toml"));
    println!("{}", config);

    let mut users = HashMap::new();
    users.insert(String::from("alice"), String::from("admin"));

    // Moves users into get_user — can't use it after
    let name = get_user(users, String::from("alice"));
    println!("{}", name);
    // println!("{:?}", users);  // would fail: users was moved
}
```
