import type { SupabaseClient } from "@supabase/supabase-js"

/** Acknowledge only visible, still-unread rows belonging to this recipient. */
export async function markSeenNotificationsRead(
  client: SupabaseClient,
  recipientId: string,
  ids: string[],
) {
  const unique = [...new Set(ids)]
  if (!unique.length) return [] as string[]
  if (!recipientId || unique.length > 100)
    throw new Error("Invalid notification batch")
  const { data, error } = await client
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", recipientId)
    .in("id", unique)
    .is("read_at", null)
    .select("id,read_at")
  if (
    error ||
    !Array.isArray(data) ||
    data.some(
      (row) => !unique.includes(row.id) || typeof row.read_at !== "string",
    )
  )
    throw new Error("Read status was not confirmed")
  // Missing rows may already be read, expired or hidden. Never acknowledge them locally.
  return data.map((row) => row.id as string)
}

export async function markNotificationRead(
  client: SupabaseClient,
  recipientId: string,
  id: string,
) {
  const { data, error } = await client
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", recipientId)
    .eq("id", id)
    .select("id,read_at")
  if (error) throw new Error("Read status was not confirmed")
  const row = data?.find(
    (item) => item.id === id && typeof item.read_at === "string",
  )
  if (!row) throw new Error("Read status was not confirmed")
  return row.read_at as string
}
