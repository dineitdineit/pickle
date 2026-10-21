import { useEffect, useRef, useState } from "react"
import { searchPostRecipes, type RecipeTagChoice } from "./lib/postRecipeTags"
import RecipeImage from "./RecipeImage"
import { recipeImageUrl } from "./lib/recipe"
interface Props {
  value: RecipeTagChoice | null
  onChange: (value: RecipeTagChoice | null) => void
  disabled: boolean
}
export default function PostRecipePicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<RecipeTagChoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const version = useRef(0)
  useEffect(() => {
    const request = ++version.current
    setRows([])
    setError("")
    setLoading(open && !!query.trim())
    if (!open || !query.trim()) return
    const timer = window.setTimeout(() => {
      void searchPostRecipes(query, offset)
        .then((next) => {
          if (version.current === request) setRows(next)
        })
        .catch(() => {
          if (version.current === request)
            setError(
              "Could not search recipes. Change your search or try again.",
            )
        })
        .finally(() => {
          if (version.current === request) setLoading(false)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      version.current++
    }
  }, [query, offset, open])
  return (
    <section className="post-recipe-picker" aria-label="Tag a recipe">
      <h2>Made a recipe?</h2>
      <p className="post-hint">
        Tag the original recipe so its cook can see what you made. Optional ·
        one recipe per post.
      </p>
      {value && (
        <div className="post-recipe-choice">
          <RecipeImage src={recipeImageUrl(value.cover_image)} alt="" />
          <span>
            <strong>{value.title}</strong>
            {value.author_name && <small>By {value.author_name}</small>}
          </span>
          <button
            type="button"
            disabled={disabled}
            aria-label="Remove recipe tag"
            onClick={() => onChange(null)}
          >
            ×
          </button>
        </div>
      )}
      <button
        type="button"
        className="post-tag-button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? "Close recipe search"
          : value
            ? "Change recipe"
            : "Tag a recipe"}
      </button>
      {open && (
        <div>
          <label>
            Search recipes
            <input
              type="search"
              maxLength={80}
              value={query}
              disabled={disabled}
              placeholder="Search by recipe name"
              onChange={(e) => {
                version.current++
                setQuery(e.target.value)
                setOffset(0)
              }}
            />
          </label>
          {loading && <p role="status">Searching recipes…</p>}
          {error && <p role="alert">{error}</p>}
          {!loading && !error && query.trim() && !rows.length && (
            <p className="post-hint">No recipes found. Try another name.</p>
          )}
          <ul className="post-recipe-results">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={disabled || loading}
                  onClick={() => {
                    version.current++
                    onChange(row)
                    setOpen(false)
                  }}
                >
                  <RecipeImage src={recipeImageUrl(row.cover_image)} alt="" />
                  <span>
                    <strong>{row.title}</strong>
                    <small>By {row.author_name}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="post-recipe-pages">
            {offset > 0 && (
              <button
                type="button"
                disabled={disabled || loading}
                onClick={() => setOffset((v) => Math.max(0, v - 20))}
              >
                Previous
              </button>
            )}
            {rows.length === 20 && offset < 200 && (
              <button
                type="button"
                disabled={disabled || loading}
                onClick={() => setOffset((v) => v + 20)}
              >
                More recipes
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
