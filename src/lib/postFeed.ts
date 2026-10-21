import { supabase } from "./supabase"
import type { PostRecipeTag } from "./postRecipeTags"

export interface PostPhoto {
  id: string
  image_path: string
  position: number
}
export interface PhotoPost {
  id: string
  author_id: string
  caption: string
  published_at: string
  is_hidden: boolean
  author: {
    display_name: string | null
    username: string | null
    avatar_url: string | null
  } | null
  photos: PostPhoto[]
  recipe_id?: string | null
  recipe_tag?: PostRecipeTag | null
}
export interface PostCursor {
  id: string
  published_at: string
}
export interface PostFeedOptions {
  authorId?: string
  recipeId?: string
  postId?: string
  before?: PostCursor
  limit?: number
}
export function initialPhotoPostId(search: string) {
  const value = new URLSearchParams(search).get("post")
  return value &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
    ? value
    : null
}
const postColumns =
  "id,author_id,caption,published_at,is_hidden,recipe_id,author:profiles!photo_posts_author_id_fkey(display_name,username,avatar_url),photos:post_photos(id,image_path,position)"
export function postFeedQuery(options: PostFeedOptions, client = supabase) {
  const limit = Math.max(1, Math.min(30, options.limit ?? 20))
  let query = client
    .from("photo_posts")
    .select(postColumns)
    .eq("status", "published")
  // Discovery excludes hidden content even for its owner/admin. A direct link
  // may show the owner their hidden post with its moderation notice.
  if (!options.postId) query = query.eq("is_hidden", false)
  if (options.authorId) query = query.eq("author_id", options.authorId)
  if (options.recipeId) query = query.eq("recipe_id", options.recipeId)
  if (options.postId) query = query.eq("id", options.postId)
  if (options.before) {
    const cursor = options.before
    if (
      !/^[a-f0-9-]{36}$/i.test(cursor.id) ||
      !Number.isFinite(Date.parse(cursor.published_at))
    )
      throw new Error("Could not load more posts. Refresh and try again.")
    // Preserve PostgreSQL's microseconds: Date.toISOString() truncates them and
    // would skip posts sharing the cursor's millisecond on the next page.
    if (
      !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(
        cursor.published_at,
      )
    )
      throw new Error("Invalid post cursor.")
    const timestamp = cursor.published_at
    query = query.or(
      `published_at.lt.${timestamp},and(published_at.eq.${timestamp},id.lt.${cursor.id})`,
    )
  }
  return query
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.postId ? 1 : limit + 1)
}
export function orderedPhotos(post: PhotoPost) {
  return [...post.photos].sort((a, b) => a.position - b.position)
}
export function postAuthorName(post: PhotoPost) {
  return post.author?.display_name || post.author?.username || "Pickle user"
}
export function mergePostPage(previous: PhotoPost[], next: PhotoPost[]) {
  const ids = new Set(previous.map((post) => post.id))
  return [...previous, ...next.filter((post) => !ids.has(post.id))]
}
