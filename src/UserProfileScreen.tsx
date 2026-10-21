import RecipeImage from "./RecipeImage"

import { useEffect, useRef, useState } from "react"

import BackIcon from "./BackIcon"

import ViewIcon from "./ViewIcon"

import RecipeSummaryCard from "./RecipeSummaryCard"

import SearchScreen from "./SearchScreen"

import MessagesScreen from "./MessagesScreen"

import useUnreadMessages from "./useUnreadMessages"

import UserActionsMenu, { type BlockState } from "./UserActionsMenu"

import { supabase } from "./lib/supabase"

import { recipeImageUrl } from "./lib/recipe"

import { profileRecipeQuery } from "./lib/profileRecipes"

import "./user-profile.css"
import ProfilePostsGrid from "./ProfilePostsGrid"
import PhotoPostsScreen from "./PhotoPostsScreen"

interface Author {
  id: string

  username: string | null

  display_name: string | null

  avatar_url: string | null

  bio: string | null

  post_count: number

  follower_count: number

  following_count: number

  following: boolean

  notifications_enabled: boolean
}

interface Recipe {
  id: string

  title: string

  cover_image: string | null
}

interface GridRecipe extends Recipe {
  view_count: number
}

interface PopularRecipe extends Recipe {
  short_description: string | null

  view_count: number

  like_count: number

  tagNames?: string[]
}

interface Props {
  authorId: string

  userId: string | null

  onBack: () => void

  onRequireLogin: () => void

  onSelectRecipe: (id: string) => void

  onOpenMenu?: () => void

  onOpenCommunity?: (mode: "followers" | "following" | "notifications") => void

  onOpenMyRecipes?: () => void
}

function ViewCount({ count }: { count: number }) {
  return (
    <span
      className="user-profile-view-count"
      aria-label={`${count.toLocaleString()} views`}
    >
      <ViewIcon />
      {count.toLocaleString()}
    </span>
  )
}

function Bell({ enabled }: { enabled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      {!enabled && <path d="M3 3l18 18" />}
    </svg>
  )
}

