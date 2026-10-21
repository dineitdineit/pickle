import PickleLogo from "./PickleLogo"
import BackIcon from "./BackIcon"
import { isEligibleBirthday } from "./lib/age"
import { privacySections, termsSections } from "./profileContent"
import { FormEvent, useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
import {
  authRedirect,
  beginNativeAuth,
  isAndroidApp,
  signInNative,
} from "./lib/nativeAuth"
import { Browser } from "@capacitor/browser"
import { useAndroidBack } from "./lib/nativeNavigation"

type Mode = "signin" | "signup" | "forgot" | "update"

type SocialProvider = "google" | "apple"

type AuthScreenProps = {
  onBack: () => void

  recoveryMode?: boolean
  verifiedNativeRecovery?: boolean

  onRecoveryComplete?: () => void
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.3 2.99-7.38Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.61-2.39l-3.23-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.13H3.08v2.59A9.99 9.99 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.93A6.02 6.02 0 0 1 6.1 12c0-.67.11-1.32.31-1.93V7.48H3.08A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.52l3.33-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.94c1.47 0 2.79.5 3.83 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a9.99 9.99 0 0 0-8.92 5.48l3.33 2.59C7.2 7.7 9.4 5.94 12 5.94Z"
      />
    </svg>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back to log in"
      className="w-9 h-9 flex items-center justify-center mb-8"
      style={{ color: "var(--color-ink)" }}
    >
      <BackIcon />
    </button>
  )
}

