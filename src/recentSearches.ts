const RECENT_SEARCHES_KEY = "pickle:recent-searches"
const MAX_RECENT_SEARCHES = 4
export function syncSearchOwner(userId: string | null, signedOut = false) {
  try {
    const owner = userId ?? "guest"
    if (signedOut || localStorage.getItem("pickle:search-owner") !== owner)
      localStorage.removeItem(RECENT_SEARCHES_KEY)
    localStorage.setItem("pickle:search-owner", owner)
  } catch {
    /* Search does not depend on optional device storage. */
  }
}
function normalizeSearchTerm(value: string) {
  return value.trim().replace(/\s+/g, " ")
}
export function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normalizeSearchTerm)
      .filter(Boolean)
      .slice(0, MAX_RECENT_SEARCHES)
  } catch {
    return []
  }
}
function storeRecentSearches(terms: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(terms))
  } catch {
    // Search still works when this device cannot save local history.
  }
  return terms
}
export function addRecentSearch(value: string) {
  const term = normalizeSearchTerm(value)
  if (!term) return getRecentSearches()
  const next = [
    term,
    ...getRecentSearches().filter(
      (item) => item.toLowerCase() !== term.toLowerCase(),
    ),
  ].slice(0, MAX_RECENT_SEARCHES)
  return storeRecentSearches(next)
}
export function removeRecentSearch(value: string) {
  const next = getRecentSearches().filter(
    (item) => item.toLowerCase() !== value.toLowerCase(),
  )
  return storeRecentSearches(next)
}
export function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY)
  } catch {
    // History storage is optional.
  }
  return [] as string[]
}
