# SOLID Principles Checklist

## S: Single Responsibility Principle

- [ ] Each class has one reason to change -- it serves a single actor or stakeholder
- [ ] If the class description requires "and" to explain its purpose, it should be split
- [ ] Helper methods that serve different concerns are extracted into their own classes
- [ ] Data access, business logic, and presentation are in separate classes
- [ ] The class has a small number of instance variables; a high count suggests mixed responsibilities

## O: Open/Closed Principle

- [ ] New behavior is added by creating new classes or modules, not modifying existing ones
- [ ] Extension points (interfaces, abstract classes, strategy patterns) exist for anticipated variation
- [ ] Conditional logic based on type (if/else chains, switch on type) is replaced with polymorphism
- [ ] Configuration and policies are injectable rather than hardcoded
- [ ] Closed modules have stable public APIs that do not change when features are added

## L: Liskov Substitution Principle

- [ ] Subclasses can replace their parent class without breaking the program
- [ ] Overridden methods accept the same or broader input and return the same or narrower output
- [ ] Subclasses do not throw new exceptions that the parent class contract does not declare
- [ ] Preconditions are not strengthened and postconditions are not weakened in subclasses
- [ ] No subclass overrides a method with an empty body or throws "not implemented" exceptions

## I: Interface Segregation Principle

- [ ] Interfaces are small and focused -- clients are not forced to depend on methods they do not use
- [ ] Large interfaces are split into cohesive role-based interfaces
- [ ] Classes implement only the interfaces whose methods they genuinely provide
- [ ] No interface has methods that some implementors leave as no-ops or stubs

## D: Dependency Inversion Principle

- [ ] High-level modules depend on abstractions (interfaces), not on low-level implementation classes
- [ ] Dependencies are injected via constructors, factory methods, or DI containers -- not instantiated inline
- [ ] Abstractions do not depend on details; details depend on abstractions
- [ ] Third-party libraries are wrapped behind an interface so they can be swapped or mocked
- [ ] The dependency graph points inward: domain core has no outward dependencies on infrastructure
