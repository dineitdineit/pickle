import type { SupabaseClient } from "npm:@supabase/supabase-js@2.116.0"
// Both delivered photos involving the deleted account and its unsent uploads.
export async function removeChatImages(admin: SupabaseClient, userId: string) {
  const bucket = admin.storage.from("chat_images")
  for (let offset = 0; ; offset += 100) {
    const result = await admin
      .from("direct_messages")
      .select("image_path")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .not("image_path", "is", null)
      .order("id")
      .range(offset, offset + 99)
    if (result.error) throw new Error("Could not list account chat photos")
    const paths = (result.data ?? []).flatMap((row) =>
      row.image_path ? [row.image_path] : [],
    )
    if (paths.length) {
      const removed = await bucket.remove(paths)
      if (removed.error) throw new Error("Could not remove account chat photos")
    }
    if ((result.data ?? []).length < 100) break
  }
  for (;;) {
    const folders = await bucket.list(userId, { limit: 100 })
    if (folders.error) throw new Error("Could not list unsent chat photos")
    if (!folders.data?.length) break
    for (const folder of folders.data) {
      if (folder.id) {
        const result = await bucket.remove([`${userId}/${folder.name}`])
        if (result.error) throw new Error("Could not remove chat upload")
        continue
      }
      const prefix = `${userId}/${folder.name}`
      for (;;) {
        const files = await bucket.list(prefix, { limit: 100 })
        if (files.error) throw new Error("Could not list chat uploads")
        if (!files.data?.length) break
        const removed = await bucket.remove(
          files.data.map((file) => `${prefix}/${file.name}`),
        )
        if (removed.error) throw new Error("Could not remove chat uploads")
      }
    }
  }
}
