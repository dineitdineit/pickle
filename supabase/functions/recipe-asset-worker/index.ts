import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.116.0"
import { cleanRecipeAssets } from "./worker.ts"

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 })
  const secret = request.headers.get("X-Retention-Worker-Secret") ?? ""
  if (!/^[a-f0-9]{64}$/.test(secret)) return Response.json({ error: "unauthorized" }, { status: 401 })
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return Response.json({ error: "not_configured" }, { status: 503 })
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(10000) }) },
  })
  try {
    const verified = await admin.rpc("retention_worker", { p_action: "verify_secret", p_payload: { secret } })
    if (verified.error || verified.data !== true) return Response.json({ error: "unauthorized" }, { status: 401 })
    return Response.json(await cleanRecipeAssets(admin))
  } catch { return Response.json({ error: "cleanup_unavailable" }, { status: 503 }) }
})
