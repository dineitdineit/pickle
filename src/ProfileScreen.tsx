import { applyTheme, readTheme } from "./lib/theme"

import SettingsIcon from "./SettingsIcon"

import NotificationSettingsScreen from "./NotificationSettingsScreen"

import RecipeImage from "./RecipeImage"

import { privateImage } from "./lib/imagePrivacy"

import {
  clearDeletedAccountCache,
  confirmedDeletionReceipt,
  rememberDeletionReceipt,
} from "./lib/accountData"

import BackIcon from "./BackIcon"

import BlockedUsersScreen from "./BlockedUsersScreen"

import AccountStatusScreen from "./AccountStatusScreen"

import { requireContentConsent } from "./ContentConsent"

import UserSafetyIcon from "./UserSafetyIcon"

import { privacySections, termsSections, faqs } from "./profileContent"

import { recipeImageUrl } from "./lib/recipe"

import { ChangeEvent, useEffect, useRef, useState } from "react"

import RetryState from "./RetryState"

import { supabase } from "./lib/supabase"

type ProfileScreenProps = {
  userId: string

  email?: string

  onOpenSaved: () => void

  onOpenLiked: () => void

  onOpenMyRecipes: () => void

  onOpenCommunity: (mode: "followers" | "following" | "notifications") => void

  unreadNotifications: number

  onBack: () => void
}

type Profile = {
  username: string

  display_name: string

  avatar_url: string | null
}

type MyComment = {
  id: string

  recipe_id: string

  content: string

  created_at: string
}

type RecipeSummary = {
  id: string

  title: string

  cover_image: string | null
}

const MAX_AVATAR_SIZE = 5 * 1024 * 1024

const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"]

const MENU_SECTIONS = [
  {
    title: "Your activity",

    items: [
      { label: "Saved Recipes", icon: "bookmark", action: "saved" },

      { label: "My Comments", icon: "comment", action: "comments" },

      { label: "Liked Recipes", icon: "heart", action: "liked" },

      { label: "My Recipes", icon: "book", action: "recipes" },

      { label: "Following", icon: "heart", action: "following" },

      { label: "Notifications", icon: "bell", action: "notifications" },
    ],
  },

  {
    title: "Support",

    items: [
      { label: "Contact Us", icon: "mail", action: "contact" },

      {
        label: "Account status & appeals",

        icon: "privacy",

        action: "account_status",
      },

      { label: "FAQ", icon: "help", action: "faq" },
    ],
  },

  {
    title: "Legal",

    items: [
      { label: "Privacy Policy", icon: "privacy", action: "privacy" },

      { label: "Terms of Service", icon: "terms", action: "terms" },
    ],
  },
] as const

function MenuIcon({ name }: { name: string }) {
  if (name === "book")
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 014 19.5v-14A2.5 2.5 0 016.5 3z" />
        <path d="M8 7h8M8 11h6" />
      </svg>
    )

  if (name === "bell")
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    )

  if (name === "bookmark")
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
    )

  if (name === "comment")
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
      </svg>
    )

  if (name === "heart")
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
      </svg>
    )

  if (name === "settings") return <SettingsIcon />

  if (name === "mail")
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
        <polyline points="22 6 12 13 2 6" />
      </svg>
    )

  if (name === "privacy")
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    )

  if (name === "terms")
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    )

  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 115.4 1.8c-.9 1.1-2.5 1.6-2.5 3.2" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function avatarPathFromUrl(url: string | null) {
  if (!url) return null

  const marker = "/storage/v1/object/public/avatars/"

  const markerIndex = url.indexOf(marker)

  if (markerIndex === -1) return null

  return decodeURIComponent(
    url.slice(markerIndex + marker.length).split("?")[0],
  )
}

