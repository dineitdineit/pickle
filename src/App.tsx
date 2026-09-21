import { useEffect, useMemo, useRef, useState } from 'react';
import BrowseScreen from './BrowseScreen';
import SearchScreen from './SearchScreen';
import RecipeDetailScreen from './RecipeDetailScreen';
import { supabase } from './lib/supabase';

type RecipeCard = {
  id: string;
  title: string;
  difficulty: string;
  total_time_minutes: number;
  servings: number | null;
  cover_image: string | null;
  image: string;
};

const FILTERS = ['All', 'Easy', 'Intermediate', 'Under 30m'];

const NAV_ICONS = [
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>,
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
];

function publicImageUrl(path: string | null) {
  if (!path) return '';
  return supabase.storage.from('recipe_images').getPublicUrl(path).data.publicUrl;
}

export default function App() {
  const [activeNav, setActiveNav] = useState(0);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchValue, setSearchValue] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const carouselScrollRef = useRef<HTMLDivElement>(null);

  const PEEK = 28;
  const GAP = 12;
  const cardWidth = carouselWidth > 0 ? carouselWidth - PEEK * 2 : 0;

  useEffect(() => {
    async function loadRecipes() {
      setLoadingRecipes(true);
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, difficulty, total_time_minutes, servings, cover_image')
        .not('cover_image', 'is', null)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to load recipes:', error);
        setLoadingRecipes(false);
        return;
      }

      const mapped: RecipeCard[] = (data ?? []).map((recipe) => ({
        ...recipe,
        image: publicImageUrl(recipe.cover_image),
      }));

      setRecipes(mapped);
      setLoadingRecipes(false);
    }

    loadRecipes();
  }, []);

  useEffect(() => {
    const el = carouselScrollRef.current;
    if (!el) return;
    setCarouselWidth(el.offsetWidth);
    const observer = new ResizeObserver(() => setCarouselWidth(el.offsetWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const featuredRecipes = recipes.slice(0, 5);

  const filteredRecipes = useMemo(() => {
    if (activeFilter === 'Easy') return recipes.filter((r) => r.difficulty === 'Easy');
    if (activeFilter === 'Intermediate') return recipes.filter((r) => r.difficulty === 'Intermediate');
    if (activeFilter === 'Under 30m') return recipes.filter((r) => r.total_time_minutes <= 30);
    return recipes;
  }, [recipes, activeFilter]);

  function submitSearch() {
    setShowSearch(true);
  }

  function handleCarouselScroll() {
    const el = carouselScrollRef.current;
    if (!el || cardWidth === 0) return;
    const index = Math.round(el.scrollLeft / (cardWidth + GAP));
    setFeaturedIndex(Math.max(0, Math.min(index, featuredRecipes.length - 1)));
  }

  function scrollToCard(index: number) {
    const el = carouselScrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * (cardWidth + GAP), behavior: 'smooth' });
    setFeaturedIndex(index);
  }

  const NavBar = (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t flex items-center justify-around py-3 bg-white z-50" style={{ borderColor: '#EAEAEA' }}>
      {NAV_ICONS.map((icon, i) => (
        <button
          key={i}
          onClick={() => { setActiveNav(i); setShowSearch(false); }}
          className="flex flex-col items-center justify-center w-12 h-10 transition-colors"
          style={{ color: activeNav === i && !showSearch ? '#F26B21' : '#6F6F6F' }}
        >
          {icon}
          {activeNav === i && !showSearch && <div className="w-1 h-1 rounded-full mt-1" style={{ backgroundColor: '#F26B21' }} />}
        </button>
      ))}
    </nav>
  );

  if (selectedRecipeId) {
    return <RecipeDetailScreen recipeId={selectedRecipeId} onBack={() => setSelectedRecipeId(null)} />;
  }

  if (showSearch) {
    return (
      <div className="bg-white min-h-screen max-w-md mx-auto relative">
        <SearchScreen
          query={searchValue}
          setQuery={setSearchValue}
          onBack={() => setShowSearch(false)}
          onSelectRecipe={setSelectedRecipeId}
        />
        {NavBar}
      </div>
    );
  }

  if (activeNav === 1) {
    return (
      <div className="bg-white min-h-screen max-w-md mx-auto relative">
        <BrowseScreen searchValue={searchValue} setSearchValue={setSearchValue} onSearch={submitSearch} />
        {NavBar}
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen max-w-md mx-auto relative pb-24">
      <div className="flex items-center justify-between px-4 pt-6 pb-2">
        <div className="flex items-center gap-2">
          <img src="/assets/logo.png" alt="Pickle logo" className="w-9 h-9 rounded-xl object-cover" />
          <span className="font-bold text-[17px]" style={{ color: '#1F1F1F' }}>Pickle</span>
        </div>
        <div className="w-9 h-9 rounded-full bg-[#FFF0E6] flex items-center justify-center font-semibold text-[14px]" style={{ color: '#F26B21' }}>P</div>
      </div>

      <div className="px-4 mt-4 mb-4">
        <h1 className="font-bold text-[28px] leading-tight" style={{ color: '#1F1F1F' }}>
          Hi, looking for<br />a recipe?
        </h1>
      </div>

      <div className="px-4 mb-8">
        <div className="flex items-center gap-3 px-4 h-12 rounded-[12px] border" style={{ backgroundColor: '#F9F9F9', borderColor: '#EAEAEA' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6F6F6F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search recipes..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            onFocus={() => setShowSearch(true)}
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-[#6F6F6F]"
            style={{ color: '#1F1F1F' }}
          />
        </div>
      </div>

      {loadingRecipes ? (
        <div className="px-4 py-10 text-center text-[15px]" style={{ color: '#6F6F6F' }}>Loading recipes…</div>
      ) : (
        <>
          <div className="mb-8">
            <div className="flex items-center justify-between px-4 mb-4">
              <h2 className="font-semibold text-[20px]" style={{ color: '#1F1F1F' }}>Featured</h2>
              <span className="text-[13px]" style={{ color: '#6F6F6F' }}>{recipes.length} recipes</span>
            </div>

            <div className="relative select-none" style={{ height: 260 }}>
              <div
                ref={carouselScrollRef}
                className="overflow-x-auto scrollbar-hide h-full"
                style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
                onScroll={handleCarouselScroll}
              >
                <div className="flex h-full" style={{ gap: GAP, paddingInline: PEEK }}>
                  {featuredRecipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => setSelectedRecipeId(recipe.id)}
                      className="relative flex-shrink-0 rounded-[16px] overflow-hidden text-left"
                      style={{
                        width: cardWidth || `calc(100% - ${PEEK * 2}px)`,
                        scrollSnapAlign: 'center',
                        height: 260,
                      }}
                    >
                      <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" draggable={false} />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)' }} />
                      <div className="absolute bottom-0 left-0 right-0 p-4 pb-10">
                        <h2 className="font-semibold text-[17px] text-white mb-1">{recipe.title}</h2>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-white/80 px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>Filipino</span>
                          <span className="text-[13px] text-white/80 px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>{recipe.difficulty}</span>
                          <span className="text-[13px] text-white/80">{recipe.total_time_minutes}m</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none z-10">
                {featuredRecipes.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToCard(i)}
                    className="rounded-full transition-all duration-300 pointer-events-auto"
                    style={{
                      width: i === featuredIndex ? 20 : 6,
                      height: 6,
                      backgroundColor: i === featuredIndex ? '#F26B21' : 'rgba(255,255,255,0.55)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between px-4 mb-4">
              <h2 className="font-semibold text-[20px]" style={{ color: '#1F1F1F' }}>Discover recipes</h2>
              <button onClick={() => { setActiveNav(1); setShowSearch(false); }} className="text-[14px] font-medium" style={{ color: '#F26B21' }}>Browse</button>
            </div>

            <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-hide">
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[14px] font-medium"
                  style={activeFilter === filter
                    ? { backgroundColor: '#F26B21', color: '#fff', border: '1.5px solid #F26B21' }
                    : { backgroundColor: '#fff', color: '#6F6F6F', border: '1.5px solid #EAEAEA' }}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-1">
              {filteredRecipes.map((recipe) => (
                <button key={recipe.id} onClick={() => setSelectedRecipeId(recipe.id)} className="flex-shrink-0 w-[148px] text-left">
                  <div className="rounded-[12px] overflow-hidden mb-2.5 bg-gray-100" style={{ height: 148 }}>
                    <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
                  </div>
                  <p className="font-semibold text-[16px] leading-tight line-clamp-2" style={{ color: '#1F1F1F' }}>{recipe.title}</p>
                  <p className="text-[13px] mt-1" style={{ color: '#6F6F6F' }}>{recipe.difficulty} · {recipe.total_time_minutes}m</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {NavBar}
    </div>
  );
}