export default function AuthScreen({
  onBack,

  recoveryMode = false,
  verifiedNativeRecovery = false,

  onRecoveryComplete,
}: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>(recoveryMode ? "update" : "signin")

  const [email, setEmail] = useState("")

  const [password, setPassword] = useState("")

  const [confirmPassword, setConfirmPassword] = useState("")

  const [username, setUsername] = useState("")

  const [displayName, setDisplayName] = useState("")

  const [birthday, setBirthday] = useState("")

  const [loading, setLoading] = useState(false)

  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(
    null,
  )

  const [message, setMessage] = useState("")

  const [errorMessage, setErrorMessage] = useState("")

  const [recoveryReady, setRecoveryReady] = useState(!recoveryMode)

  const [confirmationSent, setConfirmationSent] = useState(false)

  const [resendLoading, setResendLoading] = useState(false)

  const [resendCooldown, setResendCooldown] = useState(0)

  useAndroidBack(() => {
    if (loading || resendLoading) return true
    if (mode === "update") onBack()
    else if (mode !== "signin") changeMode("signin")
    else onBack()
    return true
  }, 100)

  useEffect(() => {
    if (resendCooldown <= 0) return

    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [resendCooldown])

  useEffect(() => {
    if (!recoveryMode) return

    setMode("update")
    if (isAndroidApp) {
      setRecoveryReady(verifiedNativeRecovery)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) setRecoveryReady(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setRecoveryReady(true)
      }
    })

    return () => {
      mounted = false

      subscription.unsubscribe()
    }
  }, [recoveryMode, verifiedNativeRecovery])

  useEffect(() => {
    if (!isAndroidApp) return
    let disposed = false
    const listener = Browser.addListener("browserFinished", () =>
      setSocialLoading(null),
    )
    void listener
      .then((handle) => {
        if (disposed) void handle.remove()
      })
      .catch(() => {})
    return () => {
      disposed = true
      void listener.then((handle) => handle.remove()).catch(() => {})
    }
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    setLoading(true)

    setMessage("")

    setErrorMessage("")

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),

        password,
      })

      if (error) setErrorMessage(error.message)

      setLoading(false)

      return
    }

    if (mode === "forgot") {
      if (!email.trim()) {
        setErrorMessage("Please enter your email address.")

        setLoading(false)

        return
      }

      if (!beginNativeAuth("recovery")) {
        setErrorMessage(
          "App storage is unavailable. Restart Pickle and try again.",
        )
        setLoading(false)
        return
      }
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),

        {
          redirectTo: authRedirect(true),
        },
      )

      if (error) setErrorMessage(error.message)
      else
        setMessage(
          isAndroidApp
            ? "Password reset email sent. Open the link on this device to return to Pickle."
            : "Password reset email sent. Check your inbox and open the reset link.",
        )

      setLoading(false)

      return
    }

    if (mode === "update") {
      if (!recoveryReady) {
        setErrorMessage(
          "This reset link is still being verified. Please wait a moment and try again.",
        )

        setLoading(false)

        return
      }

      if (password.length < 6) {
        setErrorMessage("Password must be at least 6 characters.")

        setLoading(false)

        return
      }

      if (password !== confirmPassword) {
        setErrorMessage("Passwords do not match.")

        setLoading(false)

        return
      }

      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setErrorMessage(error.message)
      } else {
        setMessage("Password updated successfully.")

        window.setTimeout(() => onRecoveryComplete?.(), 700)
      }

      setLoading(false)

      return
    }

    if (!isEligibleBirthday(birthday)) {
      setErrorMessage("Pickle accounts are for people aged 13 and over.")

      setLoading(false)

      return
    }

    const cleanUsername = username.trim()

    const cleanDisplayName = displayName.trim()

    if (!cleanUsername || !cleanDisplayName) {
      setErrorMessage("Please enter a username and display name.")

      setLoading(false)

      return
    }

    if (!beginNativeAuth("confirmation")) {
      setErrorMessage(
        "App storage is unavailable. Restart Pickle and try again.",
      )
      setLoading(false)
      return
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),

      password,

      options: {
        emailRedirectTo: authRedirect(),

        data: {
          username: cleanUsername,

          display_name: cleanDisplayName,
        },
      },
    })

    if (error) {
      setErrorMessage(error.message)
    } else if (!data.session) {
      setConfirmationSent(true)

      setResendCooldown(60)

      setMessage(
        "Account created. Check your email to confirm your account, then sign in.",
      )
    }

    setLoading(false)
  }

  async function handleResendConfirmation() {
    const cleanEmail = email.trim()

    if (!cleanEmail || resendLoading || resendCooldown > 0) return

    setResendLoading(true)

    setMessage("")

    setErrorMessage("")

    if (!beginNativeAuth("confirmation")) {
      setErrorMessage(
        "App storage is unavailable. Restart Pickle and try again.",
      )
      setResendLoading(false)
      return
    }
    const { error } = await supabase.auth.resend({
      type: "signup",

      email: cleanEmail,

      options: {
        emailRedirectTo: authRedirect(),
      },
    })

    if (error) {
      const rateLimited = error.message.toLowerCase().includes("rate limit")

      setErrorMessage(
        rateLimited
          ? "Too many confirmation emails were requested. Please wait a while before trying again."
          : error.message,
      )
    } else {
      setMessage(
        "Confirmation email sent again. Check your inbox and spam folder.",
      )

      setResendCooldown(60)
    }

    setResendLoading(false)
  }

  async function handleSocialAuth(provider: SocialProvider) {
    setSocialLoading(provider)

    setMessage("")

    setErrorMessage("")

    if (isAndroidApp) {
      try {
        await signInNative(provider)
      } catch {
        setErrorMessage("Unable to start sign in. Please try again.")
      } finally {
        setSocialLoading(null)
      }
      return
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,

      options: { redirectTo: authRedirect() },
    })

    if (error) {
      setErrorMessage(error.message)

      setSocialLoading(null)
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode)

    setPassword("")

    setConfirmPassword("")

    setBirthday("")

    setMessage("")

    setErrorMessage("")

    setConfirmationSent(false)

    setResendCooldown(0)
  }

  const socialButtons = (
    <div className="space-y-3">
      <div className="flex items-center gap-3 py-1">
        <div
          className="h-px flex-1"
          style={{ backgroundColor: "var(--color-border)" }}
        />
        <span
          className="text-label"
          style={{ color: "var(--color-gray-soft)" }}
        >
          or continue with
        </span>
        <div
          className="h-px flex-1"
          style={{ backgroundColor: "var(--color-border)" }}
        />
      </div>
      <button
        type="button"
        onClick={() => handleSocialAuth("google")}
        disabled={Boolean(socialLoading)}
        className="w-full h-12 rounded-[8px] border flex items-center justify-center gap-3 text-body font-semibold disabled:opacity-60"
        style={{
          borderColor: "var(--color-border)",

          backgroundColor: "var(--color-white)",

          color: "var(--color-ink)",
        }}
      >
        <GoogleIcon />
        {socialLoading === "google" ? "Connecting…" : "Continue with Google"}
      </button>
      <p className="text-label">
        Apple sign-in is coming later. Pickle accounts are for ages 13 and over.
      </p>
    </div>
  )

  if (mode === "forgot") {
    return (
      <div className="pb-28">
        <div className="px-6 pt-[72px]">
          <BackButton onClick={() => changeMode("signin")} />
          <div className="flex justify-center mb-6">
            <PickleLogo size={28} iconSize={88} stacked />
          </div>
          <div className="text-center mb-7">
            <h1
              className="font-bold text-page"
              style={{ color: "var(--color-ink)" }}
            >
              Reset your password
            </h1>
            <p
              className="text-body mt-2"
              style={{ color: "var(--color-gray)" }}
            >
              Enter your email and we'll send you a reset link.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-body font-semibold mb-2"
                style={{ color: "var(--color-gray-strong)" }}
              >
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-4 rounded-[12px] border outline-none text-body"
                style={{
                  borderColor: "var(--color-border)",

                  backgroundColor: "var(--color-surface)",

                  color: "var(--color-ink)",
                }}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
              />
            </div>
            {errorMessage && (
              <p className="text-body leading-5" style={{ color: "#C53D2E" }}>
                {errorMessage}
              </p>
            )}
            {message && (
              <p className="text-body leading-5" style={{ color: "#5F6F52" }}>
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-[8px] text-white text-body font-semibold disabled:opacity-60"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (mode === "update") {
    return (
      <div className="pb-28">
        <div className="px-6 pt-[72px]">
          <BackButton
            onClick={() => {
              if (!loading) onBack()
            }}
          />
          <div className="flex justify-center mb-6">
            <PickleLogo size={28} iconSize={88} stacked />
          </div>
          <div className="text-center mb-7">
            <h1
              className="font-bold text-page"
              style={{ color: "var(--color-ink)" }}
            >
              Choose a new password
            </h1>
            <p
              className="text-body mt-2"
              style={{ color: "var(--color-gray)" }}
            >
              {recoveryReady
                ? "Enter and confirm your new password."
                : "Verifying your reset link…"}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-body font-semibold mb-2"
                style={{ color: "var(--color-gray-strong)" }}
              >
                New password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 px-4 rounded-[12px] border outline-none text-body"
                style={{
                  borderColor: "var(--color-border)",

                  backgroundColor: "var(--color-surface)",

                  color: "var(--color-ink)",
                }}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label
                className="block text-body font-semibold mb-2"
                style={{ color: "var(--color-gray-strong)" }}
              >
                Confirm new password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-12 px-4 rounded-[12px] border outline-none text-body"
                style={{
                  borderColor: "var(--color-border)",

                  backgroundColor: "var(--color-surface)",

                  color: "var(--color-ink)",
                }}
                placeholder="Enter it again"
                autoComplete="new-password"
              />
            </div>
            {errorMessage && (
              <p className="text-body leading-5" style={{ color: "#C53D2E" }}>
                {errorMessage}
              </p>
            )}
            {message && (
              <p className="text-body leading-5" style={{ color: "#5F6F52" }}>
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !recoveryReady}
              className="w-full h-12 rounded-[8px] text-white text-body font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (mode === "signup") {
    return (
      <div className="pb-28">
        <div className="px-6 pt-[72px]">
          <BackButton onClick={() => changeMode("signin")} />
          <div className="flex justify-center mb-6">
            <PickleLogo size={28} iconSize={88} stacked />
          </div>
          <div className="text-center mb-7">
            <h1
              className="font-bold text-page"
              style={{ color: "var(--color-ink)" }}
            >
              Create your account
            </h1>
            <p
              className="text-body mt-2"
              style={{ color: "var(--color-gray)" }}
            >
              Save recipes and build your own Pickle profile.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-body font-semibold">
              Date of birth
              <input
                type="date"
                required
                value={birthday}
                onChange={(event) => setBirthday(event.target.value)}
                className="block w-full border rounded-lg p-3 mt-2"
              />
            </label>
            <p className="text-label">
              Accounts are for ages 13 and over. At age 13, a parent or legal
              guardian must complete a consent review before account activation.
              We do not store your birth date. After signing in, confirm your
              eligibility to activate account features.
            </p>
            <details>
              <summary>Privacy Policy</summary>
              {privacySections.map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  <p>{section.body}</p>
                </section>
              ))}
            </details>
            <details>
              <summary>Terms of Service</summary>
              {termsSections.map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  <p>{section.body}</p>
                </section>
              ))}
            </details>

            <div>
              <label
                className="block text-body font-semibold mb-2"
                style={{ color: "var(--color-gray-strong)" }}
              >
                Display name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-12 px-4 rounded-[12px] border outline-none text-body"
                style={{
                  borderColor: "var(--color-border)",

                  backgroundColor: "var(--color-surface)",

                  color: "var(--color-ink)",
                }}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
            <div>
              <label
                className="block text-body font-semibold mb-2"
                style={{ color: "var(--color-gray-strong)" }}
              >
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                className="w-full h-12 px-4 rounded-[12px] border outline-none text-body"
                style={{
                  borderColor: "var(--color-border)",

                  backgroundColor: "var(--color-surface)",

                  color: "var(--color-ink)",
                }}
                placeholder="picklefan"
                autoCapitalize="none"
                autoComplete="username"
              />
            </div>
            <div>
              <label
                className="block text-body font-semibold mb-2"
                style={{ color: "var(--color-gray-strong)" }}
              >
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-4 rounded-[12px] border outline-none text-body"
                style={{
                  borderColor: "var(--color-border)",

                  backgroundColor: "var(--color-surface)",

                  color: "var(--color-ink)",
                }}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
              />
            </div>
            <div>
              <label
                className="block text-body font-semibold mb-2"
                style={{ color: "var(--color-gray-strong)" }}
              >
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 px-4 rounded-[12px] border outline-none text-body"
                style={{
                  borderColor: "var(--color-border)",

                  backgroundColor: "var(--color-surface)",

                  color: "var(--color-ink)",
                }}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            {errorMessage && (
              <p className="text-body leading-5" style={{ color: "#C53D2E" }}>
                {errorMessage}
              </p>
            )}
            {message && (
              <p className="text-body leading-5" style={{ color: "#5F6F52" }}>
                {message}
              </p>
            )}
            {confirmationSent && (
              <div
                className="rounded-[12px] px-4 py-3 text-center"
                style={{ backgroundColor: "var(--color-primary-faint)" }}
              >
                <p
                  className="text-label"
                  style={{ color: "var(--color-gray)" }}
                >
                  Didn't get your email?{" "}
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resendLoading || resendCooldown > 0}
                    className="font-semibold disabled:opacity-50"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {resendLoading
                      ? "Sending…"
                      : resendCooldown > 0
                        ? `Resend in ${resendCooldown}s`
                        : "Resend"}
                  </button>
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || Boolean(socialLoading) || confirmationSent}
              className="w-full h-12 rounded-[8px] text-white text-body font-semibold disabled:opacity-60"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {loading
                ? "Please wait…"
                : confirmationSent
                  ? "Check your email"
                  : "Create account"}
            </button>
            {!confirmationSent && socialButtons}
            <div className="text-center">
              <button
                type="button"
                onClick={() => changeMode("signin")}
                className="text-label font-normal"
                style={{ color: "var(--color-gray-soft)" }}
              >
                Already have an account? Log in
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-28">
      <div className="mobile-back-row px-4 pt-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-9 h-9 flex items-center justify-center"
          style={{ color: "var(--color-ink)" }}
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
      </div>
      <div className="px-6 pt-[25px]">
        <div className="flex justify-center mb-6">
          <PickleLogo size={28} iconSize={88} stacked />
        </div>
        <div className="text-center mb-7">
          <h1
            className="font-bold text-page"
            style={{ color: "var(--color-ink)" }}
          >
            Welcome back
          </h1>
          <p className="text-body mt-2" style={{ color: "var(--color-gray)" }}>
            Sign in to keep your Pickle activity with you.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="auth-field-label block text-body font-semibold mb-2"
              style={{ color: "var(--color-gray-strong)" }}
            >
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-field-input w-full h-12 px-4 rounded-[12px] border outline-none text-body"
              style={{
                borderColor: "var(--color-border)",

                backgroundColor: "var(--color-surface)",

                color: "var(--color-ink)",
              }}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
            />
          </div>
          <div>
            <label
              className="auth-field-label block text-body font-semibold mb-2"
              style={{ color: "var(--color-gray-strong)" }}
            >
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-field-input w-full h-12 px-4 rounded-[12px] border outline-none text-body"
              style={{
                borderColor: "var(--color-border)",

                backgroundColor: "var(--color-surface)",

                color: "var(--color-ink)",
              }}
              placeholder="At least 6 characters"
              autoComplete="current-password"
            />
          </div>
          {errorMessage && (
            <p className="text-body leading-5" style={{ color: "#C53D2E" }}>
              {errorMessage}
            </p>
          )}
          {message && (
            <p className="text-body leading-5" style={{ color: "#5F6F52" }}>
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || Boolean(socialLoading)}
            className="w-full h-12 rounded-[8px] text-white text-body font-semibold disabled:opacity-60"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {loading ? "Please wait…" : "Log in"}
          </button>
          {socialButtons}
          <div className="flex items-center justify-center gap-3 text-label">
            <button
              type="button"
              onClick={() => changeMode("signup")}
              className="font-normal"
              style={{ color: "var(--color-gray-soft)" }}
            >
              Sign up
            </button>
            <span style={{ color: "var(--color-gray-faint)" }}>·</span>
            <button
              type="button"
              onClick={() => changeMode("forgot")}
              className="font-normal"
              style={{ color: "var(--color-gray-soft)" }}
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
