import type { AuthError, User } from "@supabase/supabase-js"
import { supabase } from "./supabase"

// A missing session is a normal signed-out state; preserve every other error.
export async function getCurrentUser(
  jwt?: string,
): Promise<{
  data: { user: User | null }
  error: AuthError | null
}> {
  const result = await supabase.auth.getUser(jwt)
  return result.error?.name === "AuthSessionMissingError"
    ? { data: { user: null }, error: null }
    : result
}
