import SettingsIcon from "./SettingsIcon"

import NotificationSettingsScreen from "./NotificationSettingsScreen"

import useSeenNotifications from "./useSeenNotifications"

import BackIcon from "./BackIcon"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { supabase } from "./lib/supabase"

import UserProfileScreen from "./UserProfileScreen"

import ModerationNotice, { type ModerationDetails } from "./ModerationNotice"

import "./social.css"

import useNotificationRefresh from "./useNotificationRefresh"

import { notificationText, notificationTimeLabel } from "./lib/notificationText"
import PhotoPostsScreen from "./PhotoPostsScreen"

import { markNotificationRead } from "./lib/notificationRead"

export type SocialMode = "following" | "followers" | "notifications"

type Cook = {
  id: string

  username: string

  display_name: string

  avatar_url: string | null

  bio?: string | null
}

interface NoticeRecipe {
  title: string

  is_hidden: boolean
}

type Notice = {
  id: string

  actor_id: string | null

  created_at: string

  read_at: string | null

  actor: Cook | null

  kind: "follow" | "new_recipe" | "moderation" | "recipe_comment" | "comment_reply" | "recipe_photo_post" | "post_comment" | "post_reply"
  post_comment_id: string | null
  post_id: string | null
  post: { id: string } | null

  comment_id: string | null

  moderation_details: ModerationDetails | null

  recipe_id: string | null

  recipe: NoticeRecipe | null
}

type Props = {
  userId: string | null

  initialMode: SocialMode

  initialProfile?: string

  navigation: ReactNode

  onBack: () => void

  onRequireLogin: () => void

  onSelectRecipe: (id: string, commentId?: string) => void
}

const columns = "id,username,display_name,avatar_url,bio"

function cookName(cook: Cook) {
  return cook.display_name || cook.username || "Pickle user"
}

function Avatar({ cook }: { cook: Cook }) {
  return cook.avatar_url && /^https?:\/\//.test(cook.avatar_url) ? (
    <img className="social-avatar" src={cook.avatar_url} alt="" />
  ) : (
    <span className="social-avatar">
      {cookName(cook).charAt(0).toUpperCase()}
    </span>
  )
}

