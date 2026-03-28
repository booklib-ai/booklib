---
description: Always-on Effective TypeScript standards from Dan Vanderkam. Apply when writing or reviewing TypeScript or JavaScript code.
---

# Effective TypeScript Standards

Apply these principles from *Effective TypeScript* (Dan Vanderkam, 2nd edition) to all TypeScript code.

## Types

- Prefer union types over enums for simple sets of values: `type Direction = 'N' | 'S' | 'E' | 'W'`
- Use `interface` for extensible object shapes that others may augment; use `type` for unions, intersections, and computed types
- Avoid `any`; use `unknown` when the type is genuinely unknown, then narrow with guards before use
- Avoid type assertions (`as T`) — prefer type narrowing, overloads, or generics

## Type inference

- Let TypeScript infer return types on internal functions; explicitly annotate public API return types
- Annotate a variable at declaration if it cannot be initialized immediately
- Use `as const` to preserve literal types; don't use it just to silence widening errors

## Null safety

- Enable `strict` mode (which includes `strictNullChecks`) — treat every `T | undefined` as requiring explicit handling
- Use optional chaining `?.` and nullish coalescing `??` over `&&` and `||` chains
- Never use non-null assertion (`!`) — narrow instead

## Structural typing

- TypeScript checks shapes, not nominal types — understand that duck typing applies
- Use discriminated unions with a `kind` or `type` literal field for exhaustive `switch` / narrowing
- Avoid class hierarchies for data shapes — prefer interfaces and composition

## Generics

- Constrain generics to the minimum required: `<T extends string>` not `<T>`
- Use descriptive generic names for complex types (`<TItem, TKey>`) and single letters for simple transforms (`<T>`, `<K, V>`)

## Functions

- Prefer function overloads over union parameter types to express the relationship between input and output
- Keep functions pure where possible; extract side effects to the call site
