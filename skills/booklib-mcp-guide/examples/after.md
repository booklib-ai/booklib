# After: Agent calls BookLib lookup before writing code

The agent calls lookup("supabase auth session") and gets the current v2.95 API.
It then writes code using the correct patterns.

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
})

// Correct: v2.95 session pattern
const { data: { session } } = await supabase.auth.getSession()

// Correct: v2 sign-in with password
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123',
})

// Correct: v2 realtime channel pattern
const channel = supabase
  .channel('messages')
  .on('postgres_changes', { event: 'INSERT', schema: 'public' }, payload => {
    console.log(payload)
  })
  .subscribe()
```

The agent used current APIs because BookLib injected the correct knowledge.
