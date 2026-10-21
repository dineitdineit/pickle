import { supabase } from "./supabase"

export interface PostComment {
  id: string
  user_id: string
  parent_id: string | null
  content: string
  created_at: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  is_recipe_author: boolean
  reply_count: number
  is_deleted: boolean
}
export async function getPostCommentContext(postId: string, commentId: string) {
  const { data, error } = await supabase.rpc("get_post_comment_context", {
    p_post: postId,
    p_comment: commentId,
  })
  if (error || !Array.isArray(data))
    throw new Error("Could not open this conversation. Please retry.")
  const rows = data as PostComment[]
  const target = rows.find((row) => row.id === commentId && !row.is_deleted)
  const root =
    target &&
    rows.find(
      (row) =>
        row.id === (target.parent_id ?? target.id) && row.parent_id === null,
    )
  if (!target || !root) throw new Error("This comment is no longer available.")
  return { root, target }
}
export async function listPostComments(
  postId: string,
  parentId: string | null,
  offset: number,
) {
  const { data, error } = await supabase.rpc("list_post_comments", {
    p_post: postId,
    p_parent: parentId,
    p_offset: offset,
  })
  if (error || !Array.isArray(data))
    throw new Error("Could not load comments. Please retry.")
  return { rows: data.slice(0, 20) as PostComment[], more: data.length > 20 }
}
export async function addPostComment(
  id: string,
  postId: string,
  content: string,
  parentId: string | null,
) {
  const { data, error } = await supabase.rpc("add_post_comment", {
    p_id: id,
    p_post: postId,
    p_content: content.trim(),
    p_parent: parentId,
  })
  if (error || data !== id)
    throw new Error(
      error?.code === "54000"
        ? "Please wait a minute before posting more comments."
        : "Could not send your comment. Check that this post is still available and try again.",
    )
}
export async function deletePostComment(id: string) {
  const { data, error } = await supabase.rpc("delete_post_comment", {
    p_id: id,
  })
  if (error || data !== id)
    throw new Error("Could not delete your comment. Please retry.")
}
