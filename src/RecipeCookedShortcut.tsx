import type { RecipeTagChoice } from "./lib/postRecipeTags"
import "./photo-posts.css"

export default function RecipeCookedShortcut({
  recipe,
  onCreate,
}: {
  recipe: RecipeTagChoice
  onCreate: (recipe: RecipeTagChoice) => void
}) {
  return (
    <button
      type="button"
      className="recipe-cooked-shortcut"
      onClick={() => onCreate(recipe)}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      I cooked this
    </button>
  )
}
