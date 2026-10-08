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

type ActivityRow = {
  event_type: "view" | "search" | "save" | "like"
  occurred_at: string
  recipe_id: string | null
  recipe_title: string | null
  user_id: string | null
  username: string | null
  display_name: string | null
  query: string | null
  result_count: number | null
}

export type AnalyticsPayload = {
  totals: MetricTotals
  last30: MetricTotals
  recipe_metrics: RecipeMetric[]
  top_searches: SearchMetric[]
  recent_activity: ActivityRow[]
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
          <h2 className="text-[27px] font-bold">App analytics</h2>
          <p className="text-[16px] text-[#6F6F6F] mt-1">
            Recipe views, searches, saves, and likes across Pickle.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAnalytics}
          disabled={loadingAnalytics}
          className="h-10 px-4 rounded-lg bg-white border border-[#D9DDE3] text-[16px] font-medium disabled:opacity-50 self-start lg:self-auto"
        >
          {loadingAnalytics ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {analyticsMessage && (
        <div className="mb-5 rounded-xl border border-[#F0C7C0] bg-[#FFF7F5] px-4 py-3 text-[16px] text-[#C53D2E]">
          {analyticsMessage}
        </div>
      )}

      {loadingAnalytics && !analytics ? (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] py-16 text-center text-[16px] text-[#6F6F6F]">
          Loading analytics…
        </div>
      ) : analytics ? (
        <>
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
                className="rounded-xl bg-white border border-[#E5E7EB] p-4"
              >
                <p className="text-[14px] font-semibold uppercase tracking-wide text-[#8A8A8A]">
                  {label}
                </p>
                <p className="text-[27px] font-bold mt-1">{formatNumber(total)}</p>
                <p className="text-[14px] text-[#8A8A8A] mt-1">
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

            <section className="bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="font-semibold">Top searches</h3>
                <p className="text-[14px] text-[#8A8A8A] mt-1">
                  Most searched keywords and average results.
                </p>
              </div>
              {analytics.top_searches.length === 0 ? (
                <div className="py-12 text-center text-[16px] text-[#8A8A8A]">
                  Search tracking will appear here.
                </div>
              ) : (
                <div className="divide-y divide-[#EEEEEE]">
                  {analytics.top_searches.map((item) => (
                    <div
                      key={item.query}
                      className="px-5 py-3 flex items-center gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px] font-medium truncate">
                          {item.query}
                        </p>
                        <p className="text-[14px] text-[#8A8A8A] mt-0.5">
                          Avg. {Number(item.avg_result_count).toFixed(1)}{" "}
                          results · Last {formatDate(item.last_searched_at)}
                        </p>
                      </div>
                      <span className="text-[16px] font-bold">
                        {formatNumber(Number(item.search_count))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E7EB]">
              <h3 className="font-semibold">Recent activity</h3>
              <p className="text-[14px] text-[#8A8A8A] mt-1">
                Latest views, searches, saves, and likes.
              </p>
            </div>
            {analytics.recent_activity.length === 0 ? (
              <div className="py-12 text-center text-[16px] text-[#8A8A8A]">
                No activity recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-[#EEEEEE]">
                {analytics.recent_activity.map((item, index) => {
                  const userLabel =
                    item.display_name ||
                    item.username ||
                    (item.user_id ? "Pickle user" : "Anonymous")
                  const description =
                    item.event_type === "search"
                      ? `Searched “${item.query ?? ""}” · ${item.result_count ?? 0} results`
                      : item.event_type === "view"
                        ? `Viewed ${item.recipe_title ?? "a recipe"}`
                        : item.event_type === "save"
                          ? `Saved ${item.recipe_title ?? "a recipe"}`
                          : `Liked ${item.recipe_title ?? "a recipe"}`

                  return (
                    <div
                      key={`${item.event_type}-${item.occurred_at}-${index}`}
                      className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                    >
                      <span
                        className="w-fit text-[13px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
                        style={{
                          backgroundColor:
                            item.event_type === "view"
                              ? "#F3F5F7"
                              : item.event_type === "search"
                                ? "#FFF0E6"
                                : item.event_type === "save"
                                  ? "#EEF4FF"
                                  : "#FFF0F3",
                          color:
                            item.event_type === "search"
                              ? "#F26B21"
                              : "#59636E",
                        }}
                      >
                        {item.event_type}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px]">{description}</p>
                        <p className="text-[14px] text-[#8A8A8A] mt-0.5">
                          {item.event_type === "view"
                            ? "Anonymous view"
                            : userLabel}{" "}
                          · {formatDate(item.occurred_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] py-16 text-center">
          <p className="text-[16px] text-[#6F6F6F]">
            Analytics could not be loaded.
          </p>
          <button
            type="button"
            onClick={loadAnalytics}
            className="mt-4 h-10 px-4 rounded-lg bg-[#F26B21] text-white text-[16px] font-semibold"
          >
            Try again
          </button>
        </div>
      )}
    </>
  )
}
