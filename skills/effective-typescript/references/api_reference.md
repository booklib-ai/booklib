# Effective TypeScript — All 62 Items

All items from Dan Vanderkam's "Effective TypeScript" organized by chapter with priority levels.

## Chapter 1: Getting to Know TypeScript (Items 1–5)

| Item | Title | Priority |
|------|-------|----------|
| 1 | Understand the Relationship Between TypeScript and JavaScript | Important |
| 2 | Know Which TypeScript Options You're Using | **Critical** |
| 3 | Understand That Code Generation Is Independent of Types | Important |
| 4 | Get Comfortable with Structural Typing | Important |
| 5 | Limit Use of the `any` Type | **Critical** |

## Chapter 2: TypeScript's Type System (Items 6–18)

| Item | Title | Priority |
|------|-------|----------|
| 6 | Use Your Editor to Interrogate and Explore the Type System | Suggestion |
| 7 | Think of Types as Sets of Values | Important |
| 8 | Know How to Tell Whether a Symbol Is in the Type Space or Value Space | Important |
| 9 | Prefer Type Declarations to Type Assertions | **Critical** |
| 10 | Avoid Object Wrapper Types (String, Number, Boolean, Symbol, BigInt) | **Critical** |
| 11 | Recognize the Limits of Excess Property Checking | Important |
| 12 | Apply Types to Entire Function Expressions When Possible | Important |
| 13 | Know the Differences Between `type` and `interface` | Important |
| 14 | Use Type Operations and Generics to Avoid Repeating Yourself | Important |
| 15 | Use Index Signatures for Dynamic Data | Important |
| 16 | Prefer Arrays, Tuples, and ArrayLike to `number` Index Signatures | Suggestion |
| 17 | Use `readonly` to Avoid Errors Associated with Mutation | Important |
| 18 | Use Mapped Types to Keep Values in Sync | Important |

## Chapter 3: Type Inference (Items 19–27)

| Item | Title | Priority |
|------|-------|----------|
| 19 | Avoid Cluttering Your Code with Inferable Types | Suggestion |
| 20 | Use Different Variables for Different Types | Important |
| 21 | Understand Type Widening | Important |
| 22 | Understand Type Narrowing | **Critical** |
| 23 | Create Objects All at Once | Important |
| 24 | Be Consistent in Your Use of Aliases | Important |
| 25 | Use `async` Functions Instead of Callbacks for Asynchronous Code | Important |
| 26 | Understand How Context Is Used in Type Inference | Important |
| 27 | Use Functional Constructs and Libraries to Help Types Flow | Suggestion |

## Chapter 4: Type Design (Items 28–37)

| Item | Title | Priority |
|------|-------|----------|
| 28 | Prefer Types That Always Represent Valid States | **Critical** |
| 29 | Be Liberal in What You Accept and Strict in What You Produce | Important |
| 30 | Don't Repeat Type Information in Documentation | Important |
| 31 | Push Null Values to the Perimeter of Your Types | **Critical** |
| 32 | Prefer Unions of Interfaces to Interfaces of Unions | **Critical** |
| 33 | Prefer More Precise Alternatives to String Types | Important |
| 34 | Prefer Incomplete Types to Inaccurate Types | Important |
| 35 | Generate Types from APIs and Specs, Not Data | Suggestion |
| 36 | Name Types Using the Language of Your Problem Domain | Important |
| 37 | Consider "Brands" for Nominal Typing | Suggestion |

## Chapter 5: Working with any (Items 38–44)

| Item | Title | Priority |
|------|-------|----------|
| 38 | Use the Narrowest Possible Scope for `any` Types | **Critical** |
| 39 | Prefer More Precise Variants of `any` to Plain `any` | Important |
| 40 | Hide Unsafe Type Assertions in Well-Typed Functions | Important |
| 41 | Understand Evolving `any` | Important |
| 42 | Use `unknown` Instead of `any` for Values with an Unknown Type | **Critical** |
| 43 | Prefer Type-Safe Approaches to Monkey Patching | Important |
| 44 | Track Your Type Coverage to Prevent Regressions in Type Safety | Suggestion |

## Chapter 6: Type Declarations and @types (Items 45–52)

| Item | Title | Priority |
|------|-------|----------|
| 45 | Put TypeScript and `@types` in devDependencies | Important |
| 46 | Understand the Three Versions Involved in Type Declarations | Important |
| 47 | Export All Types That Appear in Public APIs | Important |
| 48 | Use TSDoc for API Comments | Important |
| 49 | Provide a Type for `this` in Callbacks | Important |
| 50 | Prefer Conditional Types to Overloaded Declarations | Suggestion |
| 51 | Mirror Types to Sever Dependencies | Suggestion |
| 52 | Be Aware of the Pitfalls of Testing Types | Important |

## Chapter 7: Writing and Running Your Code (Items 53–57)

| Item | Title | Priority |
|------|-------|----------|
| 53 | Prefer ECMAScript Features to TypeScript Features | Important |
| 54 | Know How to Iterate Over Objects | Important |
| 55 | Understand the DOM Hierarchy | Important |
| 56 | Don't Rely on `private` to Hide Information | Important |
| 57 | Use Source Maps to Debug TypeScript | Suggestion |

## Chapter 8: Migrating to TypeScript (Items 58–62)

| Item | Title | Priority |
|------|-------|----------|
| 58 | Write Modern JavaScript | Important |
| 59 | Use `@ts-check` and JSDoc to Experiment with TypeScript | Suggestion |
| 60 | Use `allowJs` to Mix TypeScript and JavaScript | Important |
| 61 | Convert Module by Module Up Your Dependency Graph | Important |
| 62 | Don't Consider Migration Complete Until You Enable `noImplicitAny` | **Critical** |

---

## Priority Summary

**Critical (fix immediately — correctness or safety)**
Items: 2, 5, 9, 10, 22, 28, 31, 32, 38, 42, 62

**Important (fix soon — maintainability and idiom)**
Items: 3, 4, 7, 8, 11, 12, 13, 14, 15, 17, 18, 20, 21, 23, 24, 25, 26, 29, 30, 33, 34, 36, 39, 40, 41, 43, 45, 46, 47, 48, 49, 52, 53, 54, 55, 56, 58, 60, 61

**Suggestion (polish when time allows)**
Items: 6, 16, 19, 27, 35, 37, 44, 50, 51, 57, 59
