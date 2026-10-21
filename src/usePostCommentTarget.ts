import { useCallback, useEffect, useRef, useState } from "react"
import { getPostCommentContext } from "./lib/postComments"

export default function usePostCommentTarget(
  postId: string,
  commentId: string | undefined,
  busy: boolean,
) {
  const [context, setContext] =
    useState<Awaited<ReturnType<typeof getPostCommentContext>> | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const request = useRef(0)
  const refresh = useCallback(() => setRetry((value) => value + 1), [])
  useEffect(() => {
    setContext(null)
    setError("")
    setLoading(false)
    if (!commentId || busy) return
    const current = ++request.current
    setLoading(true)
    void getPostCommentContext(postId, commentId)
      .then((result) => {
        if (current === request.current) setContext(result)
      })
      .catch((failure) => {
        if (current === request.current) setError((failure as Error).message)
      })
      .finally(() => {
        if (current === request.current) setLoading(false)
      })
    window.addEventListener("pickle:safety-refresh", refresh)
    window.addEventListener("pickle:blocks-changed", refresh)
    return () => {
      request.current++
      window.removeEventListener("pickle:safety-refresh", refresh)
      window.removeEventListener("pickle:blocks-changed", refresh)
    }
  }, [postId, commentId, busy, retry, refresh])
  return { context, error, loading, refresh }
}
