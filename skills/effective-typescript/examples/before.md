# Before: Effective TypeScript

An API client for a user management service — written without applying Effective TypeScript principles.

```typescript
// No strict mode, any used freely, type assertions everywhere

async function getUser(id: string): Promise<any> {
  const response = await fetch(`/api/users/${id}`);
  const data = await response.json();
  return data;
}

function processUser(user: any) {
  console.log(user.name.toUpperCase()); // no null check, will crash if name is null
}

// Interface of unions — impossible states are representable
interface RequestState {
  loading: boolean;
  data?: any[];       // present when loading is false AND succeeded
  error?: string;     // present when loading is false AND failed
  // What does { loading: false, data: [...], error: "oops" } mean?
}

// Plain string types instead of literal unions
function setDirection(direction: string) {
  // accepts "north", "sideways", "diagonal", anything
}

// Type assertion instead of declaration
const userId = document.getElementById('user-id') as HTMLInputElement;
const value = userId.value as string;

// Callback-based async
function fetchProfile(id: string, callback: (err: Error | null, data: any) => void) {
  fetch(`/api/profiles/${id}`)
    .then(res => res.json())
    .then(data => callback(null, data))
    .catch(err => callback(err, null));
}

// Repeated type shape — DRY violation
function renderAdmin(user: { id: string; name: string; email: string; role: string }) {}
function updateAdmin(user: { id: string; name: string; email: string; role: string }) {}
function deleteAdmin(user: { id: string; name: string; email: string; role: string }) {}
```
