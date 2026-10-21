import { supabase } from "./supabase"
export function recipeImageUrl(path: string | null) {
  if (!path) return "/recipe-placeholder.svg"
  const community = path.startsWith("community:")
  if (community) return path
  return supabase.storage
    .from(community ? "community_recipe_images" : "recipe_images")
    .getPublicUrl(community ? path.slice(10) : path).data.publicUrl
}
export async function resolveRecipeImageUrl(path: string): Promise<string> {
  if (!path.startsWith("community:")) return path || "/recipe-placeholder.svg"
  const { data, error } = await supabase.storage
    .from("community_recipe_images")
    .createSignedUrl(path.slice(10), 300)
  if (error || !data?.signedUrl) throw new Error("Photo unavailable")
  return data.signedUrl
}
/** Supabase relationships can be returned as an object or an array. */
export function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}
