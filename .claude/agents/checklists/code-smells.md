# Code Smells Checklist (Martin Fowler)

## Bloaters

### Long Method

- [ ] No method exceeds 20 lines; methods over 40 lines are refactored immediately
- [ ] Inline comments explaining "what this block does" indicate an extraction opportunity
- [ ] Loops and conditionals with non-trivial bodies are extracted into named methods

### Large Class

- [ ] No class has more than ~200 lines or ~10 instance variables
- [ ] The class does not mix unrelated groups of functionality
- [ ] Subsets of fields that are used together suggest an extractable class

### Long Parameter List

- [ ] Methods have 3 or fewer parameters; more than 3 are grouped into a parameter object
- [ ] Boolean flag parameters are eliminated by splitting into separate methods
- [ ] Related parameters that always travel together are combined into a value object

### Data Clumps

- [ ] Groups of fields that appear together in multiple classes are extracted into their own class
- [ ] Method signatures with the same cluster of parameters use a shared type
- [ ] Removing one item from the group would make the rest meaningless -- confirming it is a clump

### Primitive Obsession

- [ ] Domain concepts (money, email, phone, coordinates) are represented by dedicated types, not raw strings or numbers
- [ ] Type codes or status strings are replaced with enums or polymorphic classes
- [ ] Validation logic for primitives is encapsulated in the value object, not scattered across callers

## Object-Orientation Abusers

### Switch Statements

- [ ] Switch/case or if/else chains on type codes are replaced with polymorphism
- [ ] Adding a new type does not require modifying existing switch statements

### Parallel Inheritance Hierarchies

- [ ] Creating a subclass in one hierarchy does not require creating a subclass in another
- [ ] Shared prefixes across two hierarchies signal a merge opportunity

### Refused Bequest

- [ ] Subclasses use the majority of inherited methods and fields
- [ ] Inherited methods are not overridden with empty bodies or "not supported" exceptions

### Alternative Classes with Different Interfaces

- [ ] Classes that do the same thing share a common interface
- [ ] Duplicate classes with different APIs are merged or aliased behind one interface

## Change Preventers

### Divergent Change

- [ ] A class is not modified for multiple unrelated reasons (e.g., DB schema AND UI changes)
- [ ] Each axis of change is isolated into its own module

### Shotgun Surgery

- [ ] A single logical change does not require edits across many files or classes
- [ ] Scattered logic is consolidated so related changes happen in one place

## Dispensables

### Lazy Class

- [ ] Every class justifies its existence with meaningful behavior, not just delegation
- [ ] Thin wrapper classes that add no value are inlined into their callers

### Speculative Generality

- [ ] Abstract classes and interfaces have more than one concrete implementation
- [ ] Unused parameters, methods, and classes added "just in case" are removed
- [ ] Template methods and hook points are exercised by current code, not hypothetical future code

### Dead Code

- [ ] Unreachable code, unused variables, and uncalled methods are deleted
- [ ] Commented-out code is removed -- version control preserves history

### Duplicate Code

- [ ] Identical or near-identical code blocks are extracted into shared methods or modules
- [ ] Similar algorithms with minor variations use a template method or strategy pattern

### Data Class

- [ ] Classes with only getters and setters have behavior moved into them from their callers
- [ ] Logic that operates on a data class's fields lives inside the class, not outside it

### Comments (as a smell)

- [ ] Comments explaining "what" the code does are replaced by clearer code and better names
- [ ] Remaining comments explain "why," not "what" or "how"

## Couplers

### Feature Envy

- [ ] Methods do not access another object's data more than their own
- [ ] Logic is moved to the class whose data it primarily uses

### Inappropriate Intimacy

- [ ] Classes do not access each other's private fields or internal details
- [ ] Bidirectional dependencies between classes are broken with interfaces or mediators

### Message Chains

- [ ] Long chains of calls (`a.getB().getC().getD()`) are replaced with delegating methods
- [ ] The Law of Demeter is respected: talk to friends, not to strangers' internals

### Middle Man

- [ ] Classes that delegate most of their methods without adding logic are removed
- [ ] Clients call the actual worker directly when the intermediary adds no value

### Insider Trading

- [ ] Modules do not secretly share data through back channels or global state
- [ ] Cross-module communication uses explicit, documented interfaces

### Temporary Field

- [ ] Fields that are only set in certain conditions are extracted into a separate class or method parameter
- [ ] No field is null or unused for most of the object's lifetime
