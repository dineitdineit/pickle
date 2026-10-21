import RecipeSummaryCard from "./RecipeSummaryCard"

import { firstRelation } from "./lib/recipe"

import { useEffect, useMemo, useRef, useState } from "react"

import { supabase } from "./lib/supabase"

import { addRecentSearch } from "./recentSearches"

import SearchSuggestions from "./SearchSuggestions"

import RankedSearchUsers from "./RankedSearchUsers"

const PAGE_SIZE = 8

type SearchRecipe = {
  id: string

  title: string

  difficulty: string

  total_time_minutes: number

  video_url?: string | null

  cover_image: string | null

  short_description: string | null

  view_count: number

  like_count: number

  ingredientNames: string[]

  tagNames: string[]
}

interface SearchScreenProps {
  query: string

  setQuery: (v: string) => void

  onBack: () => void

  onSelectRecipe: (id: string) => void

  onSelectUser: (id: string) => void

  initialEditing?: boolean

  typingRequest?: number

  authorId?: string
}

export default function SearchScreen({
  query,

  setQuery,

  onBack,

  onSelectRecipe,

  onSelectUser,

  initialEditing = false,

  typingRequest = 0,

  authorId,
}: SearchScreenProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [recipes, setRecipes] = useState<SearchRecipe[]>([])

  const [loading, setLoading] = useState(true)

  const [submittedQuery, setSubmittedQuery] = useState(query)

  const [editing, setEditing] = useState(initialEditing)

  const [showAllUsers, setShowAllUsers] = useState(false)

  const [loadError, setLoadError] = useState(false)

  const [retry, setRetry] = useState(0)

  const recipesLoaded = useRef(false)

  useEffect(() => {
    const refresh = () => {
      recipesLoaded.current = false

      setRecipes([])

      setRetry((value) => value + 1)
    }

    window.addEventListener("pickle:safety-refresh", refresh)

    return () => window.removeEventListener("pickle:safety-refresh", refresh)
  }, [])

  const lastTyping = useRef(typingRequest)

  useEffect(() => {
    if (lastTyping.current !== typingRequest) {
      lastTyping.current = typingRequest

      setEditing(true)

      setShowAllUsers(false)
    }
  }, [typingRequest])

  const lastLoggedSearchRef = useRef("")

  useEffect(() => {
    if ((editing && !authorId) || recipesLoaded.current) return

    let ignore = false

    async function loadRecipes() {
      setLoading(true)

      setLoadError(false)

      let request = supabase.from("recipes").select(`
          id,
          title,
          difficulty,
          total_time_minutes,
          cover_image,
          video_url,
          short_description,
          like_count,
          view_count,
          recipe_ingredients(ingredients(name)),
          recipe_tags(tags(name))
        `)

      if (authorId)
        request = request.eq("author_id", authorId).eq("is_hidden", false)

      const { data, error } = await request.order("title", { ascending: true })

      if (ignore) return

      if (error) {
        console.error("Failed to load search recipes:")

        setLoading(false)

        setLoadError(true)

        return
      }

      setRecipes(
        (data ?? []).map((recipe) => ({
          id: recipe.id,

          title: recipe.title,

          difficulty: recipe.difficulty,

          total_time_minutes: recipe.total_time_minutes,

          cover_image: recipe.cover_image,

          video_url: recipe.video_url,

          short_description: recipe.short_description,

          view_count: recipe.view_count ?? 0,

          like_count: recipe.like_count ?? 0,

          ingredientNames: (recipe.recipe_ingredients ?? [])

            .map((row) => firstRelation(row.ingredients)?.name)

            .filter(
              (name: unknown): name is string => typeof name === "string",
            ),

          tagNames: (recipe.recipe_tags ?? [])

            .map((row) => firstRelation(row.tags)?.name)

            .filter(
              (name: unknown): name is string => typeof name === "string",
            ),
        })),
      )

      recipesLoaded.current = true

      setLoading(false)
    }

    void loadRecipes().catch(() => {
      if (!ignore) {
        console.error("Failed to load search recipes:")

        setLoadError(true)

        setLoading(false)
      }
    })

    return () => {
      ignore = true
    }
  }, [editing, retry, authorId])

  const filtered = useMemo(() => {
    const normalized = submittedQuery.trim().toLowerCase()

    if (!normalized) return recipes

    const aliases: Record<string, string[]> = {
      seafood: [
        "fish",

        "shrimp",

        "squid",

        "milkfish",

        "bangus",

        "tuna",

        "prawn",
      ],

      dessert: ["sweet"],
    }

    if (normalized === "seafood") {
      return recipes.filter((recipe) => {
        const searchableText = [
          recipe.title,

          ...recipe.ingredientNames,

          ...recipe.tagNames,
        ]

          .join(" ")

          .toLowerCase()

        return aliases.seafood.some((term) => searchableText.includes(term))
      })
    }

    if (normalized === "dessert") {
      return recipes.filter((recipe) =>
        recipe.tagNames.some((tag) => tag.toLowerCase() === "sweet"),
      )
    }

    const terms = normalized.split(/\s+/).filter(Boolean)

    return recipes.filter((recipe) => {
      const searchableText = [
        recipe.title,

        recipe.difficulty,

        "Filipino",

        ...recipe.ingredientNames,

        ...recipe.tagNames,
      ]

        .join(" ")

        .toLowerCase()

      return terms.every((term) => searchableText.includes(term))
    })
  }, [submittedQuery, recipes])

  useEffect(() => {
    const cleanQuery = submittedQuery.trim()

    const normalized = cleanQuery.toLowerCase().replace(/\s+/g, " ")

    if (authorId || editing || loading || loadError || !normalized) return

    const eventKey = `${normalized}|${filtered.length}`

    if (lastLoggedSearchRef.current === eventKey) return

    const timer = window.setTimeout(async () => {
      lastLoggedSearchRef.current = eventKey

      const { error } = await supabase.rpc("log_search_event", {
        p_query: cleanQuery,

        p_result_count: filtered.length,
      })

      if (error) {
        console.error("Failed to log search analytics:")

        lastLoggedSearchRef.current = ""
      }
    }, 700)

    return () => window.clearTimeout(timer)
  }, [submittedQuery, filtered.length, loading, editing, loadError, authorId])

  const visible = filtered.slice(0, visibleCount)

  const remaining = Math.max(0, filtered.length - visibleCount)

  function saveCurrentSearch() {
    if (!authorId) addRecentSearch(submittedQuery)
  }

  function searchRecipes(keyword = query) {
    setQuery(keyword)

    setSubmittedQuery(keyword)

    setEditing(false)

    setShowAllUsers(false)

    setVisibleCount(PAGE_SIZE)

    if (!authorId) addRecentSearch(keyword)
  }

  function openRecipe(recipeId: string) {
    saveCurrentSearch()

    onSelectRecipe(recipeId)
  }

  return (
    <div className="search-screen pb-24">
      <div className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-3 w-full box-border pl-4 pr-6 pt-5 pb-4">
        <button
          onClick={() => (showAllUsers ? setShowAllUsers(false) : onBack())}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--color-surface)",

            border: "1.5px solid var(--color-border)",
          }}
          aria-label="Back"
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
        <div
          className="min-w-0 w-full flex items-center gap-3 px-4 h-12 rounded-[12px] border"
          style={{
            backgroundColor: "var(--color-surface)",

            borderColor: "var(--color-border)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-gray)"
            className="flex-shrink-0"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            enterKeyHint="search"
            maxLength={80}
            autoFocus={
              initialEditing && window.matchMedia("(max-width: 767px)").matches
            }
            placeholder="Search recipes..."
            aria-label={
              authorId
                ? "Search this cook's recipes"
                : "Search recipes and users"
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)

              setEditing(true)

              setShowAllUsers(false)

              setVisibleCount(PAGE_SIZE)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault()

                event.currentTarget.blur()

                searchRecipes()
              }
            }}
            className="flex-1 min-w-0 bg-transparent outline-none text-lead placeholder:text-[var(--color-gray)]"
            style={{ color: "var(--color-ink)" }}
          />
          {query && (
            <button
              onClick={() => {
                setQuery("")

                setEditing(true)

                setShowAllUsers(false)

                setVisibleCount(PAGE_SIZE)
              }}
              className="flex-shrink-0 text-[var(--color-gray)]"
              aria-label="Clear search"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="px-4">
          {authorId ? (
            <div className="search-suggestions" aria-label="Recipe suggestions">
              {loadError ? (
                <p role="alert">
                  Could not load recipes.{" "}
                  <button
                    type="button"
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    Retry
                  </button>
                </p>
              ) : loading ? (
                <p role="status">Loading recipes…</p>
              ) : query.trim() ? (
                recipes

                  .filter((recipe) =>
                    recipe.title

                      .toLowerCase()

                      .includes(query.trim().toLowerCase()),
                  )

                  .slice(0, 5)

                  .map((recipe) => (
                    <button
                      type="button"
                      className="search-term"
                      key={recipe.id}
                      onClick={() => searchRecipes(recipe.title)}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <circle cx="10.5" cy="10.5" r="6.5" />
                        <path d="m16 16 5 5" />
                      </svg>
                      <span>{recipe.title}</span>
                    </button>
                  ))
              ) : (
                <p>Enter a keyword to search this cook's recipes.</p>
              )}
            </div>
          ) : showAllUsers ? (
            <RankedSearchUsers
              key={query}
              query={query}
              onUser={onSelectUser}
            />
          ) : (
            <SearchSuggestions
              query={query}
              onKeyword={searchRecipes}
              onUser={onSelectUser}
              onMoreUsers={() => {
                setShowAllUsers(true)

                window.scrollTo({ top: 0 })
              }}
            />
          )}
        </div>
      ) : (
        <>
          <div className="px-4 mb-4">
            <p
              className="text-lead font-semibold"
              style={{ color: "var(--color-ink)" }}
            >
              {loadError
                ? "Results unavailable"
                : loading
                  ? "Loading…"
                  : submittedQuery.trim()
                    ? `${filtered.length} result${
                        filtered.length !== 1 ? "s" : ""
                      } for "${submittedQuery}"`
                    : `${filtered.length} recipes`}
            </p>
          </div>
          {loadError ? (
            <div role="alert" className="px-4 py-8">
              <p>Could not load recipes.</p>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          ) : !loading && visible.length > 0 ? (
            <div className="recipe-summary-list px-4">
              {visible.map((recipe) => (
                <RecipeSummaryCard
                  key={recipe.id}
                  recipe={recipe}
                  onSelect={openRecipe}
                />
              ))}
            </div>
          ) : !loading ? (
            <div className="flex flex-col items-center justify-center px-4 py-16">
              <p
                className="font-semibold text-lead mb-1"
                style={{ color: "var(--color-ink)" }}
              >
                No recipes found
              </p>
              <p
                className="text-body text-center"
                style={{ color: "var(--color-gray)" }}
              >
                Try a different keyword.
              </p>
            </div>
          ) : null}
          {remaining > 0 && (
            <div className="px-4 mt-6">
              <button
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="w-full h-12 rounded-[12px] text-lead font-medium"
                style={{
                  backgroundColor: "var(--color-surface)",

                  border: "1.5px solid var(--color-border)",

                  color: "var(--color-ink)",
                }}
              >
                Show {remaining} more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
