import { useEffect, useRef, useState } from "react"
import { supabase } from "./lib/supabase"
import "./recipe-author.css"
type Author = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  follower_count: number
  following: boolean
  notifications_enabled: boolean
}
type Props = {
  authorId: string
  userId: string | null
  onOpenAuthor?: (id: string) => void
  onRequireLogin: () => void
}
export default function RecipeAuthorCard({
  authorId,
  userId,
  onOpenAuthor,
  onRequireLogin,
}: Props) {
  const [author, setAuthor] = useState<Author | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState<"follow" | "notifications" | null>(null)
  const [retry, setRetry] = useState(0)
  const guard = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    generation.current++
    let ignore = false
    setLoading(true)
    setError("")
    setMessage("")
    async function load() {
      try {
        const { data, error } = await supabase.rpc("get_recipe_author", {
          p_user_id: authorId,
        })
        if (error || data?.id !== authorId)
          throw error ?? new Error("Author unavailable")
        if (!ignore) setAuthor(data)
      } catch {
        if (!ignore) setError("Could not load the cook's profile.")
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void load()
    return () => {
      ignore = true
      generation.current++
    }
  }, [authorId, userId, retry])
  async function changeFollow() {
    if (!userId) {
      onRequireLogin()
      return
    }
    if (!author || authorId === userId || guard.current || loading) return
    const version = generation.current
    const next = !author.following
    guard.current = true
    setBusy("follow")
    setMessage("")
    try {
      const { data, error } = await supabase.rpc("set_user_follow", {
        p_user_id: authorId,
        p_following: next,
      })
      if (error || data?.user_id !== authorId || data.following !== next)
        throw error ?? new Error("Follow was not confirmed")
      if (version !== generation.current) return
      setAuthor((current) =>
        current
          ? {
              ...current,
              following: next,
              notifications_enabled: false,
              follower_count: Math.max(
                0,
                current.follower_count + (next ? 1 : -1),
              ),
            }
          : current,
      )
    } catch {
      if (version === generation.current)
        setMessage("Could not update your follow. Please try again.")
    } finally {
      guard.current = false
      setBusy(null)
    }
  }
  async function changeNotifications() {
    if (!userId) {
      onRequireLogin()
      return
    }
    if (!author?.following || authorId === userId || guard.current || loading)
      return
    const version = generation.current
    const next = !author.notifications_enabled
    guard.current = true
    setBusy("notifications")
    setMessage("")
    try {
      const { data, error } = await supabase.rpc(
        "set_author_recipe_notifications",
        { p_user_id: authorId, p_enabled: next },
      )
      if (
        error ||
        data?.user_id !== authorId ||
        data.notifications_enabled !== next
      )
        throw error ?? new Error("Notification setting was not confirmed")
      if (version !== generation.current) return
      setAuthor((current) =>
        current ? { ...current, notifications_enabled: next } : current,
      )
    } catch {
      if (version === generation.current)
        setMessage("Could not update recipe alerts. Please try again.")
    } finally {
      guard.current = false
      setBusy(null)
    }
  }
  if (loading)
    return (
      <section className="recipe-author-card" aria-label="Recipe author">
        <p role="status">Loading cook…</p>
      </section>
    )
  if (error || !author)
    return (
      <section className="recipe-author-card" aria-label="Recipe author">
        <p role="alert">{error || "Cook unavailable."}</p>
        <button
          type="button"
          className="recipe-author-retry"
          onClick={() => setRetry((value) => value + 1)}
        >
          Retry
        </button>
      </section>
    )
  const name = author.display_name || author.username || "Pickle user"
  const ownRecipe = authorId === userId
  return (
    <section className="recipe-author-card" aria-label="Recipe author">
      <div className="recipe-author-row">
        <button
          type="button"
          className="recipe-author-identity"
          disabled={!onOpenAuthor}
          onClick={() => onOpenAuthor?.(authorId)}
          aria-label={`View ${name}'s profile`}
        >
          {author.avatar_url && /^https?:\/\//.test(author.avatar_url) ? (
            <img
              className="recipe-author-avatar"
              src={author.avatar_url}
              alt=""
            />
          ) : (
            <span className="recipe-author-avatar">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="recipe-author-info">
            <strong>{name}</strong>
            <small>
              {author.follower_count.toLocaleString()}{" "}
              {author.follower_count === 1 ? "follower" : "followers"}
            </small>
          </span>
        </button>
        <div className="recipe-author-actions">
          <button
            type="button"
            className={`recipe-author-follow${
              author.following ? " is-following" : ""
            }`}
            disabled={busy === "follow" || ownRecipe}
            aria-disabled={busy !== null || ownRecipe}
            title={ownRecipe ? "You can't follow yourself" : undefined}
            aria-pressed={Boolean(author.following)}
            onClick={() => void changeFollow()}
          >
            {author.following ? "Unfollow" : "Follow"}
          </button>
          <button
            type="button"
            className={`recipe-author-bell${
              author.notifications_enabled ? " is-enabled" : ""
            }`}
            disabled={ownRecipe || !author.following}
            aria-disabled={busy !== null || ownRecipe || !author.following}
            aria-pressed={Boolean(author.notifications_enabled)}
            aria-label={
              ownRecipe
                ? "New recipe alerts are unavailable for your own recipes"
                : author.notifications_enabled
                  ? `Turn off new recipe alerts from ${name}`
                  : `Turn on new recipe alerts from ${name}`
            }
            title={
              ownRecipe
                ? "New recipe alerts are unavailable for your own recipes"
                : author.following
                  ? "New recipe alerts"
                  : "Follow this cook to enable new recipe alerts"
            }
            onClick={() => void changeNotifications()}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={author.notifications_enabled ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
          </button>
        </div>
      </div>
      {message && (
        <p className="recipe-author-message" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
