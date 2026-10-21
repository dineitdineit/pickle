import { useEffect, useState } from "react"
import { Capacitor, registerPlugin } from "@capacitor/core"

const CookingScreen = registerPlugin<{
  setKeepAwake(options: { enabled: boolean }): Promise<void>
}>("CookingScreen")
let nativeQueue: Promise<void> = Promise.resolve()
function setNativeAwake(enabled: boolean) {
  const next = nativeQueue
    .catch(() => {})
    .then(() => CookingScreen.setKeepAwake({ enabled }))
  nativeQueue = next
  return next
}

export default function useCookingWakeLock(enabled: boolean) {
  const [status, setStatus] = useState("")
  useEffect(() => {
    let disposed = false
    let lock: WakeLockSentinel | null = null
    let pending = false
    const native = Capacitor.getPlatform() === "android"
    async function acquire() {
      if (
        !enabled ||
        disposed ||
        pending ||
        document.visibilityState !== "visible"
      )
        return
      pending = true
      try {
        if (native) await setNativeAwake(true)
        else {
          if (!navigator.wakeLock) throw new Error("Unsupported")
          if (lock && !lock.released) return
          const next = await navigator.wakeLock.request("screen")
          if (disposed) {
            await next.release()
            return
          }
          lock = next
          next.addEventListener("release", () => {
            if (!disposed && document.visibilityState === "visible")
              setStatus(
                "Screen awake was released. Turn it off and on to retry.",
              )
          })
        }
        if (!disposed)
          setStatus("Screen stays awake while cooking mode is visible.")
      } catch {
        if (!disposed)
          setStatus(
            "Could not keep the screen awake. Your normal screen timeout applies.",
          )
      } finally {
        pending = false
      }
    }
    setStatus("")
    if (enabled) void acquire()
    const visible = () => {
      if (document.visibilityState === "visible") void acquire()
    }
    document.addEventListener("visibilitychange", visible)
    return () => {
      disposed = true
      document.removeEventListener("visibilitychange", visible)
      if (native) void setNativeAwake(false).catch(() => {})
      if (lock) void lock.release().catch(() => {})
    }
  }, [enabled])
  return status
}
