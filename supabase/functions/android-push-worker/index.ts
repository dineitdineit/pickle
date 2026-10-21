import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.116.0"
import { handlePushWorker } from "./worker.ts"

Deno.serve((request: Request) => {
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key)
    return Response.json({ error: "not_configured" }, { status: 503 })
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return handlePushWorker(request, {
    credential: Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON"),

    expectedProject: "pickle-d7dcb",
    enabled: Deno.env.get("PUSH_DELIVERY_ENABLED") === "true",
    rpc: (name, args) => db.rpc(name, args),
    fetch,
  })
})
