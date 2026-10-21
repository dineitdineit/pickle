import { useEffect, useRef, useState } from "react"
import { supabase } from "./lib/supabase"
import BackIcon from "./BackIcon"
import "./user-actions.css"
interface Cook {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}
interface Row {
  blocked_id: string
  profile: Cook | null
}
interface Props {
  userId: string
  onBack: () => void
}
export default function BlockedUsersScreen({ userId, onBack }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [limit, setLimit] = useState(50)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1)
    window.addEventListener("pickle:safety-refresh", refresh)
    return () => window.removeEventListener("pickle:safety-refresh", refresh)
  }, [])
  const guard = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    const version = ++generation.current
    setLoading(true)
    setError("")
    async function load() {
      try {
        const result = await supabase.rpc("list_blocked_users", {
          p_limit: limit,
        })
        if (result.error || !Array.isArray(result.data))
          throw result.error ?? new Error("Invalid block list")
        if (version !== generation.current) return
        setRows((result.data ?? []).slice(0, limit).map((row) => ({
            ...row,
            profile: Array.isArray(row.profile)
              ? (row.profile[0] ?? null)
              : row.profile,
          })) as Row[])
        setHasMore((result.data ?? []).length > limit)
      } catch {
        if (version === generation.current)
          setError("Could not load blocked users. Please try again.")
      } finally {
        if (version === generation.current) setLoading(false)
      }
    }
    void load()
    return () => {
      generation.current++
    }
  }, [userId, limit, retry])
  async function unblock(id: string) {
    if (guard.current) return
    guard.current = true
    setBusy(id)
    setError("")
    const version = generation.current
    try {
      const { data, error: failure } = await supabase.rpc("set_user_block", {
        p_user_id: id,
        p_blocked: false,
      })
      if (failure || data?.user_id !== id || data.blocked !== false)
        throw failure ?? new Error("Unblock not confirmed")
      if (version !== generation.current) return
      setRows((current) => current.filter((row) => row.blocked_id !== id))
      window.dispatchEvent(new Event("pickle:blocks-changed"))
    } catch {
      if (version === generation.current)
        setError("Could not unblock this user. Please try again.")
    } finally {
      guard.current = false
      if (version === generation.current) setBusy(null)
    }
  }
  return (
    <div className="blocked-users">
      <header>
        <button type="button" aria-label="Back to settings" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>Blocked users</h1>
      </header>
      <p>
        Recipes, comments, reviews and messages are hidden from each other.
        Unblocking does not restore previous follows or recipe alerts.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            disabled={!!busy}
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {loading ? (
        <p role="status">Loading blocked users…</p>
      ) : (
        <>
          {rows.map((row) => {
            const name =
              row.profile?.display_name ||
              row.profile?.username ||
              "Pickle user"
            return (
              <article className="blocked-user" key={row.blocked_id}>
                {row.profile?.avatar_url ? (
                  <img src={row.profile.avatar_url} alt="" />
                ) : (
                  <span className="blocked-user-avatar">
                    {name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <strong>{name}</strong>
                  {row.profile?.username && (
                    <small>@{row.profile.username}</small>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void unblock(row.blocked_id)}
                  aria-label={`Unblock ${name}`}
                >
                  {busy === row.blocked_id ? "Saving…" : "Unblock"}
                </button>
              </article>
            )
          })}
          {!rows.length && !error && <p>You haven’t blocked anyone.</p>}
          {hasMore && (
            <button
              disabled={!!busy}
              onClick={() => setLimit((value) => value + 50)}
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  )
}
