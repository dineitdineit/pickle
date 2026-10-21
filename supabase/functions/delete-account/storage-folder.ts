import type { SupabaseClient } from "npm:@supabase/supabase-js@2.116.0"

/** Remove paged files through Storage API, including nested draft/recipe folders. */
export async function removeAccountFolder(admin: SupabaseClient, bucketName: "avatars" | "community_recipe_images", userId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error("Invalid account scope")
  const bucket = admin.storage.from(bucketName)
  async function removePrefix(prefix: string, depth: number) {
    if (depth > 8 || !(prefix === userId || prefix.startsWith(`${userId}/`))) throw new Error("Invalid storage scope")
    for (;;) {
      const { data, error } = await bucket.list(prefix, { limit: 100 })
      if (error) throw new Error("Could not list account images")
      if (!data?.length) return
      for (const file of data) {
        if (!file.name || file.name === "." || file.name === ".." || file.name.includes("/")) throw new Error("Invalid image path")
        const path = `${prefix}/${file.name}`
        if (!file.id) await removePrefix(path, depth + 1)
        else {
          const result = await bucket.remove([path])
          if (result.error) throw new Error("Could not remove account image")
        }
      }
    }
  }
  await removePrefix(userId, 0)
}
