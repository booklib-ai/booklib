# Before: Agent writes code without checking BookLib for post-training knowledge

The agent is asked to create a Supabase auth flow. Without calling the BookLib
lookup tool, it uses patterns from its training data which are outdated.

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, key)

// Wrong: uses deprecated v1 auth pattern
const { data, error } = await supabase.auth.session()

// Wrong: old sign-in method
const { user, error: signInError } = await supabase.auth.signIn({
  email: 'user@example.com',
  password: 'password123',
})

// Wrong: old subscription pattern  
const subscription = supabase
  .from('messages')
  .on('INSERT', payload => console.log(payload))
  .subscribe()
```

The code compiles but uses deprecated APIs that will fail at runtime.
