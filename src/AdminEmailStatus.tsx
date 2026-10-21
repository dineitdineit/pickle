import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
interface DeliveryStatus {
  counts: Record<string, number>
  scheduler_configured: boolean
  recent_failures: {
    id: string
    status: string
    last_error: string | null
    created_at: string
  }[]
}
export default function AdminEmailStatus() {
  const [data, setData] = useState<DeliveryStatus | null>(null)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const result = await supabase.rpc("admin_moderation_email_status")
        if (result.error || !result.data?.counts)
          throw result.error ?? new Error("Status unavailable")
        if (!ignore) {
          setData(result.data)
          setError("")
        }
      } catch {
        if (!ignore) setError("Could not load email delivery status.")
      }
    }
    void load()
    return () => {
      ignore = true
    }
  }, [refresh])
  return (
    <details className="admin-report-card mb-5">
      <summary>Moderation email delivery</summary>
      <button
        type="button"
        className="report-button"
        onClick={() => setRefresh((value) => value + 1)}
      >
        Refresh delivery status
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          {!data.scheduler_configured && (
            <p>
              Email setup is incomplete. Notices remain queued until the worker
              secrets are configured.
            </p>
          )}
          <p>
            {["pending", "processing", "retry", "sent", "skipped", "failed"]
              .map(
                (status) =>
                  `${
                    status === "sent" ? "Provider accepted" : status
                  }: ${data.counts[status] ?? 0}`,
              )
              .join(" · ")}
          </p>
          {data.recent_failures.length > 0 && (
            <ul>
              {data.recent_failures.map((row) => (
                <li key={row.id}>
                  <small>
                    {new Date(row.created_at).toLocaleString()} · {row.status}:{" "}
                    {row.last_error}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </details>
  )
}
