---
description: Always-on Clean Code standards from Robert C. Martin. Apply to all code regardless of language.
---

# Clean Code Standards

Apply these principles from *Clean Code* (Robert C. Martin) to all code you write or review.

## Names

- Use intention-revealing names — if the name needs a comment to explain it, rename it
- Avoid abbreviations unless universally understood (`url`, `id`, `ctx` are fine; `mgr`, `proc` are not)
- Classes and types are nouns; methods and functions are verb phrases
- Avoid noise words that add no meaning: `Manager`, `Data`, `Info`, `Handler` in type names usually signal a missing concept
- Boolean variables and functions read as assertions: `isEnabled`, `hasPermission`, `canRetry`

## Functions

- Functions do one thing; if you can extract a meaningful sub-function with a non-trivial name, the function does too much
- Keep functions short — aim for under 20 lines; over 40 is a smell
- Max 3 parameters; group related parameters into a value object when you need more
- Avoid boolean flag parameters — they signal the function does two things; split it
- No side effects in functions that return values

## Comments

- Comments compensate for failure to express intent in code — prefer renaming over commenting
- Never commit commented-out code; use version control
- `// TODO:` is acceptable only when tracked in an issue; delete stale TODOs
- Document *why*, not *what* — the code shows what; the comment explains a non-obvious reason

## Structure

- Group related code together; put high-level concepts at the top, details below
- Functions in a file should be ordered so callers appear before callees
- Avoid deep nesting — if `if`/`else` chains exceed 3 levels, extract or invert conditions

## Error handling

- Prefer exceptions over error codes for exceptional conditions
- Handle errors at the appropriate abstraction level — don't catch and re-throw unless you add context
- Never swallow exceptions silently; at minimum log before ignoring
