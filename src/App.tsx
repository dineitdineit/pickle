import { useState, useRef, useEffect } from 'react';
import BrowseScreen from './BrowseScreen';
import SearchScreen from './SearchScreen';
import { supabase } from './lib/supabase';
import RecipeDetailScreen from './RecipeDetailScreen';

const assetPathPrefix = "/assets";

const FALLBACK_FEATURED_RECIPES = [
  {
    id: 1,
    title: 'Creamy Pasta Carbonara',
    category: 'Italian',
    tag: 'Dinner',
    time: '25m',
    image: 'https://images.unsplash.com/photo-1588013273468-315fd88ea34c?w=800&h=500&fit=crop&auto=format',
  },
  {
    id: 2,
    title: 'Mushroom Risotto',
    category: 'Italian',
    tag: 'Vegetarian',
    time: '40m',
    image: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=800&h=500&fit=crop&auto=format',
  },
  {
    id: 3,
    title: 'Grilled Salmon Bowl',
    category: 'Seafood',
    tag: 'Healthy',
    time: '20m',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&h=500&fit=crop&auto=format',
  },
  {
    id: 4,
    title: 'Chocolate Lava Cake',
    category: 'Dessert',
    tag: 'Sweet',
    time: '15m',
    image: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=800&h=500&fit=crop&auto=format',
  },
];

const SUGGESTED_RECIPES = [
  {
    id: 2,
    title: 'Avocado Toast',
    category: 'Breakfast',
    time: '10m',
    image: 'https://images.unsplash.com/photo-1588137378633-dea1336ce1e2?w=400&h=400&fit=crop&auto=format',
  },
  {
    id: 3,
    title: 'Chicken Salad',
    category: 'Lunch',
    time: '20m',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop&auto=format',
  },
  {
    id: 4,
    title: 'Beef Tacos',
    category: 'Dinner',
    time: '30m',
    image: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=400&h=400&fit=crop&auto=format',
  },
  {
    id: 5,
    title: 'Berry Smoothie',
    category: 'Breakfast',
    time: '5m',
    image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400&h=400&fit=crop&auto=format',
  },
];

const CATEGORIES = [
  {
    id: 1,
    name: 'Quick & Easy',
    sub: 'Under 20 minutes',
    image: 'https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=500&h=280&fit=crop&auto=format',
  },
  {
    id: 2,
    name: 'Healthy Meals',
    sub: 'Nutritious picks',
    image: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=500&h=280&fit=crop&auto=format',
  },
];

const FILTERS = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Desserts'];

const NAV_ICONS = [
  // Home
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  // Search
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  // Bookmark
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>,
  // Bell
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  // User
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
];

