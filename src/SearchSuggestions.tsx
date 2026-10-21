import { useEffect, useState } from "react"

import { supabase } from "./lib/supabase"

import { getRecentSearches, removeRecentSearch } from "./recentSearches"

import "./search-suggestions.css"

interface SearchKeyword {
  keyword: string

  search_count: number
}

type Suggestions = {
  keywords: SearchKeyword[]

  users: {
    id: string

    username: string

    display_name: string

    avatar_url: string | null

    recipe_count: number

    view_count: number
  }[]
}

type Props = {
  query: string

  onKeyword: (keyword: string) => void

  onUser: (id: string) => void

  onMoreUsers: () => void
}

function SearchTermIcon({ recent = false }: { recent?: boolean }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {recent ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      ) : (
        <>
          <circle cx="10.5" cy="10.5" r="7.5" />
          <path d="m16 16 5 5" />
        </>
      )}
    </svg>
  )
}

export default function SearchSuggestions({
  query,

  onKeyword,

  onUser,

  onMoreUsers,
}: Props) {
  const [data, setData] = useState<Suggestions | null>(null)

  const [error, setError] = useState(false)

  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const refresh = () => {
      setData(null)

      setRetry((value) => value + 1)
    }

    window.addEventListener("pickle:safety-refresh", refresh)

    return () => window.removeEventListener("pickle:safety-refresh", refresh)
  }, [])

  const [recent, setRecent] = useState(getRecentSearches)

  const [expanded, setExpanded] = useState(false)

  const matchingRecent = recent.filter((term) =>
    term.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const keywords =
    data?.keywords.filter(
      (row) =>
        !matchingRecent.some(
          (term) => term.toLowerCase() === row.keyword.toLowerCase(),
        ),
    ) ?? []

  useEffect(() => {
    let ignore = false

    setData(null)

    setError(false)

    setExpanded(false)

    const clean = query.trim().slice(0, 80)

    if (!clean) return

    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("get_search_suggestions", {
          p_query: clean,
        })

        if (
          error ||
          !Array.isArray(data?.keywords) ||
          !Array.isArray(data?.users)
        )
          throw error ?? new Error("Suggestions unavailable")

        if (!ignore) setData(data)
      } catch {
        if (!ignore) setError(true)
      }
    }, 250)

    return () => {
      ignore = true

      window.clearTimeout(timer)
    }
  }, [query, retry])

  return (
    <div className="search-suggestions" aria-label="Search suggestions">
      {matchingRecent.length > 0 && (
        <section aria-label="Recent searches">
          {matchingRecent.map((term) => (
            <div className="search-term-row" key={term}>
              <button
                type="button"
                className="search-term"
                onClick={() => onKeyword(term)}
              >
                <SearchTermIcon recent />
                <strong>{term}</strong>
              </button>
              <button
                type="button"
                className="search-term-remove"
                aria-label={`Remove ${term} from recent searches`}
                onClick={() => setRecent(removeRecentSearch(term))}
              >
                ×
              </button>
            </div>
          ))}
        </section>
      )}
      {!query.trim() ? (
        <p>Enter a keyword to search recipes and cooks.</p>
      ) : (
        <>
          {error ? (
            <p role="status">
              Suggestions unavailable.{" "}
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Retry
              </button>
            </p>
          ) : !data ? (
            <p role="status">Finding suggestions…</p>
          ) : (
            <>
              <section aria-label="Popular search keywords">
                {keywords.length ? (
                  <>
                    {keywords.slice(0, expanded ? undefined : 4).map((row) => (
                      <button
                        className="search-term"
                        type="button"
                        key={row.keyword}
                        onClick={() => onKeyword(row.keyword)}
                      >
                        <SearchTermIcon />
                        <span>{row.keyword}</span>
                      </button>
                    ))}
                    {keywords.length > 4 && (
                      <button
                        type="button"
                        className="search-show-more"
                        onClick={() => setExpanded((value) => !value)}
                      >
                        {expanded ? "Show less" : "Show more"}{" "}
                        <span aria-hidden="true">⌄</span>
                      </button>
                    )}
                  </>
                ) : (
                  !matchingRecent.length && (
                    <p>
                      No popular searches match yet. Press Search to find
                      recipes.
                    </p>
                  )
                )}
              </section>
              <section aria-label="Matching cooks">
                {data.users.length ? data.users.slice(0, 5).map((cook) => (
                    <button
                      type="button"
                      className="search-cook"
                      key={cook.id}
                      onClick={() => onUser(cook.id)}
                    >
                      {cook.avatar_url &&
                      /^https?:\/\//.test(cook.avatar_url) ? (
                        <img src={cook.avatar_url} alt="" />
                      ) : (
                        <span className="search-cook-avatar">
                          {(cook.display_name || cook.username || "P")

                            .charAt(0)

                            .toUpperCase()}
                        </span>
                      )}
                      <span>
                        <strong>
                          {cook.display_name || cook.username || "Pickle user"}
                        </strong>
                        <small>@{cook.username}</small>
                      </span>
                    </button>
                  )) : <p>No matching cooks.</p>}
                <button
                  type="button"
                  className="search-more-users"
                  onClick={onMoreUsers}
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
                    <circle cx="12" cy="7" r="3" />
                    <path d="M5 21v-3a7 7 0 0114 0v3z" />
                  </svg>
                  Search more users
                </button>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
