import { useEffect, useRef, useState } from "react"
import RecipeSummaryCard, { type RecipeSummary } from "./RecipeSummaryCard"
import PhotoPostCard from "./PhotoPostCard"
import type { PhotoPost } from "./lib/postFeed"
import {
  loadFollowingPage,
  mergeFollowing,
  type FollowingItem,
  type FollowingCursor,
} from "./lib/followingFeed"
import "./following-feed.css"

interface Props {
  userId: string | null
  onSelectRecipe: (id: string) => void
  onOpenAuthor: (id: string) => void
  onRequireLogin: () => void
  onDiscover: () => void
}
export function HomeFeedTabs({
  value,
  onChange,
}: {
  value: "discover" | "following"
  onChange: (value: "discover" | "following") => void
}) {
  return (
    <nav className="home-feed-tabs" aria-label="Home feed">
      {(["discover", "following"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          aria-current={tab === value ? "page" : undefined}
          onClick={() => onChange(tab)}
        >
          {tab === "discover" ? "Discover" : "Following"}
        </button>
      ))}
    </nav>
  )
}
export default function FollowingFeed({
  userId,
  onSelectRecipe,
  onOpenAuthor,
  onRequireLogin,
  onDiscover,
}: Props) {
  const [refresh, setRefresh] = useState(0)
  const [rows, setRows] = useState<FollowingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const cursor = useRef<FollowingCursor | null>(null)
  const version = useRef(0)
  const lock = useRef(false)
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1)
    window.addEventListener("pickle:blocks-changed", reload)
    window.addEventListener("pickle:safety-refresh", reload)
    return () => {
      window.removeEventListener("pickle:blocks-changed", reload)
      window.removeEventListener("pickle:safety-refresh", reload)
    }
  }, [])
  useEffect(() => {
    const request = ++version.current
    setRows([])
    setLoading(!!userId)
    setLoadingMore(false)
    setError("")
    setHasMore(false)
    cursor.current = null
    lock.current = true
    if (!userId) {
      lock.current = false
      return
    }
    void loadFollowingPage()
      .then((page) => {
        if (request !== version.current) return
        setRows(page.rows)
        setHasMore(page.hasMore)
        cursor.current = page.cursor
      })
      .catch(() => {
        if (request === version.current)
          setError("Could not load followed cooks. Please retry.")
      })
      .finally(() => {
        if (request === version.current) {
          setLoading(false)
          lock.current = false
        }
      })
    return () => {
      version.current++
    }
  }, [userId, refresh])
  async function more() {
    if (lock.current || !hasMore) return
    lock.current = true
    setLoadingMore(true)
    setError("")
    const request = version.current
    try {
      const page = await loadFollowingPage(cursor.current)
      if (request !== version.current) return
      setRows((current) => mergeFollowing(current, page.rows))
      setHasMore(page.hasMore)
      cursor.current = page.cursor
    } catch {
      if (request === version.current)
        setError("Could not load more. Your feed is still here; please retry.")
    } finally {
      if (request === version.current) {
        lock.current = false
        setLoadingMore(false)
      }
    }
  }
  return (
    <section
      className="following-feed photo-post-screen"
      aria-label="Content from followed cooks"
    >
      <h1>Following</h1>
      <p className="post-hint">
        Recipes and everyday cooking from cooks you follow. Newest first.
      </p>
      {!userId ? (
        <div className="following-empty">
          <p>Sign in to see what your followed cooks are sharing.</p>
          <button type="button" onClick={onRequireLogin}>
            Sign in
          </button>
        </div>
      ) : loading ? (
        <p role="status">Loading followed cooks…</p>
      ) : (
        <>
          {rows.map((row) =>
            row.kind === "recipe" ? (
              <article className="following-recipe" key={`recipe:${row.id}`}>
                <button
                  type="button"
                  className="following-author"
                  onClick={() => onOpenAuthor(row.author_id)}
                >
                  {row.author_name} <span>shared a recipe</span>
                </button>
                <RecipeSummaryCard
                  recipe={row.payload as RecipeSummary}
                  onSelect={onSelectRecipe}
                />
              </article>
            ) : (
              <PhotoPostCard
                key={`post:${row.id}`}
                post={row.payload as PhotoPost}
                userId={userId}
                onOpenAuthor={onOpenAuthor}
                onSelectRecipe={onSelectRecipe}
                onDeleted={() =>
                  setRows((current) =>
                    current.filter(
                      (item) => item.kind !== "post" || item.id !== row.id,
                    ),
                  )
                }
              />
            ),
          )}
          {!rows.length && !error && (
            <div className="following-empty">
              <h2>No updates yet</h2>
              <p>
                Follow cooks from their profiles. Their published recipes and
                posts will appear here.
              </p>
              <button type="button" onClick={onDiscover}>
                Discover recipes
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <div role="alert" className="post-error">
          <p>{error}</p>
          <button
            type="button"
            onClick={
              rows.length
                ? () => void more()
                : () => setRefresh((value) => value + 1)
            }
          >
            Try again
          </button>
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          className="post-feed-more"
          disabled={loadingMore}
          onClick={() => void more()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </section>
  )
}
