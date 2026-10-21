import { Capacitor } from "@capacitor/core"
import { App as NativeApp } from "@capacitor/app"
import { useEffect, useRef } from "react"

interface Handler {
  priority: number
  run: () => boolean
}
const handlers = new Set<Handler>()
export function registerAndroidBack(run: () => boolean, priority = 0) {
  const handler = { run, priority }
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}
export function useAndroidBack(run: () => boolean, priority = 0) {
  const latest = useRef(run)
  latest.current = run
  useEffect(
    () => registerAndroidBack(() => latest.current(), priority),
    [priority],
  )
}
export function dispatchAndroidBack() {
  // Cancel only the top modal, respecting busy dialogs that prevent cancellation.
  const focusedModal =
    document.activeElement?.closest<HTMLDialogElement>("dialog[open]")
  const modal =
    focusedModal ??
    [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1)
  if (modal) {
    if (modal.dispatchEvent(new Event("cancel", { cancelable: true })))
      modal.close()
    return
  }
  for (const handler of [...handlers].sort((a, b) => b.priority - a.priority)) {
    if (handler.priority < 0) continue
    if (handler.run()) return
  }
  // Reuse the visible screen's Back action, including nested profiles/settings.
  const buttons = [
    ...document.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
  ]
  const back = buttons
    .reverse()
    .find(
      (button) =>
        /^(Back($| to )|Go back$)/i.test(
          button.getAttribute("aria-label") ?? "",
        ) &&
        !button.disabled &&
        !button.closest("[hidden], [inert], [aria-hidden='true']") &&
        button.getClientRects().length > 0,
    )
  if (back) {
    back.click()
    return
  }
  for (const handler of [...handlers].sort((a, b) => b.priority - a.priority)) {
    if (handler.priority < 0 && handler.run()) return
  }
  void NativeApp.minimizeApp().catch(() => {})
}
let started = false
export function startAndroidBack() {
  if (started || Capacitor.getPlatform() !== "android") return
  started = true
  void NativeApp.addListener("backButton", dispatchAndroidBack).catch(() => {
    started = false
  })
}
