import { useState } from "react"
import RetryState from "./RetryState"
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  removeRecentSearch,
} from "./recentSearches"

const BROWSE_CATEGORIES = [
  {
    title: "Ingredients",
    subtitle: "Browse by what you have",
    items: [
      "Chicken",
      "Pork",
      "Beef",
      "Seafood",
      "Garlic",
      "Coconut Milk",
      "Eggplant",
    ],
  },
  {
    title: "Type",
    subtitle: "Find the kind of dish you want",
    items: [
      "Dessert",
      "Soup",
      "Breakfast",
      "Noodles",
      "Stew",
      "Grilled",
      "Snack",
    ],
  },
  {
    title: "Time & occasion",
    subtitle: "Pick something that fits the moment",
    items: ["Easy", "Quick", "Party"],
  },
] as const

interface BrowseScreenProps {
  searchValue: string
  setSearchValue: (v: string) => void
  onSearch: () => void
  dataError?: string
  onRetry?: () => void
}

export default function BrowseScreen({
  searchValue,
  setSearchValue,
  onSearch,
  dataError = "",
  onRetry,
}: BrowseScreenProps) {
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    getRecentSearches(),
  )

  function removeRecent(item: string) {
    setRecentSearches(removeRecentSearch(item))
  }

  function clearRecent() {
    setRecentSearches(clearRecentSearches())
  }

  function searchKeyword(keyword: string) {
    const term = keyword.trim()
    if (!term) {
      onSearch()
      return
    }

    setRecentSearches(addRecentSearch(term))
    setSearchValue(term)
    requestAnimationFrame(() => onSearch())
  }

  return (
    <div className="browse-screen pb-24">
      {/* Title */}
      <div className="px-4 pt-6 pb-2 flex items-center justify-center">
        <h1 className="font-bold text-[27px]" style={{ color: "#1F1F1F" }}>
          Browse
        </h1>
      </div>

      {/* Search Bar */}
      <div className="px-4 mt-3 mb-8">
        <div
          className="flex items-center gap-3 px-4 h-12 rounded-[12px] border"
          style={{ backgroundColor: "#F9F9F9", borderColor: "#EAEAEA" }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6F6F6F"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search recipes..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchKeyword(searchValue)}
            className="flex-1 bg-transparent outline-none text-[18px] placeholder:text-[#6F6F6F]"
            style={{ color: "#1F1F1F" }}
          />
          {searchValue && (
            <button
              onClick={() => setSearchValue("")}
              className="text-[#6F6F6F]"
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

      {dataError && onRetry && (
        <div className="mb-5">
          <RetryState
            compact
            title="Couldn't connect to recipes"
            message="Browse categories are still available, but recipe data could not be refreshed."
            onRetry={onRetry}
          />
        </div>
      )}

      {/* Recently Searched */}
      <div className="px-4 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="font-semibold text-[22px]"
            style={{ color: "#1F1F1F" }}
          >
            Recently Searched
          </h2>
          {recentSearches.length > 0 && (
            <button
              type="button"
              onClick={clearRecent}
              className="text-[16px] font-medium"
              style={{ color: "#F26B21" }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {recentSearches.length > 0 ? (
            recentSearches.map((item) => (
              <div
                key={item}
                className="flex items-center gap-1 rounded-full text-[16px] font-medium overflow-hidden"
                style={{
                  backgroundColor: "#F9F9F9",
                  border: "1.5px solid #EAEAEA",
                  color: "#1F1F1F",
                }}
              >
                <button
                  type="button"
                  onClick={() => searchKeyword(item)}
                  className="flex items-center gap-1.5 pl-3.5 pr-1 py-1.5"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#6F6F6F"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="12 8 12 12 14 14" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  <span>{item}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeRecent(item)}
                  aria-label={`Remove ${item} from recent searches`}
                  className="w-7 h-7 flex items-center justify-center mr-0.5"
                  style={{ color: "#6F6F6F" }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))
          ) : (
            <p className="text-[15px]" style={{ color: "#A0A0A0" }}>
              Your recent searches will appear here.
            </p>
          )}
        </div>
      </div>

      {/* Browse categories */}
      <div className="browse-category-grid px-4 space-y-8 mb-8">
        {BROWSE_CATEGORIES.map((section) => (
          <section key={section.title}>
            <div className="mb-3">
              <h2
                className="font-semibold text-[22px]"
                style={{ color: "#1F1F1F" }}
              >
                {section.title}
              </h2>
              <p className="text-[15px] mt-1" style={{ color: "#8A8A8A" }}>
                {section.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {section.items.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => searchKeyword(item)}
                  className="min-h-[48px] rounded-[14px] border px-3.5 flex items-center justify-between gap-2 text-left"
                  style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
                >
                  <span
                    className="text-[17px] font-medium truncate"
                    style={{ color: "#1F1F1F" }}
                  >
                    {item}
                  </span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#B0B0B0"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="flex-shrink-0"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
