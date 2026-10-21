import { supabase } from "./supabase"

import { attachPostRecipeTags } from "./postRecipeTags"

import type { PhotoPost } from "./postFeed"

import type { RecipeSummary } from "../RecipeSummaryCard"

export interface FollowingCursor {
  id: string

  kind: "recipe" | "post"

  posted_at: string
}

export interface FollowingItem extends FollowingCursor {
  author_id: string

  author_name: string

  payload: RecipeSummary | PhotoPost
}

const FOLLOWING_PAGE_SIZE = 12

export async function loadFollowingPage(cursor: FollowingCursor | null = null) {
  const result = await supabase.rpc("following_feed", {
    p_before: cursor?.posted_at ?? null,

    p_before_kind: cursor?.kind ?? null,

    p_before_id: cursor?.id ?? null,

    p_limit: FOLLOWING_PAGE_SIZE,
  })

  if (result.error || !Array.isArray(result.data))
    throw new Error("Could not load followed cooks. Please retry.")

  const raw = result.data as FollowingItem[]

  if (
    raw.length > FOLLOWING_PAGE_SIZE + 1 ||
    raw.some(
      (row) =>
        !["recipe", "post"].includes(row.kind) ||
        !row.payload ||
        row.payload.id !== row.id ||
        !Number.isFinite(Date.parse(row.posted_at)),
    )
  )
    throw new Error("Could not read the Following feed.")

  const rows = raw.slice(0, FOLLOWING_PAGE_SIZE)

  const posts = await attachPostRecipeTags(
    rows

      .filter((row) => row.kind === "post")

      .map((row) => row.payload as PhotoPost),
  )

  const byId = new Map(posts.map((post) => [post.id, post]))

  return {
    rows: rows.map((row) =>
      row.kind === "post" ? { ...row, payload: byId.get(row.id)! } : row,
    ),

    hasMore: raw.length > FOLLOWING_PAGE_SIZE,

    cursor: rows.at(-1) ?? null,
  }
}

export function mergeFollowing(
  previous: FollowingItem[],

  next: FollowingItem[],
) {
  const seen = new Set(previous.map((row) => `${row.kind}:${row.id}`))

  return [
    ...previous,

    ...next.filter((row) => {
      const key = `${row.kind}:${row.id}`

      if (seen.has(key)) return false

      seen.add(key)

      return true
    }),
  ]
}