export default function SocialScreen({
  userId,

  initialMode,

  initialProfile,

  navigation,

  onBack,

  onRequireLogin,

  onSelectRecipe,
}: Props) {
  const [mode, setMode] = useState(initialMode)

  const [selected, setSelected] = useState<string | null>(
    initialProfile ?? null,
  )

  const [cooks, setCooks] = useState<Cook[]>([])

  const [notices, setNotices] = useState<Notice[]>([])

  const [following, setFollowing] = useState<Set<string>>(new Set())

  const [limit, setLimit] = useState(50)

  const [hasMore, setHasMore] = useState(false)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const [message, setMessage] = useState("")

  const [refresh, setRefresh] = useState(0)

  const [busy, setBusy] = useState<string | null>(null)

  const guard = useRef(false)
  const [openedPost, setOpenedPost] = useState<string | null>(null)
  const [openedPostComment, setOpenedPostComment] =
    useState<string | undefined>(undefined)

  const generation = useRef(0)

  const loadedPage = useRef("")

  const [settingsOpen, setSettingsOpen] = useState(false)

  const notificationList = useSeenNotifications(
    userId,

    mode === "notifications" && !selected && !settingsOpen && !openedPost,

    notices,

    !loading && !error,
  )

  useNotificationRefresh(mode === "notifications" ? userId : null, () =>
    setRefresh((value) => value + 1),
  )

  useEffect(() => {
    const update = () => setRefresh((value) => value + 1)

    window.addEventListener("pickle:safety-refresh", update)

    return () => window.removeEventListener("pickle:safety-refresh", update)
  }, [])

  useEffect(() => {
    generation.current++

    let ignore = false

    const pageKey = JSON.stringify([userId, mode, selected, limit])

    if (loadedPage.current !== pageKey) setLoading(true)

    setError("")

    setMessage("")

    async function load() {
      try {
        let people: Cook[] = []

        if (mode === "notifications" && userId) {
          const result = await supabase

            .from("user_notifications")

            .select(
              `id,actor_id,kind,recipe_id,comment_id,post_id,post_comment_id,post:photo_posts!user_notifications_post_id_fkey(id),moderation_details,created_at,read_at,actor:profiles!user_notifications_actor_id_fkey(${columns}),recipe:recipes!user_notifications_recipe_id_fkey(title,is_hidden)`,
            )

            .eq("recipient_id", userId)

            .order("created_at", { ascending: false })

            .order("id")

            .limit(limit + 1)

          if (result.error) throw result.error

          if (ignore) return

          const rows = (result.data ?? []) as unknown as Notice[]

          setNotices(rows.slice(0, limit))

          setHasMore(rows.length > limit)

          people = rows

            .slice(0, limit)

            .flatMap((row) => (row.actor ? [row.actor] : []))
        } else if ((mode === "following" || mode === "followers") && userId) {
          const outgoing = mode === "following"

          const result = await supabase

            .from("user_follows")

            .select(
              `cook:profiles!${
                outgoing
                  ? "user_follows_followed_id_fkey"
                  : "user_follows_follower_id_fkey"
              }(${columns})`,
            )

            .eq(outgoing ? "follower_id" : "followed_id", userId)

            .order("created_at", { ascending: false })

            .order(outgoing ? "followed_id" : "follower_id")

            .limit(limit + 1)

          if (result.error) throw result.error

          if (ignore) return

          const rows = (result.data ?? []) as unknown as { cook: Cook | null }[]

          people = rows

            .slice(0, limit)

            .flatMap((row) => (row.cook ? [row.cook] : []))

          setCooks(people)

          setHasMore(rows.length > limit)
        }

        const ids = [...new Set(people.map((cook) => cook.id))]

        let followed = new Set<string>()

        if (userId && ids.length) {
          const result = await supabase

            .from("user_follows")

            .select("followed_id")

            .eq("follower_id", userId)

            .in("followed_id", ids)

          if (result.error) throw result.error

          followed = new Set((result.data ?? []).map((row) => row.followed_id))
        }

        if (!ignore) {
          setFollowing(followed)

          loadedPage.current = pageKey
        }
      } catch {
        if (!ignore) setError("Could not load this page. Please try again.")
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    if (!selected) void load()

    return () => {
      ignore = true
    }
  }, [userId, mode, selected, limit, refresh])

  useEffect(() => {
    if (mode !== "notifications" || selected || busy) return

    const update = () => {
      if (document.visibilityState === "visible")
        setRefresh((value) => value + 1)
    }

    const timer = window.setInterval(update, 30000)

    window.addEventListener("focus", update)

    return () => {
      window.clearInterval(timer)

      window.removeEventListener("focus", update)
    }
  }, [mode, selected, busy])

  async function changeFollow(cook: Cook) {
    if (!userId) {
      onRequireLogin()

      return
    }

    if (guard.current || cook.id === userId) return

    const version = generation.current

    const next = !following.has(cook.id)

    guard.current = true

    setBusy(cook.id)

    setMessage("")

    try {
      const { data, error } = await supabase.rpc("set_user_follow", {
        p_user_id: cook.id,

        p_following: next,
      })

      if (error || data?.user_id !== cook.id || data.following !== next)
        throw error ?? new Error("Follow was not confirmed")

      if (version !== generation.current) return

      setFollowing((current) => {
        const copy = new Set(current)

        if (next) copy.add(cook.id)
        else copy.delete(cook.id)

        return copy
      })

      if (!next && mode === "following" && !selected)
        setCooks((current) => current.filter((row) => row.id !== cook.id))
    } catch {
      if (version === generation.current)
        setMessage("Could not update your follow. Please try again.")
    } finally {
      guard.current = false

      setBusy(null)
    }
  }

  function openCook(id: string) {
    setSelected(id)

    setLimit(50)

    window.scrollTo({ top: 0 })
  }

  function openNotice(notice: Notice) {
    if (!notice.read_at && userId) {
      const version = generation.current

      void markNotificationRead(supabase, userId, notice.id)

        .then((readAt) => {
          if (version === generation.current)
            setNotices((current) =>
              current.map((row) =>
                row.id === notice.id ? { ...row, read_at: readAt } : row,
              ),
            )

          window.dispatchEvent(new Event("pickle:notifications-changed"))
        })

        .catch(() => {
          /* Keep unread state if the server could not confirm it. */
        })
    }

    if (
      ["recipe_photo_post", "post_comment", "post_reply"].includes(
        notice.kind,
      ) &&
      notice.post_id &&
      notice.post
    ) {
      setOpenedPostComment(notice.post_comment_id ?? undefined)
      setOpenedPost(notice.post_id)
      window.scrollTo({ top: 0 })
      return
    }
    if (
      notice.kind !== "follow" &&
      notice.recipe_id &&
      notice.recipe &&
      !notice.recipe.is_hidden
    )
      onSelectRecipe(notice.recipe_id, notice.comment_id ?? undefined)
    else if (notice.actor_id) openCook(notice.actor_id)
  }

  function followButton(cook: Cook) {
    return (
      cook.id !== userId && (
        <button
          type="button"
          className={`social-follow${
            following.has(cook.id) ? " is-following" : ""
          }`}
          disabled={loading || busy !== null}
          onClick={() => void changeFollow(cook)}
          aria-label={`${
            following.has(cook.id) ? "Unfollow" : "Follow"
          } ${cookName(cook)}`}
        >
          {busy === cook.id
            ? "Saving…"
            : following.has(cook.id)
              ? "Unfollow"
              : "Follow"}
        </button>
      )
    )
  }

  if (openedPost)
    return (
      <PhotoPostsScreen
        key={openedPost}
        postId={openedPost}
        initialCommentId={openedPostComment}
        userId={userId}
        navigation={navigation}
        onSelectRecipe={(id) => {
          setOpenedPost(null)
          onSelectRecipe(id)
        }}
        onBack={() => {
          setOpenedPost(null)
          setRefresh((v) => v + 1)
        }}
      />
    )
  if (settingsOpen && userId)
    return (
      <>
        <NotificationSettingsScreen
          key={userId}
          userId={userId}
          onBack={() => {
            setSettingsOpen(false)

            setRefresh((value) => value + 1)
          }}
        />
        {navigation}
      </>
    )

  if (selected)
    return (
      <>
        <UserProfileScreen
          key={selected}
          authorId={selected}
          userId={userId}
          onBack={() =>
            selected && !initialProfile ? setSelected(null) : onBack()
          }
          onRequireLogin={onRequireLogin}
          onSelectRecipe={onSelectRecipe}
          onOpenCommunity={
            selected === userId
              ? (nextMode) => {
                  setSelected(null)

                  setMode(nextMode)

                  setLimit(50)
                }
              : undefined
          }
        />
        {navigation}
      </>
    )

  const titles = {
    following: "Following",

    followers: "Followers",

    notifications: "Notifications",
  }

  return (
    <div
      className={`social-screen${
        mode === "notifications" ? " social-notifications" : ""
      }`}
    >
      <header className="social-heading">
        <button
          type="button"
          className="social-back"
          onClick={() =>
            selected && !initialProfile ? setSelected(null) : onBack()
          }
          aria-label="Back"
        >
          <BackIcon />
        </button>
        <h1>{selected ? "Cook profile" : titles[mode]}</h1>
        {mode === "notifications" && userId && (
          <button
            type="button"
            className="notification-icon-button"
            aria-label="Notification settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </button>
        )}
      </header>
      {mode !== "notifications" && (
        <nav className="social-tabs" aria-label="Followers and following">
          {(["followers", "following"] as const).map((tab) => (
            <button
              type="button"
              key={tab}
              aria-current={!selected && mode === tab ? "page" : undefined}
              disabled={busy !== null}
              onClick={() => {
                setMode(tab)

                setSelected(null)

                setLimit(50)
              }}
            >
              {titles[tab]}
            </button>
          ))}
        </nav>
      )}
      {message && (
        <p role="status" className="social-message">
          {message}
        </p>
      )}
      {!userId && !selected ? (
        <div className="social-empty">
          <p>
            {mode === "notifications"
              ? "Log in to see your notifications."
              : "Log in to manage your followers and following."}
          </p>
          <button
            type="button"
            className="social-follow"
            onClick={onRequireLogin}
          >
            Log in
          </button>
        </div>
      ) : error ? (
        <div role="alert" className="social-empty">
          <p>{error}</p>
          <button
            type="button"
            className="social-link"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <p role="status" className="social-empty">
          Loading…
        </p>
      ) : mode === "notifications" ? (
        <>
          <div className="notification-list" ref={notificationList}>
            {notices.map((notice) =>
              notice.kind === "moderation" ? (
                <div key={notice.id} data-notification-id={notice.id}>
                  <ModerationNotice
                    details={notice.moderation_details}
                    createdAt={notice.created_at}
                    unread={!notice.read_at}
                  />
                </div>
              ) : (
                notice.actor && (
                  <article
                    className={`social-person${
                      !notice.read_at ? " is-unread" : ""
                    }`}
                    key={notice.id}
                    data-notification-id={notice.id}
                  >
                    <button
                      type="button"
                      className="social-person-info"
                      onClick={() => openNotice(notice)}
                    >
                      <Avatar cook={notice.actor} />
                      <span className="notification-copy">
                        <span>
                          <strong>{cookName(notice.actor)}</strong>{" "}
                          {notificationText(
                            notice.kind,

                            notice.recipe && !notice.recipe.is_hidden
                              ? notice.recipe.title
                              : null,
                          )}{" "}
                          <time
                            dateTime={notice.created_at}
                            title={new Date(notice.created_at).toLocaleString()}
                          >
                            {notificationTimeLabel(notice.created_at)}
                          </time>
                        </span>
                      </span>
                    </button>
                    {notice.kind === "follow" && followButton(notice.actor)}
                  </article>
                )
              ),
            )}
          </div>
          {!notices.length && (
            <p className="social-empty">
              No notifications yet. Comments, replies, new followers, recipe
              alerts and moderation notices will appear here.
            </p>
          )}
        </>
      ) : (
        <>
          {cooks.map((cook) => (
            <article className="social-person" key={cook.id}>
              <button
                type="button"
                className="social-person-info"
                onClick={() => openCook(cook.id)}
              >
                <Avatar cook={cook} />
                <span>
                  <strong>{cookName(cook)}</strong>
                  <small>
                    {cook.username ? `@${cook.username}` : "Pickle user"}
                  </small>
                </span>
              </button>
              {followButton(cook)}
            </article>
          ))}
          {!cooks.length && (
            <p className="social-empty">
              {mode === "following"
                ? "You aren't following anyone yet."
                : "No followers yet."}
            </p>
          )}
        </>
      )}
      {hasMore && !loading && !error && (
        <button
          type="button"
          className="social-link social-load-more"
          disabled={busy !== null}
          onClick={() => setLimit((value) => value + 50)}
        >
          Load more
        </button>
      )}
      {navigation}
    </div>
  )
}
