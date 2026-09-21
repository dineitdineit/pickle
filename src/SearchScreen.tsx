import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

const PAGE_SIZE = 8;

type SearchRecipe = {
  id: string;
  title: string;
  difficulty: string;
  total_time_minutes: number;
  cover_image: string | null;
  image: string;
};

interface SearchScreenProps {
  query: string;
  setQuery: (v: string) => void;
  onBack: () => void;
  onSelectRecipe: (id: string) => void;
}

function formatTime(totalMinutes: number | null) {
  if (totalMinutes === null) return '—';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function publicImageUrl(path: string | null) {
  if (!path) return '';
  return supabase.storage.from('recipe_images').getPublicUrl(path).data.publicUrl;
}

export default function SearchScreen({ query, setQuery, onBack, onSelectRecipe }: SearchScreenProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [recipes, setRecipes] = useState<SearchRecipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRecipes() {
      setLoading(true);
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, difficulty, total_time_minutes, cover_image')
        .not('cover_image', 'is', null)
        .order('title', { ascending: true });

      if (error) {
        console.error('Failed to load search recipes:', error);
        setLoading(false);
        return;
      }

      setRecipes((data ?? []).map((recipe) => ({
        ...recipe,
        image: publicImageUrl(recipe.cover_image),
      })));
      setLoading(false);
    }

    loadRecipes();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return recipes;

    return recipes.filter((recipe) =>
      recipe.title.toLowerCase().includes(normalized) ||
      recipe.difficulty.toLowerCase().includes(normalized) ||
      'filipino'.includes(normalized)
    );
  }, [query, recipes]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = Math.max(0, filtered.length - visibleCount);

  return (
    <div className="pb-24">
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button
          onClick={onBack}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full"
          style={{ backgroundColor: '#F9F9F9', border: '1.5px solid #EAEAEA' }}
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div className="flex-1 flex items-center gap-3 px-4 h-12 rounded-[12px] border" style={{ backgroundColor: '#F9F9F9', borderColor: '#EAEAEA' }}>
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

      <div className="px-4 mb-4">
        <p className="text-[16px] font-semibold" style={{ color: '#1F1F1F' }}>
          {loading ? 'Loading…' : query.trim() ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${query}"` : `${filtered.length} recipes`}
        </p>
      </div>

      {!loading && visible.length > 0 ? (
        <div className="px-4 flex flex-col">
          {visible.map((recipe, i) => (
            <button
              key={recipe.id}
              onClick={() => onSelectRecipe(recipe.id)}
              className="flex items-center gap-4 py-3.5 w-full text-left active:bg-gray-50"
              style={{ borderBottom: i < visible.length - 1 ? '1px solid #EAEAEA' : undefined }}
            >
              <div className="flex-shrink-0 rounded-[12px] overflow-hidden bg-gray-100" style={{ width: 64, height: 64 }}>
                <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[16px] leading-snug truncate" style={{ color: '#1F1F1F' }}>{recipe.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[13px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F5F5F5', color: '#6F6F6F' }}>Filipino</span>
                  <span className="text-[13px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F5F5F5', color: '#6F6F6F' }}>{recipe.difficulty}</span>
                  <span className="text-[13px]" style={{ color: '#6F6F6F' }}>{formatTime(recipe.total_time_minutes)}</span>
                </div>
              </div>

              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C7C7C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))}
        </div>
      ) : !loading ? (
        <div className="flex flex-col items-center justify-center px-4 py-16">
          <p className="font-semibold text-[17px] mb-1" style={{ color: '#1F1F1F' }}>No recipes found</p>
          <p className="text-[15px] text-center" style={{ color: '#6F6F6F' }}>Try a different keyword.</p>
        </div>
      ) : null}

      {remaining > 0 && (
        <div className="px-4 mt-6">
          <button
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="w-full h-12 rounded-[12px] text-[16px] font-medium"
            style={{ backgroundColor: '#F9F9F9', border: '1.5px solid #EAEAEA', color: '#1F1F1F' }}
          >
            Show {remaining} more
          </button>
        </div>
      )}
    </div>
  );
}
