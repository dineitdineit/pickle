import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.116.0"
import { maintainBackups, processDeletion, workerRpc } from "./worker.ts"

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 })
  const secret = request.headers.get("X-Retention-Worker-Secret") ?? ""
  if (!/^[a-f0-9]{64}$/.test(secret)) return Response.json({ error: "unauthorized" }, { status: 401 })
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return Response.json({ error: "not_configured" }, { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    if (await workerRpc(admin, "verify_secret", { secret }) !== true) return Response.json({ error: "unauthorized" }, { status: 401 })
    const started = Date.now()
    const counts = { completed: 0, queued: 0 }
    for (let index = 0; index < 3 && Date.now() - started < 40000; index++) {
      const result = await processDeletion(admin)
      if (!result.claimed) break
      if (result.completed) counts.completed++
      else counts.queued++
    }
    const backups = await maintainBackups(admin)
    return Response.json({ ...counts, backups })
  } catch { return Response.json({ error: "retention_worker_unavailable" }, { status: 503 }) }
})
