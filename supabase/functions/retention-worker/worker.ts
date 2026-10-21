import type { SupabaseClient } from "npm:@supabase/supabase-js@2.116.0"

type Job = { id: string; user_id: string; lease: string }
type FileTask = { id: string; bucket: string; path: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function workerRpc(admin: SupabaseClient, action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await admin.rpc("retention_worker", { p_action: action, p_payload: payload })
  if (error) throw new Error("database_failed")
  return data
}

/** One bounded batch. All paths come from a server-created, account-scoped manifest. */
export async function processDeletion(admin: SupabaseClient, requestedJob?: string, expectedUser?: string) {
  const job: Job | null = await workerRpc(admin, "claim", requestedJob ? { job_id: requestedJob } : {})
  if (!job) return { completed: false, queued: true, claimed: false }
  if (!uuid.test(job.id) || !uuid.test(job.user_id) || !uuid.test(job.lease) || (requestedJob && job.id !== requestedJob) || (expectedUser && job.user_id !== expectedUser)) throw new Error("Invalid job identity")
  const lease = { job_id: job.id, lease: job.lease }
  let code = "database_failed"
  try {
    const files: FileTask[] = await workerRpc(admin, "files", lease)
    if (!Array.isArray(files)) throw new Error("database_failed")
    for (const bucket of ["avatars", "community_recipe_images", "chat_images"]) {
      const group = files.filter(file => file.bucket === bucket)
      if (!group.length) continue
      if (group.some(file => !uuid.test(file.id) || !file.path || file.path.startsWith("/") || file.path.split("/").includes(".."))) throw new Error("Invalid file task")
      code = "storage_cleanup_failed"
      const removed = await admin.storage.from(bucket).remove(group.map(file => file.path))
      if (removed.error) throw new Error(code)
      code = "database_failed"
      if (await workerRpc(admin, "files_ack", { ...lease, ids: group.map(file => file.id) }) !== true) throw new Error(code)
    }
    if (files.some(file => !["avatars", "community_recipe_images", "chat_images"].includes(file.bucket))) throw new Error("Invalid bucket")
    if (await workerRpc(admin, "ready", lease) !== true) {
      await workerRpc(admin, "retry", { ...lease, code: "batch_pending" })
      return { completed: false, queued: true, claimed: true }
    }
    code = "auth_delete_failed"
    const lookup = await admin.auth.admin.getUserById(job.user_id)
    const missing = lookup.error?.status === 404 || lookup.error?.code === "user_not_found"
    if (lookup.error && !missing) throw new Error(code)
    if (!missing) {
      if (lookup.data?.user?.id !== job.user_id) throw new Error(code)
      const deleted = await admin.auth.admin.deleteUser(job.user_id)
      if (deleted.error) throw new Error(code)
    }
    code = "database_failed"
    const complete = await workerRpc(admin, "complete", lease)
    if (complete?.completed !== true || complete?.job_id !== job.id) throw new Error(code)
    return { completed: true, queued: false, claimed: true }
  } catch {
    // Never store raw provider errors, addresses, paths or request bodies in retry logs.
    try { await workerRpc(admin, "retry", { ...lease, code }) } catch { /* Expired leases are reclaimed by the scheduler. */ }
    return { completed: false, queued: true, claimed: true }
  }
}

async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("")
}

export async function maintainBackups(admin: SupabaseClient) {
  const totals = { verified: 0, expired: 0, failures: 0 }
  const receipt = await workerRpc(admin, "receipt")
  if (receipt) {
    try {
      if (!uuid.test(receipt.id) || receipt.path !== `${receipt.id}.pgp` || Date.parse(receipt.expires_at) <= Date.now()) throw new Error("Invalid receipt")
      const bytes = Uint8Array.from(atob(receipt.body), char => char.charCodeAt(0))
      if (await sha256(bytes) !== receipt.sha256) throw new Error("Invalid receipt hash")
      const bucket = admin.storage.from("retention-backups")
      const upload = await bucket.upload(receipt.path, bytes, { contentType: "application/octet-stream", upsert: true, cacheControl: "0" })
      if (upload.error) throw new Error("Backup upload failed")
      const check = await bucket.download(receipt.path)
      if (check.error || !check.data || await sha256(new Uint8Array(await check.data.arrayBuffer())) !== receipt.sha256) throw new Error("Backup verification failed")
      if (await workerRpc(admin, "receipt_ack", { id: receipt.id, sha256: receipt.sha256 }) !== true) throw new Error("Backup acknowledgement failed")
      totals.verified++
    } catch { totals.failures++ }
  }
  const expired: { job_id: string | null; path: string }[] = await workerRpc(admin, "expired")
  for (const row of expired) {
    try {
      if (!uuid.test(row.path.replace(/\.pgp$/, "")) || !row.path.endsWith(".pgp")) throw new Error("Invalid expired path")
      const removed = await admin.storage.from("retention-backups").remove([row.path])
      if (removed.error) throw new Error("Expiry cleanup failed")
      if (await workerRpc(admin, "expired_ack", row) !== true) throw new Error("Expiry not confirmed")
      totals.expired++
    } catch { totals.failures++ }
  }
  return totals
}
