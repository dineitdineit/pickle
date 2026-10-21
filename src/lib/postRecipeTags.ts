import { supabase } from "./supabase"
export interface RecipeTagChoice {
  id: string
  title: string
  cover_image: string | null
  author_name: string
}
export interface PostRecipeTag extends Omit<RecipeTagChoice, "id"> {
  post_id: string
  recipe_id: string
  author_id: string
  author_reacted: boolean
}
export async function searchPostRecipes(query: string, offset = 0) {
  const text = query.trim().slice(0, 80)
  if (!text) return [] as RecipeTagChoice[]
  const { data, error } = await supabase.rpc("search_post_recipes", {
    p_query: text,
    p_offset: offset,
  })
  if (error || !Array.isArray(data))
    throw new Error("Could not search recipes. Please try again.")
  return data as RecipeTagChoice[]
}
export async function attachPostRecipeTags<T extends {
  id: string
  recipe_id?: string | null
},>(rows: T[]) {
  const ids = rows.filter((r) => r.recipe_id).map((r) => r.id)
  if (!ids.length)
    return rows.map((row) => ({
      ...row,
      recipe_tag: null as PostRecipeTag | null,
    }))
  const { data, error } = await supabase.rpc("get_post_recipe_tags", {
    p_ids: ids,
  })
  if (error || !Array.isArray(data))
    throw new Error("Could not load tagged recipes.")
  const tags = new Map(
    (data as PostRecipeTag[]).map((tag) => [tag.post_id, tag]),
  )
  return rows.map((row) => ({ ...row, recipe_tag: tags.get(row.id) ?? null }))
}
export async function reactToRecipePost(postId: string, reacted: boolean) {
  const { data, error } = await supabase.rpc("react_to_recipe_photo_post", {
    p_post: postId,
    p_reacted: reacted,
  })
  if (error || data?.post_id !== postId || data.reacted !== reacted)
    throw new Error("Could not save your reaction. Please try again.")
  return reacted
}
