import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
type Cook = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  recipe_count: number
  view_count: number
}
export default function RankedSearchUsers({
  query,
  onUser,
}: {
  query: string
  onUser: (id: string) => void
}) {
  const [users, setUsers] = useState<Cook[]>([])
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1)
    window.addEventListener("pickle:safety-refresh", refresh)
    return () => window.removeEventListener("pickle:safety-refresh", refresh)
  }, [])
  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError(false)
    async function load() {
      try {
        const { data, error } = await supabase.rpc("search_ranked_users", {
          p_query: query.trim(),
          p_offset: offset,
        })
        if (error || !Array.isArray(data?.users))
          throw error ?? new Error("User search unavailable")
        if (!ignore) {
          setUsers((current) =>
            offset
              ? [
                  ...current,
                  ...data.users.filter(
                    (row: Cook) => !current.some((cook) => cook.id === row.id),
                  ),
                ]
              : data.users,
          )
          setHasMore(data.has_more === true)
        }
      } catch {
        if (!ignore) setError(true)
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void load()
    return () => {
      ignore = true
    }
  }, [query, offset, retry])
  return (
    <section className="search-suggestions" aria-label="User search results">
      <h2>Users matching “{query}”</h2>
      {users.map((cook) => (
        <button
          type="button"
          className="search-cook"
          key={cook.id}
          onClick={() => onUser(cook.id)}
        >
          {cook.avatar_url && /^https?:\/\//.test(cook.avatar_url) ? (
            <img src={cook.avatar_url} alt="" />
          ) : (
            <span className="search-cook-avatar">
              {(cook.display_name || cook.username || "P")
                .charAt(0)
                .toUpperCase()}
            </span>
          )}
          <span>
            <strong>{cook.display_name || cook.username}</strong>
            <small>
              @{cook.username} · {cook.recipe_count.toLocaleString()} recipes ·{" "}
              {cook.view_count.toLocaleString()} views
            </small>
          </span>
        </button>
      ))}
      {loading && <p role="status">Loading users…</p>}
      {error && (
        <p role="alert">
          Could not load users.{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </button>
        </p>
      )}
      {!loading && !error && !users.length && <p>No matching users.</p>}
      {!loading && !error && hasMore && (
        <button
          type="button"
          className="search-more-users"
          onClick={() => setOffset((value) => value + 20)}
        >
          Load more users
        </button>
      )}
    </section>
  )
}
