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
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Contact Us", icon: "mail", action: "contact" },
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
  if (name === "settings")
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 512 512"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M 225 0 L 205 14 L 193 63 L 160 77 L 107 50 L 54 95 L 49 121 L 76 162 L 61 197 L 4 217 L 0 286 L 14 306 L 63 318 L 77 351 L 52 387 L 51 408 L 95 457 L 124 461 L 162 435 L 196 450 L 216 507 L 285 511 L 305 497 L 316 449 L 351 435 L 387 460 L 406 461 L 456 417 L 461 390 L 435 349 L 450 315 L 507 295 L 511 226 L 497 206 L 449 195 L 435 161 L 459 127 L 461 104 L 417 55 L 390 50 L 349 76 L 314 61 L 294 4 Z M 232 28 L 279 29 L 291 83 L 347 107 L 399 78 L 433 112 L 404 155 L 426 217 L 483 232 L 483 278 L 429 291 L 404 346 L 433 399 L 399 433 L 352 403 L 294 426 L 278 483 L 233 483 L 220 429 L 167 405 L 113 434 L 79 400 L 108 357 L 86 296 L 28 279 L 28 234 L 82 221 L 107 165 L 78 112 L 111 79 L 155 108 L 215 86 Z M 246 145 L 201 159 L 170 185 L 149 225 L 145 263 L 149 286 L 159 310 L 185 341 L 225 362 L 263 366 L 286 362 L 310 352 L 341 326 L 362 286 L 366 246 L 352 201 L 325 169 L 286 149 Z M 246 174 L 279 177 L 307 192 L 326 214 L 337 246 L 334 279 L 319 307 L 297 326 L 282 333 L 264 337 L 232 334 L 204 319 L 184 295 L 174 264 L 177 232 L 192 204 L 214 185 Z"
        />
      </svg>
    )
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
    useState<"contact" | "faq" | "settings" | "privacy" | "terms" | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState("")
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    () => {
      try {
        const stored = localStorage.getItem(`pickle:settings:${userId}`)
        return stored ? (JSON.parse(stored).notificationsEnabled ?? true) : true
      } catch {
        return true
      }
    },
  )
  const [theme, setTheme] = useState<"Light" | "Dark">(() => {
    try {
      const stored = localStorage.getItem(`pickle:settings:${userId}`)
      const value = stored ? JSON.parse(stored).theme : null
      if (value === "Dark" || value === "Light") return value
      return localStorage.getItem("pickle:theme") === "dark" ? "Dark" : "Light"
    } catch {
      return "Light"
    }
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

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
          console.error("Failed to load profile:", error)
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

  function saveSettings(
    nextNotifications: boolean,
    nextTheme: "Light" | "Dark",
  ) {
    localStorage.setItem(
      `pickle:settings:${userId}`,
      JSON.stringify({
        notificationsEnabled: nextNotifications,
        theme: nextTheme,
      }),
    )
  }

  function toggleNotifications() {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    saveSettings(next, theme)
  }

  function chooseTheme(nextTheme: "Light" | "Dark") {
    setTheme(nextTheme)
    saveSettings(notificationsEnabled, nextTheme)
    const dark = nextTheme === "Dark"
    localStorage.setItem("pickle:theme", dark ? "dark" : "light")
    document.documentElement.dataset.theme = dark ? "dark" : "light"
    document.documentElement.style.colorScheme = dark ? "dark" : "light"
  }

  useEffect(() => {
    const dark = theme === "Dark"
    localStorage.setItem("pickle:theme", dark ? "dark" : "light")
    document.documentElement.dataset.theme = dark ? "dark" : "light"
    document.documentElement.style.colorScheme = dark ? "dark" : "light"
  }, [theme])

  async function deleteAccount() {
    if (deletingAccount) return

    setDeletingAccount(true)
    setDeleteAccountError("")

    const { error } = await supabase.functions.invoke("delete-account", {
      body: {},
    })

    if (error) {
      console.error("Failed to delete account:", error)
      setDeleteAccountError("Could not delete your account. Please try again.")
      setDeletingAccount(false)
      return
    }

    localStorage.removeItem(`pickle:settings:${userId}`)
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
      console.error("Failed to load comment history:", error)
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
        console.error("Failed to load recipes for comments:", recipeError)
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
      console.error("Failed to delete comment:", error)
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

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg"
    const filePath = `${userId}/avatar-${Date.now()}.${extension}`
    const previousPath = avatarPathFromUrl(profile?.avatar_url ?? null)

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      })

    if (uploadError) {
      console.error("Failed to upload avatar:", uploadError)
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
      console.error("Failed to save avatar to profile:", profileError)
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
      if (deleteError)
        console.error("Failed to remove previous avatar:", deleteError)
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
            style={{ color: "#1F1F1F" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: "#1F1F1F" }}>
            Profile
          </h1>
        </div>
        <div
          className="px-4 py-20 text-center text-[14px]"
          style={{ color: "#6F6F6F" }}
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
            style={{ color: "#1F1F1F" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: "#1F1F1F" }}>
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

  if (supportScreen === "settings") {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-8">
          <button
            type="button"
            onClick={() => setSupportScreen(null)}
            aria-label="Back to profile"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "#1F1F1F" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: "#1F1F1F" }}>
            Settings
          </h1>
        </div>

        <div className="px-4 space-y-7">
          <section>
            <p
              className="text-[13px] font-semibold mb-2 px-1"
              style={{ color: "#8A8A8A" }}
            >
              Notifications
            </p>
            <div
              className="rounded-[16px] border px-4 py-4 flex items-center gap-4"
              style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
            >
              <div className="flex-1">
                <p
                  className="text-[15px] font-medium"
                  style={{ color: "#1F1F1F" }}
                >
                  Notifications
                </p>
                <p
                  className="text-[13px] leading-5 mt-1"
                  style={{ color: "#8A8A8A" }}
                >
                  Get updates about activity related to your Pickle account.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                onClick={toggleNotifications}
                className="relative w-[48px] h-[28px] rounded-full flex-shrink-0 transition-colors"
                style={{
                  backgroundColor: notificationsEnabled ? "#F26B21" : "#D9D9D9",
                }}
              >
                <span
                  className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-all"
                  style={{ left: notificationsEnabled ? 23 : 3 }}
                />
              </button>
            </div>
          </section>

          <section>
            <p
              className="text-[13px] font-semibold mb-2 px-1"
              style={{ color: "#8A8A8A" }}
            >
              Appearance
            </p>
            <div
              className="rounded-[16px] border p-1.5 flex gap-1.5"
              style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
            >
              {(["Light", "Dark"] as const).map((option) => {
                const selected = theme === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => chooseTheme(option)}
                    aria-pressed={selected}
                    className="flex-1 min-h-[46px] rounded-[11px] flex items-center justify-center gap-2 text-[14px] font-medium transition-colors"
                    style={{
                      backgroundColor: selected ? "#FFF0E6" : "transparent",
                      color: selected ? "#F26B21" : "#6F6F6F",
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
              className="text-[13px] font-semibold mb-2 px-1"
              style={{ color: "#8A8A8A" }}
            >
              Account
            </p>
            <div
              className="rounded-[16px] border overflow-hidden"
              style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
            >
              <button
                type="button"
                onClick={() => {
                  setDeleteAccountError("")
                  setDeleteConfirmOpen(true)
                }}
                className="w-full min-h-[58px] px-4 flex items-center gap-3 text-left"
              >
                <span className="flex-1">
                  <span
                    className="block text-[15px] font-medium"
                    style={{ color: "#C53D2E" }}
                  >
                    Delete account
                  </span>
                  <span
                    className="block text-[12px] leading-5 mt-0.5"
                    style={{ color: "#8A8A8A" }}
                  >
                    Permanently delete your Pickle account and activity.
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#C53D2E"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
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
              style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
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
                className="font-semibold text-[18px]"
                style={{ color: "#1F1F1F" }}
              >
                Delete your account?
              </h2>
              <p
                className="text-[14px] leading-6 mt-2"
                style={{ color: "#6F6F6F" }}
              >
                This permanently deletes your profile, saved recipes, likes,
                comments, and account. This action cannot be undone.
              </p>

              {deleteAccountError && (
                <p
                  className="text-[12px] leading-5 mt-3"
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
                  className="flex-1 h-11 rounded-[12px] border text-[14px] font-semibold disabled:opacity-50"
                  style={{
                    borderColor: "#E5E5E5",
                    color: "#6F6F6F",
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deletingAccount}
                  className="flex-1 h-11 rounded-[12px] text-[14px] font-semibold text-white disabled:opacity-50"
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
            style={{ color: "#1F1F1F" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: "#1F1F1F" }}>
            Contact Us
          </h1>
        </div>

        <div className="px-4 space-y-5">
          <section
            className="rounded-[18px] border p-5"
            style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#FFF0E6", color: "#F26B21" }}
            >
              <MenuIcon name="mail" />
            </div>
            <h2
              className="font-semibold text-[18px]"
              style={{ color: "#1F1F1F" }}
            >
              How can we help?
            </h2>
            <p
              className="text-[14px] leading-6 mt-2"
              style={{ color: "#6F6F6F" }}
            >
              Questions, recipe feedback, bug reports, and general suggestions
              are all welcome.
            </p>
          </section>

          <section
            className="rounded-[18px] border overflow-hidden"
            style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
          >
            <div
              className="px-5 py-4 border-b"
              style={{ borderColor: "#EAEAEA" }}
            >
              <p
                className="text-[12px] font-semibold"
                style={{ color: "#8A8A8A" }}
              >
                EMAIL
              </p>
              <p
                className="text-[15px] font-medium mt-1"
                style={{ color: "#1F1F1F" }}
              >
                support@pickle.app
              </p>
            </div>
            <div
              className="px-5 py-4 border-b"
              style={{ borderColor: "#EAEAEA" }}
            >
              <p
                className="text-[12px] font-semibold"
                style={{ color: "#8A8A8A" }}
              >
                RESPONSE TIME
              </p>
              <p
                className="text-[15px] font-medium mt-1"
                style={{ color: "#1F1F1F" }}
              >
                Usually within 2–3 business days
              </p>
            </div>
            <div className="px-5 py-4">
              <p
                className="text-[12px] font-semibold"
                style={{ color: "#8A8A8A" }}
              >
                SUPPORT HOURS
              </p>
              <p
                className="text-[15px] font-medium mt-1"
                style={{ color: "#1F1F1F" }}
              >
                Monday–Friday, 9:00 AM–6:00 PM
              </p>
            </div>
          </section>

          <p
            className="text-[12px] leading-5 px-1"
            style={{ color: "#A0A0A0" }}
          >
            Contact information on this preview screen is temporary and can be
            replaced before launch.
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
            style={{ color: "#1F1F1F" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: "#1F1F1F" }}>
            Privacy Policy
          </h1>
        </div>

        <div className="px-4">
          <p className="text-[12px] mb-5" style={{ color: "#A0A0A0" }}>
            Last updated: October 6, 2026
          </p>
          <p
            className="text-[14px] leading-6 mb-6"
            style={{ color: "#6F6F6F" }}
          >
            This Privacy Policy explains how Pickle handles information when you
            use the app and its related services.
          </p>

          <div className="space-y-6">
            {privacySections.map((section) => (
              <section key={section.title}>
                <h2
                  className="text-[16px] font-semibold mb-2"
                  style={{ color: "#1F1F1F" }}
                >
                  {section.title}
                </h2>
                <p
                  className="text-[14px] leading-6"
                  style={{ color: "#6F6F6F" }}
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
            style={{ color: "#1F1F1F" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: "#1F1F1F" }}>
            Terms of Service
          </h1>
        </div>

        <div className="px-4">
          <p className="text-[12px] mb-5" style={{ color: "#A0A0A0" }}>
            Last updated: October 6, 2026
          </p>
          <p
            className="text-[14px] leading-6 mb-6"
            style={{ color: "#6F6F6F" }}
          >
            These Terms of Service govern your access to and use of Pickle.
          </p>

          <div className="space-y-6">
            {termsSections.map((section) => (
              <section key={section.title}>
                <h2
                  className="text-[16px] font-semibold mb-2"
                  style={{ color: "#1F1F1F" }}
                >
                  {section.title}
                </h2>
                <p
                  className="text-[14px] leading-6"
                  style={{ color: "#6F6F6F" }}
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

  if (supportScreen === "faq") {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-8">
          <button
            type="button"
            onClick={() => setSupportScreen(null)}
            aria-label="Back to profile"
            className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center"
            style={{ color: "#1F1F1F" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: "#1F1F1F" }}>
            FAQ
          </h1>
        </div>

        <div className="px-4">
          <p
            className="text-[14px] leading-6 mb-5"
            style={{ color: "#6F6F6F" }}
          >
            Quick answers to common questions about using Pickle.
          </p>

          <div
            className="rounded-[18px] border overflow-hidden"
            style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
          >
            {faqs.map((faq, index) => (
              <details
                key={faq.question}
                className="group"
                style={{
                  borderBottom:
                    index < faqs.length - 1 ? "1px solid #EAEAEA" : undefined,
                }}
              >
                <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3">
                  <span
                    className="flex-1 text-[15px] font-semibold leading-5"
                    style={{ color: "#1F1F1F" }}
                  >
                    {faq.question}
                  </span>
                  <svg
                    className="transition-transform group-open:rotate-180 flex-shrink-0"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#8A8A8A"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <p
                  className="px-5 pb-4 text-[14px] leading-6"
                  style={{ color: "#6F6F6F" }}
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
            style={{ color: "#1F1F1F" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: "#1F1F1F" }}>
            My Comments
          </h1>
        </div>

        {commentsLoading ? (
          <div
            className="px-4 py-16 text-center text-[14px]"
            style={{ color: "#6F6F6F" }}
          >
            Loading comments…
          </div>
        ) : myComments.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div
              className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: "#FFF0E6", color: "#F26B21" }}
            >
              <MenuIcon name="comment" />
            </div>
            <p
              className="font-semibold text-[17px]"
              style={{ color: "#1F1F1F" }}
            >
              No comments yet
            </p>
            <p className="text-[14px] mt-1" style={{ color: "#6F6F6F" }}>
              Comments you leave on recipes will appear here.
            </p>
            {commentsMessage && (
              <p className="text-[12px] mt-3" style={{ color: "#C53D2E" }}>
                {commentsMessage}
              </p>
            )}
          </div>
        ) : (
          <div className="px-4 space-y-3">
            {commentsMessage && (
              <p className="text-[12px]" style={{ color: "#C53D2E" }}>
                {commentsMessage}
              </p>
            )}
            {myComments.map((comment) => {
              const recipe = commentRecipes.get(comment.recipe_id)
              return (
                <article
                  key={comment.id}
                  className="rounded-[16px] border p-3.5"
                  style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
                >
                  <div className="flex gap-3">
                    {recipe?.cover_image ? (
                      <img
                        src={recipeImageUrl(recipe.cover_image)}
                        alt={recipe.title}
                        className="w-14 h-14 rounded-[10px] object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-[10px] flex-shrink-0"
                        style={{ backgroundColor: "#F5F5F5" }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[13px] font-semibold truncate"
                        style={{ color: "#1F1F1F" }}
                      >
                        {recipe?.title || "Recipe"}
                      </p>
                      <p
                        className="text-[11px] mt-0.5"
                        style={{ color: "#A0A0A0" }}
                      >
                        {new Date(comment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <p
                    className="text-[14px] leading-5 mt-3 whitespace-pre-wrap break-words"
                    style={{ color: "#555555" }}
                  >
                    {comment.content}
                  </p>
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={() => deleteMyComment(comment.id)}
                      className="text-[12px]"
                      style={{ color: "#A0A0A0" }}
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
          style={{ color: "#1F1F1F" }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="font-bold text-[24px]" style={{ color: "#1F1F1F" }}>
          Profile
        </h1>
        <button
          type="button"
          onClick={() => setSupportScreen("settings")}
          aria-label="Open settings"
          className="absolute right-4 top-5 w-9 h-9 flex items-center justify-center"
          style={{ color: "#1F1F1F" }}
        >
          <MenuIcon name="settings" />
        </button>
      </div>

      <section
        className="px-4 pb-8 flex flex-col items-center"
        style={{ paddingTop: 50 }}
      >
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
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="w-[120px] h-[120px] rounded-full object-cover"
          />
        ) : (
          <div
            className="w-[120px] h-[120px] rounded-full flex items-center justify-center text-[36px] font-bold"
            style={{ backgroundColor: "#FFF0E6", color: "#F26B21" }}
          >
            {initial}
          </div>
        )}

        <button
          type="button"
          onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          className="mt-3 text-[13px] font-semibold disabled:opacity-60"
          style={{ color: "#F26B21" }}
        >
          {uploadingAvatar ? "Uploading…" : "Upload new photo"}
        </button>
        {avatarMessage && (
          <p
            className="text-[12px] mt-2 text-center"
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
          className="font-semibold text-[20px] mt-4"
          style={{ color: "#1F1F1F" }}
        >
          {loading ? "Loading…" : displayName}
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "#8A8A8A" }}>
          {loading ? "" : username}
        </p>
      </section>

      <div className="px-4 space-y-7">
        {MENU_SECTIONS.map((section) => (
          <section key={section.title}>
            <p
              className="text-[13px] font-semibold mb-2 px-1"
              style={{ color: "#8A8A8A" }}
            >
              {section.title}
            </p>
            <div
              className="rounded-[16px] border overflow-hidden"
              style={{ borderColor: "#EAEAEA" }}
            >
              {section.items.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={
                    item.action === "saved"
                      ? onOpenSaved
                      : item.action === "liked"
                        ? onOpenLiked
                        : item.action === "comments"
                          ? openMyComments
                          : item.action === "contact"
                            ? () => setSupportScreen("contact")
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
                        ? "1px solid #EAEAEA"
                        : undefined,
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "#F9F9F9", color: "#5F5F5F" }}
                  >
                    <MenuIcon name={item.icon} />
                  </span>
                  <span
                    className="flex-1 text-[15px] font-medium"
                    style={{ color: "#1F1F1F" }}
                  >
                    {item.label}
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#B0B0B0"
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
          className="w-full h-12 rounded-[12px] text-[15px] font-semibold"
          style={{
            border: "1.5px solid #E5E5E5",
            color: "#6F6F6F",
            backgroundColor: "#FFFFFF",
          }}
        >
          Log out
        </button>
      </div>
    </div>
  )
}