export default function App() {
  const [activeNav, setActiveNav] = useState(0);
  const [featuredRecipes, setFeaturedRecipes] = useState(FALLBACK_FEATURED_RECIPES);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchValue, setSearchValue] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  function submitSearch() {
    if (searchValue.trim()) setShowSearch(true);
  }
  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    async function loadFeaturedRecipe() {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, difficulty, total_time_minutes, cover_image')
        .eq('id', '306499e3-865d-47a3-b8a9-dd615c34b115')
        .single();

      if (error || !data) {
        console.error('Failed to load featured recipe:', error);
        return;
      }

      const { data: imageData } = supabase.storage
        .from('recipe_images')
        .getPublicUrl(data.cover_image);

      setFeaturedRecipes([
        {
          id: data.id,
          title: data.title,
          category: 'Filipino',
          tag: data.difficulty,
          time: `${data.total_time_minutes}m`,
          image: imageData.publicUrl,
        },
      ]);
      setFeaturedIndex(0);
    }

    loadFeaturedRecipe();
  }, []);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const carouselScrollRef = useRef<HTMLDivElement>(null);

  const PEEK = 28;
  const GAP = 12;
  const cardWidth = carouselWidth > 0 ? carouselWidth - PEEK * 2 : 0;

  useEffect(() => {
    const el = carouselScrollRef.current;
    if (!el) return;
    setCarouselWidth(el.offsetWidth);
    const observer = new ResizeObserver(() => setCarouselWidth(el.offsetWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-2">
        <div className="flex items-center gap-2">
          <img src="/assets/logo.png" alt="Pickle logo" className="w-9 h-9 rounded-xl object-cover" />
          <span className="font-bold text-[17px]" style={{ color: '#1F1F1F' }}>Pickle</span>
        </div>
        <button className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center border-2" style={{ borderColor: '#EAEAEA' }}>
          <img
            src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&auto=format"
            alt="User avatar"
            className="w-full h-full object-cover"
          />
        </button>
      </div>

      {/* Greeting */}
      <div className="px-4 mt-4 mb-4">
        <h1 className="font-bold text-[28px] leading-tight" style={{ color: '#1F1F1F' }}>
          Hi, looking for<br />a recipe?
        </h1>
      </div>

      {/* Search Bar */}
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
            onFocus={() => { if (searchValue.trim()) setShowSearch(true); }}
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-[#6F6F6F]"
            style={{ color: '#1F1F1F' }}
          />
          {searchValue && (
            <button onClick={() => setSearchValue('')} className="text-[#6F6F6F]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Featured Recipe Carousel */}
      <div className="mb-8">
        {/* Outer: positions the dots absolutely over the scroll area */}
        <div className="relative select-none" style={{ height: 260 }}>
          {/* Scroll container */}
          <div
            ref={carouselScrollRef}
            className="overflow-x-auto scrollbar-hide h-full"
            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
            onScroll={handleCarouselScroll}
          >
            <div
              className="flex h-full"
              style={{ gap: GAP, paddingInline: PEEK }}
            >
              {featuredRecipes.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => typeof recipe.id === 'string' && setSelectedRecipeId(recipe.id)}
                  className="relative flex-shrink-0 rounded-[16px] overflow-hidden text-left"
                  style={{
                    width: cardWidth || `calc(100% - ${PEEK * 2}px)`,
                    scrollSnapAlign: 'center',
                    height: 260,
                  }}
                >
                  <img
                    src={recipe.image}
                    alt={recipe.title}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)' }} />
                  <div className="absolute bottom-0 left-0 right-0 p-4 pb-10">
                    <h2 className="font-semibold text-[17px] text-white mb-1">{recipe.title}</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-white/80 px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)' }}>{recipe.category}</span>
                      <span className="text-[13px] text-white/80 px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)' }}>{recipe.tag}</span>
                      <span className="text-[13px] text-white/80">{recipe.time}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Dot indicators — overlay, not inside scroll content */}
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

      {/* "How About" Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between px-4 mb-4">
          <h2 className="font-semibold text-[20px]" style={{ color: '#1F1F1F' }}>How About,</h2>
          <button className="text-[14px] font-medium" style={{ color: '#F26B21' }}>See all</button>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-hide">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[14px] font-medium transition-colors"
              style={
                activeFilter === f
                  ? { backgroundColor: '#F26B21', color: '#fff', border: '1.5px solid #F26B21' }
                  : { backgroundColor: '#fff', color: '#6F6F6F', border: '1.5px solid #EAEAEA' }
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Horizontal recipe cards */}
        <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-1">
          {SUGGESTED_RECIPES.map((recipe) => (
            <div key={recipe.id} className="flex-shrink-0 w-[148px]">
              <div className="rounded-[12px] overflow-hidden mb-2.5 bg-gray-100" style={{ height: 148 }}>
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="font-semibold text-[17px] leading-tight truncate" style={{ color: '#1F1F1F' }}>{recipe.title}</p>
              <p className="text-[13px] mt-0.5" style={{ color: '#6F6F6F' }}>{recipe.category} · {recipe.time}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Perfect for Any Occasion */}
      <div className="mb-8 mx-4 rounded-[16px] overflow-hidden p-4" style={{ backgroundColor: '#FFF7F2' }}>
        <h2 className="font-semibold text-[20px] mb-4" style={{ color: '#1F1F1F' }}>Perfect for Any Occasion</h2>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((cat) => (
            <button key={cat.id} className="relative rounded-[12px] overflow-hidden text-left" style={{ height: 140 }}>
              <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 60%)' }} />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="font-bold text-[14px] text-white leading-tight">{cat.name}</p>
                <p className="text-[12px] text-white/70">{cat.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Contact Us */}
      <div className="px-4 mb-8">
        <h2 className="font-semibold text-[20px] mb-3" style={{ color: '#1F1F1F' }}>Contact Us</h2>
        <div className="space-y-2">
          {[
            { icon: '✉️', text: 'hello@recipebook.app' },
            { icon: '📍', text: '123 Kitchen Street, Food City' },
            { icon: '📞', text: '+1 (800) 555-COOK' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <span className="text-[15px]">{icon}</span>
              <p className="text-[15px]" style={{ color: '#6F6F6F' }}>{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Navigation */}
      {NavBar}
    </div>
  );
}
