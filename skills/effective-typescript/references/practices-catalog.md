# Effective TypeScript — Practices Catalog

Deep before/after examples for the 20 most impactful items.

---

## Item 2: Know Which TypeScript Options You're Using

Always use `strict: true`. It enables `noImplicitAny` and `strictNullChecks` which catch the most common TypeScript bugs.

**Before:**
```json
{ "compilerOptions": {} }
```
**After:**
```json
{ "compilerOptions": { "strict": true, "target": "ES2020", "module": "commonjs" } }
```

---

## Item 9: Prefer Type Declarations to Type Assertions

**Before:**
```typescript
const user = {} as User;  // bypasses type checking — user is actually empty
const input = document.getElementById('name') as HTMLInputElement;
```
**After:**
```typescript
const user: User = { id: '1', name: 'Alice', email: 'a@example.com' }; // checked
const input = document.getElementById('name');
if (input instanceof HTMLInputElement) {
  console.log(input.value); // narrowed, not asserted
}
```

---

## Item 10: Avoid Object Wrapper Types

**Before:**
```typescript
function greet(name: String) { // String, not string
  return 'Hello ' + name;
}
const s = new String('world');
greet(s); // works but s !== 'world' as a primitive
```
**After:**
```typescript
function greet(name: string) {  // primitive type
  return 'Hello ' + name;
}
```

---

## Item 13: Know the Differences Between `type` and `interface`

- Use `interface` for object shapes that consumers may need to extend (open for augmentation)
- Use `type` for unions, intersections, tuples, and mapped types (cannot be augmented)

**Before:**
```typescript
type User = { id: string; name: string }; // fine, but can't be augmented by consumers
type StringOrNumber = string | number;     // correct use of type
```
**After:**
```typescript
interface User { id: string; name: string; }  // open for extension
type StringOrNumber = string | number;         // unions must be type aliases
type ReadonlyUser = Readonly<User>;            // mapped type must be type alias
```

---

## Item 14: Use Type Operations and Generics to Avoid Repeating Yourself

**Before:**
```typescript
interface SavedState { userId: string; name: string; lastSaved: Date; }
interface UnsavedState { userId: string; name: string; }  // repeated fields
```
**After:**
```typescript
interface State { userId: string; name: string; }
interface SavedState extends State { lastSaved: Date; }
// Or with Pick/Omit:
type UnsavedState = Omit<SavedState, 'lastSaved'>;
```

---

## Item 17: Use `readonly` to Avoid Errors Associated with Mutation

**Before:**
```typescript
function sort(arr: number[]): number[] {
  return arr.sort(); // mutates the original array!
}
```
**After:**
```typescript
function sort(arr: readonly number[]): number[] {
  return [...arr].sort(); // forced to copy — cannot mutate readonly input
}
```

---

## Item 22: Understand Type Narrowing

**Before:**
```typescript
function processInput(val: string | null) {
  console.log(val.toUpperCase()); // error: val is possibly null
}
```
**After:**
```typescript
function processInput(val: string | null) {
  if (val === null) return;
  console.log(val.toUpperCase()); // narrowed to string
}

// instanceof narrowing
function format(val: Date | string) {
  if (val instanceof Date) return val.toISOString();
  return val.toUpperCase();
}
```

---

## Item 25: Use async Functions Instead of Callbacks for Asynchronous Code

Callbacks produce `any`-typed errors and complex nested types. `async`/`await` lets TypeScript infer `Promise<T>` cleanly.

**Before:**
```typescript
function fetchData(url: string, cb: (err: any, data: any) => void) {
  fetch(url)
    .then(r => r.json())
    .then(d => cb(null, d))
    .catch(e => cb(e, null));
}
```
**After:**
```typescript
async function fetchData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as T;
}
```

---

## Item 28: Prefer Types That Always Represent Valid States

**Before:**
```typescript
interface Page {
  pageText: string;
  isLoading: boolean;
  error: string; // What does isLoading:true + error:'...' mean?
}
```
**After:**
```typescript
type Page =
  | { state: 'loading' }
  | { state: 'success'; pageText: string }
  | { state: 'error'; error: string };
// Every combination is meaningful — no impossible states
```

---

## Item 31: Push Null Values to the Perimeter

**Before:**
```typescript
// null scattered throughout
function getUser(id: string | null): User | null {
  if (!id) return null;
  const user: User | null = db.find(id) ?? null;
  return user;
}
```
**After:**
```typescript
// null handled once at the boundary
function getUser(id: string): User {
  const user = db.find(id);
  if (!user) throw new Error(`User ${id} not found`);
  return user;
}
// Callers who might not have an id handle it at their boundary
```

