import AdminUsageRetention from "./AdminUsageRetention"

type MetricTotals = {
  views: number

  searches: number

  saves: number

  likes: number
}

type RecipeMetric = {
  id: string

  title: string

  view_count: number

  save_count: number

  like_count: number
}

type SearchMetric = {
  query: string

  search_count: number

  avg_result_count: number

  last_searched_at: string
}

export type AnalyticsPayload = {
  totals: MetricTotals

  last30: MetricTotals

  recipe_metrics: RecipeMetric[]

  top_searches: SearchMetric[]
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",

    day: "numeric",

    year: "numeric",

    hour: "numeric",

    minute: "2-digit",
  })
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value ?? 0)
}

export default function AdminAnalytics({
  analytics,

  loadingAnalytics,

  analyticsMessage,

  loadAnalytics,
}: {
  analytics: AnalyticsPayload | null

  loadingAnalytics: boolean

  analyticsMessage: string

  loadAnalytics: () => void
}) {
  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-page font-bold">App analytics</h2>
          <p className="text-body text-[var(--color-gray)] mt-1">
            Recipe views, searches, saves, and likes across Pickle.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAnalytics}
          disabled={loadingAnalytics}
          className="h-10 px-4 rounded-lg bg-white border border-[var(--color-gray-faint)] text-body font-medium disabled:opacity-50 self-start lg:self-auto"
        >
          {loadingAnalytics ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {analyticsMessage && (
        <div className="mb-5 rounded-xl border border-[#F0C7C0] bg-[#FFF7F5] px-4 py-3 text-body text-[#C53D2E]">
          {analyticsMessage}
        </div>
      )}
      {loadingAnalytics && !analytics ? (
        <div className="rounded-2xl bg-white border border-[var(--color-border)] py-16 text-center text-body text-[var(--color-gray)]">
          Loading analytics…
        </div>
      ) : analytics ? (
        <>
          <AdminUsageRetention refreshKey={analytics} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {([
              ["Recipe views", analytics.totals.views, analytics.last30.views],

              [
                "Searches",

                analytics.totals.searches,

                analytics.last30.searches,
              ],

              ["Saved", analytics.totals.saves, analytics.last30.saves],

              ["Likes", analytics.totals.likes, analytics.last30.likes],
            ] as [string, number, number][]).map(([label, total, recent]) => (
              <div
                key={label}
                className="rounded-xl bg-white border border-[var(--color-border)] p-4"
              >
                <p className="text-label font-semibold uppercase tracking-wide text-[var(--color-gray-soft)]">
                  {label}
                </p>
                <p className="text-page font-bold mt-1">
                  {formatNumber(total)}
                </p>
                <p className="text-label text-[var(--color-gray-soft)] mt-1">
                  {formatNumber(recent)} in last 30 days
                </p>
              </div>
            ))}
          </div>
          <div className="grid xl:grid-cols-[1.4fr_1fr] gap-5 mb-5">
            <section className="bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="font-semibold">Recipe performance</h3>
                <p className="text-[14px] text-[#8A8A8A] mt-1">
                  Top recipes with recorded activity.
                </p>
              </div>
              {analytics.recipe_metrics.length === 0 ? (
                <div className="py-12 text-center text-[16px] text-[#8A8A8A]">
                  No recipe activity yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[16px]">
                    <thead className="bg-[#FAFAFA] text-[#8A8A8A] text-[14px] uppercase">
                      <tr>
                        <th className="text-left font-semibold px-5 py-3">
                          Recipe
                        </th>
                        <th className="text-right font-semibold px-4 py-3">
                          Views
                        </th>
                        <th className="text-right font-semibold px-4 py-3">
                          Saves
                        </th>
                        <th className="text-right font-semibold px-5 py-3">
                          Likes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEEEEE]">
                      {analytics.recipe_metrics.map((item) => (
                        <tr key={item.id}>
                          <td className="px-5 py-3 font-medium">
                            <a
                              href={`/?recipe=${item.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-[#F26B21]"
                            >
                              {item.title}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatNumber(Number(item.view_count))}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatNumber(Number(item.save_count))}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {formatNumber(Number(item.like_count))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="bg-white border border-[var(--color-border)] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <h3 className="font-semibold">Top searches</h3>
                <p className="text-label text-[var(--color-gray-soft)] mt-1">
                  Most searched keywords and average results.
                </p>
              </div>
              {analytics.top_searches.length === 0 ? (
                <div className="py-12 text-center text-body text-[var(--color-gray-soft)]">
                  Search tracking will appear here.
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {analytics.top_searches.map((item) => (
                    <div
                      key={item.query}
                      className="px-5 py-3 flex items-center gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-medium truncate">
                          {item.query}
                        </p>
                        <p className="text-label text-[var(--color-gray-soft)] mt-0.5">
                          Avg. {Number(item.avg_result_count).toFixed(1)}{" "}
                          results · Last {formatDate(item.last_searched_at)}
                        </p>
                      </div>
                      <span className="text-body font-bold">
                        {formatNumber(Number(item.search_count))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="rounded-2xl bg-white border border-[var(--color-border)] py-16 text-center">
          <p className="text-body text-[var(--color-gray)]">
            Analytics could not be loaded.
          </p>
          <button
            type="button"
            onClick={loadAnalytics}
            className="mt-4 h-10 px-4 rounded-lg bg-[var(--color-primary)] text-white text-body font-semibold"
          >
            Try again
          </button>
        </div>
      )}
    </>
  )
}
