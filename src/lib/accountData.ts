/** Clear this account's draft cache plus the shared recent-search list on this device. */

export async function clearDeletedAccountCache(userId: string) {
  let cleared = true
  try {
    const prefix = `pickle:recipe-draft:${userId}`

    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    )

    for (const key of keys)
      if (
        key === prefix ||
        key?.startsWith(`${prefix}:`) ||
        key?.startsWith(`pickle:cooking:${userId}:`) ||
        key === `pickle:settings:${userId}`
      )
        localStorage.removeItem(key)

    localStorage.removeItem("pickle:recent-searches")
    localStorage.removeItem("pickle:native-auth-intent")
    localStorage.removeItem("pickle:native-recovery")
  } catch {
    cleared = false
  }
  try {
    const { clearAccountPostDrafts } = await import("./postDrafts")
    await clearAccountPostDrafts(userId)
  } catch {
    cleared = false
  }
  return cleared
}

export interface DeletionReceipt {
  id: string

  completed: boolean
}

export function confirmedDeletionReceipt(
  value: unknown,

  userId: string,
): DeletionReceipt {
  const row = value as Record<string, unknown> | null

  if (
    !row ||
    row.user_id !== userId ||
    typeof row.job_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      row.job_id,
    )
  )
    throw new Error("Deletion was not confirmed")

  if (row.completed === true && row.ok === true)
    return { id: row.job_id, completed: true }

  if (row.accepted === true && row.completed === false && row.ok === false)
    return { id: row.job_id, completed: false }

  throw new Error("Deletion was not confirmed")
}

export function rememberDeletionReceipt(receipt: DeletionReceipt) {
  try {
    sessionStorage.setItem(
      "pickle:deletion-result",
      JSON.stringify({
        ...receipt,
        expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }),
    )
  } catch {
    /* Confirmation does not depend on device storage. */
  }
}
