import { Capacitor } from "@capacitor/core"
import { App as NativeApp } from "@capacitor/app"
import { Browser } from "@capacitor/browser"
import { supabase } from "./supabase"
import { parseAppLink, NATIVE_CALLBACK, NATIVE_RECOVERY } from "./appLinks"
import type { ContentLink } from "./appLinks"

export const isAndroidApp = Capacitor.getPlatform() === "android"
const intentKey = "pickle:native-auth-intent"
const recoveryKey = "pickle:native-recovery"
type AuthIntent = "oauth" | "recovery" | "confirmation"
type NativeState = {
  ready: boolean
  recovery: boolean
  notice: string
  content: ContentLink | null
}
let state: NativeState = {
  ready: !isAndroidApp,
  recovery: false,
  notice: "",
  content: null,
}
const subscribers = new Set<() => void>()
export const nativeSnapshot = () => state
export const subscribeNative = (fn: () => void) => {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}
function update(patch: Partial<NativeState>) {
  state = { ...state, ...patch }
  subscribers.forEach((fn) => fn())
}
export function clearNativeNotice() {
  update({ notice: "" })
}
export function takeNativeContent() {
  const link = state.content
  if (link) update({ content: null })
  return link
}
export function beginNativeAuth(kind: AuthIntent) {
  if (!isAndroidApp) return true
  try {
    localStorage.setItem(
      intentKey,
      JSON.stringify({ kind, startedAt: Date.now() }),
    )
    return true
  } catch {
    return false
  }
}
function pendingIntent(): AuthIntent | null {
  try {
    const value = JSON.parse(localStorage.getItem(intentKey) ?? "null")
    const age = Date.now() - value?.startedAt
    const valid =
      age >= 0 &&
      age < 60 * 60 * 1000 &&
      ["oauth", "recovery", "confirmation"].includes(value?.kind)
    if (!valid) localStorage.removeItem(intentKey)
    return valid ? value.kind : null
  } catch {
    return null
  }
}
export function authRedirect(recovery = false) {
  return isAndroidApp
    ? recovery
      ? NATIVE_RECOVERY
      : NATIVE_CALLBACK
    : `https://getpickleapp.com/${recovery ? "?reset=1" : ""}`
}
export async function signInNative(provider: "google" | "apple") {
  if (!beginNativeAuth("oauth")) throw new Error("App storage is unavailable.")
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: authRedirect(), skipBrowserRedirect: true },
  })
  if (error || !data.url) {
    localStorage.removeItem(intentKey)
    throw new Error("Unable to start sign in. Please try again.")
  }
  try {
    await Browser.open({ url: data.url })
  } catch {
    localStorage.removeItem(intentKey)
    throw new Error("Unable to open the sign-in browser. Please try again.")
  }
}
export async function finishNativeRecovery(cancel = false) {
  // Cancelling recovery must not leave the reset-link session signed in.
  if (cancel) {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })
      if (error) throw error
    } catch {
      update({
        notice: "Unable to sign out. Check your connection and try Back again.",
      })
      return
    }
  }
  localStorage.removeItem(recoveryKey)
  update({ recovery: false, notice: "" })
}
let serial = Promise.resolve()
const seenCodes = new Set<string>()
export async function handleNativeUrl(value: string) {
  const link = parseAppLink(value)
  if (!link) return
  if (link.kind !== "auth") {
    update({ content: link })
    return
  }
  if (link.code && seenCodes.has(link.code)) return
  if (link.code) {
    seenCodes.add(link.code)
    if (seenCodes.size > 20) seenCodes.delete(seenCodes.values().next().value!)
  }
  const intent = pendingIntent()
  // PKCE binds the exchange to this installation; the intent also binds its purpose.
  if (
    !intent ||
    (link.recovery ? intent !== "recovery" : intent === "recovery")
  ) {
    update({
      notice:
        "Start sign in or request a new reset email in this app, then open its link on this device.",
    })
    return
  }
  localStorage.removeItem(intentKey)
  try {
    await Browser.close()
  } catch {
    /* May already be closed or opened by the email app. */
  }
  if (link.denied || !link.code) {
    update({
      notice:
        "Sign in was cancelled or the link has expired. Please try again.",
    })
    return
  }
  let recovered = false
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) recovered = true
  })
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      link.code,
      link.flowId ? { flowId: link.flowId } : undefined,
    )
    if (error || !data.session) throw new Error("exchange")
    if (recovered !== link.recovery) {
      await supabase.auth.signOut({ scope: "local" })
      throw new Error("purpose")
    }
    if (recovered) {
      // Non-secret marker only; Supabase owns session/token storage.
      try {
        localStorage.setItem(
          recoveryKey,
          JSON.stringify({
            owner: data.session.user.id,
            startedAt: Date.now(),
          }),
        )
      } catch {
        /* Recovery remains usable for this process without a resume marker. */
      }
    } else localStorage.removeItem(recoveryKey)
    update({ recovery: recovered, notice: "" })
  } catch {
    update({
      notice:
        "This link could not be verified. Check your connection, then restart sign in or request a new reset email in this app.",
    })
  } finally {
    subscription.unsubscribe()
  }
}
let started = false
export function startNativeLinks() {
  if (started || !isAndroidApp) return
  started = true
  const enqueue = (url: string) => {
    serial = serial
      .then(() => handleNativeUrl(url))
      .catch(() =>
        update({ notice: "Unable to open this link. Please try again." }),
      )
    return serial
  }
  void (async () => {
    try {
      supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          localStorage.removeItem(intentKey)
          localStorage.removeItem(recoveryKey)
          update({ recovery: false })
        } else if (event === "SIGNED_IN") {
          localStorage.removeItem(recoveryKey)
          update({ recovery: false })
        }
      })
      pendingIntent()
      const { data } = await supabase.auth.getSession()
      try {
        const marker = JSON.parse(localStorage.getItem(recoveryKey) ?? "null")
        const age = Date.now() - marker?.startedAt
        if (
          data.session &&
          marker?.owner === data.session.user.id &&
          age >= 0 &&
          age < 60 * 60 * 1000
        )
          update({ recovery: true })
        else localStorage.removeItem(recoveryKey)
      } catch {
        localStorage.removeItem(recoveryKey)
      }
      await NativeApp.addListener("appUrlOpen", ({ url }) => {
        void enqueue(url)
      })
      const launch = await NativeApp.getLaunchUrl()
      if (launch?.url) await enqueue(launch.url)
    } catch {
      update({ notice: "App links are unavailable. Please restart Pickle." })
    } finally {
      update({ ready: true })
    }
  })()
}
