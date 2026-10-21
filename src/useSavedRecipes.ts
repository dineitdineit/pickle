import { useEffect, useRef, useState } from "react"
import {
  changeSavedState,
  loadSavedPage,
  unsaveRecipe,
  type CookState,
  type SavedCursor,
  type SavedFilter,
  type SavedRecipe,
} from "./lib/savedRecipes"

export default function useSavedRecipes(
  userId: string | null,
  query: string,
  filter: SavedFilter,
) {
  const [rows, setRows] = useState<SavedRecipe[]>([])
  const [loading, setLoading] = useState(!!userId)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState("")
  const [pageError, setPageError] = useState("")
  const [changeError, setChangeError] = useState("")
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const [revision, setRevision] = useState(0)
  const version = useRef(0)
  const cursor = useRef<SavedCursor | null>(null)
  const pageBusy = useRef(false)
  const changing = useRef(new Set<string>())
  const mounted = useRef(false)
  const criteria = JSON.stringify([userId, query, filter])
  const criteriaRef = useRef(criteria)
  criteriaRef.current = criteria
  const loadedCriteria = useRef("")
  const refresh = () => setRevision((value) => value + 1)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    const update = () => {
      if (document.visibilityState !== "hidden") refresh()
    }
    window.addEventListener("focus", update)
    window.addEventListener("pickle:safety-refresh", update)
    window.addEventListener("pickle:blocks-changed", update)
    document.addEventListener("visibilitychange", update)
    return () => {
      window.removeEventListener("focus", update)
      window.removeEventListener("pickle:safety-refresh", update)
      window.removeEventListener("pickle:blocks-changed", update)
      document.removeEventListener("visibilitychange", update)
    }
  }, [])
  useEffect(() => {
    const request = ++version.current
    setRows([])
    setError("")
    setPageError("")
    setChangeError("")
    setHasMore(false)
    setLoading(!!userId)
    setLoadingMore(false)
    pageBusy.current = false
    cursor.current = null
    loadedCriteria.current = ""
    if (!userId) return
    const timer = setTimeout(
      () => {
        void loadSavedPage(query, filter)
          .then((page) => {
            if (version.current !== request) return
            setRows(page.rows)
            setHasMore(page.hasMore)
            cursor.current = page.cursor
            loadedCriteria.current = criteria
          })
          .catch(() => {
            if (version.current === request)
              setError("Could not load your saved recipes. Please retry.")
          })
          .finally(() => {
            if (version.current === request) setLoading(false)
          })
      },
      query.trim() ? 250 : 0,
    )
    return () => {
      ++version.current
      clearTimeout(timer)
    }
  }, [userId, query, filter, revision])
  async function loadMore() {
    if (
      !userId ||
      loading ||
      pageBusy.current ||
      !hasMore ||
      !cursor.current ||
      loadedCriteria.current !== criteriaRef.current
    )
      return
    const request = version.current
    pageBusy.current = true
    setLoadingMore(true)
    setPageError("")
    try {
      const page = await loadSavedPage(query, filter, cursor.current)
      if (version.current !== request) return
      setRows((current) => {
        const ids = new Set(current.map((row) => row.id))
        return [...current, ...page.rows.filter((row) => !ids.has(row.id))]
      })
      cursor.current = page.cursor
      setHasMore(page.hasMore)
    } catch {
      if (version.current === request)
        setPageError("Could not load more recipes. Please retry.")
    } finally {
      if (version.current === request) {
        pageBusy.current = false
        setLoadingMore(false)
      }
    }
  }
  async function change(id: string, state: CookState | null) {
    if (!userId || changing.current.has(id)) return
    const request = version.current,
      startedCriteria = criteriaRef.current
    changing.current.add(id)
    setPending(new Set(changing.current))
    setChangeError("")
    try {
      if (state === null) await unsaveRecipe(userId, id)
      else await changeSavedState(userId, id, state)
      if (
        !mounted.current ||
        version.current !== request ||
        criteriaRef.current !== startedCriteria
      )
        return
      setRows((current) =>
        state === null || (filter !== "all" && state !== filter)
          ? current.filter((row) => row.id !== id)
          : current.map((row) =>
              row.id === id ? { ...row, cook_state: state } : row,
            ),
      )
    } catch (failure) {
      if (mounted.current && version.current === request)
        setChangeError(
          failure instanceof Error
            ? failure.message
            : "Could not update this recipe. Please retry.",
        )
    } finally {
      changing.current.delete(id)
      if (mounted.current) {
        setPending(new Set(changing.current))
        // A refresh can finish before an earlier mutation. Reload after that
        // mutation settles instead of keeping a stale server snapshot.
        if (
          version.current !== request ||
          criteriaRef.current !== startedCriteria
        )
          refresh()
      }
    }
  }
  return {
    rows,
    loading,
    loadingMore,
    hasMore,
    error,
    pageError,
    changeError,
    pending,
    refresh,
    loadMore,
    change,
  }
}
