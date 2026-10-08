import { supabase } from "./supabase"

export function recipeImageUrl(path: string | null) {
  if (!path) return "/recipe-placeholder.svg"
  const community = path.startsWith("community:")
  return supabase.storage.from(community ? "community_recipe_images" : "recipe_images").getPublicUrl(community ? path.slice(10) : path).data
    .publicUrl
}

/** Supabase relationships can be returned as an object or an array. */
export function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}
