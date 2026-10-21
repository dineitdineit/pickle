import type { SupabaseClient } from "@supabase/supabase-js"

import { supabase } from "./supabase"

export type CookState = "want_to_cook" | "cooked"

export type SavedFilter = "all" | CookState

export interface SavedRecipe {
  id: string

  title: string

  short_description: string | null

  cover_image: string | null

  video_url: string | null

  difficulty: string | null

  total_time_minutes: number | null

  cook_state: CookState

  saved_at: string
}

export interface SavedCursor {
  saved_at: string

  id: string
}

const SAVED_PAGE_SIZE = 24

export function savedPage(data: unknown) {
  if (
    !Array.isArray(data) ||
    data.length > SAVED_PAGE_SIZE + 1 ||
    data.some(
      (row) =>
        !row ||
        typeof row.id !== "string" ||
        typeof row.title !== "string" ||
        typeof row.saved_at !== "string" ||
        !Number.isFinite(Date.parse(row.saved_at)) ||
        !["want_to_cook", "cooked"].includes(row.cook_state),
    )
  )
    throw new Error("Could not load saved recipes.")

  const rows = data.slice(0, SAVED_PAGE_SIZE) as SavedRecipe[]

  const last = rows[rows.length - 1]

  return {
    rows,

    hasMore: data.length > SAVED_PAGE_SIZE,

    cursor: last ? { id: last.id, saved_at: last.saved_at } : null,
  }
}

export async function loadSavedPage(
  query: string,

  filter: SavedFilter,

  cursor: SavedCursor | null = null,

  client: SupabaseClient = supabase,
) {
  const result = await client.rpc("search_saved_recipes", {
    p_query: query.trim().slice(0, 100),

    p_state: filter,

    p_before: cursor?.saved_at ?? null,

    p_before_id: cursor?.id ?? null,

    p_limit: SAVED_PAGE_SIZE,
  })

  if (result.error) throw new Error("Could not load saved recipes.")

  return savedPage(result.data)
}

export async function changeSavedState(
  owner: string,

  id: string,

  state: CookState,

  client: SupabaseClient = supabase,
) {
  if (!owner || !id || !["want_to_cook", "cooked"].includes(state))
    throw new Error("Invalid cooking state.")

  const result = await client

    .from("saved_recipes")

    .update({ cook_state: state })

    .eq("user_id", owner)

    .eq("recipe_id", id)

    .select("user_id,recipe_id,cook_state")

    .maybeSingle()

  if (
    result.error ||
    result.data?.user_id !== owner ||
    result.data?.recipe_id !== id ||
    result.data?.cook_state !== state
  )
    throw new Error("Could not confirm the cooking state. Please retry.")

  return state
}

export async function unsaveRecipe(
  owner: string,

  id: string,

  client: SupabaseClient = supabase,
) {
  const result = await client

    .from("saved_recipes")

    .delete()

    .eq("user_id", owner)

    .eq("recipe_id", id)

    .select("recipe_id")

  if (
    result.error ||
    !Array.isArray(result.data) ||
    !result.data.some((row) => row.recipe_id === id)
  )
    throw new Error("Could not confirm removal. Please refresh and retry.")
}
