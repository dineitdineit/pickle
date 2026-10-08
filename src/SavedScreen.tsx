import { useEffect, useMemo, useState } from "react"
import RetryState from "./RetryState"
import SavedRecipeCard from "./SavedRecipeCard"
import { supabase } from "./lib/supabase"
import { getCurrentUser } from "./lib/auth"

type SavedRecipe = {
  id: string
  title: string
  difficulty: string
  total_time_minutes: number
  image: string
}

interface SavedScreenProps {
  recipes: SavedRecipe[]
  recipesLoading?: boolean
  recipeDataError?: string
  onRetryRecipeData?: () => void
  onSelectRecipe: (id: string) => void
}

export default function SavedScreen({
  recipes,
  recipesLoading = false,
  recipeDataError = "",
  onRetryRecipeData,
  onSelectRecipe,
}: SavedScreenProps) {
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [listedIds, setListedIds] = useState<string[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let ignore = false

    async function loadSavedRecipes() {
      setLoading(true)
      setErrorMessage("")
      setLoadFailed(false)

      const { data: userData, error: userError } = await getCurrentUser()
      const user = userData.user

      if (ignore) return

      if (userError) {
        console.error("Failed to check saved recipe account:", userError)
        setLoggedIn(false)
        setSavedIds([])
        setErrorMessage("Could not load your saved recipes.")
        setLoadFailed(true)
        setLoading(false)
        return
      }

      if (!user) {
        setLoggedIn(false)
        setSavedIds([])
        setLoading(false)
        return
      }

      setLoggedIn(true)

      const { data, error } = await supabase
        .from("saved_recipes")
        .select("recipe_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (ignore) return

      if (error) {
        console.error("Failed to load saved recipes:", error)
        setErrorMessage("Could not load your saved recipes.")
        setLoadFailed(true)
        setSavedIds([])
      } else {
        const ids = (data ?? []).map((row) => row.recipe_id)
        setSavedIds(ids)
        setListedIds(ids)
      }

      setLoading(false)
    }

    loadSavedRecipes()
    return () => {
      ignore = true
    }
  }, [retryKey])

  const recipeMap = useMemo(
    () => new Map(recipes.map((recipe) => [recipe.id, recipe])),
    [recipes],
  )
  const visibleRecipes = useMemo(
    () =>
      listedIds
        .map((id) => recipeMap.get(id))
        .filter((recipe): recipe is SavedRecipe => Boolean(recipe)),
    [listedIds, recipeMap],
  )

  async function toggleSaved(recipeId: string) {
    if (pendingIds.has(recipeId)) return
    const wasSaved = savedIds.includes(recipeId)
    setPendingIds((current) => new Set(current).add(recipeId))
    setErrorMessage("")
    try {
      const { data: userData, error: userError } = await getCurrentUser()
      const user = userData.user
      if (userError || !user)
        throw new Error("Please log in again to update saved recipes.")
      const { error } = wasSaved
        ? await supabase
            .from("saved_recipes")
            .delete()
            .eq("user_id", user.id)
            .eq("recipe_id", recipeId)
        : await supabase
            .from("saved_recipes")
            .insert({ user_id: user.id, recipe_id: recipeId })
      if (error) throw error
      setSavedIds((current) =>
        wasSaved
          ? current.filter((id) => id !== recipeId)
          : [...current, recipeId],
      )
    } catch {
      setErrorMessage("Could not update saved recipes. Please try again.")
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(recipeId)
        return next
      })
    }
  }

  return (
    <div className="pb-24">
      <div
        className="relative px-4 pt-6 text-center"
        style={{ marginBottom: 40 }}
      >
        <h1 className="font-bold text-[27px]" style={{ color: "#1F1F1F" }}>
          Saved Recipes
        </h1>
      </div>

      {loading || (loggedIn && savedIds.length > 0 && recipesLoading) ? (
        <div
          className="px-4 py-16 text-center text-[16px]"
          style={{ color: "#6F6F6F" }}
        >
          Loading saved recipes…
        </div>
      ) : loadFailed ? (
        <RetryState
          title="Couldn't load saved recipes"
          message={
            errorMessage || "Please check your connection and try again."
          }
          onRetry={() => setRetryKey((current) => current + 1)}
        />
      ) : loggedIn &&
        savedIds.length > 0 &&
        recipeDataError &&
        onRetryRecipeData ? (
        <RetryState
          title="Couldn't load recipe details"
          message="Your saved recipes are safe. Please try loading them again."
          onRetry={onRetryRecipeData}
        />
      ) : !loggedIn ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: "#FFF0E6", color: "#F26B21" }}
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
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </div>
          <p
            className="font-semibold text-[19px] mb-1"
            style={{ color: "#1F1F1F" }}
          >
            Log in to save recipes
          </p>
          <p className="text-[16px] leading-5" style={{ color: "#6F6F6F" }}>
            Your saved recipes are linked to your Pickle account.
          </p>
        </div>
      ) : visibleRecipes.length > 0 ? (
        <div className="saved-recipe-grid">
          {errorMessage && (
            <p
              role="alert"
              className="saved-recipe-error text-[14px] mb-2"
              style={{ color: "#C53D2E" }}
            >
              {errorMessage}
            </p>
          )}
          {visibleRecipes.map((recipe) => (
            <SavedRecipeCard
              key={recipe.id}
              recipe={recipe}
              saved={savedIds.includes(recipe.id)}
              pending={pendingIds.has(recipe.id)}
              onSelect={() => onSelectRecipe(recipe.id)}
              onToggle={() => toggleSaved(recipe.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: "#FFF0E6", color: "#F26B21" }}
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
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </div>
          <p
            className="font-semibold text-[19px] mb-1"
            style={{ color: "#1F1F1F" }}
          >
            No saved recipes yet
          </p>
          <p className="text-[16px] leading-5" style={{ color: "#6F6F6F" }}>
            Recipes you save will appear here.
          </p>
          {errorMessage && (
            <p className="text-[14px] mt-3" style={{ color: "#C53D2E" }}>
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
