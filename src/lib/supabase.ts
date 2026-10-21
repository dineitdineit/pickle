import { createClient } from "@supabase/supabase-js"
import { syncSearchOwner } from "../recentSearches"
import { Capacitor } from "@capacitor/core"
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing Supabase environment variables")
}
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  Capacitor.getPlatform() === "android"
    ? {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      }
    : undefined,
)
// The recent-search key predates account scoping: clear it across every auth change,
// including changes made in another tab. Do not retain the previous user's terms.
supabase.auth.onAuthStateChange((event, session) => {
  syncSearchOwner(session?.user.id ?? null, event === "SIGNED_OUT")
  if (Capacitor.getPlatform() === "android") {
    const owner = session?.user.id ?? null
    // Run outside the auth callback lock; registration calls authenticated RPCs.
    setTimeout(() => {
      void import("./androidPush")
        .then(({ syncAndroidPushUser }) => syncAndroidPushUser(owner))
        .catch(() => {})
    }, 0)
  }
})
