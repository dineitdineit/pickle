import { useEffect, useRef, useState } from "react"
import type { PostRecipeTag } from "./lib/postRecipeTags"
import { reactToRecipePost } from "./lib/postRecipeTags"
import RecipeImage from "./RecipeImage"
import { recipeImageUrl } from "./lib/recipe"
interface Props {
  tag: PostRecipeTag
  userId: string | null
  onSelectRecipe?: (id: string) => void
}
export default function PostRecipeCredit({
  tag,
  userId,
  onSelectRecipe,
}: Props) {
  const [reacted, setReacted] = useState(tag.author_reacted)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const locked = useRef(false)
  const version = useRef(0)
  useEffect(() => {
    version.current++
    setReacted(tag.author_reacted)
    setBusy(false)
    setError("")
    return () => {
      version.current++
    }
  }, [tag.post_id, tag.author_id, tag.author_reacted, userId])
  async function react() {
    if (locked.current || userId !== tag.author_id) return
    locked.current = true
    setBusy(true)
    setError("")
    const request = version.current
    try {
      const next = await reactToRecipePost(tag.post_id, !reacted)
      if (version.current === request) setReacted(next)
    } catch {
      if (version.current === request)
        setError("Could not update your reaction. Please try again.")
    } finally {
      locked.current = false
      if (version.current === request) setBusy(false)
    }
  }
  return (
    <div className="post-recipe-credit">
      <button
        type="button"
        className="post-recipe-link"
        disabled={!onSelectRecipe}
        onClick={() => onSelectRecipe?.(tag.recipe_id)}
      >
        <RecipeImage src={recipeImageUrl(tag.cover_image)} alt="" />
        <span>
          <small>Tagged recipe</small>
          <strong>{tag.title}</strong>
          <small>By {tag.author_name}</small>
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {userId === tag.author_id ? (
        <button
          type="button"
          className="post-author-reaction"
          aria-pressed={reacted}
          disabled={busy}
          onClick={() => void react()}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={reacted ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
          {reacted ? "Liked by recipe author" : "Like this photo feedback"}
        </button>
      ) : reacted ? (
        <span
          className="post-author-reaction"
          aria-label={`Liked by recipe author, ${tag.author_name}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
          Liked by recipe author
        </span>
      ) : null}
      {error && (
        <p className="post-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
