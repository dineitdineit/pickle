import { carouselIndex } from "./lib/carousel"
import RecipeStrip from "./RecipeStrip"
import { formatTime } from "./lib/format"
import { recipeImageUrl } from "./lib/recipe"
import PickleLogo from "./PickleLogo"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import BrowseScreen from "./BrowseScreen"
import SearchScreen from "./SearchScreen"
import SavedScreen from "./SavedScreen"
import LikedScreen from "./LikedScreen"
import ProfileScreen from "./ProfileScreen"
import AuthScreen from "./AuthScreen"
import RecipeDetailScreen from "./RecipeDetailScreen"
import MyRecipesScreen from "./MyRecipesScreen"
import RetryState from "./RetryState"
import TagRecipeListScreen from "./TagRecipeListScreen"
import DesktopShell from "./DesktopShell"
import DesktopHome from "./DesktopHome"
import { supabase } from "./lib/supabase"
import { getCurrentUser } from "./lib/auth"
import { addRecentSearch } from "./recentSearches"

type RecipeCard = {
  id: string
  title: string
  difficulty: string
  total_time_minutes: number
  servings: number | null
  cover_image: string | null
  image: string
}

type AuthUser = {
  id: string
  email?: string
}

const NAV_ICONS = [
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>,
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>,
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
  </svg>,
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>,
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>,
]

