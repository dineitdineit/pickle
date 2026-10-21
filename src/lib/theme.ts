import { Capacitor, registerPlugin } from "@capacitor/core"

interface AppearancePlugin {
  setTheme(options: { dark: boolean }): Promise<void>
}
const appearance = registerPlugin<AppearancePlugin>("Appearance")

export function readTheme(userId?: string): "Light" | "Dark" {
  try {
    if (userId) {
      const settings = JSON.parse(
        localStorage.getItem(`pickle:settings:${userId}`) ?? "null",
      )
      if (settings?.theme === "Light" || settings?.theme === "Dark")
        return settings.theme
    }
    return localStorage.getItem("pickle:theme") === "dark" ? "Dark" : "Light"
  } catch {
    return "Light"
  }
}

export function applyTheme(theme: "Light" | "Dark", userId?: string) {
  const dark = theme === "Dark"
  document.documentElement.dataset.theme = dark ? "dark" : "light"
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
  try {
    localStorage.setItem("pickle:theme", dark ? "dark" : "light")
    if (userId)
      localStorage.setItem(
        `pickle:settings:${userId}`,
        JSON.stringify({ theme }),
      )
  } catch {
    /* Theme changes still work when device storage is unavailable. */
  }
  if (Capacitor.getPlatform() === "android")
    void appearance.setTheme({ dark }).catch(() => {})
}
