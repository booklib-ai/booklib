---
name: effective-python
version: "1.0"
license: MIT
tags: [python, oop, idioms]
description: Review existing Python code and write new Python code following the 90 best practices from "Effective Python" by Brett Slatkin (2nd Edition). Use when writing Python, reviewing Python code, or wanting idiomatic, Pythonic solutions.
---

# Effective Python Skill

Apply the 90 items from Brett Slatkin's "Effective Python" (2nd Edition) to review existing code and write new Python code. This skill operates in two modes: **Review Mode** (analyze code for violations) and **Write Mode** (produce idiomatic Python from scratch).

## Reference Files

This skill includes categorized reference files with all 90 items:

- `ref-01-pythonic-thinking.md` — Items 1-10: PEP 8, f-strings, bytes/str, walrus operator, unpacking, enumerate, zip, slicing
- `ref-02-lists-and-dicts.md` — Items 11-18: Slicing, sorting, dict ordering, defaultdict, __missing__
- `ref-03-functions.md` — Items 19-26: Exceptions vs None, closures, *args/**kwargs, keyword-only args, decorators
- `ref-04-comprehensions-generators.md` — Items 27-36: Comprehensions, generators, yield from, itertools
- `ref-05-classes-interfaces.md` — Items 37-43: Composition, @classmethod, super(), mix-ins, public attrs
- `ref-06-metaclasses-attributes.md` — Items 44-51: @property, descriptors, __getattr__, __init_subclass__, class decorators
- `ref-07-concurrency.md` — Items 52-64: subprocess, threads, Lock, Queue, coroutines, asyncio
- `ref-08-robustness-performance.md` — Items 65-76: try/except, contextlib, datetime, decimal, profiling, data structures
- `ref-09-testing-debugging.md` — Items 77-85: TestCase, mocks, dependency injection, pdb, tracemalloc
- `ref-10-collaboration.md` — Items 86-90: Docstrings, packages, root exceptions, virtual environments

## How to Use This Skill

**Before responding**, read the relevant reference files based on the code's topic. For a general review, read all files. For targeted work (e.g., writing async code), read the specific reference (e.g., `ref-07-concurrency.md`).

---

## Mode 1: Code Review

When the user asks you to **review** existing Python code, follow this process:

### Step 1: Read Relevant References
Determine which chapters apply to the code under review and read those reference files. If unsure, read all of them.

### Step 2: Calibrate Your Response

**If the code is already well-written and idiomatic:**
- Say so explicitly and upfront. Do not manufacture issues to appear thorough.
- Praise the good patterns you see (see "Praising Good Patterns" below).
- Any suggestions must be framed as minor optional improvements, not as violations or issues.

**If the code has real problems:**
- Identify and report them clearly with item references.

### Step 3: Praise Good Patterns (when present)
When the code uses these patterns correctly, explicitly praise them:

<strengths_to_praise>
- **`@contextmanager`** for resource management: "Good use of `@contextmanager` (Item 66) — avoids boilerplate try/finally and makes the cleanup intent clear."
- **Generator functions** (`yield`) for memory efficiency: "Good use of a generator (Item 30) — avoids loading the entire sequence into memory."
- **Type annotations** on public functions: "Good use of type annotations (Item 84) — improves readability and enables static analysis."
- **Docstrings** on all public APIs: "Good docstrings (Item 84) — clearly communicates purpose and parameters."
- **`@dataclass`** for plain data holders: "Good use of `@dataclass` (Items 37–43) — reduces boilerplate and provides automatic `__repr__`, `__eq__`."
- **List/dict/set comprehensions** instead of manual loops: "Good use of comprehensions (Item 27) — more readable and Pythonic."
- **`enumerate`** instead of `range(len(...))`: "Good use of `enumerate` (Item 7)."
</strengths_to_praise>

### Step 4: Analyze the Code for Issues
For each relevant item from the book, check whether the code follows or violates the guideline. Focus on:

<core_principles>
1. **Style and Idiom** (Items 1-10): Is it Pythonic? Does it use f-strings, unpacking, enumerate, zip properly?
2. **Data Structures** (Items 11-18): Are lists and dicts used correctly? Is sorting done with key functions?
3. **Function Design** (Items 19-26): Do functions raise exceptions instead of returning None? Are args well-structured?
4. **Comprehensions & Generators** (Items 27-36): Are comprehensions preferred over map/filter? Are generators used for large sequences?
5. **Class Design** (Items 37-43): Is composition preferred over deep nesting? Are mix-ins used correctly? Is `@dataclass` used for plain data holders?
6. **Metaclasses & Attributes** (Items 44-51): Are plain attributes used instead of getter/setter methods? Is @property used appropriately?
7. **Concurrency** (Items 52-64): Are threads used only for I/O? Is asyncio structured correctly?
8. **Robustness** (Items 65-76): Is error handling structured with try/except/else/finally? Are the right data structures chosen?
9. **Testing** (Items 77-85): Are tests well-structured? Are mocks used appropriately?
10. **Collaboration** (Items 86-90): Are docstrings present? Are APIs stable?

### Key Anti-Patterns to Always Check

<anti_patterns>
- **Mutable default arguments** (Item 24): `def f(items=[])` is a critical bug — the list is shared across all calls. Always use `None` and initialize inside the function body.
  ```python
  # WRONG — shared mutable default
  def process(results=[]):
      results.append(...)

  # RIGHT — use None sentinel
  def process(results=None):
      if results is None:
          results = []
      results.append(...)
  ```

- **Bare `except:`** clause (Item 65): `except:` without a type catches `KeyboardInterrupt`, `SystemExit`, and `GeneratorExit`, silently killing the program. Always catch specific exception types: `except (ValueError, KeyError):` or at minimum `except Exception:`.

- **`for i in range(len(seq))`** (Item 7): Use `for item in seq` directly, or `for i, item in enumerate(seq)` when you need the index.

- **Manual list-building loops** (Item 27): Any loop that creates an empty list and appends inside the loop body should be a list comprehension.
  ```python
  # WRONG
  result = []
  for x in items:
      if x > 0:
          result.append(x * 2)

  # RIGHT
  result = [x * 2 for x in items if x > 0]
  ```

- **Java-style getter/setter methods** (Item 44): `get_name()`, `set_price()`, `get_value()` are non-Pythonic. Access attributes directly or use `@property` when validation is required.

- **`== True` / `== False` comparisons** (Item 2 / PEP 8): `if x == True:` should be `if x:`. `return self.in_stock == True` should be `return self.in_stock`.

- **Double-underscore name mangling** (Item 42): `self.__items` makes the attribute inaccessible to subclasses and creates maintenance friction. Use single underscore `self._items` to signal "internal use" without enforced hiding.

- **Plain data-holder class without `@dataclass`** (Items 37–43): Any class whose `__init__` only assigns parameters to `self.attr` with no logic should be a `@dataclass`. Dataclasses automatically generate `__repr__`, `__eq__`, and `__init__`, and signal the data-holder intent. **Crucially: `@dataclass` and `@property` can coexist.** If one field needs validation, make it a `@property` with a setter inside the `@dataclass`. This is the correct Pythonic pattern — do NOT abandon `@dataclass` just because one field has a validator.
  ```python
  from dataclasses import dataclass, field

  @dataclass
  class Product:
      name: str
      category: str
      in_stock: bool = True
      _price: float = field(default=0.0, repr=False)

      @property
      def price(self) -> float:
          return self._price

      @price.setter
      def price(self, value: float) -> None:
          if value < 0:
              raise ValueError('Price cannot be negative')
          self._price = value
  ```

- **Missing `__repr__`** (Items 37–43): Any class that is not a `@dataclass` should define `__repr__` to aid debugging. Without it, `repr(obj)` shows only the class name and memory address.

- **Returning `None` for failure** (Item 20): Functions should raise exceptions for error conditions, not return `None`. Returning `None` forces callers to check for `None` every time and doesn't carry error information.

- **`else` block after `for`/`while`** (Item 9): The loop-`else` clause fires when the loop completes without a `break`, which is rarely the intended semantics and confuses readers. Avoid it.
</anti_patterns>
</core_principles>

### Step 5: Report Findings
For each issue found, report:
- **Item number and name** (e.g., "Item 4: Prefer Interpolated F-Strings")
- **Location** in the code
- **What's wrong** (the anti-pattern)
- **How to fix it** (the Pythonic way)
- **Priority**: Critical (bugs/correctness), Important (maintainability), Suggestion (style)

### Step 6: Provide Fixed Code
Offer a corrected version of the code with all issues addressed, with comments explaining each change.

---

## Mode 2: Writing New Code

When the user asks you to **write** new Python code, follow these principles:

### Always Apply These Core Practices

<guidelines>
1. **Follow PEP 8** — Use consistent naming (snake_case for functions/variables, PascalCase for classes). Use `pylint` and `black`-compatible style.

2. **Use f-strings** for string formatting (Item 4). Never use % or .format() for simple cases.

3. **Use unpacking** instead of indexing (Item 6). Prefer `first, second = my_list` over `my_list[0]`.

4. **Use enumerate** instead of range(len(...)) (Item 7).

5. **Use zip** to iterate over multiple lists in parallel (Item 8). Use `zip_longest` from itertools when lengths differ.

6. **Avoid else blocks** after for/while loops (Item 9).

7. **Use assignment expressions** (:= walrus operator) to reduce repetition when appropriate (Item 10).

8. **Raise exceptions** instead of returning None for failure cases (Item 20).

9. **Use `None` as the default for mutable default arguments** (Item 24). Never use `[]`, `{}`, or any other mutable object as a default argument value; initialize inside the function body.

10. **Use keyword-only arguments** for clarity (Item 25). Use positional-only args to separate API from implementation (Item 25).

11. **Use functools.wraps** on all decorators (Item 26).

12. **Prefer comprehensions** over map/filter (Item 27). Keep them simple — no more than two expressions (Item 28).

13. **Use generators** for large sequences instead of returning lists (Item 30).

14. **Use `@dataclass`** for plain data-holder classes (Items 37–43). A `@dataclass` automatically provides `__init__`, `__repr__`, and `__eq__`, and makes the data-holder intent explicit. Only write a manual `__init__` when you need real logic that a dataclass can't handle. Add `__repr__` to any class that doesn't use `@dataclass`, to make debugging easier.

15. **Prefer composition** over deeply nested classes (Item 37).

16. **Use @classmethod** for polymorphic constructors (Item 39).

17. **Always call super().__init__** (Item 40).

18. **Use plain attributes** instead of getter/setter methods. Use @property for special behavior (Item 44).

19. **Use try/except/else/finally** structure correctly (Item 65). Always catch specific exception types, never bare `except:`.

20. **Write docstrings** for every module, class, and function (Item 84).
</guidelines>

### Code Structure Template

<examples>
<example id="1" title="Module and class structure template">

When writing new modules or classes, follow this structure:

```python
"""Module docstring describing purpose."""

# Standard library imports
# Third-party imports
# Local imports

# Module-level constants

class MyClass:
    """Class docstring describing purpose and usage.

    Attributes:
        attr_name: Description of attribute.
    """

    def __init__(self, param: type) -> None:
        """Initialize with description of params."""
        self.param = param  # Use public attributes (Item 42)

    @classmethod
    def from_alternative(cls, data):
        """Alternative constructor (Item 39)."""
        return cls(processed_data)

    def method(self, arg: type) -> return_type:
        """Method docstring.

        Args:
            arg: Description.

        Returns:
            Description of return value.

        Raises:
            ValueError: When arg is invalid (Item 20).
        """
        pass
```
</example>

<example id="2" title="Mutable default argument — correct pattern">

```python
# WRONG — mutable default causes shared state across all calls
def append_to(element, to=[]):
    to.append(element)
    return to

# RIGHT — use None sentinel, initialize inside
def append_to(element, to=None):
    if to is None:
        to = []
    to.append(element)
    return to
```
</example>

<example id="3" title="Plain data holder — use @dataclass, even with @property validation">

```python
# WRONG — manual __init__ boilerplate for data holder
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

# RIGHT — @dataclass provides __init__, __repr__, __eq__ for free
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float
```

**Important:** `@dataclass` and `@property` are compatible. When one field needs validation, use both — the `@dataclass` handles the boilerplate and the `@property` handles validation. Do NOT fall back to a plain class just because one field has a setter.

```python
# WRONG — abandoning @dataclass because price needs validation
class Product:
    def __init__(self, name, price, category):
        self.name = name
        self.price = price   # validation via set_price()
        self.category = category

    def set_price(self, value):
        if value < 0:
            raise ValueError("Price cannot be negative")
        self.price = value

# RIGHT — @dataclass + @property work together
from dataclasses import dataclass, field

@dataclass
class Product:
    name: str
    category: str
    in_stock: bool = True
    _price: float = field(default=0.0, repr=False)

    @property
    def price(self) -> float:
        return self._price

    @price.setter
    def price(self, value: float) -> None:
        if value < 0:
            raise ValueError("Price cannot be negative")
        self._price = value
```
</example>

<example id="4" title="Getter/setter vs plain attribute and @property">

```python
# WRONG — Java-style getter/setter
class Temperature:
    def get_celsius(self):
        return self._celsius

    def set_celsius(self, value):
        if value < -273.15:
            raise ValueError("Temperature below absolute zero")
        self._celsius = value

# RIGHT — use @property for validation, direct access otherwise
class Temperature:
    def __init__(self, celsius: float) -> None:
        self.celsius = celsius  # triggers setter on construction

    @property
    def celsius(self) -> float:
        return self._celsius

    @celsius.setter
    def celsius(self, value: float) -> None:
        if value < -273.15:
            raise ValueError("Temperature below absolute zero")
        self._celsius = value
```
</example>

<example id="5" title="List comprehension vs manual loop">

```python
# WRONG — manual loop to build list
result = []
for order in orders:
    if order['total'] > threshold:
        result.append(order)

# RIGHT — list comprehension
result = [order for order in orders if order['total'] > threshold]
```
</example>
</examples>

### Concurrency Guidelines

- Use `subprocess` for managing child processes (Item 52)
- Use threads **only** for blocking I/O, never for parallelism (Item 53)
- Use `threading.Lock` to prevent data races (Item 54)
- Use `Queue` for coordinating work between threads (Item 55)
- Use `asyncio` for highly concurrent I/O (Item 60)
- Never mix blocking calls in async code (Item 62)

### Testing Guidelines

- Subclass `TestCase` and use `setUp`/`tearDown` (Item 78)
- Use `unittest.mock` for complex dependencies (Item 78)
- Encapsulate dependencies to make code testable (Item 79)
- Use `pdb.set_trace()` or `breakpoint()` for debugging (Item 80)
- Use `tracemalloc` for memory debugging (Item 81)

---

## Priority of Items by Impact

When time is limited, focus on these highest-impact items first:

### Critical (Correctness & Bugs)
- Item 20: Raise exceptions instead of returning None
- Item 24: Use None as default for mutable arguments (never `[]` or `{}`)
- Item 53: Use threads for I/O only, not parallelism
- Item 54: Use Lock to prevent data races
- Item 40: Initialize parent classes with super()
- Item 65: Use try/except/else/finally correctly; always catch specific exception types
- Item 73: Use datetime instead of time module for timezone handling

### Important (Maintainability)
- Item 1: Follow PEP 8 style
- Item 4: Use f-strings
- Item 7: Use `for item in seq` or `enumerate`; never `range(len(seq))`
- Item 19: Never unpack more than 3 variables
- Item 25: Use keyword-only and positional-only arguments
- Item 26: Use functools.wraps for decorators
- Items 37–43: Use `@dataclass` for plain data holders; add `__repr__` to any class without it
- Item 42: Prefer public attributes over private; use single underscore for internal
- Item 44: Use plain attributes over getter/setter; use @property for validation
- Item 66: Use `@contextmanager` for reusable resource management patterns
- Item 84: Write docstrings for all public APIs

### Suggestions (Polish & Optimization)
- Item 8: Use zip for parallel iteration
- Item 10: Use walrus operator to reduce repetition
- Item 27: Use comprehensions over map/filter and manual loops
- Item 30: Use generators for large sequences
- Item 70: Profile before optimizing (cProfile)

---

## Reviewing Already-Good Code

When the submitted code is already idiomatic and well-structured, the review must:

1. **Lead with affirmative praise** — say explicitly that the code is idiomatic / well-written.
2. **Call out each strong pattern by name and item**, e.g.:
   - `@contextmanager` usage → praise as Item 66
   - Generator functions (`yield`) → praise as Item 30
   - Type annotations on public functions → praise as Item 84
   - Docstrings on public APIs → praise as Item 84
   - `@dataclass` for data holders → praise as Items 37–43
   - List/dict/set comprehensions → praise as Item 27
3. **Do not invent problems.** If something is genuinely fine, do not flag it as an issue.
4. **Clearly label any suggestion as optional** — use language like "minor suggestion", "stylistic alternative", or "optional improvement", never "issue" or "problem".
5. **Keep the tone positive** — the goal is to affirm and explain why the patterns are good, not to find fault.
