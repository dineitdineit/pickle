const RECENT_SEARCHES_KEY = 'pickle:recent-searches';
const MAX_RECENT_SEARCHES = 8;

function normalizeSearchTerm(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeSearchTerm)
      .filter(Boolean)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function addRecentSearch(value: string) {
  const term = normalizeSearchTerm(value);
  if (!term) return getRecentSearches();

  const next = [
    term,
    ...getRecentSearches().filter((item) => item.toLowerCase() !== term.toLowerCase()),
  ].slice(0, MAX_RECENT_SEARCHES);

  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

export function removeRecentSearch(value: string) {
  const next = getRecentSearches().filter(
    (item) => item.toLowerCase() !== value.toLowerCase(),
  );
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCHES_KEY);
  return [] as string[];
}
