import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
import useNotificationRefresh from "./useNotificationRefresh"
export default function useNotificationCount(userId: string | null) {
  const [count, setCount] = useState(0)
  useNotificationRefresh(userId, () =>
    window.dispatchEvent(new Event("pickle:notifications-changed")),
  )
  useEffect(() => {
    let ignore = false
    let pending = false
    setCount(0)
    async function update() {
      if (!userId || pending || document.visibilityState === "hidden") return
      pending = true
      try {
        const { count, error } = await supabase
          .from("user_notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", userId)
          .is("read_at", null)
        if (!ignore && !error) setCount(count ?? 0)
      } finally {
        pending = false
      }
    }
    const refresh = () => {
      void update().catch(() => {
        /* Keep the last known badge on temporary network failure. */
      })
    }
    refresh()
    window.addEventListener("pickle:notifications-changed", refresh)
    window.addEventListener("pickle:blocks-changed", refresh)
    window.addEventListener("pickle:safety-refresh", refresh)
    return () => {
      ignore = true
      window.removeEventListener("pickle:notifications-changed", refresh)
      window.removeEventListener("pickle:blocks-changed", refresh)
      window.removeEventListener("pickle:safety-refresh", refresh)
    }
  }, [userId])
  return count
}
