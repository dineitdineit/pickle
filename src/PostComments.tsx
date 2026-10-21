import { useCallback, useEffect, useId, useRef, useState } from "react"
import RecipeAuthorBadge from "./RecipeAuthorBadge"
import ReportButton from "./ReportButton"
import usePostCommentTarget from "./usePostCommentTarget"
import { requireContentConsent } from "./ContentConsent"
import {
  addPostComment,
  deletePostComment,
  listPostComments,
  type PostComment,
} from "./lib/postComments"
import { timeAgo } from "./lib/timeAgo"
import "./post-comments.css"

function useComments(postId: string, parentId: string | null, active: boolean) {
  const [rows, setRows] = useState<PostComment[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const request = useRef(0)
  const pending = useRef(false)
  const load = useCallback(
    async (offset = 0) => {
      if (offset && pending.current) return
      pending.current = true
      const current = ++request.current
      setLoading(true)
      setError("")
      try {
        const page = await listPostComments(postId, parentId, offset)
        if (current !== request.current) return
        setRows((previous) =>
          offset
            ? [
                ...previous,
                ...page.rows.filter(
                  (row) => !previous.some((old) => old.id === row.id),
                ),
              ]
            : page.rows,
        )
        setMore(page.more)
      } catch (failure) {
        if (current === request.current) setError((failure as Error).message)
      } finally {
        if (current === request.current) {
          pending.current = false
          setLoading(false)
        }
      }
    },
    [postId, parentId],
  )
  useEffect(() => {
    if (!active) {
      setRows([])
      setMore(false)
      return
    }
    void load()
    const refresh = () => {
      setRows([])
      void load()
    }
    window.addEventListener("pickle:safety-refresh", refresh)
    window.addEventListener("pickle:blocks-changed", refresh)
    return () => {
      request.current++
      pending.current = false
      window.removeEventListener("pickle:safety-refresh", refresh)
      window.removeEventListener("pickle:blocks-changed", refresh)
    }
  }, [active, load])
  function acknowledgeReply(id: string) {
    setRows((previous) =>
      previous.map((row) =>
        row.id === id
          ? { ...row, reply_count: Number(row.reply_count) + 1 }
          : row,
      ),
    )
  }
  function acknowledgeDeletion(id: string) {
    setRows((previous) =>
      previous.map((row) =>
        row.id === id
          ? {
              ...row,
              content: "Comment deleted",
              is_deleted: true,
              is_recipe_author: false,
              display_name: null,
              username: null,
              avatar_url: null,
            }
          : row,
      ),
    )
  }
  return {
    rows,
    more,
    loading,
    error,
    load,
    acknowledgeReply,
    acknowledgeDeletion,
  }
}

function CommentBody({
  comment,
  userId,
  onDelete,
  onOpenAuthor,
  highlighted = false,
}: {
  comment: PostComment
  userId: string | null
  onDelete: (comment: PostComment) => void
  onOpenAuthor?: (id: string) => void
  highlighted?: boolean
}) {
  const name = comment.display_name || comment.username || "Pickle user"
  if (comment.is_deleted)
    return <p className="post-comments-empty">Comment deleted</p>
  return (
    <div
      id={`post-comment-${comment.id}`}
      tabIndex={-1}
      className={`post-comment-body${
        highlighted ? " is-notification-target" : ""
      }`}
    >
      <button
        type="button"
        className="post-comment-avatar"
        disabled={!onOpenAuthor}
        onClick={() => onOpenAuthor?.(comment.user_id)}
        aria-label={`View ${name}'s profile`}
      >
        {comment.avatar_url ? (
          <img src={comment.avatar_url} alt="" loading="lazy" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </button>
      <div className="post-comment-copy">
        <div className="post-comment-heading">
          <strong>{name}</strong>
          {comment.is_recipe_author && <RecipeAuthorBadge />}
          <time dateTime={comment.created_at}>
            {timeAgo(comment.created_at)}
          </time>
        </div>
        <p>{comment.content}</p>
        {userId && userId !== comment.user_id && (
          <ReportButton
            targetType="post_comment"
            targetId={comment.id}
            userId={userId}
            onRequireLogin={() => {}}
          />
        )}
        {userId === comment.user_id && (
          <button
            type="button"
            className="post-comment-delete"
            onClick={() => onDelete(comment)}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

function Thread({
  comment,
  postId,
  userId,
  onReply,
  onDelete,
  onOpenAuthor,
  revision,
  target,
}: {
  comment: PostComment
  postId: string
  userId: string | null
  onReply: (comment: PostComment) => void
  onDelete: (comment: PostComment) => void
  onOpenAuthor?: (id: string) => void
  revision: number
  target?: PostComment
}) {
  const [open, setOpen] = useState(Boolean(target?.parent_id))
  const replies = useComments(postId, comment.id, open)
  const lastRevision = useRef(0)
  useEffect(() => {
    if (!revision || revision === lastRevision.current) return
    lastRevision.current = revision
    setOpen(true)
    if (open) void replies.load()
  }, [revision, open, replies.load])
  return (
    <li className="post-comment-thread">
      <CommentBody
        comment={comment}
        userId={userId}
        onDelete={onDelete}
        onOpenAuthor={onOpenAuthor}
        highlighted={target?.id === comment.id}
      />
      <div className="post-comment-thread-actions">
        {userId && (
          <button type="button" onClick={() => onReply(comment)}>
            Reply
          </button>
        )}
        {(Number(comment.reply_count) > 0 || open) && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide replies" : `View replies (${comment.reply_count})`}
          </button>
        )}
      </div>
      {open && (
        <div className="post-comment-replies">
          {target?.parent_id && (
            <CommentBody
              comment={target}
              userId={userId}
              onDelete={onDelete}
              onOpenAuthor={onOpenAuthor}
              highlighted
            />
          )}
          {replies.rows
            .filter((reply) => reply.id !== target?.id)
            .map((reply) => (
              <div key={reply.id}>
                <CommentBody
                  comment={reply}
                  userId={userId}
                  onDelete={onDelete}
                  onOpenAuthor={onOpenAuthor}
                />
              </div>
            ))}
          {replies.loading && <p role="status">Loading replies…</p>}
          {replies.error && (
            <p role="alert">
              {replies.error}
              <button type="button" onClick={() => void replies.load()}>
                Retry
              </button>
            </p>
          )}
          {replies.more && (
            <button
              type="button"
              disabled={replies.loading}
              onClick={() => void replies.load(replies.rows.length)}
            >
              More replies
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export default function PostComments({
  postId,
  userId,
  onOpenAuthor,
  initialCommentId,
}: {
  postId: string
  userId: string | null
  onOpenAuthor?: (id: string) => void
  initialCommentId?: string
}) {
  const [open, setOpen] = useState(Boolean(initialCommentId))
  const comments = useComments(postId, null, open)
  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<PostComment | null>(null)
  const [busy, setBusy] = useState(false)
  const target = usePostCommentTarget(postId, initialCommentId, busy)
  const focusedTarget = useRef("")
  useEffect(() => {
    if (initialCommentId) setOpen(true)
  }, [initialCommentId])
  useEffect(() => {
    const id = target.context?.target.id
    if (!id || focusedTarget.current === id) return
    const frame = requestAnimationFrame(() => {
      const node = document.getElementById(`post-comment-${id}`)
      if (!node) return
      node.scrollIntoView({ behavior: "smooth", block: "center" })
      node.focus({ preventScroll: true })
      focusedTarget.current = id
    })
    return () => cancelAnimationFrame(frame)
  }, [target.context])
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState<PostComment | null>(null)
  const [revisions, setRevisions] = useState<Record<string, number>>({})
  const mutation = useRef(false)
  const attempt = useRef<{
    fingerprint: string
    id: string
  } | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const dialogTitle = useId()
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (deleting) dialog.current?.showModal()
  }, [deleting])
  async function send() {
    if (!userId || !text.trim() || mutation.current) return
    mutation.current = true
    setBusy(true)
    setError("")
    try {
      if (!(await requireContentConsent(userId)) || !alive.current) return
      const fingerprint = JSON.stringify([
        postId,
        replyTo?.id ?? null,
        text.trim(),
      ])
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, id: crypto.randomUUID() }
      await addPostComment(
        attempt.current.id,
        postId,
        text,
        replyTo?.id ?? null,
      )
      if (!alive.current) return
      attempt.current = null
      setText("")
      if (replyTo) {
        setRevisions((previous) => ({
          ...previous,
          [replyTo.id]: (previous[replyTo.id] ?? 0) + 1,
        }))
        comments.acknowledgeReply(replyTo.id)
      }
      setReplyTo(null)
      if (!replyTo) await comments.load()
    } catch (failure) {
      if (alive.current) setError((failure as Error).message)
    } finally {
      mutation.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function remove() {
    if (!deleting || mutation.current) return
    mutation.current = true
    setBusy(true)
    setError("")
    try {
      await deletePostComment(deleting.id)
      if (!alive.current) return
      if (deleting.parent_id)
        setRevisions((previous) => ({
          ...previous,
          [deleting.parent_id!]: (previous[deleting.parent_id!] ?? 0) + 1,
        }))
      else comments.acknowledgeDeletion(deleting.id)
      if (replyTo?.id === deleting.id) setReplyTo(null)
      setDeleting(null)
    } catch (failure) {
      if (alive.current) {
        setError((failure as Error).message)
        setDeleting(null)
      }
    } finally {
      mutation.current = false
      if (alive.current) setBusy(false)
    }
  }
  return (
    <section className="post-comments" aria-label="Post comments">
      <button
        type="button"
        className="post-comments-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide comments" : "Comments"}
      </button>
      {open && (
        <>
          <ol>
            {target.context && (
              <Thread
                key={`target-${target.context.root.id}`}
                comment={target.context.root}
                target={target.context.target}
                postId={postId}
                userId={userId}
                onOpenAuthor={onOpenAuthor}
                onReply={(row) => {
                  if (!busy) {
                    setReplyTo(row)
                    input.current?.focus()
                  }
                }}
                onDelete={(row) => {
                  if (!busy) setDeleting(row)
                }}
                revision={revisions[target.context.root.id] ?? 0}
              />
            )}
            {comments.rows
              .filter((comment) => comment.id !== target.context?.root.id)
              .map((comment) => (
                <Thread
                  key={comment.id}
                  comment={comment}
                  postId={postId}
                  userId={userId}
                  onOpenAuthor={onOpenAuthor}
                  onReply={(row) => {
                    if (!busy) {
                      setReplyTo(row)
                      input.current?.focus()
                    }
                  }}
                  onDelete={(row) => {
                    if (!busy) setDeleting(row)
                  }}
                  revision={revisions[comment.id] ?? 0}
                />
              ))}
          </ol>
          {target.loading && <p role="status">Opening conversation…</p>}
          {target.error && (
            <p role="alert">
              {target.error}{" "}
              <button type="button" onClick={target.refresh}>
                Retry
              </button>
            </p>
          )}
          {comments.loading && <p role="status">Loading comments…</p>}
          {comments.error && (
            <p role="alert">
              {comments.error}
              <button type="button" onClick={() => void comments.load()}>
                Retry
              </button>
            </p>
          )}
          {!comments.loading &&
            !comments.error &&
            !target.context &&
            !target.loading &&
            !comments.rows.length && (
              <p className="post-comments-empty">Start the conversation.</p>
            )}
          {comments.more && (
            <button
              type="button"
              disabled={comments.loading}
              onClick={() => void comments.load(comments.rows.length)}
            >
              More comments
            </button>
          )}
          {userId ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void send()
              }}
            >
              {replyTo && (
                <div className="post-comment-replying">
                  Replying to{" "}
                  {replyTo.display_name || replyTo.username || "Pickle user"}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setReplyTo(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div className="post-comment-compose">
                <textarea
                  ref={input}
                  aria-label={replyTo ? "Write a reply" : "Write a comment"}
                  placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
                  rows={1}
                  maxLength={2000}
                  value={text}
                  disabled={busy}
                  onChange={(event) => setText(event.target.value)}
                />
                <button type="submit" disabled={busy || !text.trim()}>
                  {busy ? "Sending…" : "Post"}
                </button>
              </div>
            </form>
          ) : (
            <p className="post-comments-empty">Sign in to add a comment.</p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="post-error">
          {error}
        </p>
      )}
      {deleting && (
        <dialog
          ref={dialog}
          aria-labelledby={dialogTitle}
          className="post-comment-dialog"
          onCancel={(event) => {
            if (busy) event.preventDefault()
            else setDeleting(null)
          }}
        >
          <h3 id={dialogTitle}>
            Delete this {deleting.parent_id ? "reply" : "comment"}?
          </h3>
          <p>Your text will be removed. Replies will remain.</p>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => void remove()}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </dialog>
      )}
    </section>
  )
}
