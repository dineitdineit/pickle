import React, { lazy, Suspense, useSyncExternalStore } from "react"
import {
  isAndroidApp,
  nativeSnapshot,
  subscribeNative,
  startNativeLinks,
  finishNativeRecovery,
  clearNativeNotice,
} from "./lib/nativeAuth"
import { startAndroidBack } from "./lib/nativeNavigation"
import { parseAppLink } from "./lib/appLinks"
import { applyTheme, readTheme } from "./lib/theme"

import ReactDOM from "react-dom/client"

import App from "./App"

import AccountAgeGate from "./AccountAgeGate"

import DeletionReceiptNotice from "./DeletionReceiptNotice"

import AuthScreen from "./AuthScreen"

import "@fontsource/inter/latin-400.css"

import "@fontsource/inter/latin-500.css"

import "@fontsource/inter/latin-600.css"

import "@fontsource/inter/latin-700.css"

import "./index.css"

import "./desktop.css"

const AdminDashboard = lazy(() => import("./AdminDashboard"))
const websiteLink =
  !isAndroidApp && /Android/i.test(navigator.userAgent)
    ? parseAppLink(window.location.href)
    : null
const openInApp =
  websiteLink && websiteLink.kind !== "auth"
    ? `com.getpickleapp.pickle://open?${websiteLink.kind}=${websiteLink.id}`
    : null

const isAdminPath =
  window.location.pathname === "/admin" ||
  window.location.pathname.startsWith("/admin/")

if (isAdminPath) {
  document.documentElement.dataset.theme = "light"
  document.documentElement.style.colorScheme = "light"
} else applyTheme(readTheme())

function finishPasswordRecovery() {
  const url = new URL(window.location.href)

  url.searchParams.delete("reset")

  url.hash = ""

  window.location.replace(`${url.pathname}${url.search}`)
}

function LinkNotice({ message }: { message: string }) {
  if (!message) return null
  return (
    <div role="status" className="app-link-notice">
      <p>{message}</p>
      <button
        type="button"
        onClick={clearNativeNotice}
        aria-label="Dismiss link notice"
      >
        ×
      </button>
    </div>
  )
}

function Root() {
  const native = useSyncExternalStore(subscribeNative, nativeSnapshot)
  const isPasswordRecovery = isAndroidApp
    ? native.recovery
    : new URLSearchParams(window.location.search).get("reset") === "1"

  if (!native.ready)
    return (
      <div
        role="status"
        className="min-h-screen flex items-center justify-center"
      >
        Opening Pickle…
      </div>
    )

  if (isAdminPath) {
    return (
      <Suspense
        fallback={
          <div
            role="status"
            className="min-h-screen flex items-center justify-center"
          >
            Loading admin…
          </div>
        }
      >
        <AccountAgeGate>
          <AdminDashboard />
        </AccountAgeGate>
      </Suspense>
    )
  }

  if (isPasswordRecovery) {
    return (
      <div className="bg-white min-h-screen max-w-md mx-auto relative">
        <LinkNotice message={native.notice} />
        <AuthScreen
          recoveryMode
          verifiedNativeRecovery={isAndroidApp && native.recovery}
          onBack={() => {
            if (isAndroidApp) void finishNativeRecovery(true)
            else finishPasswordRecovery()
          }}
          onRecoveryComplete={() => {
            if (isAndroidApp) void finishNativeRecovery()
            else finishPasswordRecovery()
          }}
        />
      </div>
    )
  }

  return (
    <>
      {openInApp && (
        <div className="app-open-link">
          <a href={openInApp}>Open in Pickle</a>
        </div>
      )}
      <LinkNotice message={native.notice} />
      <AccountAgeGate>
        <DeletionReceiptNotice />
        <App />
      </AccountAgeGate>
    </>
  )
}

startNativeLinks()
startAndroidBack()
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
