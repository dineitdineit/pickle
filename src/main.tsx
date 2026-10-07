import React, { lazy, Suspense } from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import AuthScreen from "./AuthScreen"
import "./index.css"
import "./desktop.css"

const AdminDashboard = lazy(() => import("./AdminDashboard"))

const isAdminPath =
  window.location.pathname === "/admin" ||
  window.location.pathname.startsWith("/admin/")
const initialTheme = isAdminPath
  ? "light"
  : localStorage.getItem("pickle:theme") === "dark"
    ? "dark"
    : "light"
document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

function finishPasswordRecovery() {
  const url = new URL(window.location.href)
  url.searchParams.delete("reset")
  url.hash = ""
  window.location.replace(`${url.pathname}${url.search}`)
}

function Root() {
  const isPasswordRecovery =
    new URLSearchParams(window.location.search).get("reset") === "1"

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
        <AdminDashboard />
      </Suspense>
    )
  }

  if (isPasswordRecovery) {
    return (
      <div className="bg-white min-h-screen max-w-md mx-auto relative">
        <AuthScreen
          recoveryMode
          onBack={finishPasswordRecovery}
          onRecoveryComplete={finishPasswordRecovery}
        />
      </div>
    )
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
