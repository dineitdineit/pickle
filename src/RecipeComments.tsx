import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { supabase } from "./lib/supabase"
import { getCurrentUser } from "./lib/auth"
import RecipeAuthorBadge from "./RecipeAuthorBadge"
type CommentRow = {
  id: string
  user_id: string
  content: string
  created_at: string
  parent_comment_id: string | null
}
type ProfileRow = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
}
type RecipeCommentsProps = {
  recipeId: string
  recipeAuthorId?: string | null
  initialCommentId?: string
  onRequireLogin: () => void
  onCountChange?: (count: number) => void
}
type ReportReason = "spam" | "harassment" | "hate_or_abusive" | "sexual_content" | "personal_information" | "off_topic" | "other"
const REPORT_REASONS: {
  value: ReportReason
  label: string
}[] = [
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_or_abusive", label: "Hate or abusive content" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "personal_information", label: "Personal information" },
  { value: "off_topic", label: "Off-topic or inappropriate" },
  { value: "other", label: "Other" },
]
function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diff / 60000))
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return new Date(value).toLocaleDateString()
}
export default function RecipeComments({
  recipeId,
  recipeAuthorId,
  initialCommentId,
  onRequireLogin,
  onCountChange,
}: RecipeCommentsProps) {
  const [comments, setComments] = useState<CommentRow[]>([])
  const focusedComment = useRef("")
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map())
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map())
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [posting, setPosting] = useState(false)
  const commentMutation = useRef(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!initialCommentId || loading) return
    const key = `${recipeId}:${initialCommentId}`
    if (focusedComment.current === key) return
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`comment-${initialCommentId}`)
      target?.scrollIntoView({ behavior: "smooth", block: "center" })
      target?.focus({ preventScroll: true })
      if (target) focusedComment.current = key
    })
    return () => cancelAnimationFrame(frame)
  }, [recipeId, initialCommentId, loading, comments])
  const [message, setMessage] = useState("")
  const [menuCommentId, setMenuCommentId] = useState<string | null>(null)
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const deleteDialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (deleteCommentId) deleteDialogRef.current?.showModal()
  }, [deleteCommentId])
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [reportComment, setReportComment] = useState<CommentRow | null>(null)
  const [reportReason, setReportReason] = useState<ReportReason | null>(null)
  const [reportDetails, setReportDetails] = useState("")
  const [reporting, setReporting] = useState(false)
  const reportGuard = useRef(false)
  const [reportSuccess, setReportSuccess] = useState(false)
  const [reportError, setReportError] = useState("")
  const [safetyVersion, setSafetyVersion] = useState(0)
  useEffect(() => {
    const refresh = () => setSafetyVersion((value) => value + 1)
    window.addEventListener("pickle:safety-refresh", refresh)
    return () => window.removeEventListener("pickle:safety-refresh", refresh)
  }, [])
  async function loadComments() {
    setLoading(true)
    const [{ data: userData }, commentResult] = await Promise.all([
      getCurrentUser(),
      supabase
        .from("recipe_comments")
        .select("id, user_id, content, created_at, parent_comment_id")
        .eq("recipe_id", recipeId)
        .eq("moderation_status", "active")
        .order("created_at", { ascending: false }),
    ])
    const currentUserId = userData.user?.id ?? null
    setUserId(currentUserId)
    if (commentResult.error) {
      console.error("Failed to load comments:")
      setMessage("Could not load comments.")
      setComments([])
      onCountChange?.(0)
      setLoading(false)
      return
    }
    const activeRows = (commentResult.data ?? []) as CommentRow[]
    const rootIds = new Set(
      activeRows.filter((row) => !row.parent_comment_id).map((row) => row.id),
    )
    const rows = activeRows.filter(
      (row) => !row.parent_comment_id || rootIds.has(row.parent_comment_id),
    )
    setComments(rows)
    onCountChange?.(rows.length)
    const ids = [...new Set(rows.map((row) => row.user_id))]
    const commentIds = rows.map((row) => row.id)
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids)
      if (error) console.error("Failed to load comment profiles:")
      else
        setProfiles(
          new Map(
            ((data ?? []) as ProfileRow[]).map((profile) => [
              profile.id,
              profile,
            ]),
          ),
        )
    } else {
      setProfiles(new Map())
    }
    if (commentIds.length > 0) {
      const { data: likes, error: likesError } = await supabase
        .from("comment_likes")
        .select("comment_id, user_id")
        .in("comment_id", commentIds)
      if (likesError) {
        console.error("Failed to load comment likes:")
      } else {
        const counts = new Map<string, number>()
        const liked = new Set<string>()
        ;(likes ?? []).forEach((row) => {
          counts.set(row.comment_id, (counts.get(row.comment_id) ?? 0) + 1)
          if (currentUserId && row.user_id === currentUserId)
            liked.add(row.comment_id)
        })
        setLikeCounts(counts)
        setLikedCommentIds(liked)
      }
    } else {
      setLikeCounts(new Map())
      setLikedCommentIds(new Set())
    }
    setLoading(false)
  }
  useEffect(() => {
    void loadComments()
    const refreshComments = () => {
      void loadComments()
    }
    window.addEventListener("focus", refreshComments)
    return () => window.removeEventListener("focus", refreshComments)
  }, [recipeId, safetyVersion])
  const rootComments = useMemo(
    () => comments.filter((comment) => !comment.parent_comment_id),
    [comments],
  )
  const repliesByParent = useMemo(() => {
    const map = new Map<string, CommentRow[]>()
    comments
      .filter((comment) => comment.parent_comment_id)
      .forEach((reply) => {
        const key = reply.parent_comment_id as string
        map.set(
          key,
          [...(map.get(key) ?? []), reply].sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          ),
        )
      })
    return map
  }, [comments])
  function handleCommentKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
    parentCommentId: string | null = null,
  ) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return
    event.preventDefault()
    if (!event.repeat) void postComment(parentCommentId)
  }
  async function postComment(parentCommentId: string | null = null) {
    const cleanText = (parentCommentId ? replyText : text).trim()
    if (!userId) {
      onRequireLogin()
      return
    }
    if (!cleanText || posting || commentMutation.current) return
    commentMutation.current = true
    setPosting(true)
    setMessage("")
    try {
      if (!(await requireContentConsent(userId))) return
      const { error } = await supabase.from("recipe_comments").insert({
        recipe_id: recipeId,
        user_id: userId,
        content: cleanText,
        parent_comment_id: parentCommentId,
      })
      if (error) {
        console.error("Failed to post comment:")
        setMessage("Could not post your comment.")
      } else {
        if (parentCommentId) {
          setReplyText("")
          setReplyingToId(null)
        } else setText("")
        await loadComments()
      }
    } catch {
      setMessage("Could not post your comment. Please try again.")
    } finally {
      commentMutation.current = false
      setPosting(false)
    }
  }
  async function toggleCommentLike(commentId: string) {
    if (!userId) {
      onRequireLogin()
      return
    }
    const liked = likedCommentIds.has(commentId)
    const query = liked
      ? supabase
          .from("comment_likes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", userId)
      : supabase
          .from("comment_likes")
          .insert({ comment_id: commentId, user_id: userId })
    const { error } = await query
    if (error) {
      console.error("Failed to update comment like:")
      return
    }
    setLikedCommentIds((current) => {
      const next = new Set(current)
      liked ? next.delete(commentId) : next.add(commentId)
      return next
    })
    setLikeCounts((current) => {
      const next = new Map(current)
      next.set(
        commentId,
        Math.max(0, (next.get(commentId) ?? 0) + (liked ? -1 : 1)),
      )
      return next
    })
  }
  function startEdit(comment: CommentRow) {
    setMenuCommentId(null)
    setEditingCommentId(comment.id)
    setEditText(comment.content)
  }
  async function saveEdit(commentId: string) {
    if (!userId || !editText.trim() || commentMutation.current) return
    commentMutation.current = true
    try {
      if (!(await requireContentConsent(userId))) return
      const { error } = await supabase
        .from("recipe_comments")
        .update({
          content: editText.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", commentId)
        .eq("user_id", userId)
      if (error) {
        console.error("Failed to edit comment:")
        setMessage("Could not edit your comment.")
        return
      }
      setComments((current) =>
        current.map((comment) =>
          comment.id === commentId
            ? { ...comment, content: editText.trim() }
            : comment,
        ),
      )
      setEditingCommentId(null)
      setEditText("")
    } catch {
      setMessage("Could not edit your comment. Please try again.")
    } finally {
      commentMutation.current = false
    }
  }
  async function deleteComment(commentId: string) {
    if (!userId || deleting) return
    setDeleting(true)
    setDeleteError("")
    try {
      const { error } = await supabase
        .from("recipe_comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", userId)
      if (error) throw error
      await loadComments()
      setDeleteCommentId(null)
    } catch (error) {
      console.error("Failed to delete comment:")
      setDeleteError("Could not delete your comment. Please try again.")
    } finally {
      setDeleting(false)
    }
  }
  function openReport(comment: CommentRow) {
    setMenuCommentId(null)
    if (!userId) {
      onRequireLogin()
      return
    }
    setReportComment(comment)
    setReportReason(null)
    setReportDetails("")
    setReportError("")
    setReportSuccess(false)
  }
  function closeReport() {
    if (reportGuard.current) return
    setReportComment(null)
    setReportReason(null)
    setReportDetails("")
    setReportError("")
    setReportSuccess(false)
  }
  async function submitReport() {
    if (!userId) {
      closeReport()
      onRequireLogin()
      return
    }
    if (!reportComment || !reportReason || reportGuard.current) return
    reportGuard.current = true
    setReporting(true)
    setReportError("")
    try {
      const { data, error } = await supabase.rpc("submit_comment_report", {
        p_comment_id: reportComment.id,
        p_reason: reportReason,
        p_details: reportDetails.trim() || null,
      })
      if (error || typeof data !== "string" || !data)
        throw error ?? new Error("Report was not confirmed")
      setReportSuccess(true)
    } catch (error) {
      const normalized =
        error instanceof Error ? error.message.toLowerCase() : ""
      setReportError(
        normalized.includes("own comment")
          ? "You cannot report your own comment."
          : normalized.includes("not available")
            ? "This comment is no longer available for reporting."
            : "Could not submit your report. Please try again.",
      )
    } finally {
      reportGuard.current = false
      setReporting(false)
    }
  }
  const currentProfile = useMemo(
    () => (userId ? profiles.get(userId) : undefined),
    [profiles, userId],
  )
  const currentInitial =
    currentProfile?.username?.charAt(0).toUpperCase() || "P"
  function renderComment(comment: CommentRow, isReply = false) {
    const profile = profiles.get(comment.user_id)
    const name = profile?.display_name || profile?.username || "Pickle User"
    const initial = profile?.username?.charAt(0).toUpperCase() || "P"
    const ownComment = comment.user_id === userId
    const liked = likedCommentIds.has(comment.id)
    const replyCount = repliesByParent.get(comment.id)?.length ?? 0
    return (
      <article
        key={comment.id}
        id={`comment-${comment.id}`}
        tabIndex={-1}
        className={`relative flex gap-3 ${
          isReply ? "ml-11" : replyCount > 0 ? "comment-with-replies" : ""
        }`}
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={name}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-label font-semibold"
            style={{
              backgroundColor: "var(--color-surface)",
              color: "var(--color-gray)",
            }}
          >
            {initial}
          </div>
        )}
        <div className="flex-1 min-w-0 relative">
          <div className="flex items-center gap-2 pr-7">
            <p
              className="comment-author-name font-semibold text-body truncate"
              style={{ color: "var(--color-ink)" }}
            >
              {name}
            </p>
            {recipeAuthorId && comment.user_id === recipeAuthorId && (
              <RecipeAuthorBadge />
            )}
            <span
              className="text-caption"
              style={{ color: "var(--color-gray-soft)" }}
            >
              {timeAgo(comment.created_at)}
            </span>
          </div>
          <div className="absolute right-0 top-0">
            <button
              type="button"
              onClick={() =>
                setMenuCommentId((current) =>
                  current === comment.id ? null : comment.id,
                )
              }
              aria-label="Comment options"
              className="w-6 h-6 flex items-center justify-center"
              style={{ color: "var(--color-gray)" }}
            >
              <span className="text-lead leading-none">•••</span>
            </button>
            {menuCommentId === comment.id && (
              <div className="comment-options-menu absolute right-0 top-7 w-44 rounded-[12px] shadow-lg z-20 overflow-hidden p-1">
                {ownComment ? (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(comment)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-[8px] text-left text-body"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m16 3 5 5-12 12-6 1 1-6Z" />
                        <path d="m14 5 5 5" />
                      </svg>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuCommentId(null)
                        setDeleteError("")
                        setDeleteCommentId(comment.id)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-[8px] text-left text-body"
                      style={{ color: "#FF5C5C" }}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                      </svg>
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openReport(comment)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-[8px] text-left text-body"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 21V3c5-3 10 3 16 0v12c-6 3-11-3-16 0" />
                    </svg>
                    Report
                  </button>
                )}
              </div>
            )}
          </div>
          {editingCommentId === comment.id ? (
            <div className="mt-1.5">
              <textarea
                rows={2}
                maxLength={1000}
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                className="comment-textarea w-full resize-none rounded-[12px] border px-3 py-2 text-body outline-none"
                style={{ borderColor: "var(--color-border)" }}
              />
            </div>
          ) : (
            <p
              className="comment-content text-body leading-5 mt-1 whitespace-pre-wrap break-words"
              style={{ color: "var(--color-gray-strong)" }}
            >
              {comment.content}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 mt-2">
            <div
              className="flex items-center gap-3 text-caption"
              style={{ color: "var(--color-gray-soft)" }}
            >
              <button
                type="button"
                onClick={() => toggleCommentLike(comment.id)}
                className="flex items-center gap-1"
                style={{
                  color: liked
                    ? "var(--color-primary)"
                    : "var(--color-gray-soft)",
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill={liked ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
                </svg>
                <span>{likeCounts.get(comment.id) ?? 0}</span>
              </button>
              {!isReply && (
                <button
                  type="button"
                  onClick={() => {
                    if (!userId) {
                      onRequireLogin()
                      return
                    }
                    setReplyingToId((current) =>
                      current === comment.id ? null : comment.id,
                    )
                    setReplyText("")
                  }}
                  className="flex items-center gap-1"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
                  </svg>
                  <span>{replyCount}</span>
                </button>
              )}
            </div>
            {editingCommentId === comment.id && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingCommentId(null)}
                  className="text-body"
                  style={{ color: "var(--color-gray)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveEdit(comment.id)}
                  className="text-body font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  Save
                </button>
              </div>
            )}
          </div>
          {replyingToId === comment.id && (
            <div className="mt-2">
              <textarea
                rows={2}
                maxLength={1000}
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                onKeyDown={(event) => handleCommentKeyDown(event, comment.id)}
                placeholder={`Reply to ${name}...`}
                className="comment-textarea w-full resize-none rounded-[12px] border px-3 py-2 text-label outline-none"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                }}
              />
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => postComment(comment.id)}
                  disabled={posting || !replyText.trim()}
                  className="h-7 px-3 rounded-full text-caption font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-primary)" }}
                >
                  Reply
                </button>
              </div>
            </div>
          )}
        </div>
      </article>
    )
  }
  return (
    <>
      {deleteCommentId &&
        createPortal(
          <dialog
            ref={deleteDialogRef}
            className="comment-delete-dialog w-[calc(100%-32px)] max-w-sm rounded-[16px] border-0 p-6 shadow-xl m-auto"
            style={{
              backgroundColor: "var(--color-white)",
              color: "var(--color-ink)",
            }}
            aria-labelledby="comment-delete-title"
            aria-describedby="comment-delete-description"
            onCancel={(event) => {
              if (deleting) event.preventDefault()
              else setDeleteCommentId(null)
            }}
          >
            <h2
              id="comment-delete-title"
              className="font-semibold text-section"
            >
              Delete comment?
            </h2>
            <p
              id="comment-delete-description"
              className="mt-2 text-body leading-6"
              style={{ color: "var(--color-gray)" }}
            >
              Are you sure you want to delete this comment? This cannot be
              undone.
            </p>
            {deleteError && (
              <p
                role="alert"
                className="mt-3 text-body"
                style={{ color: "#C53D2E" }}
              >
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button
                type="button"
                autoFocus
                disabled={deleting}
                onClick={() => setDeleteCommentId(null)}
                className="px-4 py-2 rounded-[8px] text-body font-semibold disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => deleteComment(deleteCommentId)}
                className="px-4 py-2 rounded-[8px] text-body font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "#C53D2E" }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </dialog>,
          document.body,
        )}
      {reportComment &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center"
            style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
            onClick={closeReport}
          >
            <div
              className="w-full max-w-md px-5 pt-5 pb-7 shadow-xl"
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                backgroundColor: "var(--color-white)",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {reportSuccess ? (
                <div className="py-5 text-center">
                  <div
                    className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                    style={{
                      backgroundColor: "var(--color-primary-soft)",
                      color: "var(--color-primary)",
                    }}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3
                    className="font-semibold text-section mt-4"
                    style={{ color: "var(--color-ink)" }}
                  >
                    Report submitted
                  </h3>
                  <p
                    className="text-body leading-5 mt-2"
                    style={{ color: "var(--color-gray)" }}
                  >
                    Thanks for letting us know. The Pickle team will review this
                    comment.
                  </p>
                  <button
                    type="button"
                    onClick={closeReport}
                    className="w-full h-11 rounded-[12px] mt-5 text-body font-semibold text-white"
                    style={{ backgroundColor: "var(--color-primary)" }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3
                        className="font-semibold text-section"
                        style={{ color: "var(--color-ink)" }}
                      >
                        Report comment
                      </h3>
                      <p
                        className="text-label mt-1"
                        style={{ color: "var(--color-gray-soft)" }}
                      >
                        Tell us why this comment should be reviewed.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeReport}
                      aria-label="Close report"
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-gray-strong)",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div
                    className="rounded-[12px] px-3.5 py-3 mb-4"
                    style={{ backgroundColor: "var(--color-surface)" }}
                  >
                    <p
                      className="text-label leading-5 line-clamp-3"
                      style={{ color: "var(--color-gray)" }}
                    >
                      {reportComment.content}
                    </p>
                  </div>
                  <div
                    className="rounded-[14px] border overflow-hidden"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    {REPORT_REASONS.map((reason, index) => {
                      const selected = reportReason === reason.value
                      return (
                        <button
                          key={reason.value}
                          type="button"
                          onClick={() => setReportReason(reason.value)}
                          className="w-full min-h-[48px] px-4 flex items-center gap-3 text-left"
                          style={{
                            borderBottom:
                              index < REPORT_REASONS.length - 1
                                ? "1px solid var(--color-border)"
                                : undefined,
                            backgroundColor: "var(--color-white)",
                          }}
                        >
                          <span
                            className="flex-1 text-body"
                            style={{ color: "var(--color-ink)" }}
                          >
                            {reason.label}
                          </span>
                          <span
                            className="w-5 h-5 rounded-full border flex items-center justify-center"
                            style={{
                              borderColor: selected
                                ? "var(--color-primary)"
                                : "var(--color-gray-faint)",
                            }}
                          >
                            {selected && (
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{
                                  backgroundColor: "var(--color-primary)",
                                }}
                              />
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={reportDetails}
                    onChange={(event) => setReportDetails(event.target.value)}
                    placeholder="Add details (optional)"
                    className="comment-textarea w-full resize-none rounded-[12px] border px-3.5 py-3 mt-4 text-body outline-none"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-ink)",
                    }}
                  />
                  {reportError && (
                    <p
                      className="text-label leading-5 mt-2"
                      style={{ color: "#C53D2E" }}
                    >
                      {reportError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={submitReport}
                    disabled={!reportReason || reporting}
                    className="w-full h-11 rounded-[12px] mt-4 text-body font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: "var(--color-primary)" }}
                  >
                    {reporting ? "Submitting…" : "Submit report"}
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
      <section
        className="border-t"
        style={{
          borderColor: "var(--color-border)",
          marginTop: 30,
          paddingTop: 15,
        }}
      >
        <h2
          className="font-semibold text-section mb-4"
          style={{ color: "var(--color-ink)" }}
        >
          Comments
        </h2>
        <div className="flex items-start gap-3">
          {currentProfile?.avatar_url ? (
            <img
              src={currentProfile.avatar_url}
              alt="Your profile"
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-body font-semibold"
              style={{
                backgroundColor: "var(--color-primary-soft)",
                color: "var(--color-primary)",
              }}
            >
              {currentInitial}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <textarea
              aria-label="Write a comment"
              placeholder={
                userId ? "Share your thoughts..." : "Log in to leave a comment"
              }
              rows={3}
              maxLength={1000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleCommentKeyDown}
              onFocus={() => {
                if (!userId) onRequireLogin()
              }}
              className="comment-textarea w-full resize-none rounded-[16px] border px-4 py-3 text-body leading-5 outline-none"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-ink)",
                backgroundColor: "var(--color-surface)",
              }}
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => postComment(null)}
                disabled={posting || !text.trim()}
                className="h-9 px-4 rounded-full text-body font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
        {message && (
          <p className="text-label mt-3" style={{ color: "#C53D2E" }}>
            {message}
          </p>
        )}
        <div className="mt-6 space-y-5">
          {loading ? (
            <p
              className="text-body"
              style={{ color: "var(--color-gray-soft)" }}
            >
              Loading comments…
            </p>
          ) : rootComments.length === 0 ? (
            <p
              className="text-body"
              style={{ color: "var(--color-gray-soft)" }}
            >
              No comments yet. Be the first to share your thoughts.
            </p>
          ) : (
            rootComments.map((comment) => (
              <div key={comment.id}>
                {renderComment(comment)}
                {(repliesByParent.get(comment.id) ?? []).map((reply) => (
                  <div className="comment-reply-node" key={reply.id}>
                    {renderComment(reply, true)}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  )
}
import { requireContentConsent } from "./ContentConsent"
