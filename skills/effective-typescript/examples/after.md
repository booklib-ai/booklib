# After: Effective TypeScript

The same API client rewritten applying Effective TypeScript principles.

```typescript
// tsconfig.json has "strict": true (Item 2)

// Extract repeated shape into a named type (Item 14)
interface User {
  readonly id: UserId;   // Item 17: readonly on identity fields
  name: string;
  email: string;
  role: 'admin' | 'viewer' | 'editor';  // Item 33: literal union, not plain string
}

// Branded type prevents passing a raw string where a UserId is expected (Item 37)
type UserId = string & { readonly __brand: 'UserId' };

// Tagged union — only valid states are representable (Item 28, 32)
// Impossible: { status: 'loading', data: [...] } or { status: 'success', error: '...' }
type RequestState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

// Return unknown from untrusted sources — callers must narrow (Item 42)
async function getUser(id: UserId): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw: unknown = await response.json();
  // Unsafe assertion scoped inside well-typed function boundary (Item 40)
  return raw as User;
}

// Type declaration, not assertion (Item 9)
const userIdInput: HTMLInputElement | null = document.getElementById('user-id') as HTMLInputElement | null;

// Null pushed to the perimeter — caller handles it once (Item 31)
function processUser(user: User): string {
  return user.name.toUpperCase(); // safe — name: string, not string | null
}

// String literal union, not plain string (Item 33)
type Direction = 'north' | 'south' | 'east' | 'west';
function setDirection(direction: Direction) {
  // TypeScript rejects "sideways" at compile time
}

// async/await over callbacks — types flow naturally (Item 25)
async function fetchProfile(id: UserId): Promise<User> {
  const response = await fetch(`/api/profiles/${id}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as User;
}

// Named type used in all three functions — DRY (Item 14)
function renderAdmin(user: User): void {}
function updateAdmin(user: User): void {}
function deleteAdmin(user: User): void {}
```

**Key improvements:**
- `strict: true` enables `noImplicitAny` and `strictNullChecks` (Item 2)
- `RequestState<T>` tagged union eliminates impossible states (Items 28, 32)
- `UserId` branded type prevents mixing up `string` IDs (Item 37)
- `role` is a literal union, not `string` (Item 33)
- `unknown` returned from untrusted JSON; unsafe assertion hidden inside typed boundary (Items 40, 42)
- `async`/`await` replaces callback (Item 25)
- `User` interface defined once and reused (Item 14)
- `readonly` on `id` prevents accidental reassignment (Item 17)
