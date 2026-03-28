---
description: Always-on Effective Python standards from Brett Slatkin. Apply when writing or reviewing Python code.
---

# Effective Python Standards

Apply these principles from *Effective Python* (Brett Slatkin, 3rd edition) to all Python code.

## Pythonic style

- Use `enumerate()` over `range(len(...))` for indexed iteration
- Use f-strings for interpolation; avoid `%` formatting and `.format()`
- Prefer unpacking over indexing: `first, *rest = items` instead of `items[0]` and `items[1:]`
- Use `zip()` to iterate two sequences together; use `zip(strict=True)` when lengths must match

## Data structures

- Use `list` for ordered mutable sequences, `tuple` for immutable positional data, `set` for membership tests
- Use `collections.defaultdict` or `Counter` instead of manual dict initialization
- Prefer `dataclasses` over plain dicts or namedtuples for structured data with methods

## Functions

- Use keyword-only arguments (`def f(a, *, b)`) for optional parameters that benefit from names at the call site
- Never use mutable default arguments — use `None` and assign inside the function body
- Prefer generator expressions `(x for x in ...)` over list comprehensions when you don't need the full list in memory

## Type annotations

- Annotate all public functions and class attributes
- Use `X | None` (Python 3.10+) or `Optional[X]` for nullable types; never return `None` silently from a typed function
- Avoid `Any` except at system boundaries (external APIs, deserialized JSON)

## Error handling

- Catch specific exception types; never use bare `except:`
- Use `contextlib.suppress(ExceptionType)` for intentionally ignored exceptions — makes the intent explicit
- Use `__all__` in every module to declare its public API
