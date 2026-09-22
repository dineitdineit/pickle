import { useEffect, useMemo, useRef, useState } from 'react';
import BrowseScreen from './BrowseScreen';
import SearchScreen from './SearchScreen';
import SavedScreen from './SavedScreen';
import ProfileScreen from './ProfileScreen';
import AuthScreen from './AuthScreen';
import RecipeDetailScreen from './RecipeDetailScreen';
import TagRecipeListScreen from './TagRecipeListScreen';
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

type AuthUser = {
  id: string;
  email?: string;
};

const NAV_ICONS = [
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>,
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
];

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

function RecipeStrip({ title, recipes, onSelectRecipe, onSeeMore }: { title: string; recipes: RecipeCard[]; onSelectRecipe: (id: string) => void; onSeeMore: () => void; }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const startScrollLeft = useRef(0);
  const dragging = useRef(false);
  const didDrag = useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;
    dragging.current = true;
    didDrag.current = false;
    startX.current = e.clientX;
    startScrollLeft.current = el.scrollLeft;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el || !dragging.current || startX.current === null) return;
    const deltaX = e.clientX - startX.current;
    if (Math.abs(deltaX) > 5) didDrag.current = true;
    el.scrollLeft = startScrollLeft.current - deltaX;
  }

  function finishDrag() {
    dragging.current = false;
    startX.current = null;
    window.setTimeout(() => { didDrag.current = false; }, 0);
  }

  return (
    <section className="mb-8">
      <div className="px-4 mb-3 flex items-end justify-between gap-3">
        <h2 className="font-semibold text-[20px] leading-none" style={{ color: '#1F1F1F' }}>{title}</h2>
        <button type="button" onClick={onSeeMore} className="flex-shrink-0 text-[13px] font-medium leading-none pb-[1px]" style={{ color: '#6F6F6F' }}>See more &gt;</button>
      </div>
      <div ref={scrollRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag} className="flex items-start gap-3 px-4 overflow-x-auto scrollbar-hide pb-1 cursor-grab active:cursor-grabbing" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>
        {recipes.map((recipe) => (
          <button key={recipe.id} type="button" onClick={() => { if (!didDrag.current) onSelectRecipe(recipe.id); }} className="flex-none w-[148px] text-left self-start">
            <div className="w-[148px] h-[148px] rounded-[12px] overflow-hidden mb-2 bg-gray-100"><img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover block" draggable={false} /></div>
            <p className="font-semibold text-[16px] leading-[19px] min-h-[19px] line-clamp-2" style={{ color: '#1F1F1F' }}>{recipe.title}</p>
            <p className="text-[13px] mt-1" style={{ color: '#6F6F6F' }}>{recipe.difficulty} · {formatTime(recipe.total_time_minutes)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [activeNav, setActiveNav] = useState(0);
  const [searchValue, setSearchValue] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedTagRecipeSection, setSelectedTagRecipeSection] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [partyRecipeIds, setPartyRecipeIds] = useState<Set<string>>(new Set());
  const [recentViewCounts, setRecentViewCounts] = useState<Map<string, number>>(new Map());
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const carouselScrollRef = useRef<HTMLDivElement>(null);
  const GAP = 16;

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setAuthUser(data.user ? { id: data.user.id, email: data.user.email } : null);
        setLoadingAuth(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      setLoadingAuth(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadHomeData() {
      setLoadingRecipes(true);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const [recipeResult, partyTagResult, viewsResult] = await Promise.all([
        supabase.from('recipes').select('id, title, difficulty, total_time_minutes, servings, cover_image').not('cover_image', 'is', null).order('created_at', { ascending: true }),
        supabase.from('tags').select('id').eq('name', 'Party').single(),
        supabase.from('recipe_views').select('recipe_id').gte('viewed_at', thirtyDaysAgo.toISOString()),
      ]);
      if (recipeResult.error) { console.error('Failed to load recipes:', recipeResult.error); setLoadingRecipes(false); return; }
      const mapped: RecipeCard[] = (recipeResult.data ?? []).map((recipe) => ({ ...recipe, image: publicImageUrl(recipe.cover_image) }));
      setRecipes(mapped);
      if (!partyTagResult.error && partyTagResult.data) {
        const { data: partyLinks, error: partyLinksError } = await supabase.from('recipe_tags').select('recipe_id').eq('tag_id', partyTagResult.data.id);
        if (partyLinksError) console.error('Failed to load Party recipes:', partyLinksError);
        else setPartyRecipeIds(new Set((partyLinks ?? []).map((row) => row.recipe_id)));
      }
      if (viewsResult.error) console.error('Failed to load recent recipe views:', viewsResult.error);
      else {
        const counts = new Map<string, number>();
        (viewsResult.data ?? []).forEach((row) => counts.set(row.recipe_id, (counts.get(row.recipe_id) ?? 0) + 1));
        setRecentViewCounts(counts);
      }
      setLoadingRecipes(false);
    }
    loadHomeData();
  }, [selectedRecipeId]);

  const sortedRecipes = useMemo(() => [...recipes].sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })), [recipes]);
  const featuredRecipes = useMemo(() => {
    if (sortedRecipes.length <= 5) return sortedRecipes;
    const shuffled = [...sortedRecipes];
    for (let i = shuffled.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    return shuffled.slice(0, 5);
  }, [sortedRecipes]);
  const trendingRecipes = useMemo(() => [...sortedRecipes].sort((a, b) => { const viewDifference = (recentViewCounts.get(b.id) ?? 0) - (recentViewCounts.get(a.id) ?? 0); return viewDifference || a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }); }), [sortedRecipes, recentViewCounts]);
  const trendingPreview = useMemo(() => trendingRecipes.slice(0, 10), [trendingRecipes]);
  const under30Recipes = useMemo(() => sortedRecipes.filter((recipe) => recipe.difficulty === 'Easy' && recipe.total_time_minutes < 30), [sortedRecipes]);
  const partyRecipes = useMemo(() => sortedRecipes.filter((recipe) => partyRecipeIds.has(recipe.id)).sort((a, b) => (b.servings ?? 0) - (a.servings ?? 0) || a.title.localeCompare(b.title, 'en')), [sortedRecipes, partyRecipeIds]);
  const selectedTagRecipes = useMemo(() => {
    if (selectedTagRecipeSection === 'Trending Recipes') return trendingRecipes;
    if (selectedTagRecipeSection === 'Under 30min') return under30Recipes;
    if (selectedTagRecipeSection === 'Party Packs') return partyRecipes;
    return [];
  }, [selectedTagRecipeSection, trendingRecipes, under30Recipes, partyRecipes]);

  function submitSearch() { setShowSearch(true); }
  function handleCarouselScroll() { const el = carouselScrollRef.current; if (!el || el.clientWidth === 0) return; const index = Math.round(el.scrollLeft / (el.clientWidth + GAP)); setFeaturedIndex(Math.max(0, Math.min(index, featuredRecipes.length - 1))); }
  function scrollToCard(index: number) { const el = carouselScrollRef.current; if (!el) return; el.scrollTo({ left: index * (el.clientWidth + GAP), behavior: 'smooth' }); setFeaturedIndex(index); }

  const dragStartX = useRef<number | null>(null);
  const dragStartScrollLeft = useRef(0);
  const isDragging = useRef(false);
  const featuredDidDrag = useRef(false);
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) { const el = carouselScrollRef.current; if (!el) return; isDragging.current = true; featuredDidDrag.current = false; dragStartX.current = e.clientX; dragStartScrollLeft.current = el.scrollLeft; }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) { const el = carouselScrollRef.current; if (!el || !isDragging.current || dragStartX.current === null) return; const deltaX = e.clientX - dragStartX.current; if (Math.abs(deltaX) > 5) featuredDidDrag.current = true; if (featuredDidDrag.current) el.scrollLeft = dragStartScrollLeft.current - deltaX; }
  function finishPointerDrag(e: React.PointerEvent<HTMLDivElement>) { const el = carouselScrollRef.current; if (!el || dragStartX.current === null) return; const deltaX = e.clientX - dragStartX.current; isDragging.current = false; dragStartX.current = null; if (Math.abs(deltaX) < 40) { scrollToCard(featuredIndex); return; } const nextIndex = deltaX < 0 ? Math.min(featuredIndex + 1, featuredRecipes.length - 1) : Math.max(featuredIndex - 1, 0); scrollToCard(nextIndex); window.setTimeout(() => { featuredDidDrag.current = false; }, 0); }

  useEffect(() => {
    if (activeNav !== 0 || showSearch || selectedRecipeId || loadingRecipes) return;
    const el = carouselScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollLeft = featuredIndex * (el.clientWidth + GAP); });
  }, [activeNav, showSearch, selectedRecipeId, loadingRecipes, featuredIndex]);

  const NavBar = (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t flex items-center justify-around py-3 bg-white z-50" style={{ borderColor: '#EAEAEA' }}>
      {NAV_ICONS.map((icon, i) => (
        <button key={i} onClick={() => { setActiveNav(i); setShowSearch(false); }} className="flex flex-col items-center justify-center w-12 h-10 transition-colors" style={{ color: activeNav === i && !showSearch ? '#F26B21' : '#6F6F6F' }}>
          {icon}
          {activeNav === i && !showSearch && <div className="w-1 h-1 rounded-full mt-1" style={{ backgroundColor: '#F26B21' }} />}
        </button>
      ))}
    </nav>
  );

  if (selectedRecipeId) {
    return <RecipeDetailScreen recipeId={selectedRecipeId} onBack={() => setSelectedRecipeId(null)} onSelectRecipe={setSelectedRecipeId} onBrowse={() => { setSelectedRecipeId(null); setSelectedTagRecipeSection(null); setShowSearch(false); setActiveNav(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />;
  }

  if (selectedTagRecipeSection) {
    return <TagRecipeListScreen title={selectedTagRecipeSection} recipes={selectedTagRecipes} onBack={() => setSelectedTagRecipeSection(null)} onSelectRecipe={setSelectedRecipeId} />;
  }

  if (showSearch) {
    return <div className="bg-white min-h-screen max-w-md mx-auto relative"><SearchScreen query={searchValue} setQuery={setSearchValue} onBack={() => setShowSearch(false)} onSelectRecipe={setSelectedRecipeId} />{NavBar}</div>;
  }

  if (activeNav === 1) {
    return <div className="bg-white min-h-screen max-w-md mx-auto relative"><BrowseScreen searchValue={searchValue} setSearchValue={setSearchValue} onSearch={submitSearch} />{NavBar}</div>;
  }

  if (activeNav === 2) {
    return <div className="bg-white min-h-screen max-w-md mx-auto relative"><SavedScreen recipes={sortedRecipes} onSelectRecipe={setSelectedRecipeId} onBack={() => setActiveNav(0)} />{NavBar}</div>;
  }

  if (activeNav === 4) {
    return (
      <div className="bg-white min-h-screen max-w-md mx-auto relative">
        {loadingAuth ? (
          <div className="px-4 py-20 text-center text-[15px]" style={{ color: '#6F6F6F' }}>Loading profile…</div>
        ) : authUser ? (
          <ProfileScreen userId={authUser.id} email={authUser.email} onOpenSaved={() => setActiveNav(2)} />
        ) : (
          <AuthScreen />
        )}
        {NavBar}
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen max-w-md mx-auto relative pb-24">
      <div className="flex items-center justify-between px-4 pt-6 pb-2">
        <div className="flex items-center gap-2"><img src="/assets/pickle-logo.png" alt="Pickle logo" className="w-9 h-9 rounded-xl object-cover" /><span className="font-bold text-[17px]" style={{ color: '#1F1F1F' }}>Pickle</span></div>
        <div className="w-9 h-9 rounded-full bg-[#FFF0E6] flex items-center justify-center font-semibold text-[14px]" style={{ color: '#F26B21' }}>P</div>
      </div>
      <div className="px-4 mt-4 mb-4"><h1 className="font-bold text-[28px] leading-tight" style={{ color: '#1F1F1F' }}>Hi, looking for<br />a recipe?</h1></div>
      <div className="px-4 mb-8">
        <div className="flex items-center gap-3 px-4 h-12 rounded-[12px] border" style={{ backgroundColor: '#F9F9F9', borderColor: '#EAEAEA' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6F6F6F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search recipes..." value={searchValue} onChange={(e) => setSearchValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitSearch()} onFocus={() => setShowSearch(true)} className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-[#6F6F6F]" style={{ color: '#1F1F1F' }} />
        </div>
      </div>
      {loadingRecipes ? <div className="px-4 py-10 text-center text-[15px]" style={{ color: '#6F6F6F' }}>Loading recipes…</div> : <>
        <div className="mb-8">
          <div className="px-4 mb-4"><h2 className="font-semibold text-[20px]" style={{ color: '#1F1F1F' }}>Featured</h2></div>
          <div className="relative select-none" style={{ height: 260 }}>
            <div ref={carouselScrollRef} onScroll={handleCarouselScroll} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishPointerDrag} onPointerCancel={finishPointerDrag} className="overflow-x-auto scrollbar-hide h-full cursor-grab active:cursor-grabbing" style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
              <div className="grid h-full" style={{ gridAutoFlow: 'column', gridAutoColumns: '100%', gap: GAP }}>
                {featuredRecipes.map((recipe) => <button key={recipe.id} type="button" onClick={() => { if (!featuredDidDrag.current) setSelectedRecipeId(recipe.id); }} className="relative w-full rounded-[16px] overflow-hidden text-left" style={{ scrollSnapAlign: 'start', height: 260 }}>
                  <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" draggable={false} />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)' }} />
                  <div className="absolute bottom-0 left-0 right-0 p-4 pb-10"><h2 className="font-semibold text-[17px] text-white mb-1">{recipe.title}</h2><div className="flex items-center gap-2"><span className="text-[13px] text-white/80 px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>Filipino</span><span className="text-[13px] text-white/80 px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>{recipe.difficulty}</span><span className="text-[13px] text-white/80">{formatTime(recipe.total_time_minutes)}</span></div></div>
                </button>)}
              </div>
            </div>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none z-10">
              {featuredRecipes.map((_, i) => <button key={i} onClick={() => scrollToCard(i)} className="rounded-full transition-all duration-300 pointer-events-auto" style={{ width: i === featuredIndex ? 20 : 6, height: 6, backgroundColor: i === featuredIndex ? '#F26B21' : 'rgba(255,255,255,0.55)' }} />)}
            </div>
          </div>
        </div>
        <RecipeStrip title="Trending Recipes" recipes={trendingPreview} onSelectRecipe={setSelectedRecipeId} onSeeMore={() => setSelectedTagRecipeSection('Trending Recipes')} />
        <RecipeStrip title="Under 30min" recipes={under30Recipes} onSelectRecipe={setSelectedRecipeId} onSeeMore={() => setSelectedTagRecipeSection('Under 30min')} />
        <RecipeStrip title="Party Packs" recipes={partyRecipes} onSelectRecipe={setSelectedRecipeId} onSeeMore={() => setSelectedTagRecipeSection('Party Packs')} />
      </>}
      {NavBar}
    </div>
  );
}
