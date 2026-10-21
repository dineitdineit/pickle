import type { SupabaseClient } from "npm:@supabase/supabase-js@2.116.0"

export async function cleanRecipeAssets(admin: SupabaseClient) {
  const result = { removed: 0, retry: 0 }
  const started = Date.now()
  for (let index = 0; index < 25 && Date.now() - started < 40000; index++) {
    const claim = await admin.rpc("recipe_asset_worker", { p_action: "claim", p_payload: {} })
    if (claim.error) throw new Error("queue_unavailable")
    if (!claim.data) break
    const job = claim.data as { path: string; lease: string }
    if (typeof job.path !== "string" || job.path.length > 1024 ||
        !/^[0-9a-f-]{36}\/.+/i.test(job.path) || job.path.split("/").some(part => !part || part === "." || part === "..") || job.path.includes("\\") ||
        !/^[0-9a-f-]{36}$/i.test(job.lease)) throw new Error("invalid_task")
    try {
      const removed = await admin.storage.from("community_recipe_images").remove([job.path])
      if (removed.error) throw new Error("storage_failed")
      const ack = await admin.rpc("recipe_asset_worker", { p_action: "ack", p_payload: job })
      if (ack.error || ack.data !== true) throw new Error("ack_failed")
      result.removed++
    } catch {
      await admin.rpc("recipe_asset_worker", { p_action: "retry", p_payload: job })
      result.retry++
    }
  }
  return result
}
