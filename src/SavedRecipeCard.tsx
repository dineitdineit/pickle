import RecipeImage from "./RecipeImage"

import { VideoBadge } from "./RecipeVideo"

import { formatTime } from "./lib/format"

import { recipeImageUrl } from "./lib/recipe"

import type { CookState, SavedRecipe } from "./lib/savedRecipes"

type Props = {
  recipe: SavedRecipe

  pending: boolean

  onSelect: () => void

  onToggle: () => void

  onStateChange: (state: CookState) => void
}

export default function SavedRecipeCard({
  recipe,

  pending,

  onSelect,

  onToggle,

  onStateChange,
}: Props) {
  const duration = formatTime(recipe.total_time_minutes, "compact")

  return (
    <article className="saved-recipe-card">
      <button
        type="button"
        className="saved-recipe-open"
        onClick={onSelect}
        aria-label={`View ${recipe.title}`}
      >
        <div className="saved-recipe-photo">
          <VideoBadge url={recipe.video_url} />
          <RecipeImage
            src={recipeImageUrl(recipe.cover_image)}
            alt={recipe.title}
            loading="lazy"
          />
        </div>
        <h2 className="saved-recipe-title">{recipe.title}</h2>
        <div className="saved-recipe-tags">
          <span>{recipe.difficulty || "Recipe"}</span>
          <span>{duration}</span>
        </div>
      </button>
      <button
        type="button"
        className="saved-recipe-toggle"
        aria-label={`Unsave ${recipe.title}`}
        aria-pressed={true}
        disabled={pending}
        onClick={onToggle}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      </button>
      <select
        className="saved-recipe-state"
        aria-label={`Cooking status for ${recipe.title}`}
        value={recipe.cook_state}
        disabled={pending}
        onChange={(event) => onStateChange(event.target.value as CookState)}
      >
        <option value="want_to_cook">Want to cook</option>
        <option value="cooked">Cooked</option>
      </select>
    </article>
  )
}
