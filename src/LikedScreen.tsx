import { VideoBadge } from "./RecipeVideo"
import { formatTime } from "./lib/format"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "./lib/supabase"
import { getCurrentUser } from "./lib/auth"
type LikedRecipe = {
  id: string
  title: string
  difficulty: string
  total_time_minutes: number
  video_url?: string | null
  image: string
}
type LikedScreenProps = {
  recipes: LikedRecipe[]
  onSelectRecipe: (id: string) => void
  onBack: () => void
}
export default function LikedScreen({
  recipes,
  onSelectRecipe,
  onBack,
}: LikedScreenProps) {
  const [likedIds, setLikedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [safetyVersion, setSafetyVersion] = useState(0)
  useEffect(() => {
    const refresh = () => setSafetyVersion((value) => value + 1)
    window.addEventListener("pickle:safety-refresh", refresh)
    return () => window.removeEventListener("pickle:safety-refresh", refresh)
  }, [])
  useEffect(() => {
    let ignore = false
    async function loadLikedRecipes() {
      setLoading(true)
      setErrorMessage("")
      const { data: userData, error: userError } = await getCurrentUser()
      const user = userData.user
      if (ignore) return
      if (userError || !user) {
        setLikedIds([])
        setLoading(false)
        return
      }
      const { data, error } = await supabase
        .from("recipe_likes")
        .select("recipe_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
      if (ignore) return
      if (error) {
        console.error("Failed to load liked recipes:")
        setErrorMessage("Could not load your liked recipes.")
        setLikedIds([])
      } else {
        setLikedIds((data ?? []).map((row) => row.recipe_id))
      }
      setLoading(false)
    }
    loadLikedRecipes()
    return () => {
      ignore = true
    }
  }, [safetyVersion])
  const recipeMap = useMemo(
    () => new Map(recipes.map((recipe) => [recipe.id, recipe])),
    [recipes],
  )
  const visibleRecipes = useMemo(
    () =>
      likedIds
        .map((id) => recipeMap.get(id))
        .filter((recipe): recipe is LikedRecipe => Boolean(recipe)),
    [likedIds, recipeMap],
  )
  async function removeLike(recipeId: string) {
    const { data: userData } = await getCurrentUser()
    const user = userData.user
    if (!user) return
    const { error } = await supabase
      .from("recipe_likes")
      .delete()
      .eq("user_id", user.id)
      .eq("recipe_id", recipeId)
    if (error) {
      console.error("Failed to unlike recipe:")
      setErrorMessage("Could not update this recipe. Please try again.")
      return
    }
    setLikedIds((current) => current.filter((id) => id !== recipeId))
  }
  return (
    <div className="pb-24">
      <div
        className="relative px-4 pt-6 text-center"
        style={{ marginBottom: 40 }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1.5px solid var(--color-border)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1
          className="font-bold text-page"
          style={{ color: "var(--color-ink)" }}
        >
          Liked Recipes
        </h1>
      </div>
      {loading ? (
        <div
          className="px-4 py-16 text-center text-body"
          style={{ color: "var(--color-gray)" }}
        >
          Loading liked recipes…
        </div>
      ) : visibleRecipes.length > 0 ? (
        <div className="web-saved-grid px-4 flex flex-col">
          {errorMessage && (
            <p className="text-label mb-2" style={{ color: "#C53D2E" }}>
              {errorMessage}
            </p>
          )}
          {visibleRecipes.map((recipe, index) => (
            <div
              key={recipe.id}
              className="flex items-center gap-4 py-3.5 w-full"
              style={{
                borderBottom:
                  index < visibleRecipes.length - 1
                    ? "1px solid var(--color-border)"
                    : undefined,
              }}
            >
              <button
                type="button"
                onClick={() => onSelectRecipe(recipe.id)}
                className="flex items-center gap-4 flex-1 min-w-0 text-left active:bg-gray-50"
              >
                <div
                  className="flex-shrink-0 rounded-[8px] overflow-hidden bg-gray-100"
                  style={{ width: 64, height: 64, position: "relative" }}
                >
                  <VideoBadge url={recipe.video_url} />
                  <img
                    src={recipe.image}
                    alt={recipe.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-semibold text-lead leading-snug truncate"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {recipe.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span
                      className="text-body px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-gray)",
                      }}
                    >
                      Filipino
                    </span>
                    <span
                      className="text-body px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-gray)",
                      }}
                    >
                      {recipe.difficulty}
                    </span>
                    <span
                      className="text-body"
                      style={{ color: "var(--color-gray)" }}
                    >
                      {formatTime(recipe.total_time_minutes)}
                    </span>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => removeLike(recipe.id)}
                aria-label={`Unlike ${recipe.title}`}
                className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-white)",
                  border: "1.5px solid var(--color-primary)",
                }}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{
              backgroundColor: "var(--color-primary-soft)",
              color: "var(--color-primary)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
            </svg>
          </div>
          <p
            className="font-semibold text-lead mb-1"
            style={{ color: "var(--color-ink)" }}
          >
            No liked recipes yet
          </p>
          <p
            className="text-body leading-5"
            style={{ color: "var(--color-gray)" }}
          >
            Recipes you like will appear here.
          </p>
          {errorMessage && (
            <p className="text-label mt-3" style={{ color: "#C53D2E" }}>
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
