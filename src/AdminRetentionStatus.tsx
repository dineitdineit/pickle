import { useEffect, useRef, useState } from "react"

import { supabase } from "./lib/supabase"

interface RetentionJob {
  id: string

  status: string

  requested_at: string

  completed_at: string | null

  expires_at: string | null

  attempts: number

  next_attempt_at: string

  last_error: string | null

  backup_verified_at: string | null
}

interface PurgeStatus {
  at: string

  counts: Record<string, number>
}

interface RetentionStatus {
  recipe_media?: {
    pending: number
    retry: number
    attention: number
    scheduled: boolean
  }
  retention_days: number

  minimum_history_days: number

  worker_scheduled: boolean

  purge_scheduled: boolean

  counts: Record<string, number>

  overdue_backups: number

  unverified_backups: number

  last_purge: PurgeStatus | null

  jobs: RetentionJob[]
}

export default function AdminRetentionStatus() {
  const [data, setData] = useState<RetentionStatus | null>(null)

  const [error, setError] = useState("")

  const [refresh, setRefresh] = useState(0)

  const [busy, setBusy] = useState<string | null>(null)

  const generation = useRef(0)

  const guard = useRef(false)

  useEffect(() => {
    const current = ++generation.current

    void supabase
      .rpc("admin_retention_status")
      .then(({ data: result, error: failure }) => {
        if (generation.current !== current) return

        if (
          failure ||
          !Array.isArray(result?.jobs) ||
          result?.retention_days !== 30 ||
          result?.minimum_history_days !== 90
        ) {
          setError("Could not load retention status.")
          setData(null)
        } else {
          setData(result)
          setError("")
        }
      })

    return () => {
      generation.current++
    }
  }, [refresh])

  async function retry(id: string) {
    if (guard.current) return

    guard.current = true
    setBusy(id)
    setError("")

    const current = generation.current

    try {
      const { data: result, error: failure } = await supabase.rpc(
        "admin_retry_account_deletion",
        { p_job: id },
      )

      if (generation.current !== current) return

      if (failure || result?.id !== id || result?.queued !== true)
        throw new Error("Retry could not be queued. Refresh status.")

      setRefresh((value) => value + 1)
    } catch (failure) {
      if (generation.current === current)
        setError(
          failure instanceof Error ? failure.message : "Could not retry.",
        )
    } finally {
      guard.current = false
      setBusy(null)
    }
  }

  return (
    <details className="admin-report-card mb-5">
      <summary>Data deletion, retention & backups</summary>
      <button
        type="button"
        disabled={!!busy}
        className="report-button"
        onClick={() => setRefresh((value) => value + 1)}
      >
        Refresh retention status
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            Deletion receipts/backups: 30 days. Detailed evidence: 30 days after
            closure. Minimum enforcement history: 90 days. Open appeals and
            active restrictions remain protected.
          </p>
          {(!data.worker_scheduled || !data.purge_scheduled) && (
            <p role="alert">Automatic cleanup is not fully scheduled.</p>
          )}
          <p>
            {Object.entries(data.counts)
              .map(([name, count]) => `${name}: ${count}`)
              .join(" · ") || "No deletion jobs."}
          </p>
          <p>
            Backups awaiting verification: {data.unverified_backups}. Expired
            backups awaiting confirmed cleanup: {data.overdue_backups}.
          </p>
          {data.recipe_media && (
            <p
              role={
                data.recipe_media.attention || !data.recipe_media.scheduled
                  ? "alert"
                  : undefined
              }
            >
              Recipe photo cleanup: {data.recipe_media.pending} pending ·{" "}
              {data.recipe_media.retry} retrying · {data.recipe_media.attention}{" "}
              need attention.
              {!data.recipe_media.scheduled &&
                " Photo cleanup is not scheduled."}
            </p>
          )}
          {data.last_purge && (
            <p>
              Last record purge: {new Date(data.last_purge.at).toLocaleString()}{" "}
              ·{" "}
              {Object.entries(data.last_purge.counts)
                .map(([name, count]) => `${name}: ${count}`)
                .join(" · ")}
            </p>
          )}
          <p>
            Only encrypted minimal deletion receipts are backed up. This does
            not back up recipe/photo copies or configure vendor-managed database
            backups. Backup files and keys are never exposed here.
          </p>
          {data.jobs.map((job) => (
            <section key={job.id} className="border-t py-3">
              <p>
                Reference: {job.id} · {job.status} · Attempts: {job.attempts}
              </p>
              <p>
                Requested: {new Date(job.requested_at).toLocaleString()}
                {job.expires_at
                  ? ` · Expires: ${new Date(job.expires_at).toLocaleString()}`
                  : " · Cleanup pending"}
              </p>
              {job.last_error && (
                <p>
                  {job.last_error}
                  {job.attempts >= 5 ? " · Operator attention required" : ""}
                </p>
              )}
              {job.status === "completed" && (
                <p>
                  Receipt backup:{" "}
                  {job.backup_verified_at
                    ? "Verified"
                    : "Waiting for verification"}
                </p>
              )}
              {["retry", "pending"].includes(job.status) && (
                <button
                  type="button"
                  className="report-button"
                  disabled={!!busy}
                  onClick={() => void retry(job.id)}
                >
                  {busy === job.id ? "Queueing…" : "Retry deletion cleanup"}
                </button>
              )}
            </section>
          ))}
        </>
      )}
    </details>
  )
}
