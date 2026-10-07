import { supabase } from "./supabase"

export function recipeImageUrl(path: string | null) {
  if (!path) return ""
  return supabase.storage.from("recipe_images").getPublicUrl(path).data
    .publicUrl
}

/** Supabase relationships can be returned as an object or an array. */
export function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}
