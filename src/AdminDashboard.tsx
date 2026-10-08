import AdminAnalytics, { type AnalyticsPayload } from "./AdminAnalytics"
import PickleLogo from "./PickleLogo"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { supabase } from "./lib/supabase"
import { getCurrentUser } from "./lib/auth"

type AccessState = "loading" | "signed-out" | "denied" | "admin"
type FilterState = "all" | "open" | "actioned" | "dismissed"
type AdminSection = "analytics" | "moderation"

type ReportRow = {
  id: string
  comment_id: string
  recipe_id: string
  reporter_id: string
  reported_user_id: string
  reason: string
  details: string | null
  comment_snapshot: string
  status: "open" | "dismissed" | "actioned"
  created_at: string
  reviewed_at: string | null
  resolution_note: string | null
}

type ProfileLite = {
  id: string
  username: string
  display_name: string
}

type RecipeLite = {
  id: string
  title: string
}

type CommentLite = {
  id: string
  content: string
  moderation_status: "active" | "hidden" | "removed"
}

type ReportGroup = {
  commentId: string
  reports: ReportRow[]
  recipeId: string
  reportedUserId: string
  status: "open" | "actioned" | "dismissed"
  latestAt: string
}

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate_or_abusive: "Hate / abusive",
  sexual_content: "Sexual content",
  personal_information: "Personal information",
  off_topic: "Off-topic",
  other: "Other",
}

