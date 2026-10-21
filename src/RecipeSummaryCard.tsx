import RecipeImage from "./RecipeImage"

import { recipeImageUrl } from "./lib/recipe"

import { VideoBadge } from "./RecipeVideo"

import "./recipe-summary.css"

export interface RecipeSummary {
  id: string

  title: string

  cover_image: string | null

  short_description: string | null

  view_count: number

  like_count: number

  video_url?: string | null

  tagNames?: string[]
}

interface Props {
  recipe: RecipeSummary

  onSelect: (id: string) => void
}

export default function RecipeSummaryCard({ recipe, onSelect }: Props) {
  const tags = Array.from(
    new Map(
      (recipe.tagNames ?? [])

        .map((tag) => tag.trim())

        .filter(Boolean)

        .map((tag) => [tag.toLowerCase(), tag]),
    ).values(),
  )

    .sort((a, b) => a.localeCompare(b, "en"))

    .slice(0, 3)

  return (
    <button
      type="button"
      className="recipe-summary-card"
      onClick={() => onSelect(recipe.id)}
      aria-label={`View ${recipe.title}`}
    >
      <span className="recipe-summary-photo">
        <VideoBadge url={recipe.video_url} />
        <RecipeImage
          src={recipeImageUrl(recipe.cover_image)}
          alt=""
          loading="lazy"
        />
      </span>
      <span className="recipe-summary-info">
        <strong>{recipe.title}</strong>
        <span className="recipe-summary-counts">
          {recipe.view_count.toLocaleString()} views ·{" "}
          {recipe.like_count.toLocaleString()} likes
        </span>
        {recipe.short_description && (
          <span className="recipe-summary-description">
            {recipe.short_description}
          </span>
        )}
        {tags.length > 0 && (
          <span className="recipe-summary-tags" aria-label="Recipe tags">
            {tags.map((tag) => (
              <span className="recipe-summary-tag" key={tag.toLowerCase()}>
                {tag}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  )
}
