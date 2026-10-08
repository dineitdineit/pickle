import { shareRecipe, recipeShareUrl } from "./lib/share"
import type { IngredientRow, StepRow, Nutrition } from "./recipeTypes"
import {
  IngredientsSection,
  StepsSection,
  NutritionSection,
} from "./RecipeSections"
import { formatTime } from "./lib/format"
import { recipeImageUrl, firstRelation } from "./lib/recipe"
import { useEffect, useMemo, useRef, useState } from "react"
import RetryState from "./RetryState"
import { supabase } from "./lib/supabase"
import { getCurrentUser } from "./lib/auth"
import RecipeComments from "./RecipeComments"

type RecipeDetailScreenProps = {
  recipeId: string
  onBack: () => void
  onSelectRecipe: (id: string) => void
  onBrowse: () => void
  onRequireLogin: () => void
}

type Recipe = {
  id: string
  title: string
  short_description: string | null
  description: string | null
  difficulty: string | null
  total_time_minutes: number | null
  servings: number | null
  cover_image: string | null
  ingredients_image: string | null
  like_count: number
}

type Recommendation = {
  id: string
  title: string
  difficulty: string | null
  total_time_minutes: number | null
  cover_image: string | null
}

export default function RecipeDetailScreen({
  recipeId,
  onBack,
  onSelectRecipe,
  onBrowse,
  onRequireLogin,
}: RecipeDetailScreenProps) {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [steps, setSteps] = useState<StepRow[]>([])
  const [nutrition, setNutrition] = useState<Nutrition | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [retryKey, setRetryKey] = useState(0)
  const [activeTab, setActiveTab] =
    useState<"Ingredients" | "Steps" | "Nutrition">("Ingredients")
  const [userId, setUserId] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [isLiked, setIsLiked] = useState(false)
  const [liking, setLiking] = useState(false)
  const [likeMessage, setLikeMessage] = useState("")
  const shareRequest = useRef(0)
  const [sharing, setSharing] = useState(false)
  const [shareMessage, setShareMessage] = useState("")
  const [showShareLink, setShowShareLink] = useState(false)
  const [commentCount, setCommentCount] = useState(0)

  useEffect(() => {
    let ignore = false
    async function loadRecipe() {
      setLoading(true)
      setErrorMessage("")

      const [
        recipeResult,
        ingredientResult,
        stepResult,
        nutritionResult,
        recommendationResult,
      ] = await Promise.all([
        supabase
          .from("recipes")
          .select(
            "id, title, short_description, description, difficulty, total_time_minutes, servings, cover_image, ingredients_image, like_count",
          )
          .eq("id", recipeId)
          .single(),
        supabase
          .from("recipe_ingredients")
          .select(
            "id, group_name, amount, unit, optional, substitute, display_order, ingredients(name)",
          )
          .eq("recipe_id", recipeId)
          .order("display_order", { ascending: true }),
        supabase
          .from("recipe_steps")
          .select(
            "id, step_number, title, instruction, step_image, step_time_minutes, is_final",
          )
          .eq("recipe_id", recipeId)
          .order("step_number", { ascending: true }),
        supabase
          .from("recipe_nutrition")
          .select("calories, protein_g, carbs_g, fat_g, is_estimated")
          .eq("recipe_id", recipeId)
          .maybeSingle(),
        supabase
          .from("recipes")
          .select("id, title, difficulty, total_time_minutes, cover_image")
          .neq("id", recipeId)
          .not("cover_image", "is", null)
          .order("created_at", { ascending: false })
          .limit(8),
      ])

      if (ignore) return

      if (recipeResult.error || ingredientResult.error || stepResult.error) {
        if (recipeResult.error)
          console.error("Failed to load recipe:", recipeResult.error)
        if (ingredientResult.error)
          console.error("Failed to load ingredients:", ingredientResult.error)
        if (stepResult.error)
          console.error("Failed to load recipe steps:", stepResult.error)
        setRecipe(null)
        setIngredients([])
        setSteps([])
        setErrorMessage("Could not load this recipe.")
        setLoading(false)
        return
      }

      setRecipe(recipeResult.data as Recipe)
      setIngredients(
        (ingredientResult.data ?? []).map((row) => ({
          ...row,
          ingredients: firstRelation(row.ingredients),
        })),
      )
      setSteps((stepResult.data ?? []) as StepRow[])

      if (nutritionResult.error) {
        console.error("Failed to load nutrition:", nutritionResult.error)
        setNutrition(null)
      } else {
        setNutrition(nutritionResult.data as Nutrition | null ?? null)
      }

      if (recommendationResult.error) {
        console.error(
          "Failed to load recipe recommendations:",
          recommendationResult.error,
        )
        setRecommendations([])
      } else {
        setRecommendations(
          (recommendationResult.data ?? []) as Recommendation[],
        )
      }

      const viewKey = `pickle:viewed:${recipeId}`
      if (!sessionStorage.getItem(viewKey)) {
        const { error: viewError } = await supabase
          .from("recipe_views")
          .insert({ recipe_id: recipeId })
        if (viewError) console.error("Failed to record recipe view:", viewError)
        else sessionStorage.setItem(viewKey, "1")
      }
      if (!ignore) setLoading(false)
    }

    loadRecipe()
    return () => {
      ignore = true
    }
  }, [recipeId, retryKey])

  useEffect(() => {
    let ignore = false

    async function loadUserState() {
      setSaveMessage("")
      setLikeMessage("")
      const { data: userData, error: userError } = await getCurrentUser()
      if (ignore) return

      if (userError || !userData.user) {
        setUserId(null)
        setIsSaved(false)
        setIsLiked(false)
        return
      }

      setUserId(userData.user.id)
      const [savedResult, likedResult] = await Promise.all([
        supabase
          .from("saved_recipes")
          .select("recipe_id")
          .eq("user_id", userData.user.id)
          .eq("recipe_id", recipeId)
          .maybeSingle(),
        supabase
          .from("recipe_likes")
          .select("recipe_id")
          .eq("user_id", userData.user.id)
          .eq("recipe_id", recipeId)
          .maybeSingle(),
      ])

      if (ignore) return

      if (savedResult.error) {
        console.error("Failed to load saved state:", savedResult.error)
        setIsSaved(false)
      } else {
        setIsSaved(Boolean(savedResult.data))
      }

      if (likedResult.error) {
        console.error("Failed to load liked state:", likedResult.error)
        setIsLiked(false)
      } else {
        setIsLiked(Boolean(likedResult.data))
      }
    }

    loadUserState()
    return () => {
      ignore = true
    }
  }, [recipeId])

  async function toggleSaved() {
    if (!userId) {
      onRequireLogin()
      return
    }

    setSaving(true)
    setSaveMessage("")

    if (isSaved) {
      const { error } = await supabase
        .from("saved_recipes")
        .delete()
        .eq("user_id", userId)
        .eq("recipe_id", recipeId)
      if (error) {
        console.error("Failed to remove saved recipe:", error)
        setSaveMessage("Could not update saved recipes.")
      } else {
        setIsSaved(false)
      }
    } else {
      const { error } = await supabase
        .from("saved_recipes")
        .insert({ user_id: userId, recipe_id: recipeId })
      if (error) {
        console.error("Failed to save recipe:", error)
        setSaveMessage("Could not save this recipe.")
      } else {
        setIsSaved(true)
      }
    }

    setSaving(false)
  }

  async function toggleLike() {
    if (!userId) {
      onRequireLogin()
      return
    }

    setLiking(true)
    setLikeMessage("")

    if (isLiked) {
      const { error } = await supabase
        .from("recipe_likes")
        .delete()
        .eq("user_id", userId)
        .eq("recipe_id", recipeId)
      if (error) {
        console.error("Failed to unlike recipe:", error)
        setLikeMessage("Could not update your like.")
      } else {
        setIsLiked(false)
        setRecipe((current) =>
          current
            ? { ...current, like_count: Math.max(current.like_count - 1, 0) }
            : current,
        )
      }
    } else {
      const { error } = await supabase
        .from("recipe_likes")
        .insert({ user_id: userId, recipe_id: recipeId })
      if (error) {
        console.error("Failed to like recipe:", error)
        setLikeMessage("Could not like this recipe.")
      } else {
        setIsLiked(true)
        setRecipe((current) =>
          current
            ? { ...current, like_count: current.like_count + 1 }
            : current,
        )
      }
    }

    setLiking(false)
  }

  useEffect(() => {
    shareRequest.current += 1
    setShareMessage("")
    setShowShareLink(false)
    setSharing(false)
    return () => {
      shareRequest.current += 1
    }
  }, [recipeId])

  async function handleShare() {
    if (!recipe || sharing) return
    const request = ++shareRequest.current
    setSharing(true)
    setShareMessage("")
    setShowShareLink(false)
    const result = await shareRecipe(recipe)
    if (request !== shareRequest.current) return
    if (result === "copied") setShareMessage("Recipe link copied!")
    if (result === "manual") {
      setShareMessage("Copy this link to share the recipe.")
      setShowShareLink(true)
    }
    setSharing(false)
  }

  const groupedIngredients = useMemo(() => {
    const groups = new Map<string, IngredientRow[]>()
    ingredients.forEach((item) => {
      const key = item.group_name || "Ingredients"
      const group = groups.get(key)
      if (group) group.push(item)
      else groups.set(key, [item])
    })
    return Array.from(groups.entries())
  }, [ingredients])

  if (loading) {
    return (
      <div className="min-h-screen bg-white max-w-md mx-auto flex items-center justify-center">
        <p className="text-[17px]" style={{ color: "#6F6F6F" }}>
          Loading recipe…
        </p>
      </div>
    )
  }

  if (!recipe || errorMessage) {
    return (
      <div className="min-h-screen bg-white max-w-md mx-auto pt-6">
        <div className="px-4">
          <button
            onClick={onBack}
            aria-label="Back"
            className="mb-2 text-[17px] font-medium"
            style={{ color: "#F26B21" }}
          >
            ← Back
          </button>
        </div>
        <RetryState
          title={
            errorMessage ? "Couldn't load this recipe" : "Recipe not found"
          }
          message={
            errorMessage
              ? "Please check your connection and try again."
              : "This recipe may no longer be available."
          }
          onRetry={() => setRetryKey((current) => current + 1)}
        />
      </div>
    )
  }

  return (
    <div className="recipe-detail relative min-h-screen bg-white max-w-md mx-auto pb-10">
      <div className="recipe-detail-hero relative h-[300px] bg-gray-100">
        <img
          src={recipeImageUrl(recipe.cover_image)}
          alt={recipe.title}
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.28), transparent 38%, rgba(0,0,0,0.18))",
          }}
        />
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center"
          style={{ position: "absolute", top: 20, left: 16, zIndex: 20 }}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1F1F1F"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div className="recipe-detail-body px-4 pt-5">
        <div className="recipe-detail-intro">
          <div
            className="flex justify-between gap-4"
            style={{ alignItems: "flex-end" }}
          >
            <div className="min-w-0">
              {recipe.short_description && (
                <p
                  className="text-[15px] leading-5 mb-1"
                  style={{ color: "#6F6F6F" }}
                >
                  {recipe.short_description}
                </p>
              )}
              <h1
                className="font-bold text-[31px] leading-tight"
                style={{ color: "#1F1F1F" }}
              >
                {recipe.title}
              </h1>
            </div>
            <div
              className="flex items-center gap-2 flex-shrink-0"
              style={{ alignSelf: "flex-end", marginBottom: 4 }}
            >
              <button
                type="button"
                onClick={toggleLike}
                disabled={liking}
                className="w-10 h-10 rounded-full border flex items-center justify-center disabled:opacity-60"
                style={
                  isLiked
                    ? {
                        borderColor: "#F26B21",
                        backgroundColor: "#F26B21",
                        color: "#FFFFFF",
                      }
                    : {
                        borderColor: "#EAEAEA",
                        backgroundColor: "#FFFFFF",
                        color: "#1F1F1F",
                      }
                }
                aria-label={isLiked ? "Unlike recipe" : "Like recipe"}
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill={isLiked ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleSaved}
                disabled={saving}
                className="w-10 h-10 rounded-full border flex items-center justify-center disabled:opacity-60"
                style={
                  isSaved
                    ? {
                        borderColor: "#F26B21",
                        backgroundColor: "#F26B21",
                        color: "#FFFFFF",
                      }
                    : {
                        borderColor: "#EAEAEA",
                        backgroundColor: "#FFFFFF",
                        color: "#1F1F1F",
                      }
                }
                aria-label={
                  isSaved ? "Remove recipe from saved recipes" : "Save recipe"
                }
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill={isSaved ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Share recipe"
                onClick={handleShare}
                disabled={sharing}
                aria-busy={sharing}
                className="recipe-share-button w-10 h-10 rounded-full border flex items-center justify-center disabled:opacity-60"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1F1F1F"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="10.51" x2="15.42" y2="6.49" />
                  <line x1="8.59" y1="13.49" x2="15.42" y2="17.51" />
                </svg>
              </button>
            </div>
          </div>
          {shareMessage && (
            <div className="mt-2 text-right">
              <p
                role="status"
                className="text-[14px]"
                style={{ color: "#6F6F6F" }}
              >
                {shareMessage}
              </p>
              {showShareLink && (
                <input
                  aria-label="Recipe share link"
                  readOnly
                  value={recipeShareUrl(recipe.id)}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-2 w-full border rounded-lg p-2 text-[15px]"
                />
              )}
            </div>
          )}
          {(saveMessage || likeMessage) && (
            <p
              className="text-[14px] mt-2 text-right"
              style={{ color: "#C53D2E" }}
            >
              {likeMessage || saveMessage}
            </p>
          )}

          <div
            className="flex items-center gap-3 mt-2.5 text-[14px]"
            style={{ color: "#6F6F6F" }}
          >
            <div className="flex items-center gap-1.5">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={isLiked ? "#F26B21" : "none"}
                stroke={isLiked ? "#F26B21" : "currentColor"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
              </svg>
              <span>{recipe.like_count}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
              </svg>
              <span>{commentCount}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-5">
            {[
              ["Time", formatTime(recipe.total_time_minutes)],
              ["Difficulty", recipe.difficulty || "—"],
              ["Servings", recipe.servings ? `${recipe.servings}` : "—"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[12px] p-3 text-center"
                style={{ backgroundColor: "#F9F9F9" }}
              >
                <p className="text-[14px] mb-1" style={{ color: "#6F6F6F" }}>
                  {label}
                </p>
                <p
                  className="font-semibold text-[16px]"
                  style={{ color: "#1F1F1F" }}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          {recipe.description && (
            <section className="mt-8">
              <h2
                className="font-semibold text-[22px] mb-3"
                style={{ color: "#1F1F1F" }}
              >
                About
              </h2>
              <p className="text-[17px] leading-6" style={{ color: "#6F6F6F" }}>
                {recipe.description}
              </p>
            </section>
          )}
        </div>

        <div
          className="recipe-detail-tabs mt-8 p-2.5 flex gap-1"
          style={{ backgroundColor: "#F5F5F5", borderRadius: 24 }}
        >
          {(["Ingredients", "Steps", "Nutrition"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 h-10 rounded-[16px] text-[16px] font-semibold transition-colors"
              style={
                activeTab === tab
                  ? {
                      backgroundColor: "#FFFFFF",
                      color: "#F26B21",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    }
                  : { color: "#6F6F6F" }
              }
            >
              {tab}
            </button>
          ))}
        </div>

        <IngredientsSection
          groupedIngredients={groupedIngredients}
          recipeTitle={recipe.title}
          ingredientsImage={recipe.ingredients_image}
          active={activeTab === "Ingredients"}
        />
        <StepsSection steps={steps} active={activeTab === "Steps"} />
        <NutritionSection
          nutrition={nutrition}
          active={activeTab === "Nutrition"}
        />

        <RecipeComments
          recipeId={recipeId}
          onRequireLogin={onRequireLogin}
          onCountChange={setCommentCount}
        />

        {recommendations.length > 0 && (
          <section
            className="pt-6 border-t"
            style={{ borderColor: "#EEEEEE", marginTop: 50 }}
          >
            <h2
              className="font-semibold text-[22px] mb-5"
              style={{ color: "#1F1F1F" }}
            >
              More recipes
            </h2>
            <div
              className="recipe-recommendations"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                justifyContent: "space-between",
                columnGap: 16,
                rowGap: 28,
              }}
            >
              {recommendations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectRecipe(item.id)
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                  className="text-left"
                  style={{ width: "100%", minWidth: 0 }}
                >
                  <div
                    className="overflow-hidden bg-gray-100 mb-2"
                    style={{ width: "100%", aspectRatio: "1", borderRadius: 16 }}
                  >
                    <img
                      src={recipeImageUrl(item.cover_image)}
                      alt={item.title}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                  <p
                    className="font-semibold text-[18px] leading-[21px] line-clamp-2"
                    style={{ color: "#1F1F1F" }}
                  >
                    {item.title}
                  </p>
                  <p className="text-[15px] mt-0.5" style={{ color: "#6F6F6F" }}>
                    {item.difficulty || "—"} ·{" "}
                    {formatTime(item.total_time_minutes)}
                  </p>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onBrowse}
              className="w-full h-12 mt-8 rounded-[14px] border text-[16px] font-semibold"
              style={{
                borderColor: "#F26B21",
                color: "#F26B21",
                backgroundColor: "#FFFFFF",
              }}
            >
              See more recipes
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
