import { useEffect, useState, useSyncExternalStore } from "react"
import {
  androidPushAvailable,
  disableAndroidPush,
  enableAndroidPush,
  pushStatus,
  subscribePush,
} from "./lib/androidPush"
import { supabase } from "./lib/supabase"

export default function AndroidPushSettings({ userId }: { userId: string }) {
  const status = useSyncExternalStore(subscribePush, pushStatus, () => "off")
  const [delivery, setDelivery] = useState<boolean | null>(null)
  useEffect(() => {
    if (!androidPushAvailable) return
    let active = true
    void supabase.rpc("push_delivery_status").then(({ data }) => {
      if (active) setDelivery(data?.enabled === true && data?.ready === true)
    })
    return () => {
      active = false
    }
  }, [userId, status])
  if (!androidPushAvailable) return null
  return (
    <section
      className="notification-settings-options"
      aria-label="Phone notifications"
    >
      <div className="notification-setting-row">
        <div>
          <label id="phone-push-label">Phone notifications</label>
          <p>
            Receive alerts on this Android device, including when Pickle is
            closed.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-labelledby="phone-push-label"
          aria-checked={status === "enabled"}
          className="notification-setting-switch"
          disabled={status === "connecting"}
          onClick={() =>
            void (status === "enabled"
              ? disableAndroidPush()
              : enableAndroidPush(userId))
          }
        >
          <span />
        </button>
      </div>
      <p className="notification-settings-note">
        Optional: enabling shares this device’s notification token and routing
        identifiers with Google Firebase Cloud Messaging. Alerts use generic
        text, without message or comment contents. Turn off here to remove this
        device’s registration.
      </p>
      <p className="notification-settings-note" role="status">
        {status === "connecting"
          ? "Connecting this device…"
          : status === "denied"
            ? "Notifications are blocked. Allow notifications for Pickle in Android Settings, then retry."
            : status === "error"
              ? "Could not confirm the phone notification setting. Check your connection and try again."
              : status === "enabled"
                ? "This device is registered."
                : "Phone notifications are off on this device."}
        {delivery === false &&
          " Push delivery is still in testing and is currently disabled."}
      </p>
    </section>
  )
}
