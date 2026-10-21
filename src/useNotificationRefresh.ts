import { useEffect, useRef } from "react"
import { supabase } from "./lib/supabase"

/** Recipient-filtered realtime updates, plus polling after missed/reconnected events. */
export default function useNotificationRefresh(
  userId: string | null,
  refresh: () => void,
) {
  const callback = useRef(refresh)
  useEffect(() => {
    callback.current = refresh
  }, [refresh])
  useEffect(() => {
    if (!userId) return
    let active = true
    let pending: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      if (!active || document.visibilityState === "hidden") return
      clearTimeout(pending)
      pending = setTimeout(() => callback.current(), 150)
    }
    const channel = supabase
      .channel(`notifications:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        update,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        update,
      )
      .subscribe()
    const timer = window.setInterval(update, 30000)
    window.addEventListener("focus", update)
    window.addEventListener("pickle:push-received", update)
    document.addEventListener("visibilitychange", update)
    return () => {
      active = false
      clearTimeout(pending)
      window.clearInterval(timer)
      window.removeEventListener("focus", update)
      window.removeEventListener("pickle:push-received", update)
      document.removeEventListener("visibilitychange", update)
      void supabase.removeChannel(channel)
    }
  }, [userId])
}
