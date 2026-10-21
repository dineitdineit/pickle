import type { SupabaseClient } from "@supabase/supabase-js"
export interface NotificationPreferences {
  enabled: boolean
  follows: boolean
  recipes: boolean
  comments: boolean
  replies: boolean
}
export const defaultNotificationPreferences: NotificationPreferences = {
  enabled: true,
  follows: true,
  recipes: true,
  comments: true,
  replies: true,
}
export function checkedPreferences(
  value: unknown,
  userId: string,
): NotificationPreferences {
  const row = value as Record<string, unknown> | null
  if (
    !row ||
    row.user_id !== userId ||
    Object.keys(defaultNotificationPreferences).some(
      (key) => typeof row[key] !== "boolean",
    )
  )
    throw new Error("Notification settings were not confirmed.")
  return Object.fromEntries(
    Object.keys(defaultNotificationPreferences).map((key) => [key, row[key]]),
  ) as unknown as NotificationPreferences
}
export async function loadNotificationPreferences(
  client: SupabaseClient,
  userId: string,
) {
  const result = await client
    .from("notification_preferences")
    .select("user_id,enabled,follows,recipes,comments,replies")
    .eq("user_id", userId)
    .maybeSingle()
  if (result.error) throw new Error("Could not load notification settings.")
  return result.data
    ? checkedPreferences(result.data, userId)
    : { ...defaultNotificationPreferences }
}
export async function saveNotificationPreferences(
  client: SupabaseClient,
  userId: string,
  preferences: NotificationPreferences,
) {
  const result = await client
    .from("notification_preferences")
    .upsert({ user_id: userId, ...preferences }, { onConflict: "user_id" })
    .select("user_id,enabled,follows,recipes,comments,replies")
    .single()
  if (result.error) throw new Error("Could not save notification settings.")
  const confirmed = checkedPreferences(result.data, userId)
  if (
    Object.keys(defaultNotificationPreferences).some(
      (key) =>
        confirmed[(key as keyof NotificationPreferences)] !==
        preferences[(key as keyof NotificationPreferences)],
    )
  )
    throw new Error("Notification settings were not confirmed.")
  return confirmed
}