export default function ProfileScreen({
  userId,

  email,

  onOpenSaved,

  onOpenLiked,

  onOpenMyRecipes,

  onOpenCommunity,

  unreadNotifications,

  onBack,
}: ProfileScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null)

  const [loading, setLoading] = useState(true)

  const [profileError, setProfileError] = useState("")

  const [profileRetryKey, setProfileRetryKey] = useState(0)

  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const [avatarMessage, setAvatarMessage] = useState("")

  const [showMyComments, setShowMyComments] = useState(false)

  const [commentsLoading, setCommentsLoading] = useState(false)

  const [myComments, setMyComments] = useState<MyComment[]>([])

  const [commentRecipes, setCommentRecipes] =
    useState<Map<string, RecipeSummary>>(new Map())

  const [commentsMessage, setCommentsMessage] = useState("")

  const [supportScreen, setSupportScreen] =
    useState<"contact" | "faq" | "settings" | "notification_settings" | "blocked" | "privacy" | "terms" | "account_status" | null>(
      null,
    )

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const [deletingAccount, setDeletingAccount] = useState(false)

  const [deleteAccountError, setDeleteAccountError] = useState("")

  const [theme, setTheme] = useState(() => readTheme(userId))

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [followCounts, setFollowCounts] = useState<{
    followers: number

    following: number
  } | null>(null)

  const [followCountsError, setFollowCountsError] = useState(false)

  const [followCountsRetry, setFollowCountsRetry] = useState(0)

  useEffect(() => {
    let ignore = false

    let pending = false

    setFollowCounts(null)

    setFollowCountsError(false)

    async function loadCounts() {
      if (pending || document.visibilityState === "hidden") return

      pending = true

      try {
        const [followers, following] = await Promise.all([
          supabase

            .from("user_follows")

            .select("follower_id", { count: "exact", head: true })

            .eq("followed_id", userId),

          supabase

            .from("user_follows")

            .select("followed_id", { count: "exact", head: true })

            .eq("follower_id", userId),
        ])

        if (followers.error || following.error)
          throw followers.error ?? following.error

        if (!ignore) {
          setFollowCounts({
            followers: followers.count ?? 0,

            following: following.count ?? 0,
          })

          setFollowCountsError(false)
        }
      } catch {
        if (!ignore) setFollowCountsError(true)
      } finally {
        pending = false
      }
    }

    const refreshCounts = () => {
      void loadCounts()
    }

    refreshCounts()

    const timer = window.setInterval(refreshCounts, 30000)

    window.addEventListener("focus", refreshCounts)

    document.addEventListener("visibilitychange", refreshCounts)

    return () => {
      ignore = true

      window.clearInterval(timer)

      window.removeEventListener("focus", refreshCounts)

      document.removeEventListener("visibilitychange", refreshCounts)
    }
  }, [userId, followCountsRetry])

  useEffect(() => {
    let ignore = false

    async function loadProfile() {
      setLoading(true)

      setProfileError("")

      const { data, error } = await supabase

        .from("profiles")

        .select("username, display_name, avatar_url")

        .eq("id", userId)

        .single()

      if (!ignore) {
        if (error) {
          console.error("Failed to load profile:")

          setProfile(null)

          setProfileError("Could not load your profile.")
        } else {
          setProfile(data)
        }

        setLoading(false)
      }
    }

    loadProfile()

    return () => {
      ignore = true
    }
  }, [userId, profileRetryKey])

  function chooseTheme(nextTheme: "Light" | "Dark") {
    setTheme(nextTheme)
  }

  useEffect(() => {
    applyTheme(theme, userId)
  }, [theme, userId])

  async function deleteAccount() {
    if (deletingAccount) return

    setDeletingAccount(true)

    setDeleteAccountError("")

    const { data: deletion, error } = await supabase.functions.invoke(
      "delete-account",

      {
        body: {},
      },
    )

    let receipt

    try {
      if (error) throw error

      receipt = confirmedDeletionReceipt(deletion, userId)
    } catch {
      console.error("Failed to delete account:")

      setDeleteAccountError("Could not delete your account. Please try again.")

      setDeletingAccount(false)

      return
    }

    if (!(await clearDeletedAccountCache(userId)))
      window.alert(
        "Account deletion was requested, but this device’s cached drafts could not be cleared. Clear Pickle’s app storage in Android Settings, or clear this site’s data in your browser.",
      )

    rememberDeletionReceipt(receipt)

    const { data: latestSession } = await supabase.auth.getSession()

    if (latestSession.session?.user.id !== userId) return

    await supabase.auth.signOut({ scope: "local" })

    window.location.replace("/")
  }

  async function openMyComments() {
    setShowMyComments(true)

    setCommentsLoading(true)

    setCommentsMessage("")

    const { data, error } = await supabase

      .from("recipe_comments")

      .select("id, recipe_id, content, created_at")

      .eq("user_id", userId)

      .order("created_at", { ascending: false })

    if (error) {
      console.error("Failed to load comment history:")

      setCommentsMessage("Could not load your comments.")

      setMyComments([])

      setCommentsLoading(false)

      return
    }

    const rows = (data ?? []) as MyComment[]

    setMyComments(rows)

    const recipeIds = [...new Set(rows.map((comment) => comment.recipe_id))]

    if (recipeIds.length > 0) {
      const { data: recipeData, error: recipeError } = await supabase

        .from("recipes")

        .select("id, title, cover_image")

        .in("id", recipeIds)

      if (recipeError) {
        console.error("Failed to load recipes for comments:")
      } else {
        setCommentRecipes(
          new Map(
            ((recipeData ?? []) as RecipeSummary[]).map((recipe) => [
              recipe.id,

              recipe,
            ]),
          ),
        )
      }
    } else {
      setCommentRecipes(new Map())
    }

    setCommentsLoading(false)
  }

  async function deleteMyComment(commentId: string) {
    const { error } = await supabase

      .from("recipe_comments")

      .delete()

      .eq("id", commentId)

      .eq("user_id", userId)

    if (error) {
      console.error("Failed to delete comment:")

      setCommentsMessage("Could not delete this comment.")

      return
    }

    setMyComments((current) =>
      current.filter((comment) => comment.id !== commentId),
    )
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    event.target.value = ""

    if (!file) return

    setAvatarMessage("")

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarMessage("Please choose a JPG, PNG, or WebP image.")

      return
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarMessage("Profile photos must be 5 MB or smaller.")

      return
    }

    setUploadingAvatar(true)

    try {
      if (!(await requireContentConsent(userId))) {
        setUploadingAvatar(false)

        return
      }
    } catch {
      setAvatarMessage("Could not load the content policy. Please try again.")

      setUploadingAvatar(false)

      return
    }

    let cleanFile: File

    try {
      cleanFile = await privateImage(file)
    } catch {
      setAvatarMessage(
        "Could not prepare this photo. Please choose another image.",
      )

      setUploadingAvatar(false)

      return
    }

    const extension =
      cleanFile.type === "image/png"
        ? "png"
        : cleanFile.type === "image/webp"
          ? "webp"
          : "jpg"

    const filePath = `${userId}/avatar-${Date.now()}.${extension}`

    const previousPath = avatarPathFromUrl(profile?.avatar_url ?? null)

    const { error: uploadError } = await supabase.storage

      .from("avatars")

      .upload(filePath, cleanFile, {
        cacheControl: "3600",

        upsert: false,

        contentType: cleanFile.type,
      })

    if (uploadError) {
      console.error("Failed to upload avatar:")

      setAvatarMessage("Could not upload this photo. Please try again.")

      setUploadingAvatar(false)

      return
    }

    const { data: publicUrlData } = supabase.storage

      .from("avatars")

      .getPublicUrl(filePath)

    const avatarUrl = publicUrlData.publicUrl

    const { error: profileError } = await supabase

      .from("profiles")

      .update({ avatar_url: avatarUrl })

      .eq("id", userId)

    if (profileError) {
      console.error("Failed to save avatar to profile:")

      await supabase.storage.from("avatars").remove([filePath])

      setAvatarMessage(
        "The photo uploaded, but your profile could not be updated.",
      )

      setUploadingAvatar(false)

      return
    }

    setProfile((current) =>
      current ? { ...current, avatar_url: avatarUrl } : current,
    )

    setAvatarMessage("Profile photo updated.")

    if (
      previousPath &&
      previousPath !== filePath &&
      previousPath.startsWith(`${userId}/`)
    ) {
      const { error: deleteError } = await supabase.storage

        .from("avatars")

        .remove([previousPath])

      if (deleteError) console.error("Failed to remove previous avatar:")
    }

    setUploadingAvatar(false)
  }

  const displayName =
    profile?.display_name || profile?.username || "Pickle User"

  const username = profile?.username ? `@${profile.username}` : email || ""

  const initial = profile?.username?.trim().charAt(0).toUpperCase() || "P"

  if (loading) {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-ink)" }}
          >
            <BackIcon />
          </button>
          <h1
            className="font-bold text-section"
            style={{ color: "var(--color-ink)" }}
          >
            Profile
          </h1>
        </div>
        <div
          className="px-4 py-20 text-center text-body"
          style={{ color: "var(--color-gray)" }}
        >
          Loading profile…
        </div>
      </div>
    )
  }

  if (profileError) {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-ink)" }}
          >
            <BackIcon />
          </button>
          <h1
            className="font-bold text-section"
            style={{ color: "var(--color-ink)" }}
          >
            Profile
          </h1>
        </div>
        <RetryState
          title="Couldn't load your profile"
          message="Please check your connection and try again."
          onRetry={() => setProfileRetryKey((current) => current + 1)}
        />
      </div>
    )
  }

  if (supportScreen === "notification_settings")
    return (
      <NotificationSettingsScreen
        key={userId}
        userId={userId}
        onBack={() => setSupportScreen("settings")}
      />
    )

  if (supportScreen === "blocked")
    return (
      <BlockedUsersScreen
        key={userId}
        userId={userId}
        onBack={() => setSupportScreen("settings")}
      />
    )

  if (supportScreen === "settings") {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-8">
          <button
            type="button"
            onClick={() => setSupportScreen(null)}
            aria-label="Back to profile"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-ink)" }}
          >
            <BackIcon />
          </button>
          <h1
            className="font-bold text-section"
            style={{ color: "var(--color-ink)" }}
          >
            Settings
          </h1>
        </div>
        <div className="px-4 space-y-7">
          <section>
            <p
              className="text-body font-semibold mb-2 px-1"
              style={{ color: "var(--color-gray-soft)" }}
            >
              Privacy
            </p>
            <button
              type="button"
              className="w-full rounded-[16px] border px-4 py-4 flex items-center gap-3 text-body"
              style={{
                borderColor: "var(--color-border)",

                backgroundColor: "var(--color-white)",

                color: "var(--color-ink)",
              }}
              onClick={() => setSupportScreen("blocked")}
            >
              <UserSafetyIcon kind="block" />
              <span className="flex-1 text-left">Blocked users</span>
              <span aria-hidden="true">›</span>
            </button>
          </section>
          <section>
            <p
              className="text-body font-semibold mb-2 px-1"
              style={{ color: "var(--color-gray-soft)" }}
            >
              Notifications
            </p>
            <button
              type="button"
              className="w-full rounded-[16px] border px-4 py-4 flex items-center gap-4 text-left"
              style={{
                borderColor: "var(--color-border)",

                backgroundColor: "var(--color-white)",

                color: "var(--color-ink)",
              }}
              onClick={() => setSupportScreen("notification_settings")}
            >
              <span className="flex-1 text-body">Notification settings</span>
              <span aria-hidden="true">›</span>
            </button>
          </section>
          <section>
            <p
              className="text-body font-semibold mb-2 px-1"
              style={{ color: "var(--color-gray-soft)" }}
            >
              Appearance
            </p>
            <div
              className="rounded-[16px] border p-1.5 flex gap-1.5"
              style={{
                borderColor: "var(--color-border)",

                backgroundColor: "var(--color-white)",
              }}
            >
              {(["Light", "Dark"] as const).map((option) => {
                const selected = theme === option

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => chooseTheme(option)}
                    aria-pressed={selected}
                    className="flex-1 min-h-[46px] rounded-[11px] flex items-center justify-center gap-2 text-body font-medium transition-colors"
                    style={{
                      backgroundColor: selected
                        ? "var(--color-primary-soft)"
                        : "transparent",

                      color: selected
                        ? "var(--color-primary)"
                        : "var(--color-gray)",
                    }}
                  >
                    {option === "Light" ? (
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                      </svg>
                    ) : (
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                      </svg>
                    )}
                    {option}
                  </button>
                )
              })}
            </div>
          </section>
          <section>
            <p
              className="text-body font-semibold mb-2 px-1"
              style={{ color: "var(--color-gray-soft)" }}
            >
              Account
            </p>
            <div
              className="rounded-[16px] border overflow-hidden"
              style={{
                borderColor: "var(--color-border)",

                backgroundColor: "var(--color-white)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setDeleteAccountError("")

                  setDeleteConfirmOpen(true)
                }}
                className="w-full min-h-[58px] px-4 flex items-center gap-3 text-left"
              >
                <span
                  className="text-body font-medium"
                  style={{ color: "#C53D2E" }}
                >
                  Delete Account
                </span>
              </button>
            </div>
          </section>
        </div>
        {deleteConfirmOpen && (
          <div
            className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center px-4"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={() => !deletingAccount && setDeleteConfirmOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-[20px] border p-5 mb-4 sm:mb-0"
              style={{
                borderColor: "var(--color-border)",

                backgroundColor: "var(--color-white)",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: "#FFF0F0", color: "#C53D2E" }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6m3 0V4h8v2M10 11v5M14 11v5" />
                </svg>
              </div>
              <h2
                className="font-semibold text-section"
                style={{ color: "var(--color-ink)" }}
              >
                Delete your account?
              </h2>
              <p
                className="text-body leading-6 mt-2"
                style={{ color: "var(--color-gray)" }}
              >
                This requests deletion of your account, published recipes,
                drafts, uploaded photos, messages and linked activity. Your
                content becomes unavailable while cleanup runs; failed steps
                retry automatically. Minimal deletion receipts and encrypted
                application backups expire after 30 days. Detailed evidence is
                kept for 30 days and minimum enforcement history for 90 days
                after final case closure, with ongoing cases or active
                restrictions handled as described in the Privacy Policy.
                Provider backups have separate settings. Deletion cannot be
                undone.
              </p>
              {deleteAccountError && (
                <p
                  className="text-label leading-5 mt-3"
                  style={{ color: "#C53D2E" }}
                >
                  {deleteAccountError}
                </p>
              )}
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deletingAccount}
                  className="flex-1 h-11 rounded-[12px] border text-body font-semibold disabled:opacity-50"
                  style={{
                    borderColor: "var(--color-border)",

                    color: "var(--color-gray)",

                    backgroundColor: "var(--color-white)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deletingAccount}
                  className="flex-1 h-11 rounded-[12px] text-body font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "#C53D2E" }}
                >
                  {deletingAccount ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (supportScreen === "contact") {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-8">
          <button
            type="button"
            onClick={() => setSupportScreen(null)}
            aria-label="Back to profile"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-ink)" }}
          >
            <BackIcon />
          </button>
          <h1
            className="font-bold text-section"
            style={{ color: "var(--color-ink)" }}
          >
            Contact Us
          </h1>
        </div>
        <div className="px-4 space-y-5">
          <section
            className="rounded-[18px] border p-5"
            style={{
              borderColor: "var(--color-border)",

              backgroundColor: "var(--color-white)",
            }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center mb-4"
              style={{
                backgroundColor: "var(--color-primary-soft)",

                color: "var(--color-primary)",
              }}
            >
              <MenuIcon name="mail" />
            </div>
            <h2
              className="font-semibold text-section"
              style={{ color: "var(--color-ink)" }}
            >
              How can we help?
            </h2>
            <p
              className="text-body leading-6 mt-2"
              style={{ color: "var(--color-gray)" }}
            >
              For account support, technical issues, privacy questions or
              feedback, email us.
            </p>
          </section>
          <section
            className="rounded-[18px] border overflow-hidden"
            style={{
              borderColor: "var(--color-border)",

              backgroundColor: "var(--color-white)",
            }}
          >
            <div
              className="px-5 py-4 border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <p
                className="text-label font-semibold"
                style={{ color: "var(--color-gray-soft)" }}
              >
                EMAIL
              </p>
              <a
                href="mailto:admin@getpickleapp.com"
                className="inline-block text-body font-medium mt-1 break-all"
                style={{ color: "var(--color-ink)" }}
              >
                admin@getpickleapp.com
              </a>
            </div>
            <div
              className="px-5 py-4 border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <p
                className="text-label font-semibold"
                style={{ color: "var(--color-gray-soft)" }}
              >
                RESPONSE TIME
              </p>
              <p
                className="text-body font-medium mt-1"
                style={{ color: "var(--color-ink)" }}
              >
                We aim to reply within 3 business days. Response times may vary.
              </p>
            </div>
            <div className="px-5 py-4">
              <p
                className="text-label font-semibold"
                style={{ color: "var(--color-gray-soft)" }}
              >
                EMAIL AVAILABILITY
              </p>
              <p
                className="text-body font-medium mt-1"
                style={{ color: "var(--color-ink)" }}
              >
                Email us anytime. We reply asynchronously.
              </p>
            </div>
          </section>
          <p
            className="text-label leading-5 px-1"
            style={{ color: "var(--color-gray-soft)" }}
          >
            To report a recipe, review, comment or user, use the report option
            in the app. For support, privacy questions or account-deletion
            assistance, email admin@getpickleapp.com. Never send your password
            or verification codes.
          </p>
        </div>
      </div>
    )
  }

  if (supportScreen === "privacy") {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-6">
          <button
            type="button"
            onClick={() => setSupportScreen(null)}
            aria-label="Back to profile"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-ink)" }}
          >
            <BackIcon />
          </button>
          <h1
            className="font-bold text-section"
            style={{ color: "var(--color-ink)" }}
          >
            Privacy Policy
          </h1>
        </div>
        <div className="px-4">
          <p
            className="text-label mb-5"
            style={{ color: "var(--color-gray-soft)" }}
          >
            Last updated: October 16, 2026
          </p>
          <p
            className="text-body leading-6 mb-6"
            style={{ color: "var(--color-gray)" }}
          >
            This Privacy Policy explains how Pickle handles information when you
            use the app and its related services.
          </p>
          <div className="space-y-6">
            {privacySections.map((section) => (
              <section key={section.title}>
                <h2
                  className="text-lead font-semibold mb-2"
                  style={{ color: "var(--color-ink)" }}
                >
                  {section.title}
                </h2>
                <p
                  className="text-body leading-6"
                  style={{ color: "var(--color-gray)" }}
                >
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (supportScreen === "terms") {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-6">
          <button
            type="button"
            onClick={() => setSupportScreen(null)}
            aria-label="Back to profile"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-ink)" }}
          >
            <BackIcon />
          </button>
          <h1
            className="font-bold text-section"
            style={{ color: "var(--color-ink)" }}
          >
            Terms of Service
          </h1>
        </div>
        <div className="px-4">
          <p
            className="text-label mb-5"
            style={{ color: "var(--color-gray-soft)" }}
          >
            Last updated: October 16, 2026
          </p>
          <p
            className="text-body leading-6 mb-6"
            style={{ color: "var(--color-gray)" }}
          >
            These Terms of Service govern your access to and use of Pickle.
          </p>
          <div className="space-y-6">
            {termsSections.map((section) => (
              <section key={section.title}>
                <h2
                  className="text-lead font-semibold mb-2"
                  style={{ color: "var(--color-ink)" }}
                >
                  {section.title}
                </h2>
                <p
                  className="text-body leading-6"
                  style={{ color: "var(--color-gray)" }}
                >
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (supportScreen === "account_status") {
    return (
      <AccountStatusScreen
        key={userId}
        userId={userId}
        onBack={() => setSupportScreen(null)}
      />
    )
  }

  if (supportScreen === "faq") {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-8">
          <button
            type="button"
            onClick={() => setSupportScreen(null)}
            aria-label="Back to profile"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-ink)" }}
          >
            <BackIcon />
          </button>
          <h1
            className="font-bold text-section"
            style={{ color: "var(--color-ink)" }}
          >
            FAQ
          </h1>
        </div>
        <div className="px-4">
          <p
            className="text-body leading-6 mb-5"
            style={{ color: "var(--color-gray)" }}
          >
            Quick answers to common questions about using Pickle.
          </p>
          <div
            className="rounded-[18px] border overflow-hidden"
            style={{
              borderColor: "var(--color-border)",

              backgroundColor: "var(--color-white)",
            }}
          >
            {faqs.map((faq, index) => (
              <details
                key={faq.question}
                className="group"
                style={{
                  borderBottom:
                    index < faqs.length - 1
                      ? "1px solid var(--color-border)"
                      : undefined,
                }}
              >
                <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3">
                  <span
                    className="flex-1 text-body font-semibold leading-5"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {faq.question}
                  </span>
                  <svg
                    className="transition-transform group-open:rotate-180 flex-shrink-0"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-gray-soft)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <p
                  className="px-5 pb-4 text-body leading-6"
                  style={{ color: "var(--color-gray)" }}
                >
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (showMyComments) {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-7">
          <button
            type="button"
            onClick={() => setShowMyComments(false)}
            aria-label="Back to profile"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--color-ink)" }}
          >
            <BackIcon />
          </button>
          <h1
            className="font-bold text-section"
            style={{ color: "var(--color-ink)" }}
          >
            My Comments
          </h1>
        </div>
        {commentsLoading ? (
          <div
            className="px-4 py-16 text-center text-body"
            style={{ color: "var(--color-gray)" }}
          >
            Loading comments…
          </div>
        ) : myComments.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div
              className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{
                backgroundColor: "var(--color-primary-soft)",

                color: "var(--color-primary)",
              }}
            >
              <MenuIcon name="comment" />
            </div>
            <p
              className="font-semibold text-lead"
              style={{ color: "var(--color-ink)" }}
            >
              No comments yet
            </p>
            <p
              className="text-body mt-1"
              style={{ color: "var(--color-gray)" }}
            >
              Comments you leave on recipes will appear here.
            </p>
            {commentsMessage && (
              <p className="text-label mt-3" style={{ color: "#C53D2E" }}>
                {commentsMessage}
              </p>
            )}
          </div>
        ) : (
          <div className="px-4 space-y-3">
            {commentsMessage && (
              <p className="text-label" style={{ color: "#C53D2E" }}>
                {commentsMessage}
              </p>
            )}
            {myComments.map((comment) => {
              const recipe = commentRecipes.get(comment.recipe_id)

              return (
                <article
                  key={comment.id}
                  className="rounded-[16px] border p-3.5"
                  style={{
                    borderColor: "var(--color-border)",

                    backgroundColor: "var(--color-white)",
                  }}
                >
                  <div className="flex gap-3">
                    {recipe?.cover_image ? (
                      <RecipeImage
                        src={recipeImageUrl(recipe.cover_image)}
                        alt={recipe.title}
                        className="w-14 h-14 rounded-[10px] object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-[10px] flex-shrink-0"
                        style={{ backgroundColor: "var(--color-surface)" }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-body font-semibold truncate"
                        style={{ color: "var(--color-ink)" }}
                      >
                        {recipe?.title || "Recipe"}
                      </p>
                      <p
                        className="text-label mt-0.5"
                        style={{ color: "var(--color-gray-soft)" }}
                      >
                        {new Date(comment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <p
                    className="text-body leading-5 mt-3 whitespace-pre-wrap break-words"
                    style={{ color: "var(--color-gray-strong)" }}
                  >
                    {comment.content}
                  </p>
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={() => deleteMyComment(comment.id)}
                      className="text-label"
                      style={{ color: "var(--color-gray-soft)" }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pb-28">
      <div className="relative px-4 pt-6 text-center">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
          style={{ color: "var(--color-ink)" }}
        >
          <BackIcon />
        </button>
        <h1
          className="font-bold text-section"
          style={{ color: "var(--color-ink)" }}
        >
          Profile
        </h1>
        <button
          type="button"
          onClick={() => setSupportScreen("settings")}
          aria-label="Open settings"
          className="absolute right-4 top-5 w-9 h-9 flex items-center justify-center"
          style={{ color: "var(--color-ink)" }}
        >
          <MenuIcon name="settings" />
        </button>
      </div>
      <section className="px-4 pt-5 pb-6 flex flex-col items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAvatarChange}
          aria-hidden="true"
          tabIndex={-1}
          style={{ display: "none" }}
        />
        {profile?.avatar_url && /^https?:\/\//.test(profile.avatar_url) ? (
          <RecipeImage
            src={profile.avatar_url}
            alt={displayName}
            className="w-[88px] h-[88px] rounded-full object-cover"
          />
        ) : (
          <div
            className="w-[88px] h-[88px] rounded-full flex items-center justify-center text-page font-bold"
            style={{
              backgroundColor: "var(--color-primary-soft)",

              color: "var(--color-primary)",
            }}
          >
            {initial}
          </div>
        )}
        <button
          type="button"
          onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          className="mt-2 min-h-9 text-label font-semibold disabled:opacity-60"
          style={{ color: "var(--color-primary)" }}
        >
          {uploadingAvatar ? "Uploading…" : "Upload new photo"}
        </button>
        {avatarMessage && (
          <p
            className="text-label mt-2 text-center"
            style={{
              color:
                avatarMessage === "Profile photo updated."
                  ? "#5F6F52"
                  : "#C53D2E",
            }}
          >
            {avatarMessage}
          </p>
        )}
        <h2
          className="max-w-full text-center break-words font-semibold text-lead mt-2"
          style={{ color: "var(--color-ink)" }}
        >
          {loading ? "Loading…" : displayName}
        </h2>
        <p
          className="max-w-full text-center break-words text-label mt-0.5"
          style={{ color: "var(--color-gray-soft)" }}
        >
          {loading ? "" : username}
        </p>
        <div
          className="mt-3 flex items-center justify-center gap-8"
          aria-label="Follow counts"
        >
          {(["followers", "following"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="min-w-[72px] min-h-11 flex flex-col items-center justify-center gap-0.5"
              onClick={() => onOpenCommunity(kind)}
            >
              <strong
                className="text-body font-semibold"
                style={{ color: "var(--color-ink)" }}
              >
                {followCounts
                  ? followCounts[kind].toLocaleString()
                  : followCountsError
                    ? "—"
                    : "…"}
              </strong>
              <span
                className="text-label"
                style={{ color: "var(--color-gray)" }}
              >
                {kind === "followers" ? "Followers" : "Following"}
              </span>
            </button>
          ))}
        </div>
        {followCountsError && (
          <p
            role="status"
            className="mt-2 text-label"
            style={{ color: "var(--color-gray)" }}
          >
            Could not refresh follow counts.{" "}
            <button
              type="button"
              onClick={() => setFollowCountsRetry((value) => value + 1)}
              style={{ color: "var(--color-primary)" }}
            >
              Retry
            </button>
          </p>
        )}
      </section>
      <div className="px-4 space-y-7">
        {MENU_SECTIONS.map((section) => (
          <section key={section.title}>
            <p
              className="text-body font-semibold mb-2 px-1"
              style={{ color: "var(--color-gray-soft)" }}
            >
              {section.title}
            </p>
            <div
              className="rounded-[16px] border overflow-hidden"
              style={{ borderColor: "var(--color-border)" }}
            >
              {section.items.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={
                    item.action === "following" ||
                    item.action === "notifications"
                      ? () => onOpenCommunity(item.action)
                      : item.action === "recipes"
                        ? onOpenMyRecipes
                        : item.action === "saved"
                          ? onOpenSaved
                          : item.action === "liked"
                            ? onOpenLiked
                            : item.action === "comments"
                              ? openMyComments
                              : item.action === "contact"
                                ? () => setSupportScreen("contact")
                                : item.action === "account_status"
                                  ? () => setSupportScreen("account_status")
                                  : item.action === "faq"
                                    ? () => setSupportScreen("faq")
                                    : item.action === "privacy"
                                      ? () => setSupportScreen("privacy")
                                      : item.action === "terms"
                                        ? () => setSupportScreen("terms")
                                        : undefined
                  }
                  className="w-full h-[58px] px-4 flex items-center gap-3 text-left"
                  style={{
                    borderBottom:
                      index < section.items.length - 1
                        ? "1px solid var(--color-border)"
                        : undefined,

                    backgroundColor: "var(--color-white)",
                  }}
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: "var(--color-surface)",

                      color: "var(--color-gray-strong)",
                    }}
                  >
                    <MenuIcon name={item.icon} />
                  </span>
                  <span
                    className="flex-1 text-body font-medium"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {item.label}
                    {item.action === "notifications" &&
                      unreadNotifications > 0 && (
                        <span
                          className="ml-2 text-label"
                          style={{ color: "var(--color-primary)" }}
                        >
                          {unreadNotifications > 99
                            ? "99+"
                            : unreadNotifications}{" "}
                          unread
                        </span>
                      )}
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-gray-soft)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          </section>
        ))}
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="w-full h-12 rounded-[12px] text-body font-semibold"
          style={{
            border: "1.5px solid var(--color-border)",

            color: "var(--color-gray)",

            backgroundColor: "var(--color-white)",
          }}
        >
          Log out
        </button>
      </div>
    </div>
  )
}
