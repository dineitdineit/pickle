import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "./supabase"
import { getCurrentUser } from "./auth"

export type Review = {
  id: string
  user_id: string
  rating: number
  content: string
  created_at: string
  updated_at: string
  profiles: {
    display_name: string
    username: string
    avatar_url: string | null
  } | null
}
export type RatingSummary = {
  average: number
  total: number
  written: number
  distribution: number[]
}
export const emptyRatingSummary: RatingSummary = {
  average: 0,
  total: 0,
  written: 0,
  distribution: [0, 0, 0, 0, 0],
}
const columns =
  "id,user_id,rating,content,created_at,updated_at,profiles(display_name,username,avatar_url)"

export function normalizeReview(row: any): Review {
  return {
    ...row,
    profiles: Array.isArray(row.profiles)
      ? (row.profiles[0] ?? null)
      : row.profiles,
  }
}

export function useRecipeReviews(recipeId: string) {
  const [summary, setSummary] = useState<RatingSummary>(emptyRatingSummary)
  const [reviews, setReviews] = useState<Review[]>([])
  const [ownReview, setOwnReview] = useState<Review | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const request = useRef(0)
  const reload = useCallback(() => setRefresh((value) => value + 1), [])

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => reload())
    return () => data.subscription.unsubscribe()
  }, [reload])

  useEffect(() => {
    setPage(1)
    setSummary(emptyRatingSummary)
    setReviews([])
    setOwnReview(null)
  }, [recipeId])

  useEffect(() => {
    const current = ++request.current
    let disposed = false
    setLoading(true)
    setError("")
    async function load() {
      try {
        const { data: authData, error: authError } = await getCurrentUser()
        if (authError) throw authError
        const uid = authData.user?.id ?? null
        const [stats, list, own] = await Promise.all([
          supabase.rpc("recipe_rating_summary", { p_recipe_id: recipeId }),
          supabase
            .from("recipe_reviews")
            .select(columns)
            .eq("recipe_id", recipeId)
            .neq("content", "")
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(0, page * 10 - 1),
          uid
            ? supabase
                .from("recipe_reviews")
                .select(columns)
                .eq("recipe_id", recipeId)
                .eq("user_id", uid)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ])
        if (stats.error || list.error || own.error)
          throw stats.error || list.error || own.error
        if (disposed || current !== request.current) return
        const row = stats.data?.[0]
        setSummary(
          row
            ? {
                average: Number(row.average_rating),
                total: Number(row.rating_count),
                written: Number(row.review_count),
                distribution: [
                  row.star_1,
                  row.star_2,
                  row.star_3,
                  row.star_4,
                  row.star_5,
                ].map(Number),
              }
            : emptyRatingSummary,
        )
        setReviews((list.data ?? []).map(normalizeReview))
        setOwnReview(own.data ? normalizeReview(own.data) : null)
        setUserId(uid)
      } catch (err) {
        if (disposed || current !== request.current) return
        console.error("Failed to load reviews", err)
        setError("Could not load ratings and reviews. Please try again.")
      } finally {
        if (!disposed && current === request.current) setLoading(false)
      }
    }
    void load()
    return () => {
      disposed = true
    }
  }, [recipeId, page, refresh])

  return {
    summary,
    reviews,
    ownReview,
    userId,
    loading,
    error,
    reload,
    loadMore: () => setPage((value) => value + 1),
  }
}
