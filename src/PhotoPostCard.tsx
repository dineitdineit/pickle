import { useEffect, useId, useRef, useState } from "react"
import PostPhotoCarousel from "./PostPhotoCarousel"
import { orderedPhotos, postAuthorName, type PhotoPost } from "./lib/postFeed"
import { photoPostShareUrl, sharePhotoPostLink } from "./lib/share"
import { supabase } from "./lib/supabase"
import PostRecipeCredit from "./PostRecipeCredit"
import PostComments from "./PostComments"
import { ReportDialog } from "./ReportButton"

function ShareIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3m-4 4 4-4 4 4M5 11v9h14v-9" />
    </svg>
  )
}
export default function PhotoPostCard({
  post,
  userId,
  onOpenAuthor,
  onDeleted,
  onSelectRecipe,
  initialCommentId,
}: {
  post: PhotoPost
  userId: string | null
  onOpenAuthor?: (id: string) => void
  onDeleted: () => void
  onSelectRecipe?: (id: string) => void
  initialCommentId?: string
}) {
  const [options, setOptions] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const [shareStatus, setShareStatus] = useState("")
  const [manualLink, setManualLink] = useState(false)
  const caption = useRef<HTMLParagraphElement>(null)
  const captionId = useId()
  const name = postAuthorName(post)
  useEffect(() => {
    const node = caption.current
    if (!node || expanded) return
    const measure = () => setOverflow(node.scrollHeight > node.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [post.caption, expanded])
  async function share() {
    setShareStatus("")
    const result = await sharePhotoPostLink(post.id, name)
    setManualLink(result === "manual")
    if (result === "copied") setShareStatus("Link copied.")
  }
  const identity = (
    <>
      {post.author?.avatar_url ? (
        <img src={post.author.avatar_url} alt="" loading="lazy" />
      ) : (
        <span className="post-avatar-placeholder">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span>
        <strong>{name}</strong>
        {post.author?.username && <small>@{post.author.username}</small>}
      </span>
    </>
  )
  return (
    <article className="photo-post-card" aria-label={`Post by ${name}`}>
      <header>
        {onOpenAuthor ? (
          <button
            type="button"
            className="post-card-author"
            onClick={() => onOpenAuthor(post.author_id)}
            aria-label={`View ${name}'s profile`}
          >
            {identity}
          </button>
        ) : (
          <div className="post-card-author">{identity}</div>
        )}
        <button
          type="button"
          className="post-card-options"
          aria-label={`Options for ${name}'s post`}
          aria-haspopup="dialog"
          onClick={() => setOptions(true)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </header>
      {post.is_hidden && (
        <p className="post-hidden-notice" role="status">
          This post has been hidden by moderation.
        </p>
      )}
      <PostPhotoCarousel photos={orderedPhotos(post)} />
      <div className="post-card-content">
        {post.recipe_tag && (
          <PostRecipeCredit
            tag={post.recipe_tag}
            userId={userId}
            onSelectRecipe={onSelectRecipe}
          />
        )}
        <div className="post-card-actions">
          <button
            type="button"
            onClick={() => void share()}
            aria-label="Share post"
          >
            <ShareIcon />
            <span>Share</span>
          </button>
        </div>
        {post.caption && (
          <>
            <p
              ref={caption}
              id={captionId}
              className={`post-caption${
                expanded ? "" : " post-caption-collapsed"
              }`}
            >
              <strong>{name}</strong> {post.caption}
            </p>
            {(overflow || expanded) && (
              <button
                type="button"
                className="post-caption-toggle"
                aria-expanded={expanded}
                aria-controls={captionId}
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? "Less" : "More"}
              </button>
            )}
          </>
        )}
        <time dateTime={post.published_at}>
          {new Date(post.published_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </time>
        <PostComments
          key={`${post.id}:${userId ?? "guest"}`}
          postId={post.id}
          userId={userId}
          initialCommentId={initialCommentId}
          onOpenAuthor={onOpenAuthor}
        />
        {shareStatus && (
          <p className="post-share-status" role="status">
            {shareStatus}
          </p>
        )}
        {manualLink && (
          <label className="post-manual-link">
            Copy this link
            <input
              readOnly
              value={photoPostShareUrl(post.id)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        )}
      </div>
      {options && (
        <PostOptions
          post={post}
          userId={userId}
          onClose={() => setOptions(false)}
          onDeleted={onDeleted}
          onReport={
            userId && userId !== post.author_id
              ? () => {
                  setOptions(false)
                  setReportOpen(true)
                }
              : undefined
          }
        />
      )}
      {reportOpen && userId && (
        <ReportDialog
          targetType="post"
          targetId={post.id}
          userId={userId}
          onRequireLogin={() => setReportOpen(false)}
          onClose={() => setReportOpen(false)}
        />
      )}
    </article>
  )
}

function PostOptions({
  post,
  userId,
  onClose,
  onDeleted,
  onReport,
}: {
  post: PhotoPost
  userId: string | null
  onClose: () => void
  onDeleted: () => void
  onReport?: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const guard = useRef(false)
  const alive = useRef(true)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState(false)
  const titleId = useId()
  useEffect(() => {
    alive.current = true
    const modal = dialog.current
    const focus = document.activeElement as HTMLElement | null
    const previous = document.body.style.overflow
    modal?.showModal()
    document.body.style.overflow = "hidden"
    return () => {
      alive.current = false
      modal?.close()
      document.body.style.overflow = previous
      if (focus?.isConnected) focus.focus({ preventScroll: true })
    }
  }, [])
  async function remove() {
    if (guard.current || userId !== post.author_id) return
    guard.current = true
    setBusy(true)
    setError("")
    try {
      const { data, error: failure } = await supabase.rpc("delete_photo_post", {
        p_id: post.id,
      })
      if (failure || data?.id !== post.id || data?.deleted !== true)
        throw new Error()
      if (alive.current) {
        onDeleted()
        onClose()
      }
    } catch {
      if (alive.current)
        setError("Could not confirm deletion. Please try again.")
    } finally {
      guard.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(photoPostShareUrl(post.id))
      if (alive.current) setCopied(true)
    } catch {
      if (alive.current) setManual(true)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="post-options-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!guard.current) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !guard.current) onClose()
      }}
    >
      <div className="post-options-panel">
        <h2 id={titleId}>
          {confirming ? "Delete this post?" : "Post options"}
        </h2>
        {confirming ? (
          <>
            <p>
              Your photos and caption will be removed. This cannot be undone.
            </p>
            <button
              type="button"
              className="post-delete-option"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete post"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false)
                setError("")
              }}
            >
              Keep post
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => void copy()}>
              {copied ? "Link copied" : "Copy link"}
            </button>
            {onReport && (
              <button
                type="button"
                className="post-delete-option"
                onClick={onReport}
              >
                Report post
              </button>
            )}
            {!userId && (
              <p className="post-hint">Sign in to report this post.</p>
            )}
            {post.author_id === userId && (
              <button
                type="button"
                className="post-delete-option"
                onClick={() => setConfirming(true)}
              >
                Delete post
              </button>
            )}
            <button type="button" onClick={onClose}>
              Close
            </button>
          </>
        )}
        {error && (
          <p className="post-error" role="alert">
            {error}
          </p>
        )}
        {copied && <p role="status">Link copied.</p>}
        {manual && (
          <label className="post-manual-link">
            Copy this link
            <input
              readOnly
              value={photoPostShareUrl(post.id)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        )}
      </div>
    </dialog>
  )
}