export default function App() {
  const [activeNav, setActiveNav] = useState(0)
  const [searchValue, setSearchValue] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [showLikedRecipes, setShowLikedRecipes] = useState(false)
  const [showMyRecipes, setShowMyRecipes] = useState(() => new URLSearchParams(window.location.search).has("upload"))
  const [startNewRecipe, setStartNewRecipe] = useState(() => new URLSearchParams(window.location.search).get("upload") === "new")
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("recipe"),
  )
  const [selectedTagRecipeSection, setSelectedTagRecipeSection] =
    useState<string | null>(null)
  const [recipes, setRecipes] = useState<RecipeCard[]>([])
  const [partyRecipeIds, setPartyRecipeIds] = useState<Set<string>>(new Set())
  const [recentViewCounts, setRecentViewCounts] = useState<Map<string, number>>(
    new Map(),
  )
  const [featuredIndex, setFeaturedIndex] = useState(0)
  const [loadingRecipes, setLoadingRecipes] = useState(true)
  const [homeError, setHomeError] = useState("")
  const [homeRetryKey, setHomeRetryKey] = useState(0)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [authError, setAuthError] = useState("")
  const [authRetryKey, setAuthRetryKey] = useState(0)
  const [homeAvatarUrl, setHomeAvatarUrl] = useState<string | null>(null)
  const carouselScrollRef = useRef<HTMLDivElement>(null)
  const featuredIndexRef = useRef(0)
  const GAP = 16

  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedRecipeId) url.searchParams.set("recipe", selectedRecipeId)
    else url.searchParams.delete("recipe")
    if (showMyRecipes) url.searchParams.set("upload", startNewRecipe ? "new" : "my")
    else url.searchParams.delete("upload")
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    )
  }, [selectedRecipeId, showMyRecipes, startNewRecipe])

  useEffect(() => {
    let mounted = true
    setLoadingAuth(true)
    setAuthError("")

    getCurrentUser().then(({ data, error }) => {
      if (mounted) {
        if (error) {
          console.error("Failed to load auth state:", error)
          setAuthUser(null)
          setAuthError("Could not load your account.")
        } else {
          setAuthUser(
            data.user ? { id: data.user.id, email: data.user.email } : null,
          )
        }
        setLoadingAuth(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthError("")
      setAuthUser(
        session?.user
          ? { id: session.user.id, email: session.user.email }
          : null,
      )
      if (!session?.user) setHomeAvatarUrl(null)
      setLoadingAuth(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [authRetryKey])

  useEffect(() => {
    let ignore = false

    async function loadHomeAvatar() {
      if (!authUser) {
        setHomeAvatarUrl(null)
        return
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", authUser.id)
        .maybeSingle()

      if (ignore) return
      if (error) {
        console.error("Failed to load home profile photo:", error)
        return
      }
      setHomeAvatarUrl(data?.avatar_url ?? null)
    }

    loadHomeAvatar()
    return () => {
      ignore = true
    }
  }, [authUser, activeNav])

  useEffect(() => {
    let ignore = false
    async function loadHomeData() {
      setLoadingRecipes(true)
      setHomeError("")
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const [recipeResult, partyTagResult, viewsResult] = await Promise.all([
        supabase
          .from("recipes")
          .select(
            "id, title, difficulty, total_time_minutes, servings, cover_image",
          )
          .order("created_at", { ascending: true }),
        supabase.from("tags").select("id").eq("name", "Party").single(),
        supabase
          .from("recipe_views")
          .select("recipe_id")
          .gte("viewed_at", thirtyDaysAgo.toISOString()),
      ])
      if (ignore) return

      if (recipeResult.error) {
        console.error("Failed to load recipes:", recipeResult.error)
        setRecipes([])
        setHomeError("Could not load recipes.")
        setLoadingRecipes(false)
        return
      }
      const mapped: RecipeCard[] = (recipeResult.data ?? []).map((recipe) => ({
        ...recipe,
        image: recipeImageUrl(recipe.cover_image),
      }))
      setRecipes(mapped)
      if (!partyTagResult.error && partyTagResult.data) {
        const { data: partyLinks, error: partyLinksError } = await supabase
          .from("recipe_tags")
          .select("recipe_id")
          .eq("tag_id", partyTagResult.data.id)
        if (ignore) return
        if (partyLinksError)
          console.error("Failed to load Party recipes:", partyLinksError)
        else
          setPartyRecipeIds(
            new Set((partyLinks ?? []).map((row) => row.recipe_id)),
          )
      }
      if (viewsResult.error)
        console.error("Failed to load recent recipe views:", viewsResult.error)
      else {
        const counts = new Map<string, number>()
        ;(viewsResult.data ?? []).forEach((row) =>
          counts.set(row.recipe_id, (counts.get(row.recipe_id) ?? 0) + 1),
        )
        setRecentViewCounts(counts)
      }
      setLoadingRecipes(false)
    }
    loadHomeData()
    return () => {
      ignore = true
    }
  }, [selectedRecipeId, homeRetryKey])

  const sortedRecipes = useMemo(
    () =>
      [...recipes].sort((a, b) =>
        a.title.localeCompare(b.title, "en", { sensitivity: "base" }),
      ),
    [recipes],
  )
  const featuredRecipes = useMemo(() => {
    if (sortedRecipes.length <= 5) return sortedRecipes
    const shuffled = [...sortedRecipes]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, 5)
  }, [sortedRecipes])
  const trendingRecipes = useMemo(
    () =>
      [...sortedRecipes].sort((a, b) => {
        const viewDifference =
          (recentViewCounts.get(b.id) ?? 0) - (recentViewCounts.get(a.id) ?? 0)
        return (
          viewDifference ||
          a.title.localeCompare(b.title, "en", { sensitivity: "base" })
        )
      }),
    [sortedRecipes, recentViewCounts],
  )
  const trendingPreview = useMemo(
    () => trendingRecipes.slice(0, 10),
    [trendingRecipes],
  )
  const under30Recipes = useMemo(
    () =>
      sortedRecipes.filter(
        (recipe) =>
          recipe.difficulty === "Easy" && recipe.total_time_minutes < 30,
      ),
    [sortedRecipes],
  )
  const partyRecipes = useMemo(
    () =>
      sortedRecipes
        .filter((recipe) => partyRecipeIds.has(recipe.id))
        .sort(
          (a, b) =>
            (b.servings ?? 0) - (a.servings ?? 0) ||
            a.title.localeCompare(b.title, "en"),
        ),
    [sortedRecipes, partyRecipeIds],
  )
  const selectedTagRecipes = useMemo(() => {
    if (selectedTagRecipeSection === "Trending Recipes") return trendingRecipes
    if (selectedTagRecipeSection === "Under 30min") return under30Recipes
    if (selectedTagRecipeSection === "Party Packs") return partyRecipes
    return []
  }, [selectedTagRecipeSection, trendingRecipes, under30Recipes, partyRecipes])

  function submitSearch() {
    setShowSearch(true)
  }
  function retryHomeData() {
    setHomeRetryKey((current) => current + 1)
  }
  function handleCarouselScroll() {
    const el = carouselScrollRef.current
    if (!el || el.clientWidth === 0) return
    const index = carouselIndex(
      el.scrollLeft,
      el.clientWidth,
      featuredRecipes.length,
      GAP,
    )
    featuredIndexRef.current = index
    setFeaturedIndex(index)
  }
  function scrollToCard(index: number) {
    const el = carouselScrollRef.current
    if (!el) return
    el.scrollTo({ left: index * (el.clientWidth + GAP), behavior: "smooth" })
    featuredIndexRef.current = index
    setFeaturedIndex(index)
  }

  const dragStartX = useRef<number | null>(null)
  const dragStartScrollLeft = useRef(0)
  const isDragging = useRef(false)
  const featuredDidDrag = useRef(false)
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = carouselScrollRef.current
    if (!el || e.button !== 0) return
    featuredDidDrag.current = false
    // Touch uses native scrolling and momentum; do not fight the browser.
    if (e.pointerType !== "mouse") return
    el.style.scrollSnapType = "none"
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartScrollLeft.current = el.scrollLeft
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = carouselScrollRef.current
    if (!el || !isDragging.current || dragStartX.current === null) return
    const deltaX = e.clientX - dragStartX.current
    if (Math.abs(deltaX) > 5) {
      featuredDidDrag.current = true
      if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId)
    }
    if (featuredDidDrag.current)
      el.scrollLeft = dragStartScrollLeft.current - deltaX
  }
  function finishPointerDrag(e: React.PointerEvent<HTMLDivElement>) {
    const el = carouselScrollRef.current
    if (!el || !isDragging.current) return
    isDragging.current = false
    dragStartX.current = null
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    el.style.scrollSnapType = "x mandatory"
    scrollToCard(
      carouselIndex(el.scrollLeft, el.clientWidth, featuredRecipes.length, GAP),
    )
    window.setTimeout(() => {
      featuredDidDrag.current = false
    }, 0)
  }

  useEffect(() => {
    if (activeNav !== 0 || showSearch || selectedRecipeId || loadingRecipes)
      return
    const el = carouselScrollRef.current
    if (!el) return
    const frame = requestAnimationFrame(() => {
      el.scrollLeft = featuredIndexRef.current * (el.clientWidth + GAP)
    })
    return () => cancelAnimationFrame(frame)
  }, [activeNav, showSearch, selectedRecipeId, loadingRecipes])

  function openRecipeUpload() {
    setSelectedRecipeId(null)
    setSelectedTagRecipeSection(null)
    setShowSearch(false)
    setShowLikedRecipes(false)
    setStartNewRecipe(true)
    setShowMyRecipes(true)
    window.scrollTo({ top: 0 })
  }

  const NavBar = (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t flex items-center justify-around py-3 bg-white z-50"
      style={{ borderColor: "#EAEAEA" }}
    >
      {NAV_ICONS.map((icon, i) => (
        <Fragment key={i}>
          {i === 4 && (
            <button
              type="button"
              aria-label="Add recipe"
              onClick={openRecipeUpload}
              className="flex items-center justify-center w-12 h-10"
              style={{ color: "#F26B21" }}
            >
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="16" cy="16" r="13" />
                <path d="M16 10v12M10 16h12" />
              </svg>
            </button>
          )}
        <button
          type="button"
          aria-label={["Home", "Browse", "Saved recipes", "Notifications", "Profile"][i]}
          onClick={() => {
            setShowMyRecipes(false)
            setActiveNav(i)
            setShowSearch(false)
            setShowLikedRecipes(false)
          }}
          className="flex flex-col items-center justify-center w-12 h-10 transition-colors"
          style={{
            color: activeNav === i && !showSearch ? "#F26B21" : "#6F6F6F",
          }}
        >
          {icon}
          {activeNav === i && !showSearch && (
            <div
              className="w-1 h-1 rounded-full mt-1"
              style={{ backgroundColor: "#F26B21" }}
            />
          )}
        </button>
        </Fragment>
      ))}
    </nav>
  )

  function navigate(index: number) {
    setShowMyRecipes(false)
    setSelectedRecipeId(null)
    setSelectedTagRecipeSection(null)
    setShowSearch(false)
    setShowLikedRecipes(false)
    setActiveNav(index)
    window.scrollTo({ top: 0 })
  }

  function desktopSearch(keyword = searchValue) {
    setShowMyRecipes(false)
    setSearchValue(keyword)
    addRecentSearch(keyword)
    setSelectedRecipeId(null)
    setSelectedTagRecipeSection(null)
    setShowLikedRecipes(false)
    setShowSearch(true)
    window.scrollTo({ top: 0 })
  }

  function renderScreen() {
    if (showMyRecipes) {
      if (loadingAuth) return <p className="px-4 py-20" role="status">Loading your account…</p>
      if (authError) return <RetryState title="Couldn't load your account" message="Please check your connection and try again." onRetry={() => setAuthRetryKey(value => value + 1)} />
      if (!authUser) return <div className="bg-white min-h-screen max-w-md mx-auto"><AuthScreen onBack={() => { setShowMyRecipes(false); setActiveNav(0) }} /></div>
      return <MyRecipesScreen key={authUser.id} userId={authUser.id} startNew={startNewRecipe} onShowList={() => { setStartNewRecipe(false); setHomeRetryKey(value => value + 1) }} onBack={() => { setShowMyRecipes(false); setActiveNav(4) }} onSelectRecipe={id => { setShowMyRecipes(false); setSelectedRecipeId(id); window.scrollTo({ top: 0 }) }} />
    }
    if (selectedRecipeId) {
      return (
        <RecipeDetailScreen
          recipeId={selectedRecipeId}
          onBack={() => setSelectedRecipeId(null)}
          onSelectRecipe={setSelectedRecipeId}
          onBrowse={() => {
            setSelectedRecipeId(null)
            setSelectedTagRecipeSection(null)
            setShowSearch(false)
            setShowLikedRecipes(false)
            setActiveNav(1)
            window.scrollTo({ top: 0, behavior: "smooth" })
          }}
          onRequireLogin={() => {
            setSelectedRecipeId(null)
            setSelectedTagRecipeSection(null)
            setShowSearch(false)
            setShowLikedRecipes(false)
            setActiveNav(4)
            window.scrollTo({ top: 0, behavior: "smooth" })
          }}
        />
      )
    }

    if (selectedTagRecipeSection) {
      return (
        <TagRecipeListScreen
          title={selectedTagRecipeSection}
          recipes={selectedTagRecipes}
          onBack={() => setSelectedTagRecipeSection(null)}
          onSelectRecipe={setSelectedRecipeId}
        />
      )
    }

    if (showLikedRecipes) {
      return (
        <div className="bg-white min-h-screen max-w-md mx-auto relative">
          <LikedScreen
            recipes={sortedRecipes}
            onSelectRecipe={setSelectedRecipeId}
            onBack={() => setShowLikedRecipes(false)}
          />
          {NavBar}
        </div>
      )
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
      )
    }

    if (activeNav === 1) {
      return (
        <div className="bg-white min-h-screen max-w-md mx-auto relative">
          <BrowseScreen
            searchValue={searchValue}
            setSearchValue={setSearchValue}
            onSearch={submitSearch}
            dataError={homeError}
            onRetry={retryHomeData}
          />
          {NavBar}
        </div>
      )
    }

    if (activeNav === 2) {
      return (
        <div className="bg-white min-h-screen max-w-md mx-auto relative">
          <SavedScreen
            recipes={sortedRecipes}
            recipesLoading={loadingRecipes}
            recipeDataError={homeError}
            onRetryRecipeData={retryHomeData}
            onSelectRecipe={setSelectedRecipeId}
          />
          {NavBar}
        </div>
      )
    }

    if (activeNav === 4) {
      return (
        <div className="bg-white min-h-screen max-w-md mx-auto relative">
          {loadingAuth ? (
            <div
              className="px-4 py-20 text-center text-[17px]"
              style={{ color: "#6F6F6F" }}
            >
              Loading profile…
            </div>
          ) : authError ? (
            <RetryState
              title="Couldn't load your account"
              message="Please check your connection and try again."
              onRetry={() => setAuthRetryKey((current) => current + 1)}
            />
          ) : authUser ? (
            <ProfileScreen
              userId={authUser.id}
              email={authUser.email}
              onOpenSaved={() => setActiveNav(2)}
              onOpenLiked={() => setShowLikedRecipes(true)}
              onOpenMyRecipes={() => { setStartNewRecipe(false); setShowMyRecipes(true); window.scrollTo({ top: 0 }) }}
              onBack={() => setActiveNav(0)}
            />
          ) : (
            <AuthScreen onBack={() => setActiveNav(0)} />
          )}
          {NavBar}
        </div>
      )
    }

    return (
      <>
        <DesktopHome
          featured={featuredRecipes}
          trending={trendingPreview}
          quick={under30Recipes}
          party={partyRecipes}
          loading={loadingRecipes}
          error={homeError}
          onRetry={retryHomeData}
          onSelect={(id) => {
            setSelectedRecipeId(id)
            window.scrollTo({ top: 0 })
          }}
          onCollection={(title) => {
            setSelectedTagRecipeSection(title)
            window.scrollTo({ top: 0 })
          }}
          onKeyword={desktopSearch}
        />
        <div className="mobile-home bg-white min-h-screen max-w-md mx-auto relative pb-24">
          <div className="flex items-center justify-between px-4 pt-6 pb-2">
            <PickleLogo size={24} iconSize={36} />
            <button
              type="button"
              onClick={() => setActiveNav(4)}
              aria-label="Open profile"
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-semibold text-[16px]"
              style={{ backgroundColor: "#FFF0E6", color: "#F26B21" }}
            >
              {homeAvatarUrl && /^https?:\/\//.test(homeAvatarUrl) ? (
                <img
                  src={homeAvatarUrl}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                "P"
              )}
            </button>
          </div>
          <div className="px-4 mt-4 mb-4">
            <h1
              className="font-bold text-[31px] leading-tight"
              style={{ color: "#1F1F1F" }}
            >
              Hi, looking for
              <br />a recipe?
            </h1>
          </div>
          <div className="px-4 mb-8">
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addRecentSearch(searchValue)
                    submitSearch()
                  }
                }}
                onFocus={() => setShowSearch(true)}
                className="flex-1 bg-transparent outline-none text-[18px] placeholder:text-[#6F6F6F]"
                style={{ color: "#1F1F1F" }}
              />
            </div>
          </div>
          {loadingRecipes ? (
            <div
              className="px-4 py-10 text-center text-[17px]"
              style={{ color: "#6F6F6F" }}
            >
              Loading recipes…
            </div>
          ) : homeError ? (
            <RetryState
              title="Couldn't load recipes"
              message="Please check your connection and try again."
              onRetry={retryHomeData}
            />
          ) : (
            <>
              <div className="mb-8">
                <div className="px-4 mb-4">
                  <h2
                    className="font-semibold text-[22px]"
                    style={{ color: "#1F1F1F" }}
                  >
                    Featured
                  </h2>
                </div>
                <div className="relative select-none" style={{ height: 260 }}>
                  <div
                    ref={carouselScrollRef}
                    onScroll={handleCarouselScroll}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishPointerDrag}
                    onPointerCancel={finishPointerDrag}
                    className="overflow-x-auto scrollbar-hide h-full cursor-grab active:cursor-grabbing"
                    style={{
                      scrollSnapType: "x mandatory",
                      WebkitOverflowScrolling: "touch",
                      touchAction: "pan-x pan-y pinch-zoom",
                      overscrollBehaviorX: "contain",
                    }}
                  >
                    <div
                      className="grid h-full"
                      style={{
                        gridAutoFlow: "column",
                        gridAutoColumns: "100%",
                        gap: GAP,
                      }}
                    >
                      {featuredRecipes.map((recipe) => (
                        <button
                          key={recipe.id}
                          type="button"
                          onClick={() => {
                            if (!featuredDidDrag.current)
                              setSelectedRecipeId(recipe.id)
                          }}
                          className="relative w-full rounded-[16px] overflow-hidden text-left"
                          style={{ scrollSnapAlign: "start", height: 260 }}
                        >
                          <img
                            src={recipe.image}
                            alt={recipe.title}
                            className="w-full h-full object-cover"
                            draggable={false}
                          />
                          <div
                            className="absolute inset-0"
                            style={{
                              background:
                                "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)",
                            }}
                          />
                          <div className="absolute bottom-0 left-0 right-0 p-4 pb-10">
                            <h2 className="font-semibold text-[19px] text-white mb-0.5">
                              {recipe.title}
                            </h2>
                            <div className="flex items-center gap-2">
                              <span
                                className="text-[15px] text-white/80 px-2.5 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: "rgba(255,255,255,0.18)",
                                }}
                              >
                                Filipino
                              </span>
                              <span
                                className="text-[15px] text-white/80 px-2.5 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: "rgba(255,255,255,0.18)",
                                }}
                              >
                                {recipe.difficulty}
                              </span>
                              <span className="text-[15px] text-white/80">
                                {formatTime(recipe.total_time_minutes)}
                              </span>
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
                        aria-label={`Show featured recipe ${i + 1}`}
                        aria-pressed={i === featuredIndex}
                        className="rounded-full transition-all duration-300 pointer-events-auto"
                        style={{
                          width: i === featuredIndex ? 20 : 6,
                          height: 6,
                          backgroundColor:
                            i === featuredIndex
                              ? "#F26B21"
                              : "rgba(255,255,255,0.55)",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <RecipeStrip
                title="Trending Recipes"
                recipes={trendingPreview}
                onSelectRecipe={setSelectedRecipeId}
                onSeeMore={() =>
                  setSelectedTagRecipeSection("Trending Recipes")
                }
              />
              <RecipeStrip
                title="Under 30min"
                recipes={under30Recipes}
                onSelectRecipe={setSelectedRecipeId}
                onSeeMore={() => setSelectedTagRecipeSection("Under 30min")}
              />
              <RecipeStrip
                title="Party Packs"
                recipes={partyRecipes}
                onSelectRecipe={setSelectedRecipeId}
                onSeeMore={() => setSelectedTagRecipeSection("Party Packs")}
              />
            </>
          )}
          {NavBar}
        </div>
      </>
    )
  }

  return (
    <DesktopShell
      activeNav={activeNav}
      searching={
        showSearch ||
        Boolean(selectedRecipeId) ||
        Boolean(selectedTagRecipeSection)
        || showMyRecipes
      }
      accountLabel={authUser ? "My account" : "Log in"}
      accountView={
        activeNav === 4 &&
        !selectedRecipeId &&
        !showSearch &&
        !selectedTagRecipeSection &&
        !showLikedRecipes
        && !showMyRecipes
      }
      query={searchValue}
      onQueryChange={setSearchValue}
      onSearch={() => desktopSearch()}
      onNavigate={navigate}
      onUploadRecipe={openRecipeUpload}
    >
      {renderScreen()}
    </DesktopShell>
  )
}
