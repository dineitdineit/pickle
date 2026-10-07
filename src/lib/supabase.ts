import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)

// In the browser, having no active session is a normal signed-out state, not a
// network/data-loading failure. Supabase getUser() reports that case as an
// AuthSessionMissingError, so normalize only that specific case to user: null.
const originalGetUser = supabase.auth.getUser.bind(supabase.auth)

supabase.auth.getUser = async (jwt?: string) => {
  const result = await originalGetUser(jwt)

  if (result.error?.name === 'AuthSessionMissingError') {
    return {
      data: { user: null },
      error: null,
    }
  }

  return result
}
