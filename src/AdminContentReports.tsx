import { useCallback, useEffect, useRef, useState } from "react"

import { supabase } from "./lib/supabase"

import {
  reportReasons,
  reportTypeLabels,
  type ReportType,
} from "./ReportButton"

import "./reports.css"

interface Report {
  id: string

  target_type: ReportType

  target_id: string

  recipe_id: string | null

  reporter_name: string | null

  reported_name: string | null

  reason: string

  details: string | null

  snapshot: {
    title?: string

    content?: string

    rating?: number

    username?: string
  }

  status: "open" | "actioned" | "dismissed"

  target_state: "active" | "hidden" | null

  created_at: string

  resolution_note: string | null

  actions: {
    id: string

    action: string

    admin_id: string | null

    note: string | null

    created_at: string
  }[]
}

export default function AdminContentReports() {
  const [type, setType] = useState("all")

  const [status, setStatus] = useState("open")

  const [offset, setOffset] = useState(0)

  const [reports, setReports] = useState<Report[]>([])

  const [total, setTotal] = useState(0)

  const [hasMore, setHasMore] = useState(false)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const request = useRef(0)

  const alive = useRef(true)

  const load = useCallback(async () => {
    const current = ++request.current

    setLoading(true)

    setError("")

    try {
      const { data, error: failure } = await supabase.rpc(
        "admin_content_reports",

        { p_type: type, p_status: status, p_offset: offset },
      )

      if (
        failure ||
        !Array.isArray(data?.reports) ||
        typeof data?.total !== "number"
      )
        throw failure ?? new Error("Invalid queue")

      if (!alive.current || current !== request.current) return

      setReports(data.reports)

      setTotal(data.total)

      setHasMore(data.has_more === true)
    } catch {
      if (alive.current && current === request.current) {
        setReports([])

        setError("Could not load reports. Please retry.")
      }
    } finally {
      if (alive.current && current === request.current) setLoading(false)
    }
  }, [type, status, offset])

  useEffect(() => {
    alive.current = true

    void load()

    return () => {
      alive.current = false

      request.current++
    }
  }, [load])

  return (
    <section
      className="admin-content-reports"
      aria-label="Content and user reports"
    >
      <h2 className="text-page font-bold">
        Content, message &amp; user reports
      </h2>
      <div className="admin-report-toolbar">
        <label>
          Type{" "}
          <select
            disabled={loading}
            value={type}
            onChange={(event) => {
              setType(event.target.value)

              setOffset(0)
            }}
          >
            {["all", ...Object.keys(reportTypeLabels)].map((value) => (
              <option key={value} value={value}>
                {value === "all"
                  ? "all"
                  : reportTypeLabels[(value as ReportType)]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status{" "}
          <select
            disabled={loading}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)

              setOffset(0)
            }}
          >
            {["open", "actioned", "dismissed", "all"].map((value) => (
              <option key={value} value={value}>
                {value === "actioned" ? "Reviewed / actioned" : value}
              </option>
            ))}
          </select>
        </label>
        <button disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
        <span>{total} reports</span>
      </div>
      {error && (
        <p role="alert" className="report-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading reports…</p>
      ) : reports.length === 0 ? (
        <p>No reports in this filter.</p>
      ) : (
        reports.map((report) => (
          <article key={report.id} className="admin-report-card">
            <h3>
              {reportTypeLabels[report.target_type]} ·{" "}
              {report.snapshot.title ||
                report.reported_name ||
                "Unavailable content"}
            </h3>
            <small>
              {report.status} · {report.target_state ?? "Deleted / unavailable"}{" "}
              · {new Date(report.created_at).toLocaleString()}
            </small>
            <p>
              Reported by {report.reporter_name || "Deleted user"} · Author:{" "}
              {report.reported_name || "Deleted user"}
            </p>
            <p>
              Reason:{" "}
              {reportReasons[(report.reason as keyof typeof reportReasons)] ??
                report.reason}
            </p>
            {report.details && <blockquote>{report.details}</blockquote>}
            <blockquote>
              {report.snapshot.rating
                ? `${report.snapshot.rating} stars · `
                : ""}
              {report.snapshot.content ||
                report.snapshot.username ||
                "No text provided."}
            </blockquote>
            {report.resolution_note && (
              <p>Saved admin note: {report.resolution_note}</p>
            )}
            <p>
              Read-only report history. Use Operations &amp; appeals for
              decisions and reversals.
            </p>
            {report.actions.length > 0 && (
              <details>
                <summary>Moderation history ({report.actions.length})</summary>
                <ul>
                  {report.actions.map((action) => (
                    <li key={action.id}>
                      <small>
                        {new Date(action.created_at).toLocaleString()} ·{" "}
                        {action.action} · Admin {action.admin_id ?? "deleted"}
                      </small>
                      {action.note && <p>{action.note}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))
      )}
      <div className="admin-report-toolbar">
        <button
          disabled={loading || offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 50))}
        >
          Previous
        </button>
        <button
          disabled={loading || !hasMore}
          onClick={() => setOffset((value) => value + 50)}
        >
          Next
        </button>
      </div>
    </section>
  )
}
