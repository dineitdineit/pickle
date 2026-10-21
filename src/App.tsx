import RecipeImage from "./RecipeImage"
import CreateSheet from "./CreateSheet"
import PostComposer from "./PostComposer"
import type { RecipeTagChoice } from "./lib/postRecipeTags"
import PhotoPostsScreen from "./PhotoPostsScreen"
import HomePostsSection from "./HomePostsSection"
import FollowingFeed, { HomeFeedTabs } from "./FollowingFeed"
import usePhotoPosts from "./usePhotoPosts"
import { initialPhotoPostId } from "./lib/postFeed"
import { parseAppLink } from "./lib/appLinks"
import {
  isAndroidApp,
  nativeSnapshot,
  subscribeNative,
  takeNativeContent,
} from "./lib/nativeAuth"
import { useAndroidBack } from "./lib/nativeNavigation"
import { listenPushTargets, takePushTarget } from "./lib/androidPush"
import { carouselIndex } from "./lib/carousel"
import RecipeStrip from "./RecipeStrip"
import { formatTime } from "./lib/format"
import { recipeImageUrl } from "./lib/recipe"
import PickleLogo from "./PickleLogo"
import { useEffect, useMemo, useRef, useState } from "react"
import BrowseScreen from "./BrowseScreen"
import SearchScreen from "./SearchScreen"
import SavedScreen from "./SavedScreen"
import LikedScreen from "./LikedScreen"
import AccountProfileScreen from "./AccountProfileScreen"
import AuthScreen from "./AuthScreen"
import RecipeDetailScreen from "./RecipeDetailScreen"
import MyRecipesScreen from "./MyRecipesScreen"
import RecipeEditScreen from "./RecipeEditScreen"
import SocialScreen, { type SocialMode } from "./SocialScreen"
import useNotificationCount from "./useNotificationCount"
import useUnreadMessages from "./useUnreadMessages"
import MessagesScreen from "./MessagesScreen"
import AccountStatusScreen, {
  AccountRestrictionBanner,
} from "./AccountStatusScreen"
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

  video_url?: string | null

  cover_image: string | null

  image: string

  view_count: number
}

type AuthUser = {
  id: string

  email?: string
}
interface RecentRecipeViews {
  recipe_id: string
  recent_count: number
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
  const [showMessages, setShowMessages] = useState(false)
  const [messagePeer, setMessagePeer] = useState<string | undefined>()
  const [pushNotice, setPushNotice] = useState("")

