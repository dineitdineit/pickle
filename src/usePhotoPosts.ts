import { useEffect, useRef, useState } from "react"
import { mergePostPage, postFeedQuery, type PhotoPost } from "./lib/postFeed"
import { attachPostRecipeTags } from "./lib/postRecipeTags"

interface FeedState {
  scope: string
  rows: PhotoPost[]
  loading: boolean
  loadingMore: boolean
  error: string
  hasMore: boolean
}
export default function usePhotoPosts({
  authorId,
  recipeId,
  postId,
  viewerId,
  pageSize = 20,
}: {
  authorId?: string
  recipeId?: string
  postId?: string
  viewerId: string | null
  pageSize?: number
}) {
  const scope = `${viewerId ?? "guest"}:${authorId ?? "all"}:${recipeId ?? "all"}:${postId ?? "all"}:${pageSize}`
  const [refresh, setRefresh] = useState(0)
  const [state, setState] = useState<FeedState>({
    scope,
    rows: [],
    loading: true,
    loadingMore: false,
    error: "",
    hasMore: false,
  })
  const version = useRef(0)
  const locked = useRef(false)
  useEffect(() => {
    const reload = () => setRefresh((v) => v + 1)
    window.addEventListener("pickle:blocks-changed", reload)
    window.addEventListener("pickle:safety-refresh", reload)
    return () => {
      window.removeEventListener("pickle:blocks-changed", reload)
      window.removeEventListener("pickle:safety-refresh", reload)
    }
  }, [])
  useEffect(() => {
    const request = ++version.current
    locked.current = true
    setState({
      scope,
      rows: [],
      loading: true,
      loadingMore: false,
      error: "",
      hasMore: false,
    })
    async function load() {
      try {
        const result = await postFeedQuery({
          authorId,
          recipeId,
          postId,
          limit: pageSize,
        })
        if (result.error) throw result.error
        if (request !== version.current) return
        const rows = (result.data ?? []) as unknown as PhotoPost[]
        const tagged = await attachPostRecipeTags(rows.slice(0, pageSize))
        if (request !== version.current) return
        setState({
          scope,
          rows: recipeId
            ? tagged.filter((row) => row.recipe_tag?.recipe_id === recipeId)
            : tagged,
          loading: false,
          loadingMore: false,
          error: "",
          hasMore: !postId && rows.length > pageSize,
        })
      } catch {
        if (request === version.current)
          setState({
            scope,
            rows: [],
            loading: false,
            loadingMore: false,
            error: "Could not load posts. Please try again.",
            hasMore: false,
          })
      } finally {
        if (request === version.current) locked.current = false
      }
    }
    void load()
    return () => {
      version.current++
    }
  }, [authorId, recipeId, postId, pageSize, scope, refresh])
  async function loadMore() {
    if (
      locked.current ||
      state.scope !== scope ||
      !state.hasMore ||
      !state.rows.length
    )
      return
    locked.current = true
    const request = version.current
    const before = state.rows[state.rows.length - 1]
    setState((current) => ({ ...current, loadingMore: true, error: "" }))
    try {
      const result = await postFeedQuery({
        authorId,
        recipeId,
        postId,
        limit: pageSize,
        before,
      })
      if (result.error) throw result.error
      if (request !== version.current) return
      const next = (result.data ?? []) as unknown as PhotoPost[]
      const tagged = await attachPostRecipeTags(next.slice(0, pageSize))
      if (request !== version.current) return
      setState((current) => ({
        ...current,
        rows: mergePostPage(
          current.rows,
          recipeId
            ? tagged.filter((row) => row.recipe_tag?.recipe_id === recipeId)
            : tagged,
        ),
        loadingMore: false,
        hasMore: next.length > pageSize,
      }))
    } catch {
      if (request === version.current)
        setState((current) => ({
          ...current,
          loadingMore: false,
          error: "Could not load more posts. Please try again.",
        }))
    } finally {
      if (request === version.current) locked.current = false
    }
  }
  const visible =
    state.scope === scope
      ? state
      : {
          scope,
          rows: [],
          loading: true,
          loadingMore: false,
          error: "",
          hasMore: false,
        }
  return {
    ...visible,
    loadMore,
    reload: () => setRefresh((current) => current + 1),
    removeLocal: (id: string) =>
      setState((current) => ({
        ...current,
        rows: current.rows.filter((post) => post.id !== id),
      })),
  }
}
