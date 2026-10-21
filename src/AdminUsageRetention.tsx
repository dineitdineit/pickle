import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"

export interface RetentionMetrics {
  days: number
  generated_at: string
  eligible_saved_pairs: number
  returned_saved_pairs: number
  returning_savers: number
  cooks_marking_cooked: number
  result_posts: number
  result_publishers: number
  results_with_response: number
  results_with_author_response: number
}
export function retentionPercent(numerator: number, denominator: number) {
  return denominator > 0
    ? `${((100 * numerator) / denominator).toFixed(1)}%`
    : "—"
}
export default function AdminUsageRetention({
  refreshKey,
}: {
  refreshKey: unknown
}) {
  const [days, setDays] = useState(30)
  const [retry, setRetry] = useState(0)
  const [metrics, setMetrics] = useState<RetentionMetrics | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    setMetrics(null)
    setError("")
    void Promise.resolve(
      supabase.rpc("admin_retention_metrics", { p_days: days }),
    )
      .then((result) => {
        if (!active) return
        if (result.error || !result.data || result.data.days !== days)
          setError("Could not load retention metrics.")
        else setMetrics(result.data as RetentionMetrics)
      })
      .catch(() => {
        if (active) setError("Could not load retention metrics.")
      })
    return () => {
      active = false
    }
  }, [days, retry, refreshKey])
  const cards = metrics
    ? [
        [
          "Saved-recipe return rate",
          retentionPercent(
            metrics.returned_saved_pairs,
            metrics.eligible_saved_pairs,
          ),
          `${metrics.returned_saved_pairs} of ${metrics.eligible_saved_pairs} eligible saved user/recipe pairs`,
        ],
        [
          "Returning savers",
          metrics.returning_savers,
          "People opening an existing save on a later UTC day",
        ],
        [
          "Marked Cooked",
          metrics.cooks_marking_cooked,
          "People changing a saved recipe to Cooked",
        ],
        [
          "Result posts",
          metrics.result_posts,
          `Published by ${metrics.result_publishers} cooks; tagged to another cook’s recipe`,
        ],
        [
          "Results receiving responses",
          retentionPercent(metrics.results_with_response, metrics.result_posts),
          `${metrics.results_with_response} result posts with another cook’s comment or original-author response`,
        ],
        [
          "Original-author responses",
          retentionPercent(
            metrics.results_with_author_response,
            metrics.result_posts,
          ),
          `${metrics.results_with_author_response} result posts with the recipe author’s comment or heart`,
        ],
      ]
    : []
  return (
    <section
      className="mb-6 rounded-2xl border border-[var(--color-border)] bg-white p-5"
      aria-label="Cooking and retention metrics"
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="font-semibold">Cooking & community retention</h3>
        <label className="text-label">
          Window{" "}
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="border rounded-lg p-2"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
      </div>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : !metrics ? (
        <p role="status">Loading retention metrics…</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map(([label, value, description]) => (
            <div
              key={label}
              className="rounded-xl bg-[var(--color-surface)] p-4"
            >
              <p className="text-label font-semibold">{label}</p>
              <p className="text-page font-bold mt-1">{value}</p>
              <p className="text-caption text-[var(--color-gray)] mt-1">
                {description}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="text-caption text-[var(--color-gray)] mt-4">
        Return-rate denominator: still-saved pairs created within this window
        before today (UTC); numerator: those pairs opened again on a later UTC
        day. Returns and Cooked changes are measured from this feature’s launch;
        no historical backfill. A response is current, available in-app
        activity, not proof of notification delivery. Deleted or hidden result
        posts are excluded; results can receive responses after their
        publication day. No response or no eligible saves displays zero or —,
        never an assumed success.
      </p>
    </section>
  )
}
