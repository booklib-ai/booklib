---
description: Always-on Rust standards from Programming with Rust and Rust in Action. Apply when writing or reviewing Rust code.
---

# Rust Standards

Apply these principles from *Programming with Rust* (Donis Marshall) and *Rust in Action* (Tim McNamara) to all Rust code.

## Ownership and borrowing

- Use owned values (`String`, `Vec<T>`) for data you own; borrow (`&str`, `&[T]`) when you only need to read
- Prefer passing `&T` or `&mut T` over cloning; clone only when ownership transfer is required
- Use `Rc<T>` for single-threaded shared ownership, `Arc<T>` for multi-threaded; use `RefCell<T>` / `Mutex<T>` for interior mutability

## Error handling

- Return `Result<T, E>` from all fallible functions; propagate with `?`
- Use `thiserror` to define library errors with `#[derive(Error)]`; use `anyhow` for application-level error context
- Avoid `.unwrap()` in library code; use `.expect("clear message")` in application code where panicking is intentional

## Types and traits

- Use `struct` for data, `enum` for variants with payloads, `trait` for shared behaviour
- Implement standard traits where appropriate: `Debug` always, `Display` for user-facing types, `Clone`, `PartialEq`, `Hash` as needed
- Use `impl Trait` in argument position for static dispatch; `Box<dyn Trait>` only when you need runtime dispatch

## Idiomatic patterns

- Use `Iterator` adapters (`map`, `filter`, `flat_map`, `collect`) over manual loops — the compiler optimizes them equally
- Use `Option` methods (`map`, `unwrap_or`, `and_then`, `ok_or`) over `match` for simple transformations
- Use `if let` for single-variant matching; use `match` for exhaustive handling

## Naming and style

- Types: `PascalCase`; functions, variables, modules: `snake_case`; constants and statics: `SCREAMING_SNAKE_CASE`
- Lifetime names: `'a`, `'b` for simple cases; descriptive names (`'arena`, `'cx`) for complex lifetimes
- Mark all public items in a library crate with doc comments (`///`)
