import { useState } from 'react';

const SEARCH_RESULTS = [
  { id: 1,  title: 'Spaghetti Carbonara',    category: 'Italian',    tag: 'Dinner',     time: '25m', image: 'https://images.unsplash.com/photo-1588013273468-315fd88ea34c?w=160&h=160&fit=crop&auto=format' },
  { id: 2,  title: 'Avocado Toast',           category: 'Breakfast',  tag: 'Vegetarian', time: '10m', image: 'https://images.unsplash.com/photo-1588137378633-dea1336ce1e2?w=160&h=160&fit=crop&auto=format' },
  { id: 3,  title: 'Grilled Salmon Bowl',     category: 'Seafood',    tag: 'Healthy',    time: '20m', image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=160&h=160&fit=crop&auto=format' },
  { id: 4,  title: 'Beef Tacos',              category: 'Mexican',    tag: 'Dinner',     time: '30m', image: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=160&h=160&fit=crop&auto=format' },
  { id: 5,  title: 'Chicken Caesar Salad',    category: 'Lunch',      tag: 'Protein',    time: '15m', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=160&h=160&fit=crop&auto=format' },
  { id: 6,  title: 'Berry Smoothie',          category: 'Breakfast',  tag: 'Vegan',      time: '5m',  image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=160&h=160&fit=crop&auto=format' },
  { id: 7,  title: 'Mushroom Risotto',        category: 'Italian',    tag: 'Vegetarian', time: '40m', image: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=160&h=160&fit=crop&auto=format' },
  { id: 8,  title: 'Chocolate Lava Cake',     category: 'Dessert',    tag: 'Sweet',      time: '15m', image: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=160&h=160&fit=crop&auto=format' },
  { id: 9,  title: 'Shrimp Stir-Fry',         category: 'Asian',      tag: 'Quick',      time: '12m', image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=160&h=160&fit=crop&auto=format' },
  { id: 10, title: 'Greek Yogurt Parfait',    category: 'Breakfast',  tag: 'Healthy',    time: '5m',  image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=160&h=160&fit=crop&auto=format' },
  { id: 11, title: 'Margherita Pizza',        category: 'Italian',    tag: 'Dinner',     time: '35m', image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=160&h=160&fit=crop&auto=format' },
  { id: 12, title: 'Lentil Soup',             category: 'Soup',       tag: 'Vegan',      time: '45m', image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=160&h=160&fit=crop&auto=format' },
];

const PAGE_SIZE = 8;

interface SearchScreenProps {
  query: string;
  setQuery: (v: string) => void;
  onBack: () => void;
}

export default function SearchScreen({ query, setQuery, onBack }: SearchScreenProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = query.trim()
    ? SEARCH_RESULTS.filter(
        (r) =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          r.category.toLowerCase().includes(query.toLowerCase()) ||
          r.tag.toLowerCase().includes(query.toLowerCase()),
      )
    : SEARCH_RESULTS;

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visibleCount;

  return (
    <div className="pb-24">
      {/* Top bar: back arrow + search input */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button
          onClick={onBack}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: '#F9F9F9', border: '1.5px solid #EAEAEA' }}
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div
          className="flex-1 flex items-center gap-3 px-4 h-12 rounded-[12px] border"
          style={{ backgroundColor: '#F9F9F9', borderColor: '#EAEAEA' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6F6F6F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search recipes..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
            autoFocus
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-[#6F6F6F]"
            style={{ color: '#1F1F1F' }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setVisibleCount(PAGE_SIZE); }} className="text-[#6F6F6F]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Result count label */}
      <div className="px-4 mb-4">
        <p className="text-[16px] font-semibold" style={{ color: '#1F1F1F' }}>
          {query.trim() ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${query}"` : 'Search Results'}
        </p>
      </div>

      {/* Result rows */}
      {visible.length > 0 ? (
        <div className="px-4 flex flex-col" style={{ gap: 0 }}>
          {visible.map((recipe, i) => (
            <button
              key={recipe.id}
              className="flex items-center gap-4 py-3.5 w-full text-left transition-colors active:bg-gray-50"
              style={{ borderBottom: i < visible.length - 1 ? '1px solid #EAEAEA' : undefined }}
            >
              {/* Thumbnail */}
              <div className="flex-shrink-0 rounded-[12px] overflow-hidden bg-gray-100" style={{ width: 64, height: 64 }}>
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[16px] leading-snug truncate" style={{ color: '#1F1F1F' }}>{recipe.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className="text-[13px] px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#F5F5F5', color: '#6F6F6F' }}
                  >
                    {recipe.category}
                  </span>
                  <span
                    className="text-[13px] px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#F5F5F5', color: '#6F6F6F' }}
                  >
                    {recipe.tag}
                  </span>
                  <span className="text-[13px]" style={{ color: '#6F6F6F' }}>{recipe.time}</span>
                </div>
              </div>

              {/* Chevron */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EAEAEA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-4 py-16">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#EAEAEA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p className="font-semibold text-[17px] mb-1" style={{ color: '#1F1F1F' }}>No recipes found</p>
          <p className="text-[15px] text-center" style={{ color: '#6F6F6F' }}>Try a different keyword or adjust your search.</p>
        </div>
      )}

      {/* Show more button */}
      {remaining > 0 && (
        <div className="px-4 mt-6">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="w-full h-12 rounded-[12px] text-[16px] font-medium transition-colors"
            style={{ backgroundColor: '#F9F9F9', border: '1.5px solid #EAEAEA', color: '#1F1F1F' }}
          >
            Show {remaining} result{remaining !== 1 ? 's' : ''} more
          </button>
        </div>
      )}
    </div>
  );
}
