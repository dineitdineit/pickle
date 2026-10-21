import { useEffect, useRef, useState } from "react"
import BackIcon from "./BackIcon"
import AndroidPushSettings from "./AndroidPushSettings"
import { supabase } from "./lib/supabase"
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "./lib/notificationPreferences"
import "./social.css"

const options: {
  key: keyof NotificationPreferences
  title: string
  description: string
}[] = [
  {
    key: "enabled",
    title: "Activity notifications",
    description: "Receive new activity notifications in Pickle.",
  },
  {
    key: "follows",
    title: "New followers",
    description: "When someone follows you.",
  },
  {
    key: "comments",
    title: "Comments & photo feedback",
    description:
      "Comments on your recipes and posts, and posts tagging your recipes.",
  },
  {
    key: "replies",
    title: "Comment replies",
    description: "Replies to your comments on recipes and posts.",
  },
  {
    key: "recipes",
    title: "New recipes",
    description: "From cooks whose recipe alerts you’ve turned on.",
  },
]
export default function NotificationSettingsScreen({
  userId,
  onBack,
}: {
  userId: string
  onBack: () => void
}) {
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  const guard = useRef(false)
  useEffect(() => {
    const current = ++generation.current
    setPreferences(null)
    setError("")
    void loadNotificationPreferences(supabase, userId)
      .then((value) => {
        if (generation.current === current) setPreferences(value)
      })
      .catch(() => {
        if (generation.current === current)
          setError("Could not load notification settings. Please retry.")
      })
    return () => {
      generation.current++
    }
  }, [userId, retry])
  async function toggle(key: keyof NotificationPreferences) {
    if (!preferences || guard.current) return
    guard.current = true
    setBusy(true)
    setError("")
    const current = generation.current
    try {
      const confirmed = await saveNotificationPreferences(supabase, userId, {
        ...preferences,
        [key]: !preferences[key],
      })
      if (generation.current === current) setPreferences(confirmed)
    } catch {
      if (generation.current === current)
        setError("Could not save notification settings. Please try again.")
    } finally {
      guard.current = false
      if (generation.current === current) setBusy(false)
    }
  }
  return (
    <div className="social-screen notification-settings-screen">
      <header className="social-heading">
        <button
          type="button"
          className="notification-icon-button"
          aria-label="Back to notifications"
          onClick={onBack}
        >
          <BackIcon />
        </button>
        <h1>Notification settings</h1>
      </header>
      <AndroidPushSettings key={userId} userId={userId} />
      {error && (
        <div className="social-message" role="alert">
          <p>{error}</p>
          {!preferences && (
            <button
              type="button"
              className="social-link"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {!preferences && !error && (
        <p className="social-empty" role="status">
          Loading settings…
        </p>
      )}
      {preferences && (
        <>
          <p className="notification-settings-intro">
            Choose which activity reaches your inbox. Settings apply across your
            devices to new notifications.
          </p>
          <div className="notification-settings-options">
            {options.map((option) => (
              <div key={option.key} className="notification-setting-row">
                <div>
                  <label id={`notification-setting-${option.key}`}>
                    {option.title}
                  </label>
                  <p>{option.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-labelledby={`notification-setting-${option.key}`}
                  aria-checked={preferences[option.key]}
                  disabled={
                    busy || (option.key !== "enabled" && !preferences.enabled)
                  }
                  onClick={() => void toggle(option.key)}
                  className="notification-setting-switch"
                >
                  <span />
                </button>
              </div>
            ))}
          </div>
          <p className="notification-settings-note">
            Safety and moderation notices stay on. Existing notifications remain
            in your inbox. These settings control in-app activity, not email or
            phone push notifications.
          </p>
          <p className="notification-settings-note">
            To change alerts for one cook, use the bell on their profile.
          </p>
          {busy && (
            <p className="notification-settings-note" role="status">
              Saving…
            </p>
          )}
        </>
      )}
    </div>
  )
}
