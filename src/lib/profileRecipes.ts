import { supabase } from "./supabase"

export function profileRecipeQuery(authorId: string, limit: number) {
  return supabase

    .from("recipes")

    .select("id,title,cover_image,view_count")

    .eq("author_id", authorId)

    .eq("is_hidden", false)

    .order("created_at", { ascending: false })

    .order("id")

    .limit(limit + 1)
}
