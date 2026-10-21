import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
export default function useUnreadMessages(userId: string | null) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let ignore = false
    let inFlight = false
    setCount(0)
    if (!userId) return
    async function load() {
      if (ignore || inFlight || document.visibilityState !== "visible") return
      inFlight = true
      try {
        const result = await supabase
          .from("direct_messages")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", userId)
          .is("read_at", null)
        if (!ignore && !result.error) setCount(result.count ?? 0)
      } finally {
        inFlight = false
      }
    }
    const update = () => {
      void load().catch(() => {})
    }
    update()
    const timer = window.setInterval(update, 30000)
    window.addEventListener("focus", update)
    window.addEventListener("pickle:push-received", update)
    window.addEventListener("pickle:blocks-changed", update)
    window.addEventListener("pickle:safety-refresh", update)
    document.addEventListener("visibilitychange", update)
    const channel = supabase
      .channel(`unread-messages:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${userId}`,
        },
        update,
      )
      .subscribe()
    return () => {
      ignore = true
      window.clearInterval(timer)
      window.removeEventListener("focus", update)
      window.removeEventListener("pickle:push-received", update)
      window.removeEventListener("pickle:blocks-changed", update)
      window.removeEventListener("pickle:safety-refresh", update)
      document.removeEventListener("visibilitychange", update)
      void supabase.removeChannel(channel)
    }
  }, [userId])
  return count
}