export default function UserProfileScreen({
  authorId,

  userId,

  onBack,

  onRequireLogin,

  onSelectRecipe,

  onOpenMenu,

  onOpenCommunity,

  onOpenMyRecipes,
}: Props) {
  const [author, setAuthor] = useState<Author | null>(null)

  const [recipes, setRecipes] = useState<GridRecipe[]>([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const [message, setMessage] = useState("")

  const [busy, setBusy] = useState<"follow" | "notifications" | "block" | null>(
    null,
  )

  const [retry, setRetry] = useState(0)

  const [limit, setLimit] = useState(30)

  const [hasMore, setHasMore] = useState(false)

  const [popularRecipes, setPopularRecipes] = useState<PopularRecipe[]>([])

  const [searchOpen, setSearchOpen] = useState(false)

  const [searchInput, setSearchInput] = useState("")

  const [messageOpen, setMessageOpen] = useState(false)

  const [blockState, setBlockState] = useState<BlockState>({
    user_id: authorId,

    blocked: false,

    can_contact: true,
  })

  const guard = useRef(false)

  const generation = useRef(0)

  const own = authorId === userId
  const [contentTab, setContentTab] = useState<"recipes" | "posts">("recipes")
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const profileScroll = useRef(0)

  const unreadMessages = useUnreadMessages(own ? userId : null)

  useEffect(() => {
    if (!userId || own) return

    let disposed = false

    const refresh = async () => {
      try {
        const { data, error } = await supabase.rpc("get_user_block_state", {
          p_user_id: authorId,
        })

        if (disposed || error || data?.user_id !== authorId) return

        if (
          data.blocked !== blockState.blocked ||
          data.can_contact !== blockState.can_contact
        ) {
          setBlockState(data)

          setRecipes([])

          setPopularRecipes([])

          setSearchOpen(false)

          setMessageOpen(false)

          setRetry((value) => value + 1)
        }
      } catch {
        // The server still enforces the block; retry when the next refresh arrives.
      }
    }

    window.addEventListener("pickle:safety-refresh", refresh)

    return () => {
      disposed = true

      window.removeEventListener("pickle:safety-refresh", refresh)
    }
  }, [authorId, userId, own, blockState.blocked, blockState.can_contact])

  useEffect(() => {
    generation.current++

    let ignore = false

    setLoading(true)

    setError("")

    async function load() {
      try {
        const [summary, published, popular, block] = await Promise.all([
          supabase.rpc("get_recipe_author", { p_user_id: authorId }),

          profileRecipeQuery(authorId, limit),

          supabase.rpc("get_profile_popular_recipes", { p_user_id: authorId }),

          userId && !own
            ? supabase.rpc("get_user_block_state", { p_user_id: authorId })
            : Promise.resolve({
                data: { user_id: authorId, blocked: false, can_contact: true },

                error: null,
              }),
        ])

        if (
          block.error ||
          block.data?.user_id !== authorId ||
          summary.error ||
          published.error ||
          popular.error ||
          !Array.isArray(popular.data) ||
          summary.data?.id !== authorId
        )
          throw new Error("Profile unavailable")

        if (!ignore) {
          setBlockState(block.data)

          setAuthor(summary.data)

          setRecipes((published.data ?? []).slice(0, limit).map((recipe) => ({
              id: recipe.id,

              title: recipe.title,

              cover_image: recipe.cover_image,

              view_count: recipe.view_count ?? 0,
            })))

          setHasMore((published.data ?? []).length > limit)

          setPopularRecipes(popular.data)
        }
      } catch {
        if (!ignore) setError("Could not load this profile. Please try again.")
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    void load()

    return () => {
      ignore = true

      generation.current++
    }
  }, [authorId, userId, retry, limit])

  async function changeFollow() {
    if (!userId) {
      onRequireLogin()

      return
    }

    if (!author || authorId === userId || guard.current || loading) return

    const version = generation.current

    const next = !author.following

    guard.current = true

    setBusy("follow")

    setMessage("")

    try {
      const { data, error } = await supabase.rpc("set_user_follow", {
        p_user_id: authorId,

        p_following: next,
      })

      if (error || data?.user_id !== authorId || data.following !== next)
        throw error ?? new Error("Follow was not confirmed")

      if (version !== generation.current) return

      setAuthor((current) =>
        current
          ? {
              ...current,

              following: next,

              notifications_enabled: false,

              follower_count: Math.max(
                0,

                current.follower_count + (next ? 1 : -1),
              ),
            }
          : current,
      )
    } catch {
      if (version === generation.current)
        setMessage("Could not update your follow. Please try again.")
    } finally {
      guard.current = false

      setBusy(null)
    }
  }

  async function changeNotifications() {
    if (!userId) {
      onRequireLogin()

      return
    }

    if (!author?.following || authorId === userId || guard.current || loading)
      return

    const version = generation.current

    const next = !author.notifications_enabled

    guard.current = true

    setBusy("notifications")

    setMessage("")

    try {
      const { data, error } = await supabase.rpc(
        "set_author_recipe_notifications",

        { p_user_id: authorId, p_enabled: next },
      )

      if (
        error ||
        data?.user_id !== authorId ||
        data.notifications_enabled !== next
      )
        throw error ?? new Error("Notification setting was not confirmed")

      if (version !== generation.current) return

      setAuthor((current) =>
        current ? { ...current, notifications_enabled: next } : current,
      )
    } catch {
      if (version === generation.current)
        setMessage("Could not update recipe alerts. Please try again.")
    } finally {
      guard.current = false

      setBusy(null)
    }
  }

  const name = author?.display_name || author?.username || "Pickle user"

  if (messageOpen && userId)
    return (
      <MessagesScreen
        key={userId}
        userId={userId}
        initialPeerId={own ? undefined : authorId}
        onBack={() => setMessageOpen(false)}
      />
    )

  if (searchOpen)
    return (
      <SearchScreen
        key={authorId}
        authorId={authorId}
        query={searchInput}
        setQuery={setSearchInput}
        initialEditing
        onBack={() => {
          setSearchOpen(false)

          setSearchInput("")
        }}
        onSelectRecipe={onSelectRecipe}
        onSelectUser={() => {}}
      />
    )

  return (
    <>
      <div
        className="user-profile"
        hidden={!!selectedPostId && blockState.can_contact}
      >
        <header className="user-profile-header">
          <button
            type="button"
            className="user-profile-icon"
            onClick={onBack}
            aria-label="Back"
          >
            <BackIcon />
          </button>
          <h1>{author ? name : "Profile"}</h1>
          <button
            type="button"
            className="user-profile-icon"
            aria-label={`Search ${name}'s recipes`}
            aria-expanded={searchOpen}
            hidden={!blockState.can_contact}
            onClick={() => setSearchOpen(true)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 5 5" />
            </svg>
          </button>
          <button
            type="button"
            className="user-profile-icon"
            hidden={!blockState.can_contact}
            disabled={
              own
                ? !onOpenCommunity
                : loading ||
                  busy === "block" ||
                  !author?.following ||
                  !blockState.can_contact
            }
            onClick={() =>
              own
                ? onOpenCommunity?.("notifications")
                : void changeNotifications()
            }
            aria-label={
              own
                ? "Notifications"
                : `${
                    author?.notifications_enabled ? "Turn off" : "Turn on"
                  } new recipe alerts from ${name}`
            }
            aria-pressed={own ? undefined : author?.notifications_enabled}
            aria-disabled={
              own
                ? !onOpenCommunity
                : loading || busy !== null || !author?.following
            }
            title={
              own
                ? "Notifications"
                : author?.following
                  ? "New recipe notifications"
                  : "Follow this cook to turn on recipe notifications"
            }
          >
            <Bell enabled={own || !!author?.notifications_enabled} />
          </button>
          {!own && author && (
            <UserActionsMenu
              key={`${authorId}:${userId}`}
              targetId={authorId}
              userId={userId}
              name={name}
              blocked={blockState.blocked}
              disabled={loading || busy !== null}
              onRequireLogin={onRequireLogin}
              onBusy={(value) => setBusy(value ? "block" : null)}
              onChanged={(state) => {
                setBlockState(state)

                setMessageOpen(false)

                setRetry((value) => value + 1)
              }}
            />
          )}
          {own && onOpenMenu && (
            <button
              type="button"
              className="user-profile-icon"
              onClick={onOpenMenu}
              aria-label="Profile menu"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
        </header>
        {error ? (
          <div className="user-profile-empty" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <p className="user-profile-empty" role="status">
            Loading profile…
          </p>
        ) : (
          author && (
            <>
              {
                <>
                  <section
                    className="user-profile-summary"
                    aria-label="Profile summary"
                  >
                    {author.avatar_url &&
                    /^https?:\/\//.test(author.avatar_url) ? (
                      <RecipeImage
                        className="user-profile-avatar"
                        src={author.avatar_url}
                        alt={`${name}'s profile`}
                      />
                    ) : (
                      <span className="user-profile-avatar">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="user-profile-summary-info">
                      <div className="user-profile-identity">
                        <strong>{name}</strong>
                        {author.username && <span>@{author.username}</span>}
                      </div>
                      {blockState.can_contact && (
                        <div className="user-profile-stats">
                          <div>
                            <strong>
                              {author.post_count.toLocaleString()}
                            </strong>
                            <span>Posts</span>
                          </div>
                          <button
                            type="button"
                            disabled={!own || !onOpenCommunity}
                            onClick={() => onOpenCommunity?.("followers")}
                          >
                            <strong>
                              {author.follower_count.toLocaleString()}
                            </strong>
                            <span>Followers</span>
                          </button>
                          <button
                            type="button"
                            disabled={!own || !onOpenCommunity}
                            onClick={() => onOpenCommunity?.("following")}
                          >
                            <strong>
                              {author.following_count.toLocaleString()}
                            </strong>
                            <span>Following</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                  {blockState.can_contact && (
                    <section
                      className="user-profile-bio"
                      aria-label="About this cook"
                    >
                      {author.bio && <p>{author.bio}</p>}
                    </section>
                  )}
                  {blockState.can_contact && (
                    <div className="user-profile-actions">
                      {own ? (
                        <>
                          {onOpenMyRecipes && (
                            <button type="button" onClick={onOpenMyRecipes}>
                              My recipes
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setMessageOpen(true)}
                          >
                            Messages
                            {unreadMessages > 0 && (
                              <span
                                className="user-profile-message-count"
                                aria-label={`${unreadMessages} unread messages`}
                              >
                                {unreadMessages}
                              </span>
                            )}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={
                              author.following ? "" : "user-profile-follow"
                            }
                            disabled={
                              busy === "follow" ||
                              busy === "block" ||
                              !blockState.can_contact
                            }
                            aria-disabled={busy !== null}
                            onClick={() => void changeFollow()}
                          >
                            {blockState.blocked
                              ? "Blocked"
                              : !blockState.can_contact
                                ? "Unavailable"
                                : busy === "follow"
                                  ? "Saving…"
                                  : author.following
                                    ? "Unfollow"
                                    : "Follow"}
                          </button>
                          <button
                            type="button"
                            disabled={
                              !blockState.can_contact || busy === "block"
                            }
                            onClick={() =>
                              userId ? setMessageOpen(true) : onRequireLogin()
                            }
                          >
                            Message
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {!blockState.can_contact && (
                    <p className="user-profile-empty">
                      {blockState.blocked
                        ? "You have blocked this user. Use the profile menu to unblock or report."
                        : "This profile is unavailable."}
                    </p>
                  )}
                  {message && (
                    <p className="user-profile-status" role="status">
                      {message}
                    </p>
                  )}
                  {blockState.can_contact && (
                    <div
                      className="profile-content-tabs"
                      role="group"
                      aria-label="Profile content"
                    >
                      <button
                        type="button"
                        aria-pressed={contentTab === "recipes"}
                        onClick={() => setContentTab("recipes")}
                      >
                        Recipes
                      </button>
                      <button
                        type="button"
                        aria-pressed={contentTab === "posts"}
                        onClick={() => setContentTab("posts")}
                      >
                        Posts
                      </button>
                    </div>
                  )}
                  {blockState.can_contact &&
                    contentTab === "recipes" &&
                    popularRecipes.length > 0 && (
                      <section
                        className="user-profile-popular"
                        aria-labelledby="profile-popular-title"
                      >
                        <h2
                          id="profile-popular-title"
                          className="user-profile-recipes-title"
                        >
                          Featured Recipes
                        </h2>
                        <div className="user-profile-popular-list">
                          {popularRecipes.map((recipe) => (
                            <RecipeSummaryCard
                              key={recipe.id}
                              recipe={recipe}
                              onSelect={onSelectRecipe}
                            />
                          ))}
                        </div>
                      </section>
                    )}
                </>
              }
              {blockState.can_contact &&
                (contentTab === "posts" ? (
                  <ProfilePostsGrid
                    authorId={authorId}
                    userId={userId}
                    onOpen={(id) => {
                      profileScroll.current = window.scrollY
                      setSelectedPostId(id)
                      window.scrollTo({ top: 0 })
                    }}
                  />
                ) : (
                  <>
                    <h2 className="user-profile-recipes-title">All recipes</h2>
                    <div className="user-profile-grid">
                      {recipes.map((recipe) => (
                        <button
                          type="button"
                          key={recipe.id}
                          aria-label={`View ${recipe.title}`}
                          onClick={() => onSelectRecipe(recipe.id)}
                        >
                          <RecipeImage
                            src={recipeImageUrl(recipe.cover_image)}
                            alt=""
                            loading="lazy"
                          />
                          <span className="user-profile-grid-caption">
                            <strong>{recipe.title}</strong>
                            <small>
                              <ViewCount count={recipe.view_count} />
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                    {!recipes.length && (
                      <p className="user-profile-empty">
                        No published recipes yet.
                      </p>
                    )}
                    {hasMore && (
                      <button
                        type="button"
                        className="user-profile-more"
                        disabled={busy !== null}
                        onClick={() => setLimit((value) => value + 30)}
                      >
                        Load more recipes
                      </button>
                    )}
                  </>
                ))}
            </>
          )
        )}
      </div>
      {selectedPostId && blockState.can_contact && (
        <PhotoPostsScreen
          key={selectedPostId}
          authorId={authorId}
          postId={selectedPostId}
          onSelectRecipe={onSelectRecipe}
          userId={userId}
          onChanged={() => setRetry((value) => value + 1)}
          onBack={() => {
            setSelectedPostId(null)
            requestAnimationFrame(() =>
              window.scrollTo({ top: profileScroll.current }),
            )
          }}
        />
      )}
    </>
  )
}