---

## Item 32: Prefer Unions of Interfaces to Interfaces of Unions

**Before:**
```typescript
interface Layer {
  type: 'fill' | 'line' | 'point';
  fillColor?: string;   // only for fill
  lineWidth?: number;   // only for line
  pointRadius?: number; // only for point
  // { type: 'fill', lineWidth: 5 } is representable but invalid
}
```
**After:**
```typescript
interface FillLayer   { type: 'fill';  fillColor: string; }
interface LineLayer   { type: 'line';  lineWidth: number; }
interface PointLayer  { type: 'point'; pointRadius: number; }
type Layer = FillLayer | LineLayer | PointLayer;
// Each valid state has exactly the right fields
```

---

## Item 33: Prefer More Precise Alternatives to String Types

**Before:**
```typescript
function setAlignment(align: string) {} // accepts anything
interface Album { genre: string; }      // 'rock', 'jazz', or 'anything'?
```
**After:**
```typescript
type Alignment = 'left' | 'center' | 'right';
function setAlignment(align: Alignment) {}

type Genre = 'rock' | 'jazz' | 'pop' | 'classical';
interface Album { genre: Genre; }
```

---

## Item 38: Use the Narrowest Possible Scope for `any` Types

**Before:**
```typescript
const config: any = JSON.parse(rawConfig); // entire variable is any
console.log(config.timeout);               // no type checking from here on
```
**After:**
```typescript
const config = JSON.parse(rawConfig) as { timeout: number; retries: number };
// or better — parse with unknown and narrow:
const raw: unknown = JSON.parse(rawConfig);
const timeout = (raw as { timeout: number }).timeout; // any scoped to one property access
```

---

## Item 40: Hide Unsafe Type Assertions in Well-Typed Functions

**Before:**
```typescript
// Assertion visible at every call site
const user = fetchUser() as User;
```
**After:**
```typescript
// Assertion encapsulated once — all callers get proper types
async function fetchUser(id: string): Promise<User> {
  const raw: unknown = await fetch(`/api/users/${id}`).then(r => r.json());
  return raw as User; // single controlled assertion inside typed boundary
}
```

---

## Item 42: Use `unknown` Instead of `any` for Values with an Unknown Type

**Before:**
```typescript
function parseYaml(yaml: string): any { // callers never have to narrow
  return parse(yaml);
}
const config = parseYaml(raw);
config.port.toFixed(); // no error — but crashes if port is missing
```
**After:**
```typescript
function parseYaml(yaml: string): unknown { // callers must narrow before use
  return parse(yaml);
}
const config = parseYaml(raw);
if (typeof config === 'object' && config !== null && 'port' in config) {
  const port = (config as { port: number }).port;
}
```

---

## Item 47: Export All Types That Appear in Public APIs

**Before:**
```typescript
// Unexported — users have to use ReturnType<typeof getUser> hacks
interface User { id: string; name: string; }
export function getUser(id: string): User { ... }
```
**After:**
```typescript
export interface User { id: string; name: string; } // exported explicitly
export function getUser(id: string): User { ... }
```

---

## Item 48: Use TSDoc for API Comments

**Before:**
```typescript
// Fetches user by id. Returns null if not found.
function getUser(id: string): User | null { ... }
```
**After:**
```typescript
/**
 * Fetches a user by their unique identifier.
 *
 * @param id - The user's unique identifier
 * @returns The user, or null if no user exists with that id
 * @throws {NetworkError} If the network request fails
 */
function getUser(id: string): User | null { ... }
```

---

## Item 53: Prefer ECMAScript Features to TypeScript Features

Avoid TypeScript-specific features that don't map cleanly to JavaScript. Prefer standard ES features.

**Before:**
```typescript
// TypeScript enums — compiled to objects with side effects, can't be tree-shaken
enum Direction { North, South, East, West }
```
**After:**
```typescript
// Const object + type — tree-shakeable, maps cleanly to JS
const Direction = { North: 'North', South: 'South', East: 'East', West: 'West' } as const;
type Direction = typeof Direction[keyof typeof Direction];
```

---

## Item 62: Don't Consider Migration Complete Until You Enable `noImplicitAny`

The final step of any JS→TS migration. Without it, TypeScript silently accepts untyped code.

```json
// tsconfig.json — final migration milestone
{
  "compilerOptions": {
    "strict": true,          // includes noImplicitAny and strictNullChecks
    "noImplicitAny": true    // explicit — every value must have a type
  }
}
```
