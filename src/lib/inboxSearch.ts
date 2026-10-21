import type { SupabaseClient } from "@supabase/supabase-js"

export function inboxSearchFilter(value: string) {
  const query = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/^@/, "")
    .trim()
    .slice(0, 80)
  if (!query) return null
  // Escape SQL LIKE metacharacters, then quote the PostgREST literal separately.
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`
  const literal = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  return `display_name.ilike.${literal},username.ilike.${literal}`
}

/** Filter the private inbox on the server before applying its page limit. */
export function queryInbox(
  client: SupabaseClient,
  query: string,
  limit: number,
) {
  let request = client.rpc("get_message_inbox")
  const filter = inboxSearchFilter(query)
  if (filter) request = request.or(filter)
  return request.order("latest_id", { ascending: false }).range(0, limit)
}
