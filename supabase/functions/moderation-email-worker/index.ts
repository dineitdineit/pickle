import { createClient } from "npm:@supabase/supabase-js@2.116.0"
import { handleWorker } from "./worker.ts"

Deno.serve((request: Request) => {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key)
    return Response.json({ error: "worker_not_configured" }, { status: 503 })
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return handleWorker(request, {
    secret: Deno.env.get("MODERATION_WORKER_SECRET"),
    apiKey: Deno.env.get("RESEND_API_KEY"),
    sender: Deno.env.get("MODERATION_EMAIL_FROM"),
    rpc: (name, args) => db.rpc(name, args),
    fetch,
  })
})
