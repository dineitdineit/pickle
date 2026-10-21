import BackIcon from "./BackIcon"
import { useState } from "react"
import RetryState from "./RetryState"
import SavedRecipeCard from "./SavedRecipeCard"
import useSavedRecipes from "./useSavedRecipes"
import { type SavedFilter } from "./lib/savedRecipes"
import "./saved-recipes.css"

interface Props {
  userId: string | null
  onSelectRecipe: (id: string) => void
  onBack: () => void
  onRequireLogin: () => void
}
interface FilterOption {
  value: SavedFilter
  label: string
}
const filters: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "want_to_cook", label: "Want to cook" },
  { value: "cooked", label: "Cooked" },
]
export default function SavedScreen({
  userId,
  onSelectRecipe,
  onBack,
  onRequireLogin,
}: Props) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<SavedFilter>("all")
  const saved = useSavedRecipes(userId, query, filter)
  return (
    <div className="saved-library pb-24">
      <header className="saved-library-heading">
        <button type="button" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
        <h1>Saved Recipes</h1>
        <span />
      </header>
      {!userId ? (
        <div className="saved-library-empty">
          <h2>Log in to save recipes</h2>
          <p>Your collection and cooking states stay linked to your account.</p>
          <button
            type="button"
            className="saved-library-action"
            onClick={onRequireLogin}
          >
            Log in
          </button>
        </div>
      ) : (
        <>
          <div className="saved-library-controls">
            <form
              role="search"
              onSubmit={(event) => {
                event.preventDefault()
                ;(document.activeElement as HTMLElement)?.blur()
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="7.5" />
                <path d="m16 16 5 5" />
              </svg>
              <input
                type="search"
                aria-label="Search saved recipes"
                placeholder="Search saved recipes…"
                maxLength={100}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                enterKeyHint="search"
              />
            </form>
            <div
              className="saved-library-filters"
              role="group"
              aria-label="Filter saved recipes by cooking state"
            >
              {filters.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {saved.changeError && (
            <p className="saved-library-error" role="alert">
              {saved.changeError}
            </p>
          )}
          {saved.loading ? (
            <p className="saved-library-empty" role="status">
              Loading saved recipes…
            </p>
          ) : saved.error ? (
            <RetryState
              title="Couldn't load saved recipes"
              message={saved.error}
              onRetry={saved.refresh}
            />
          ) : (
            <>
              {!!saved.rows.length && (
                <div className="saved-recipe-grid">
                  {saved.rows.map((recipe) => (
                    <SavedRecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      pending={saved.pending.has(recipe.id)}
                      onSelect={() => onSelectRecipe(recipe.id)}
                      onToggle={() => void saved.change(recipe.id, null)}
                      onStateChange={(state) =>
                        void saved.change(recipe.id, state)
                      }
                    />
                  ))}
                </div>
              )}
              {!saved.rows.length && !saved.hasMore && (
                <div className="saved-library-empty" role="status">
                  <h2>
                    {query.trim()
                      ? "No saved recipes match"
                      : filter === "cooked"
                        ? "No cooked recipes yet"
                        : filter === "want_to_cook"
                          ? "Nothing on your cooking list"
                          : "No saved recipes yet"}
                  </h2>
                  <p>
                    {query.trim()
                      ? "Try another recipe name or description."
                      : filter === "cooked"
                        ? "Change a saved recipe’s status to Cooked after making it."
                        : filter === "want_to_cook"
                          ? "Save a recipe or change its status to Want to cook."
                          : "Save a recipe to start your cooking list."}
                  </p>
                </div>
              )}
              {saved.pageError && (
                <p className="saved-library-error" role="alert">
                  {saved.pageError}
                </p>
              )}
              {saved.hasMore && (
                <div className="saved-library-more">
                  <button
                    className="saved-library-action"
                    type="button"
                    disabled={saved.loadingMore}
                    onClick={() => void saved.loadMore()}
                  >
                    {saved.loadingMore
                      ? "Loading…"
                      : saved.pageError
                        ? "Retry loading more"
                        : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
