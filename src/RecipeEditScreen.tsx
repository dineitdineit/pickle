import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
import {
  submissionColumns,
  type RecipeTag,
  type Submission,
} from "./lib/submissions"
import RecipeUploadScreen from "./RecipeUploadScreen"
type Props = {
  userId: string
  recipeId: string
  onBack: () => void
  onSaved: () => void
}
export default function RecipeEditScreen({
  userId,
  recipeId,
  onBack,
  onSaved,
}: Props) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [tags, setTags] = useState<RecipeTag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    async function load() {
      try {
        const [owned, catalog] = await Promise.all([
          supabase
            .from("recipe_submissions")
            .select(submissionColumns)
            .eq("user_id", userId)
            .eq("published_recipe_id", recipeId)
            .eq("status", "published")
            .maybeSingle(),
          supabase
            .from("tags")
            .select("id,name,category")
            .order("category")
            .order("name"),
        ])
        if (owned.error || catalog.error) throw owned.error ?? catalog.error
        if (
          !owned.data ||
          owned.data.user_id !== userId ||
          owned.data.published_recipe_id !== recipeId ||
          owned.data.status !== "published"
        )
          throw new Error("Recipe unavailable")
        if (!ignore) {
          setSubmission(owned.data as Submission)
          setTags(catalog.data ?? [])
        }
      } catch {
        if (!ignore)
          setError(
            "Could not open this recipe for editing. It may have been deleted or belong to another account.",
          )
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void load()
    return () => {
      ignore = true
    }
  }, [userId, recipeId, retry])
  if (loading)
    return (
      <div className="submission-ui my-recipes">
        <p role="status">Opening recipe editor…</p>
      </div>
    )
  if (error || !submission)
    return (
      <div className="submission-ui my-recipes">
        <p role="alert">{error}</p>
        <div className="submission-inline-actions">
          <button
            type="button"
            className="submission-secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </button>
          <button
            type="button"
            className="submission-text-button"
            onClick={onBack}
          >
            Back to recipe
          </button>
        </div>
      </div>
    )
  return (
    <RecipeUploadScreen
      key={submission.id}
      userId={userId}
      submission={submission}
      tags={tags}
      onBack={onBack}
      onSaved={onSaved}
    />
  )
}
