import { useEffect, useRef } from "react"
import { supabase } from "./lib/supabase"
import { markSeenNotificationsRead } from "./lib/notificationRead"

interface NoticeState {
  id: string
  read_at: string | null
}
interface SeenVisit {
  userId: string
  seen: Set<string>
}
/** Each visit owns its recipient/seen set; refreshes never mark off-screen rows. */
export default function useSeenNotifications(
  userId: string | null,
  active: boolean,
  notices: NoticeState[],
  ready: boolean,
) {
  const root = useRef<HTMLDivElement>(null)
  const session = useRef<SeenVisit | null>(null)
  useEffect(() => {
    if (!userId || !active) return
    const visit = { userId, seen: new Set<string>() }
    session.current = visit
    let saving = false
    async function flush() {
      if (saving || !visit.seen.size) return
      saving = true
      try {
        const ids = [...visit.seen]
        for (let offset = 0; offset < ids.length; offset += 100) {
          const batch = ids.slice(offset, offset + 100)
          const confirmed = await markSeenNotificationsRead(
            supabase,
            visit.userId,
            batch,
          )
          batch.forEach((id) => visit.seen.delete(id))
          if (confirmed.length)
            window.dispatchEvent(new Event("pickle:notifications-changed"))
        }
      } catch {
        // Keep the server's unread state when a request fails; the next visit retries.
      } finally {
        saving = false
      }
    }
    const leave = () => void flush()
    window.addEventListener("pagehide", leave)
    return () => {
      window.removeEventListener("pagehide", leave)
      if (session.current === visit) session.current = null
      void flush()
    }
  }, [userId, active])
  useEffect(() => {
    const visit = session.current
    if (
      !active ||
      !ready ||
      !visit ||
      visit.userId !== userId ||
      !root.current ||
      typeof IntersectionObserver === "undefined"
    )
      return
    const unread = new Set(
      notices.filter((row) => !row.read_at).map((row) => row.id),
    )
    const timers = new Map<Element, ReturnType<typeof setTimeout>>()
    const visible = new Set<Element>()
    const clear = (target: Element) => {
      clearTimeout(timers.get(target))
      timers.delete(target)
    }
    const schedule = (target: Element) => {
      const id = target.getAttribute("data-notification-id")
      if (
        !id ||
        !unread.has(id) ||
        visit.seen.has(id) ||
        timers.has(target) ||
        document.visibilityState !== "visible"
      )
        return
      timers.set(
        target,
        setTimeout(() => {
          timers.delete(target)
          if (
            visible.has(target) &&
            document.visibilityState === "visible" &&
            session.current === visit
          )
            visit.seen.add(id)
        }, 500),
      )
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            visible.add(entry.target)
            schedule(entry.target)
          } else {
            visible.delete(entry.target)
            clear(entry.target)
          }
        }
      },
      { threshold: [0.5], rootMargin: "0px 0px -96px 0px" },
    )
    root.current
      .querySelectorAll("[data-notification-id]")
      .forEach((target) => observer.observe(target))
    const visibility = () => {
      if (document.visibilityState === "visible") visible.forEach(schedule)
      else timers.forEach((_timer, target) => clear(target))
    }
    document.addEventListener("visibilitychange", visibility)
    return () => {
      observer.disconnect()
      timers.forEach(clearTimeout)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [userId, active, notices, ready])
  return root
}