function groupStatus(reports: ReportRow[]): ReportGroup["status"] {
  if (reports.some((report) => report.status === "open")) return "open"
  if (reports.some((report) => report.status === "actioned")) return "actioned"
  return "dismissed"
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

export default function AdminDashboard() {
  const [access, setAccess] = useState<AccessState>("loading")
  const [section, setSection] = useState<AdminSection>("analytics")
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [analyticsMessage, setAnalyticsMessage] = useState("")
  const [reports, setReports] = useState<ReportRow[]>([])
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map())
  const [recipes, setRecipes] = useState<Map<string, RecipeLite>>(new Map())
  const [comments, setComments] = useState<Map<string, CommentLite>>(new Map())
  const [filter, setFilter] = useState<FilterState>("open")
  const [loadingReports, setLoadingReports] = useState(false)
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null)
  const [pageMessage, setPageMessage] = useState("")
  const [actionMessage, setActionMessage] = useState("")
  const [signingOut, setSigningOut] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [signingIn, setSigningIn] = useState(false)

  async function loadAnalytics() {
    setLoadingAnalytics(true)
    setAnalyticsMessage("")

    const { data, error } = await supabase.rpc("admin_analytics_overview")

    if (error) {
      console.error("Failed to load analytics:", error)
      setAnalyticsMessage("Could not load analytics.")
      setLoadingAnalytics(false)
      return
    }

    setAnalytics(data as AnalyticsPayload)
    setLoadingAnalytics(false)
  }

  async function loadReports() {
    setLoadingReports(true)
    setPageMessage("")
    setActionMessage("")

    const { data, error } = await supabase
      .from("comment_reports")
      .select(
        "id, comment_id, recipe_id, reporter_id, reported_user_id, reason, details, comment_snapshot, status, created_at, reviewed_at, resolution_note",
      )
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Failed to load moderation reports:", error)
      setPageMessage("Could not load moderation reports.")
      setLoadingReports(false)
      return false
    }

    const rows = (data ?? []) as ReportRow[]
    setReports(rows)

    const userIds = [
      ...new Set(
        rows.flatMap((row) => [row.reporter_id, row.reported_user_id]),
      ),
    ]
    const recipeIds = [...new Set(rows.map((row) => row.recipe_id))]
    const commentIds = [...new Set(rows.map((row) => row.comment_id))]

    const [profileResult, recipeResult, commentResult] = await Promise.all([
      userIds.length
        ? supabase
            .from("profiles")
            .select("id, username, display_name")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      recipeIds.length
        ? supabase.from("recipes").select("id, title").in("id", recipeIds)
        : Promise.resolve({ data: [], error: null }),
      commentIds.length
        ? supabase
            .from("recipe_comments")
            .select("id, content, moderation_status")
            .in("id", commentIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (profileResult.error)
      console.error("Failed to load report profiles:", profileResult.error)
    if (recipeResult.error)
      console.error("Failed to load report recipes:", recipeResult.error)
    if (commentResult.error)
      console.error("Failed to load report comments:", commentResult.error)

    setProfiles(
      new Map(
        ((profileResult.data ?? []) as ProfileLite[]).map((row) => [
          row.id,
          row,
        ]),
      ),
    )
    setRecipes(
      new Map(
        ((recipeResult.data ?? []) as RecipeLite[]).map((row) => [row.id, row]),
      ),
    )
    setComments(
      new Map(
        ((commentResult.data ?? []) as CommentLite[]).map((row) => [
          row.id,
          row,
        ]),
      ),
    )
    if (profileResult.error || recipeResult.error || commentResult.error) {
      setPageMessage("Some report details could not be loaded. Please refresh.")
      setLoadingReports(false)
      return false
    }
    setLoadingReports(false)
    return true
  }

  async function evaluateAccess(userId?: string) {
    let id = userId

    if (!id) {
      const { data } = await getCurrentUser()
      id = data.user?.id
    }

    if (!id) {
      setAccess("signed-out")
      return
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", id)
      .maybeSingle()

    if (error) {
      console.error("Failed to verify admin access:", error)
      setAccess("denied")
      return
    }

    if (data?.role !== "admin" && data?.role !== "official") {
      setAccess("denied")
      return
    }

    setAccess("admin")
    await Promise.all([loadAnalytics(), loadReports()])
  }

  useEffect(() => {
    void evaluateAccess()
    let accessTimer: ReturnType<typeof setTimeout> | undefined

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(accessTimer)
      if (!session?.user) {
        setAccess("signed-out")
        setAnalytics(null)
        setReports([])
        return
      }
      const userId = session.user.id
      accessTimer = setTimeout(() => {
        void evaluateAccess(userId)
      }, 0)
    })

    return () => {
      clearTimeout(accessTimer)
      subscription.unsubscribe()
    }
  }, [])

  const groups = useMemo<ReportGroup[]>(() => {
    const map = new Map<string, ReportRow[]>()

    reports.forEach((report) => {
      map.set(report.comment_id, [
        ...(map.get(report.comment_id) ?? []),
        report,
      ])
    })

    return [...map.entries()]
      .map(([commentId, rows]) => ({
        commentId,
        reports: rows,
        recipeId: rows[0].recipe_id,
        reportedUserId: rows[0].reported_user_id,
        status: groupStatus(rows),
        latestAt: rows
          .map((row) => row.created_at)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
      }))
      .sort(
        (a, b) =>
          new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
      )
  }, [reports])

  const filteredGroups = useMemo(
    () => groups.filter((group) => filter === "all" || group.status === filter),
    [groups, filter],
  )

  const stats = useMemo(
    () => ({
      open: groups.filter((group) => group.status === "open").length,
      actioned: groups.filter((group) => group.status === "actioned").length,
      dismissed: groups.filter((group) => group.status === "dismissed").length,
      total: groups.length,
    }),
    [groups],
  )

  async function handleSignIn(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password) return

    setSigningIn(true)
    setPageMessage("")

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setPageMessage(error.message)
      setSigningIn(false)
      return
    }

    setPassword("")
    setSigningIn(false)
  }

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setPageMessage("")
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error("Failed to sign out:", error)
      setPageMessage("Could not sign out. Please try again.")
    } finally {
      setSigningOut(false)
    }
  }

  async function moderate(
    group: ReportGroup,
    action: "dismiss" | "hide" | "remove",
  ) {
    const firstReport = group.reports[0]
    if (!firstReport || busyCommentId) return

    if (
      action === "remove" &&
      !window.confirm("Remove this comment from Pickle?")
    )
      return

    setBusyCommentId(group.commentId)
    setPageMessage("")

    setActionMessage("")
    try {
      const { error } = await supabase.rpc("moderate_comment_report", {
        p_report_id: firstReport.id,
        p_action: action,
        p_note: null,
      })
      if (error) throw error

      const result =
        action === "dismiss"
          ? await supabase
              .from("comment_reports")
              .select("status")
              .eq("id", firstReport.id)
              .maybeSingle()
          : await supabase
              .from("recipe_comments")
              .select("moderation_status")
              .eq("id", group.commentId)
              .maybeSingle()
      if (result.error) throw result.error
      const expected =
        action === "dismiss"
          ? "dismissed"
          : action === "hide"
            ? "hidden"
            : "removed"
      const actual =
        result.data &&
        ("status" in result.data
          ? result.data.status
          : result.data.moderation_status)
      if (actual !== expected)
        throw new Error("Moderation result did not match the requested action")
      if (!(await loadReports())) return
      setActionMessage(
        action === "dismiss"
          ? "Report dismissed. The comment remains visible."
          : action === "hide"
            ? "Comment hidden from recipe pages."
            : "Comment removed from recipe pages. The report remains in moderation history.",
      )
    } catch (error) {
      console.error("Failed to moderate comment:", error)
      setPageMessage(
        "Could not confirm this moderation action. Refresh and check the comment state before retrying.",
      )
    } finally {
      setBusyCommentId(null)
    }
  }

  if (access === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F7F8] text-[#6F6F6F]">
        Loading Pickle Admin…
      </div>
    )
  }

  if (access === "signed-out") {
    return (
      <div className="min-h-screen bg-[#F6F7F8] flex items-center justify-center px-5">
        <form
          onSubmit={handleSignIn}
          className="w-full max-w-sm rounded-2xl bg-white border border-[#E5E7EB] p-6 shadow-sm"
        >
          <div className="mb-6">
            <div className="mb-1">
              <PickleLogo size={24} />
            </div>
            <h1 className="text-[27px] font-bold text-[#1F1F1F]">Admin sign in</h1>
            <p className="text-[16px] text-[#6F6F6F] mt-2">
              Use an account with the admin role.
            </p>
          </div>

          <label className="block text-[16px] font-medium text-[#333333] mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full h-11 rounded-xl border border-[#D9DDE3] px-3 mb-4 outline-none focus:border-[#F26B21]"
            autoComplete="email"
          />

          <label className="block text-[16px] font-medium text-[#333333] mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full h-11 rounded-xl border border-[#D9DDE3] px-3 outline-none focus:border-[#F26B21]"
            autoComplete="current-password"
          />

          {pageMessage && (
            <p className="text-[16px] text-[#C53D2E] mt-3">{pageMessage}</p>
          )}

          <button
            type="submit"
            disabled={signingIn}
            className="w-full h-11 mt-5 rounded-xl bg-[#F26B21] text-white font-semibold disabled:opacity-50"
          >
            {signingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    )
  }

  if (access === "denied") {
    return (
      <div className="min-h-screen bg-[#F6F7F8] flex items-center justify-center px-5">
        <div className="w-full max-w-md rounded-2xl bg-white border border-[#E5E7EB] p-6 text-center">
          <h1 className="text-[22px] font-bold text-[#1F1F1F]">Access denied</h1>
          <p className="text-[16px] text-[#6F6F6F] mt-2">
            This account does not have Pickle admin access.
          </p>
          {pageMessage && (
            <p role="alert" className="text-[16px] text-[#C53D2E] mt-3">
              {pageMessage}
            </p>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-5 h-10 px-4 rounded-lg border border-[#D9DDE3] text-[16px] font-medium text-[#333333]"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F8] text-[#1F1F1F]">
      <header className="sticky top-0 z-20 bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <div>
            <p className="text-[14px] font-semibold text-[#F26B21]">PICKLE</p>
            <h1 className="text-[20px] font-bold">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="h-9 px-3 rounded-lg border border-[#D9DDE3] flex items-center text-[16px] font-medium"
            >
              Open app
            </a>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="h-9 px-3 rounded-lg border border-[#D9DDE3] text-[16px] font-medium"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 lg:px-8 py-7">
        <div className="flex gap-2 mb-7">
          {([
            ["analytics", "Analytics"],
            ["moderation", "Moderation"],
          ] as [AdminSection, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSection(value)}
              className="h-10 px-4 rounded-lg text-[16px] font-semibold"
              style={{
                backgroundColor: section === value ? "#FFF0E6" : "#FFFFFF",
                color: section === value ? "#F26B21" : "#6F6F6F",
                border: "1px solid #E5E7EB",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {section === "analytics" ? (
          <AdminAnalytics
            analytics={analytics}
            loadingAnalytics={loadingAnalytics}
            analyticsMessage={analyticsMessage}
            loadAnalytics={loadAnalytics}
          />
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-[27px] font-bold">Comment moderation</h2>
                <p className="text-[16px] text-[#6F6F6F] mt-1">
                  Review user reports and moderate comments.
                </p>
              </div>
              <button
                type="button"
                onClick={loadReports}
                disabled={loadingReports}
                className="h-10 px-4 rounded-lg bg-white border border-[#D9DDE3] text-[16px] font-medium disabled:opacity-50 self-start lg:self-auto"
              >
                {loadingReports ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            {actionMessage && (
              <p
                role="status"
                className="mb-5 rounded-xl bg-[#EDF7EE] px-4 py-3 text-[16px] text-[#397A46]"
              >
                {actionMessage}
              </p>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                ["Open", stats.open],
                ["Actioned", stats.actioned],
                ["Dismissed", stats.dismissed],
                ["Total", stats.total],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-white border border-[#E5E7EB] p-4"
                >
                  <p className="text-[14px] font-semibold uppercase tracking-wide text-[#8A8A8A]">
                    {label}
                  </p>
                  <p className="text-[27px] font-bold mt-1">{value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden">
              <div className="px-4 lg:px-5 py-4 border-b border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="font-semibold">Reports</h3>
                <div className="flex flex-wrap gap-2">
                  {([
                    "open",
                    "all",
                    "actioned",
                    "dismissed",
                  ] as FilterState[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFilter(option)}
                      className="h-8 px-3 rounded-full text-[14px] font-semibold capitalize"
                      style={{
                        backgroundColor:
                          filter === option ? "#FFF0E6" : "#F5F5F5",
                        color: filter === option ? "#F26B21" : "#6F6F6F",
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {pageMessage && (
                <div className="px-5 py-3 border-b border-[#E5E7EB] text-[16px] text-[#C53D2E] bg-[#FFF7F5]">
                  {pageMessage}
                </div>
              )}

              {loadingReports ? (
                <div className="py-16 text-center text-[16px] text-[#6F6F6F]">
                  Loading reports…
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="py-16 px-5 text-center">
                  <p className="font-semibold">
                    No {filter === "all" ? "" : filter} reports
                  </p>
                  <p className="text-[16px] text-[#8A8A8A] mt-1">
                    Reported comments will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#E5E7EB]">
                  {filteredGroups.map((group) => {
                    const reportedProfile = profiles.get(group.reportedUserId)
                    const recipe = recipes.get(group.recipeId)
                    const currentComment = comments.get(group.commentId)
                    const reasonCounts = new Map<string, number>()

                    group.reports.forEach((report) => {
                      reasonCounts.set(
                        report.reason,
                        (reasonCounts.get(report.reason) ?? 0) + 1,
                      )
                    })

                    const latestReport = [...group.reports].sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime(),
                    )[0]

                    const busy = busyCommentId !== null

                    return (
                      <article key={group.commentId} className="p-4 lg:p-5">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span
                                className="text-[13px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
                                style={{
                                  backgroundColor:
                                    group.status === "open"
                                      ? "#FFF0E6"
                                      : group.status === "actioned"
                                        ? "#EDF7EE"
                                        : "#F2F2F2",
                                  color:
                                    group.status === "open"
                                      ? "#F26B21"
                                      : group.status === "actioned"
                                        ? "#397A46"
                                        : "#6F6F6F",
                                }}
                              >
                                {group.status}
                              </span>
                              <span className="text-[14px] text-[#8A8A8A]">
                                {group.reports.length} report
                                {group.reports.length !== 1 ? "s" : ""}
                              </span>
                              <span className="text-[14px] text-[#8A8A8A]">
                                Latest {formatDate(group.latestAt)}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-2 mb-3">
                              {[...reasonCounts.entries()].map(
                                ([reason, count]) => (
                                  <span
                                    key={reason}
                                    className="text-[14px] rounded-full bg-[#F5F5F5] px-2.5 py-1 text-[#555555]"
                                  >
                                    {REASON_LABELS[reason] ?? reason}
                                    {count > 1 ? ` · ${count}` : ""}
                                  </span>
                                ),
                              )}
                            </div>

                            <div className="rounded-xl bg-[#FAFAFA] border border-[#ECECEC] p-3.5">
                              <p className="text-[14px] font-semibold text-[#8A8A8A] mb-1">
                                Reported comment
                              </p>
                              <p className="text-[16px] leading-6 whitespace-pre-wrap break-words">
                                {currentComment?.content ||
                                  latestReport.comment_snapshot}
                              </p>
                            </div>

                            <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[16px]">
                              <p>
                                <span className="text-[#8A8A8A]">Author:</span>{" "}
                                {reportedProfile?.display_name ||
                                  reportedProfile?.username ||
                                  "Unknown user"}
                              </p>
                              <p>
                                <span className="text-[#8A8A8A]">Recipe:</span>{" "}
                                {recipe?.title || "Unknown recipe"}
                              </p>
                              <p>
                                <span className="text-[#8A8A8A]">
                                  Comment state:
                                </span>{" "}
                                {currentComment?.moderation_status ||
                                  "Unavailable"}
                              </p>
                              {latestReport.details && (
                                <p>
                                  <span className="text-[#8A8A8A]">
                                    Latest note:
                                  </span>{" "}
                                  {latestReport.details}
                                </p>
                              )}
                            </div>

                            {recipe && (
                              <a
                                href={`/?recipe=${recipe.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block mt-3 text-[16px] font-semibold text-[#F26B21]"
                              >
                                Open recipe ↗
                              </a>
                            )}
                          </div>

                          {group.status === "open" && (
                            <div className="flex lg:flex-col gap-2 flex-wrap lg:w-36">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => moderate(group, "dismiss")}
                                className="h-9 px-3 rounded-lg border border-[#D9DDE3] text-[16px] font-medium bg-white disabled:opacity-50"
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => moderate(group, "hide")}
                                className="h-9 px-3 rounded-lg border border-[#F1C8B1] text-[16px] font-medium text-[#C85B20] bg-[#FFF8F4] disabled:opacity-50"
                              >
                                Hide comment
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => moderate(group, "remove")}
                                className="h-9 px-3 rounded-lg border border-[#E9B8B8] text-[16px] font-medium text-[#B83939] bg-[#FFF6F6] disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