  const [showAccountStatus, setShowAccountStatus] = useState(false)

  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)

  const [social, setSocial] = useState<{
    mode: SocialMode

    profile?: string

    originRecipe?: string
  } | null>(null)

  const [activeNav, setActiveNav] = useState(0)

  const sectionBackNav = useRef<Record<number, number>>({ 1: 0, 2: 0 })

  const [searchValue, setSearchValue] = useState("")

  const [searchEditing, setSearchEditing] = useState(false)

  const [typingRequest, setTypingRequest] = useState(0)

  const [searchRequest, setSearchRequest] = useState(0)

  const [showSearch, setShowSearch] = useState(false)

  const [showLikedRecipes, setShowLikedRecipes] = useState(false)

  const [showMyRecipes, setShowMyRecipes] = useState(() =>
    new URLSearchParams(window.location.search).has("upload"),
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [composingPost, setComposingPost] = useState(false)
  const [composerRecipe, setComposerRecipe] = useState<RecipeTagChoice | null>(
    null,
  )
  const pendingRecipePost = useRef<RecipeTagChoice | null>(null)
  const composerOwner = useRef<string | null>(null)
  const [postFeed, setPostFeed] = useState<{
    authorId?: string
    postId?: string
    commentId?: string
  } | null>(() => {
    const postId = initialPhotoPostId(window.location.search)
    return postId ? { postId } : null
  })
  const postFeedScroll = useRef(0)

  const [startNewRecipe, setStartNewRecipe] = useState(
    () => new URLSearchParams(window.location.search).get("upload") === "new",
  )

  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(
    () => {
      const link = parseAppLink(window.location.href)
      return link?.kind === "recipe" ? link.id : null
    },
  )

  const [commentTarget, setCommentTarget] = useState<{
    recipeId: string
    commentId: string
  } | null>(null)

  useEffect(() => {
    if (commentTarget && commentTarget.recipeId !== selectedRecipeId)
      setCommentTarget(null)
  }, [selectedRecipeId, commentTarget])

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
  useEffect(() => {
    const owner = authUser?.id ?? null
    if (composerOwner.current && composerOwner.current !== owner) {
      setComposingPost(false)
      setComposerRecipe(null)
      pendingRecipePost.current = null
    }
    composerOwner.current = owner
    if (owner && pendingRecipePost.current) {
      const recipe = pendingRecipePost.current
      pendingRecipePost.current = null
      setComposerRecipe(recipe)
      setSelectedRecipeId(recipe.id)
      setComposingPost(true)
      window.scrollTo({ top: 0 })
    }
  }, [authUser?.id])
  useEffect(() => {
    if (!authUser) return
    const owner = authUser.id
    let active = true
    let inFlight = false
    const open = async () => {
      if (inFlight) return
      // Keep a tap pending rather than unmount an editor or a conversation that
      // may contain unsent text. It is opened after the user closes that screen.
      if (composingPost || editingRecipeId || showMyRecipes || showMessages)
        return
      const target = takePushTarget(owner)
      if (!target) return
      inFlight = true
      try {
        if (target.kind === "message") {
          const result = await supabase
            .from("direct_messages")
            .select("sender_id")
            .eq("id", target.target)
            .eq("recipient_id", owner)
            .maybeSingle()
          if (!active) return
          if (result.error || !result.data) throw new Error("Unavailable")
          clearRecipeViews()
          setComposingPost(false)
          setMessagePeer(result.data.sender_id)
          setShowMessages(true)
        } else {
          const result = await supabase
            .from("user_notifications")
            .select(
              "kind,recipe_id,comment_id,post_id,post_comment_id,actor_id",
            )
            .eq("id", target.target)
            .eq("recipient_id", owner)
            .maybeSingle()
          if (!active) return
          if (result.error || !result.data) throw new Error("Unavailable")
          const notice = result.data
          clearRecipeViews()
          setComposingPost(false)
          setShowSearch(false)
          if (notice.post_id)
            setPostFeed({
              postId: notice.post_id,
              commentId: notice.post_comment_id ?? undefined,
            })
          else if (notice.recipe_id) {
            setSelectedRecipeId(notice.recipe_id)
            setCommentTarget(
              notice.comment_id
                ? { recipeId: notice.recipe_id, commentId: notice.comment_id }
                : null,
            )
          } else
            setSocial({
              mode: notice.kind === "follow" ? "followers" : "notifications",
              profile: notice.kind === "follow" ? notice.actor_id : undefined,
            })
        }
        setPushNotice("")
        window.scrollTo({ top: 0 })
      } catch {
        if (active) {
          navigate(3)
          setPushNotice(
            "This notification is no longer available. Check your inbox for current activity.",
          )
        }
      } finally {
        inFlight = false
        if (active) queueMicrotask(update)
      }
    }
    const update = () => {
      void open()
    }
    const stop = listenPushTargets(update)
    update()
    return () => {
      active = false
      stop()
    }
  }, [
    authUser?.id,
    composingPost,
    editingRecipeId,
    showMyRecipes,
    showMessages,
  ])
  const homePosts = usePhotoPosts({
    viewerId: authUser?.id ?? null,
    pageSize: 4,
  })
  const [homeFeed, setHomeFeed] = useState<"discover" | "following">("discover")

  const unreadNotifications = useNotificationCount(authUser?.id ?? null)

  const unreadMessages = useUnreadMessages(authUser?.id ?? null)

  const [loadingAuth, setLoadingAuth] = useState(true)

  const [authError, setAuthError] = useState("")

  const [authRetryKey, setAuthRetryKey] = useState(0)

  const [homeAvatarUrl, setHomeAvatarUrl] = useState<string | null>(null)

  const carouselScrollRef = useRef<HTMLDivElement>(null)

  const featuredIndexRef = useRef(0)

  const GAP = 16

  useEffect(() => {
    const url = new URL(window.location.href)

    // A post can overlay a recipe; only the visible content owns the URL.
    if (postFeed?.postId) url.searchParams.set("post", postFeed.postId)
    else url.searchParams.delete("post")

    if (selectedRecipeId && !postFeed?.postId)
      url.searchParams.set("recipe", selectedRecipeId)
    else url.searchParams.delete("recipe")

    if (showMyRecipes && !postFeed?.postId && !selectedRecipeId)
      url.searchParams.set("upload", startNewRecipe ? "new" : "my")
    else url.searchParams.delete("upload")

    window.history.replaceState(
      window.history.state,

      "",

      `${url.pathname}${url.search}${url.hash}`,
    )
  }, [selectedRecipeId, postFeed?.postId, showMyRecipes, startNewRecipe])

  useEffect(() => {
    let mounted = true

    setLoadingAuth(true)

    setAuthError("")

    getCurrentUser().then(({ data, error }) => {
      if (mounted) {
        if (error) {
          console.error("Failed to load auth state:")

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
        console.error("Failed to load home profile photo:")

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
            "id, title, difficulty, total_time_minutes, servings, cover_image, video_url, view_count",
          )

          .order("created_at", { ascending: true }),

        supabase.from("tags").select("id").eq("name", "Party").single(),

        supabase

          .rpc("get_recipe_view_counts"),
      ])

      if (ignore) return

      if (recipeResult.error) {
        console.error("Failed to load recipes:")

        setRecipes([])

        setHomeError("Could not load recipes.")

        setLoadingRecipes(false)

        return
      }

      const mapped: RecipeCard[] = (recipeResult.data ?? []).map((recipe) => ({
        ...recipe,

        image: recipeImageUrl(recipe.cover_image),

        view_count: recipe.view_count ?? 0,
      }))

      setRecipes(mapped)

      if (!partyTagResult.error && partyTagResult.data) {
        const { data: partyLinks, error: partyLinksError } = await supabase

          .from("recipe_tags")

          .select("recipe_id")

          .eq("tag_id", partyTagResult.data.id)

        if (ignore) return

        if (partyLinksError) console.error("Failed to load Party recipes:")
        else
          setPartyRecipeIds(
            new Set((partyLinks ?? []).map((row) => row.recipe_id)),
          )
      }

      if (viewsResult.error)
        console.error("Failed to load recent recipe views:")
      else {
        const counts = new Map<string, number>()
        ;(viewsResult.data ?? []).forEach((row: RecentRecipeViews) =>
          counts.set(row.recipe_id, Number(row.recent_count)),
        )

        setRecentViewCounts(counts)
      }

      setLoadingRecipes(false)
    }

    loadHomeData()

    return () => {
      ignore = true
    }
  }, [selectedRecipeId, homeRetryKey, authUser?.id])

  useEffect(() => {
    setRecipes([])

    window.dispatchEvent(new Event("pickle:safety-refresh"))
  }, [authUser?.id])

  useEffect(() => {
    let disposed = false

    let checking = false

    let version: string | null = null

    const refresh = () => {
      if (document.visibilityState !== "visible") return

      setHomeRetryKey((value) => value + 1)

      window.dispatchEvent(new Event("pickle:safety-refresh"))
    }

    const check = async () => {
      if (disposed || checking || document.visibilityState !== "visible") return

      checking = true

      try {
        const { data, error } = await supabase.rpc(
          authUser?.id ? "get_safety_version" : "get_public_visibility_version",
        )

        if (disposed || error || typeof data !== "string") return

        if (data !== version) refresh()

        version = data
      } catch {
        // Retry on the next poll or foreground event without changing server state.
      } finally {
        checking = false
      }
    }

    const foreground = () => {
      refresh()

      void check()
    }

    const changed = () => {
      setRecipes([])

      refresh()

      void check()
    }

    void check()

    const timer = window.setInterval(check, 30000)

    window.addEventListener("pickle:blocks-changed", changed)

    window.addEventListener("focus", foreground)

    document.addEventListener("visibilitychange", foreground)

    return () => {
      disposed = true

      window.clearInterval(timer)

      window.removeEventListener("pickle:blocks-changed", changed)

      window.removeEventListener("focus", foreground)

      document.removeEventListener("visibilitychange", foreground)
    }
  }, [authUser?.id])

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

  function clearRecipeViews() {
    setMessagePeer(undefined)
    setPushNotice("")
    setPostFeed(null)
    setShowMessages(false)

    setEditingRecipeId(null)

    setSelectedRecipeId(null)

    setSelectedTagRecipeSection(null)

    setShowMyRecipes(false)

    setShowLikedRecipes(false)

    setSocial(null)
  }

  function startSearchTyping(keyword: string) {
    clearRecipeViews()

    setSearchValue(keyword)

    setSearchEditing(true)

    setTypingRequest((value) => value + 1)

    setShowSearch(true)
  }

  function submitSearch(keyword = searchValue) {
    clearRecipeViews()

    setSearchValue(keyword)

    addRecentSearch(keyword)

    setSearchEditing(false)

    setSearchRequest((value) => value + 1)

    setShowSearch(true)

    window.scrollTo({ top: 0 })
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

  useEffect(() => {
    if (showMyRecipes && !loadingAuth && !authError && !authUser) {
      setShowMyRecipes(false)

      setActiveNav(4)
    }
  }, [showMyRecipes, loadingAuth, authError, authUser])

  function openRecipeUpload() {
    setPostFeed(null)
    setEditingRecipeId(null)

    setSocial(null)

    if (!loadingAuth && !authError && !authUser) {
      navigate(4)

      return
    }

    setSelectedRecipeId(null)

    setSelectedTagRecipeSection(null)

    setShowSearch(false)

    setShowLikedRecipes(false)

    setStartNewRecipe(true)

    setShowMyRecipes(true)

    window.scrollTo({ top: 0 })
  }

  function openPostComposer() {
    pendingRecipePost.current = null
    setComposerRecipe(null)
    setCreateOpen(false)
    if (!authUser) {
      navigate(4)
      return
    }
    setComposingPost(true)
    window.scrollTo({ top: 0 })
  }
  function openRecipePostComposer(recipe: RecipeTagChoice) {
    setCreateOpen(false)
    if (!authUser) {
      pendingRecipePost.current = recipe
      navigate(4)
      return
    }
    pendingRecipePost.current = null
    setComposerRecipe(recipe)
    setComposingPost(true)
    window.scrollTo({ top: 0 })
  }
  function openKitchenPosts(postId?: string) {
    postFeedScroll.current = window.scrollY
    setPostFeed(postId ? { postId } : {})
    window.scrollTo({ top: 0 })
  }

  function navButton(i: number) {
    return (
      <button
        key={i}
        type="button"
        aria-label={
          ["Home", "Search", "Saved recipes", "Notifications", "Profile"][i]
        }
        aria-current={activeNav === i && !showSearch ? "page" : undefined}
        onClick={() => navigate(i)}
        className="relative flex flex-col items-center justify-center w-full min-w-0 h-14 transition-colors"
        style={{
          color:
            activeNav === i && !showSearch
              ? "var(--color-primary)"
              : "var(--color-gray)",
        }}
      >
        {NAV_ICONS[i]}
        {activeNav === i && !showSearch && (
          <div
            className="absolute bottom-1 w-1 h-1 rounded-full"
            style={{ backgroundColor: "var(--color-primary)" }}
          />
        )}
      </button>
    )
  }

  const NavBar = (
    <nav
      className="app-bottom-nav fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t grid items-center justify-items-center py-1 bg-white z-50"
      style={{
        borderColor: "var(--color-border)",

        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
      }}
      aria-label="Main navigation"
    >
      {[0, 1].map(navButton)}
      <button
        type="button"
        aria-label="Create"
        aria-haspopup="dialog"
        aria-expanded={createOpen}
        onClick={() => setCreateOpen(true)}
        className="flex items-center justify-center w-14 h-14 shrink-0 rounded-full"
        style={{
          color: "var(--color-primary)",

          backgroundColor: "var(--color-primary-soft)",
        }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="16" cy="16" r="13" />
          <path d="M16 10v12M10 16h12" />
        </svg>
      </button>
      {[2, 4].map(navButton)}
    </nav>
  )

  function navigate(index: number) {
    if (index !== 4) pendingRecipePost.current = null
    if (index === 0) homePosts.reload()
    setPostFeed(null)
    if ((index === 1 || index === 2) && index !== activeNav)
      sectionBackNav.current[index] = activeNav

    clearRecipeViews()

    setSocial(index === 3 ? { mode: "notifications" } : null)

    setShowSearch(false)

    setActiveNav(index)

    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    function openPendingLink() {
      // Do not replace an editor, private conversation or active dialog.
      if (
        composingPost ||
        editingRecipeId ||
        showMyRecipes ||
        showMessages ||
        document.querySelector("dialog[open]")
      )
        return
      const link = takeNativeContent()
      if (!link) return
      clearRecipeViews()
      setShowSearch(false)
      setShowAccountStatus(false)
      setCreateOpen(false)
      setActiveNav(0)
      if (link.kind === "recipe") setSelectedRecipeId(link.id)
      else setPostFeed({ postId: link.id })
      window.scrollTo({ top: 0 })
    }
    if (!isAndroidApp) return
    openPendingLink()
    const unsubscribe = subscribeNative(openPendingLink)
    // A link deferred behind a modal is reconsidered when that modal closes.
    const observer = new MutationObserver(() => {
      if (nativeSnapshot().content) openPendingLink()
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["open"],
      subtree: true,
      childList: true,
    })
    return () => {
      unsubscribe()
      observer.disconnect()
    }
  }, [composingPost, editingRecipeId, showMyRecipes, showMessages])

  useAndroidBack(() => {
    if (composingPost || editingRecipeId) return true
    if (createOpen) {
      setCreateOpen(false)
      return true
    }
    if (showAccountStatus) {
      setShowAccountStatus(false)
      return true
    }
    if (
      showMessages ||
      postFeed ||
      social ||
      showMyRecipes ||
      selectedRecipeId ||
      selectedTagRecipeSection ||
      showLikedRecipes ||
      showSearch ||
      activeNav !== 0
    ) {
      navigate(0)
      return true
    }
    return false
  }, -100)

  function renderScreen() {
    if (composingPost && authUser)
      return (
        <PostComposer
          key={authUser.id}
          userId={authUser.id}
          initialRecipe={composerRecipe}
          onClose={() => {
            setComposingPost(false)
            setComposerRecipe(null)
          }}
          onShared={(postId) => {
            setComposingPost(false)
            setComposerRecipe(null)
            homePosts.reload()
            setPostFeed({ authorId: authUser.id, postId })
            window.scrollTo({ top: 0 })
          }}
        />
      )
    if (postFeed)
      return (
        <PhotoPostsScreen
          key={`${postFeed.authorId}:${postFeed.postId ?? "all"}:${authUser?.id ?? "guest"}`}
          authorId={postFeed.authorId}
          postId={postFeed.postId}
          initialCommentId={postFeed.commentId}
          onSelectRecipe={(id) => {
            setPostFeed(null)
            setSelectedRecipeId(id)
            window.scrollTo({ top: 0 })
          }}
          userId={authUser?.id ?? null}
          onChanged={homePosts.reload}
          onCreate={openPostComposer}
          navigation={NavBar}
          renderAuthor={(authorId, onBack) => (
            <SocialScreen
              key={authorId}
              userId={authUser?.id ?? null}
              initialMode="following"
              initialProfile={authorId}
              navigation={NavBar}
              onBack={onBack}
              onRequireLogin={() => navigate(4)}
              onSelectRecipe={(id, commentId) => {
                setPostFeed(null)
                setSocial({ mode: "following", profile: authorId })
                setCommentTarget(commentId ? { recipeId: id, commentId } : null)
                setSelectedRecipeId(id)
                window.scrollTo({ top: 0 })
              }}
            />
          )}
          onBack={() => {
            setPostFeed(null)
            requestAnimationFrame(() =>
              window.scrollTo({ top: postFeedScroll.current }),
            )
          }}
        />
      )
    if (showAccountStatus && authUser) {
      return (
        <AccountStatusScreen
          key={authUser.id}
          userId={authUser.id}
          onBack={() => setShowAccountStatus(false)}
        />
      )
    }

    if (showMessages) {
      if (loadingAuth)
        return (
          <p role="status" className="px-4 py-20">
            Loading your account…
          </p>
        )

      if (authError)
        return (
          <RetryState
            title="Couldn't load your account"
            message="Please try again."
            onRetry={() => setAuthRetryKey((value) => value + 1)}
          />
        )

      return (
        <>
          {authUser ? (
            <MessagesScreen
              key={`${authUser.id}:${messagePeer ?? "inbox"}`}
              userId={authUser.id}
              initialPeerId={messagePeer}
              onBack={() => setShowMessages(false)}
            />
          ) : (
            <AuthScreen onBack={() => setShowMessages(false)} />
          )}
        </>
      )
    }

    if (editingRecipeId) {
      if (loadingAuth)
        return (
          <p role="status" className="px-4 py-20">
            Loading your account…
          </p>
        )

      if (authError)
        return (
          <RetryState
            title="Couldn't load your account"
            message="Please try again."
            onRetry={() => setAuthRetryKey((value) => value + 1)}
          />
        )

      if (!authUser)
        return <AuthScreen onBack={() => setEditingRecipeId(null)} />

      return (
        <RecipeEditScreen
          key={`${authUser.id}:${editingRecipeId}`}
          userId={authUser.id}
          recipeId={editingRecipeId}
          onBack={() => setEditingRecipeId(null)}
          onSaved={() => {
            setSelectedRecipeId(editingRecipeId)

            setEditingRecipeId(null)

            setHomeRetryKey((value) => value + 1)

            window.scrollTo({ top: 0 })
          }}
        />
      )
    }

    if (social && !selectedRecipeId)
      return (
        <>
          {pushNotice && (
            <p className="social-message" role="status">
              {pushNotice}
            </p>
          )}
          <SocialScreen
            key={`${authUser?.id ?? "guest"}:${social.mode}:${social.profile ?? ""}`}
            userId={authUser?.id ?? null}
            initialMode={social.mode}
            initialProfile={social.profile}
            navigation={NavBar}
            onBack={() => {
              setSelectedRecipeId(social.originRecipe ?? null)

              setSocial(null)
            }}
            onRequireLogin={() => navigate(4)}
            onSelectRecipe={(id, commentId) => {
              setCommentTarget(commentId ? { recipeId: id, commentId } : null)

              setSelectedRecipeId(id)

              window.scrollTo({ top: 0 })
            }}
          />
        </>
      )

    if (showMyRecipes) {
      if (loadingAuth)
        return (
          <p className="px-4 py-20" role="status">
            Loading your account…
          </p>
        )

      if (authError)
        return (
          <RetryState
            title="Couldn't load your account"
            message="Please check your connection and try again."
            onRetry={() => setAuthRetryKey((value) => value + 1)}
          />
        )

      if (!authUser) return null

      return (
        <MyRecipesScreen
          key={authUser.id}
          userId={authUser.id}
          startNew={startNewRecipe}
          navigation={NavBar}
          onShowList={() => {
            setStartNewRecipe(false)

            setHomeRetryKey((value) => value + 1)
          }}
          onBack={() => {
            setShowMyRecipes(false)

            setActiveNav(4)
          }}
          onSelectRecipe={(id) => {
            setShowMyRecipes(false)

            setSelectedRecipeId(id)

            window.scrollTo({ top: 0 })
          }}
        />
      )
    }

    if (selectedRecipeId) {
      return (
        <>
          <RecipeDetailScreen
            recipeId={selectedRecipeId}
            onCookedRecipe={openRecipePostComposer}
            initialCommentId={
              commentTarget?.recipeId === selectedRecipeId
                ? commentTarget.commentId
                : undefined
            }
            onEditRecipe={(id) => {
              setEditingRecipeId(id)

              window.scrollTo({ top: 0 })
            }}
            onOpenAuthor={(id) => {
              setSocial({
                mode: "following",

                profile: id,

                originRecipe: selectedRecipeId,
              })

              setSelectedRecipeId(null)

              window.scrollTo({ top: 0 })
            }}
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
          {NavBar}
        </>
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
            key={searchRequest}
            initialEditing={searchEditing}
            typingRequest={typingRequest}
            query={searchValue}
            setQuery={setSearchValue}
            onBack={() => setShowSearch(false)}
            onSelectRecipe={setSelectedRecipeId}
            onSelectUser={(id) => {
              setShowSearch(false)

              setSocial({ mode: "following", profile: id })

              window.scrollTo({ top: 0 })
            }}
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
            onOpenSearch={() => startSearchTyping(searchValue)}
            onBack={() => navigate(sectionBackNav.current[1])}
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
          {loadingAuth ? (
            <p className="px-4 py-16" role="status">
              Loading your account…
            </p>
          ) : authError ? (
            <RetryState
              title="Couldn't load your account"
              message={authError}
              onRetry={() => setAuthRetryKey((value) => value + 1)}
            />
          ) : (
            <SavedScreen
              key={authUser?.id ?? "guest"}
              userId={authUser?.id ?? null}
              onRequireLogin={() => navigate(4)}
              onBack={() => navigate(sectionBackNav.current[2])}
              onSelectRecipe={setSelectedRecipeId}
            />
          )}
          {NavBar}
        </div>
      )
    }

    if (activeNav === 4) {
      return (
        <div className="bg-white min-h-screen max-w-md mx-auto relative">
          {loadingAuth ? (
            <div
              className="px-4 py-20 text-center text-body"
              style={{ color: "var(--color-gray)" }}
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
            <AccountProfileScreen
              onSelectRecipe={(id) => {
                setSelectedRecipeId(id)

                window.scrollTo({ top: 0 })
              }}
              userId={authUser.id}
              email={authUser.email}
              onOpenSaved={() => {
                sectionBackNav.current[2] = 4

                setActiveNav(2)
              }}
              onOpenLiked={() => setShowLikedRecipes(true)}
              onOpenMyRecipes={() => {
                setStartNewRecipe(false)

                setShowMyRecipes(true)

                window.scrollTo({ top: 0 })
              }}
              onOpenCommunity={(mode) => {
                setSocial({ mode })

                window.scrollTo({ top: 0 })
              }}
              unreadNotifications={unreadNotifications}
              onBack={() => setActiveNav(0)}
            />
          ) : (
            <AuthScreen onBack={() => setActiveNav(0)} />
          )}
          {NavBar}
        </div>
      )
    }

    const homeHeader = (
      <div className="flex items-center justify-between px-4 pt-6 pb-2">
        <PickleLogo size={24} iconSize={36} />
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              clearRecipeViews()

              setShowSearch(false)

              setShowMessages(true)

              window.scrollTo({ top: 0 })
            }}
            aria-label={`Messages${
              unreadMessages ? `, ${unreadMessages} unread` : ""
            }`}
            className="relative w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-primary)" }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 11.5a8.5 8.5 0 01-8.5 8.5H4l-3 2V11.5A8.5 8.5 0 019.5 3h3a8.5 8.5 0 018.5 8.5Z" />
              <path d="M7 9h8M7 13h5" />
            </svg>
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 rounded-full bg-[var(--color-primary)] text-white text-caption px-1 min-w-4 text-center">
                {unreadMessages > 99 ? "99+" : unreadMessages}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate(3)}
            aria-label={`Notifications${
              unreadNotifications ? `, ${unreadNotifications} unread` : ""
            }`}
            className="relative w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-primary)" }}
          >
            {NAV_ICONS[3]}
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 rounded-full bg-[var(--color-primary)] text-white text-caption px-1 min-w-4 text-center">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </button>
        </div>
      </div>
    )
    if (homeFeed === "following")
      return (
        <div className="max-w-md mx-auto min-h-screen pb-24">
          {homeHeader}
          <HomeFeedTabs value={homeFeed} onChange={setHomeFeed} />
          <FollowingFeed
            key={authUser?.id ?? "guest"}
            userId={authUser?.id ?? null}
            onSelectRecipe={(id) => {
              setSelectedRecipeId(id)
              window.scrollTo({ top: 0 })
            }}
            onOpenAuthor={(id) => {
              setSocial({ mode: "following", profile: id })
              window.scrollTo({ top: 0 })
            }}
            onRequireLogin={() => navigate(4)}
            onDiscover={() => setHomeFeed("discover")}
          />
          {NavBar}
        </div>
      )
    const feedTabs = <HomeFeedTabs value={homeFeed} onChange={setHomeFeed} />
    const kitchens = (
      <HomePostsSection
        posts={homePosts.rows}
        loading={homePosts.loading}
        error={homePosts.error}
        onRetry={homePosts.reload}
        onOpen={openKitchenPosts}
        onSeeAll={() => openKitchenPosts()}
        onCreate={openPostComposer}
      />
    )
    return (
      <>
        <DesktopHome
          feedTabs={feedTabs}
          kitchens={kitchens}
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
          onKeyword={submitSearch}
        />
        <div className="mobile-home bg-white min-h-screen max-w-md mx-auto relative pb-24">
          {homeHeader}
          {feedTabs}
          <div className="px-4 mt-4 mb-4">
            <h1
              className="font-bold text-hero leading-tight"
              style={{ color: "var(--color-ink)" }}
            >
              Hi, looking for
              <br />a recipe?
            </h1>
          </div>
          <div className="px-4 mb-8">
            <div
              className="flex items-center gap-3 px-4 h-12 rounded-[12px] border"
              style={{
                backgroundColor: "var(--color-surface)",

                borderColor: "var(--color-border)",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-gray)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                enterKeyHint="search"
                aria-label="Search recipes and cooks"
                maxLength={80}
                placeholder="Search recipes..."
                value={searchValue}
                onFocus={() => startSearchTyping(searchValue)}
                onChange={(e) =>
                  (e.nativeEvent as InputEvent).isComposing
                    ? setSearchValue(e.target.value)
                    : startSearchTyping(e.target.value)
                }
                onCompositionEnd={(event) =>
                  startSearchTyping(event.currentTarget.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault()

                    e.currentTarget.blur()

                    submitSearch()
                  }
                }}
                className="flex-1 bg-transparent outline-none text-lead placeholder:text-[var(--color-gray)]"
                style={{ color: "var(--color-ink)" }}
              />
            </div>
          </div>
          {loadingRecipes ? (
            <div
              className="px-4 py-10 text-center text-body"
              style={{ color: "var(--color-gray)" }}
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
                    className="font-semibold text-section"
                    style={{ color: "var(--color-ink)" }}
                  >
                    Featured
                  </h2>
                </div>
                <div
                  className="relative select-none mx-4"
                  style={{ height: 260 }}
                >
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
                          <RecipeImage
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
                            <h2 className="font-semibold text-lead text-white mb-0.5">
                              {recipe.title}
                            </h2>
                            <div className="flex items-center gap-2">
                              <span
                                className="text-body text-white/80 px-2.5 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: "rgba(255,255,255,0.18)",
                                }}
                              >
                                Filipino
                              </span>
                              <span
                                className="text-body text-white/80 px-2.5 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: "rgba(255,255,255,0.18)",
                                }}
                              >
                                {recipe.difficulty}
                              </span>
                              <span className="text-body text-white/80">
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
                              ? "var(--color-primary)"
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
              {kitchens}
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

  if (composingPost && authUser) return renderScreen()

  return (
    <>
      <DesktopShell
        activeNav={activeNav}
        searching={
          showSearch ||
          Boolean(selectedRecipeId) ||
          Boolean(selectedTagRecipeSection) ||
          showMyRecipes
        }
        loggedIn={Boolean(authUser)}
        avatarUrl={homeAvatarUrl}
        accountView={
          activeNav === 4 &&
          !selectedRecipeId &&
          !showSearch &&
          !selectedTagRecipeSection &&
          !showLikedRecipes &&
          !showMyRecipes
        }
        query={searchValue}
        onQueryChange={startSearchTyping}
        onSearch={() => submitSearch()}
        onNavigate={navigate}
        onCreate={() => setCreateOpen(true)}
      >
        <AccountRestrictionBanner
          userId={authUser?.id ?? null}
          onOpen={() => setShowAccountStatus(true)}
        />
        {renderScreen()}
      </DesktopShell>
      {createOpen && (
        <CreateSheet
          onClose={() => setCreateOpen(false)}
          onPost={openPostComposer}
          onRecipe={() => {
            setCreateOpen(false)
            openRecipeUpload()
          }}
        />
      )}
    </>
  )
}
