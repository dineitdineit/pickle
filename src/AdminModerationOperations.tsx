import { useCallback, useEffect, useRef, useState } from "react"

import { supabase } from "./lib/supabase"

import { getCurrentUser } from "./lib/auth"

import "./moderation-operations.css"

import ModerationCaseContext from "./ModerationCaseContext"

interface Staff {
  id: string

  name: string

  role: string
}

interface Decision {
  id: string

  case_id: string

  outcome: string

  sanction: string

  state: string

  public_reason: string

  internal_note: string

  updated_at: string
}

interface ReportSnapshot {
  title?: string

  content?: string
}

interface CaseEvent {
  id: string

  action: string

  note: string

  created_at: string
}

interface Case {
  id: string

  target_type: string

  target_id: string

  subject_name: string

  subject_id: string | null

  priority: string

  status: string

  assignee_id: string | null

  due_at: string

  updated_at: string

  previous_violations: number

  reports: {
    id: string

    source: string

    reason: string

    details: string | null

    snapshot: ReportSnapshot
  }[]

  decisions: Decision[]

  events: CaseEvent[]
}

interface Appeal {
  id: string

  user_name: string

  case_id: string

  explanation: string

  public_reason: string

  sanction: string

  due_at: string
}

interface Workspace {
  can_approve: boolean

  staff: Staff[]

  cases: Case[]

  appeals: Appeal[]

  total: number
}

type Run = (
  rpc: string,

  args: Record<string, unknown>,

  verify: (result: any) => boolean,
) => Promise<void>

const outcomes = [
  "dismiss",

  "request_changes",

  "hide",

  "remove",

  "temporary_hide",

  "request_info",
]

const sanctions = [
  "none",

  "warning",

  "restrict_3",

  "suspend_7",

  "suspend_30",

  "permanent",

  "temp_suspend",

  "report_limit_7",
]

const clauses = [
  "none",

  "harassment",

  "sexual_exploitation",

  "privacy",

  "scam_spam",

  "copyright_impersonation",

  "dangerous_content",

  "rating_manipulation",

  "evasion",

  "false_reports",
]

function Options({ values }: { values: string[] }) {
  return (
    <>
      {values.map((value) => (
        <option key={value} value={value}>
          {value.replace(/_/g, " ")}
        </option>
      ))}
    </>
  )
}

function CaseCard({
  item,

  staff,

  actor,

  canApprove,

  busy,

  run,
}: {
  item: Case

  staff: Staff[]

  actor: string

  canApprove: boolean

  busy: boolean

  run: Run
}) {
  const [assignee, setAssignee] = useState(item.assignee_id ?? actor)

  const [priority, setPriority] = useState(item.priority)

  const [outcome, setOutcome] = useState(
    item.target_type === "user" ? "request_changes" : "hide",
  )

  const [sanction, setSanction] = useState("warning")

  const [severity, setSeverity] = useState("minor")

  const [clause, setClause] = useState("none")

  const [reason, setReason] = useState("")

  const [note, setNote] = useState("")

  const [reviewNote, setReviewNote] = useState("")

  const validNote = note.trim().length >= 10

  const validReason = reason.trim().length >= 10

  const decide = () => {
    if (
      !window.confirm(
        `Apply ${outcome} with ${sanction} for ${item.subject_name}? Long suspensions require a separate final approval. Critical proposals immediately hide eligible content and impose a provisional 24-hour suspension.`,
      )
    )
      return

    void run(
      "decide_moderation_case",

      {
        p_case: item.id,

        p_expected: item.updated_at,

        p_outcome: outcome,

        p_severity: severity,

        p_clause: clause,

        p_reason: reason.trim(),

        p_note: note.trim(),

        p_sanction: sanction,
      },

      (data) =>
        !!data?.id &&
        data.case_id === item.id &&
        data.outcome === outcome &&
        data.sanction === sanction,
    )
  }

  return (
    <article>
      <h3>
        <strong>
          {item.target_type} · {item.subject_name}
        </strong>
      </h3>
      <p>
        Priority: {item.priority} · Status: {item.status} · Reports:{" "}
        {item.reports.length} · Confirmed previous incidents in 90 days:{" "}
        {item.previous_violations}
      </p>
      <p
        className={
          item.status !== "closed" && Date.parse(item.due_at) < Date.now()
            ? "overdue"
            : ""
        }
      >
        Target: {new Date(item.due_at).toLocaleString()}
        {item.status !== "closed" && Date.parse(item.due_at) < Date.now()
          ? " · Overdue"
          : ""}
      </p>
      <details>
        <summary>Reports and evidence</summary>
        {item.reports.map((report) => (
          <section key={report.id}>
            <p>
              <strong>{report.reason}</strong> · {report.source}
            </p>
            {report.snapshot.title && <p>{report.snapshot.title}</p>}
            {report.snapshot.content && <pre>{report.snapshot.content}</pre>}
            {report.details && <p>{report.details}</p>}
          </section>
        ))}
      </details>
      <ModerationCaseContext caseId={item.id} />
      {item.status !== "closed" && (
        <form
          onSubmit={(event) => {
            event.preventDefault()

            decide()
          }}
        >
          <label>
            Assigned reviewer
            <select
              disabled={busy}
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
            >
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} ({person.role})
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              disabled={busy}
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <Options values={["urgent", "high", "normal", "needs_info"]} />
            </select>
          </label>
          <label>
            Internal evidence and rationale (not sent to users)
            <textarea
              disabled={busy}
              minLength={10}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !validNote || item.status === "proposed"}
            onClick={() =>
              void run(
                "triage_moderation_case",

                {
                  p_case: item.id,

                  p_expected: item.updated_at,

                  p_assignee: assignee,

                  p_priority: priority,

                  p_note: note.trim(),
                },

                (data) =>
                  data?.id === item.id &&
                  data.assignee_id === assignee &&
                  data.priority === priority,
              )
            }
          >
            Assign / update triage
          </button>
          {item.assignee_id === actor && item.status !== "proposed" && (
            <>
              <label>
                Finding
                <select
                  value={outcome}
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.target.value

                    setOutcome(value)

                    if (
                      value === "dismiss" ||
                      value === "request_info" ||
                      value === "temporary_hide"
                    )
                      setSanction("none")
                  }}
                >
                  <Options values={outcomes} />
                </select>
              </label>
              <label>
                Severity
                <select
                  value={severity}
                  disabled={busy}
                  onChange={(event) => setSeverity(event.target.value)}
                >
                  <Options
                    values={["minor", "standard", "repeated", "critical"]}
                  />
                </select>
              </label>
              <label>
                Policy clause
                <select
                  value={clause}
                  disabled={busy}
                  onChange={(event) => setClause(event.target.value)}
                >
                  <Options values={clauses} />
                </select>
              </label>
              <label>
                Account action
                <select
                  value={sanction}
                  disabled={busy}
                  onChange={(event) => setSanction(event.target.value)}
                >
                  <Options values={sanctions} />
                </select>
              </label>
              <label>
                Public reason (sent to the author)
                <textarea
                  disabled={busy}
                  minLength={10}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={busy || !validNote || !validReason}
              >
                Record decision / proposal
              </button>
            </>
          )}
        </form>
      )}
      {item.decisions.map((decision) => (
        <section key={decision.id}>
          <p>
            <strong>
              {decision.state}: {decision.outcome} · {decision.sanction}
            </strong>
          </p>
          <p>{decision.public_reason}</p>
          {(decision.state === "proposed" ||
            (canApprove &&
              ["confirmed", "temporary"].includes(decision.state))) && (
            <label>
              Separate review note
              <textarea
                disabled={busy}
                minLength={10}
                maxLength={2000}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
              />
            </label>
          )}
          {decision.state === "proposed" && canApprove && (
            <div className="actions">
              {[true, false].map((approve) => (
                <button
                  key={String(approve)}
                  disabled={busy || reviewNote.trim().length < 10}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `${
                          approve ? "Approve and activate" : "Reject"
                        } ${decision.sanction} for ${item.subject_name}?`,
                      )
                    )
                      return

                    void run(
                      "approve_moderation_decision",

                      {
                        p_decision: decision.id,

                        p_expected: decision.updated_at,

                        p_approve: approve,

                        p_note: reviewNote.trim(),
                      },

                      (data) =>
                        data?.id === decision.id &&
                        data.state === (approve ? "confirmed" : "rejected"),
                    )
                  }}
                >
                  {approve ? "Final approval" : "Reject proposal"}
                </button>
              ))}
            </div>
          )}
          {canApprove &&
            ["confirmed", "temporary"].includes(decision.state) && (
              <>
                <label>
                  Public reversal explanation
                  <textarea
                    disabled={busy}
                    minLength={10}
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button
                  disabled={
                    busy || reviewNote.trim().length < 10 || !validReason
                  }
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Reverse this decision, cancel its strike/restriction and restore eligible content?",
                      )
                    )
                      return

                    void run(
                      "revoke_moderation_decision",

                      {
                        p_decision: decision.id,

                        p_reason: reason.trim(),

                        p_note: reviewNote.trim(),
                      },

                      (data) =>
                        data?.id === decision.id && data.state === "overturned",
                    )
                  }}
                >
                  Reverse decision / lift restriction
                </button>
              </>
            )}
        </section>
      ))}
      <details>
        <summary>Audit history</summary>
        {item.events.map((event) => (
          <p key={event.id}>
            {new Date(event.created_at).toLocaleString()} · {event.action}
            <br />
            {event.note}
          </p>
        ))}
      </details>
    </article>
  )
}

function AppealCard({
  item,

  busy,

  run,
}: {
  item: Appeal

  busy: boolean

  run: Run
}) {
  const [response, setResponse] = useState("")

  const [note, setNote] = useState("")

  return (
    <article>
      <strong>
        Appeal · {item.user_name} · {item.sanction}
      </strong>
      <p>{item.public_reason}</p>
      <p>{item.explanation}</p>
      <small>Review target: {new Date(item.due_at).toLocaleString()}</small>
      <label>
        Public explanation
        <textarea
          disabled={busy}
          maxLength={1000}
          value={response}
          onChange={(event) => setResponse(event.target.value)}
        />
      </label>
      <label>
        Internal review note
        <textarea
          disabled={busy}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="actions">
        {["upheld", "overturned"].map((result) => (
          <button
            key={result}
            disabled={
              busy || response.trim().length < 10 || note.trim().length < 10
            }
            onClick={() => {
              if (!window.confirm(`Record appeal result: ${result}?`)) return

              void run(
                "review_moderation_appeal",

                {
                  p_appeal: item.id,

                  p_result: result,

                  p_response: response.trim(),

                  p_note: note.trim(),
                },

                (data) =>
                  data?.id === item.id &&
                  data.status === result &&
                  data.response === response.trim(),
              )
            }}
          >
            {result === "upheld" ? "Uphold decision" : "Overturn decision"}
          </button>
        ))}
      </div>
    </article>
  )
}

export default function AdminModerationOperations() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)

  const [actor, setActor] = useState("")

  const [status, setStatus] = useState("open")

  const [offset, setOffset] = useState(0)

  const [error, setError] = useState("")

  const [busy, setBusy] = useState(false)

  const [message, setMessage] = useState("")

  const guard = useRef(false)

  const request = useRef(0)

  const alive = useRef(true)

  const load = useCallback(async () => {
    const version = ++request.current

    try {
      const [result, auth] = await Promise.all([
        supabase.rpc("get_moderation_workspace", {
          p_status: status,

          p_offset: offset,
        }),

        getCurrentUser(),
      ])

      if (
        result.error ||
        auth.error ||
        !auth.data.user ||
        !Array.isArray(result.data?.cases) ||
        !Array.isArray(result.data.appeals)
      )
        throw result.error ?? new Error("Invalid workspace")

      if (version !== request.current || !alive.current) return

      setWorkspace(result.data)

      setActor(auth.data.user.id)

      setError("")
    } catch {
      if (version === request.current && alive.current)
        setError("Could not load moderation operations.")
    }
  }, [status, offset])

  useEffect(() => {
    alive.current = true

    void load()

    const timer = window.setInterval(() => {
      if (!guard.current && document.visibilityState === "visible") void load()
    }, 60000)

    return () => {
      window.clearInterval(timer)

      alive.current = false

      request.current++
    }
  }, [load])

  async function run(
    rpc: string,

    args: Record<string, unknown>,

    verify: (result: any) => boolean,
  ) {
    if (guard.current) return

    guard.current = true

    setBusy(true)

    setError("")

    setMessage("")

    try {
      const { data, error: failure } = await supabase.rpc(rpc, args)

      if (failure || !verify(data))
        throw failure ?? new Error("Action not confirmed")

      if (!alive.current) return

      setMessage(
        "Confirmed and recorded. Check the updated case and audit history.",
      )

      await load()
    } catch (failure: any) {
      if (alive.current)
        setError(
          failure?.message ||
            "Action was not confirmed. Reload before retrying.",
        )
    } finally {
      guard.current = false

      if (alive.current) setBusy(false)
    }
  }

  return (
    <section className="moderation-operations">
      <h2>Moderation operations</h2>
      <p>
        Group duplicate reports, assign an uninvolved reviewer and document the
        evidence. Report count alone never creates a strike. Urgent/high:
        24-hour target; normal: 3 business days. These are operational targets.
      </p>
      <p>
        Official accounts approve long/permanent sanctions. If no official
        account exists, an administrator is the responsible operator. A separate
        final review step is required even for a single operator.
      </p>
      <div className="actions">
        <select
          disabled={busy}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)

            setOffset(0)

            setWorkspace(null)
          }}
        >
          <Options values={["open", "closed", "all"]} />
        </select>
        <button disabled={busy} onClick={() => void load()}>
          Reload
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!workspace && !error && <p>Loading operations…</p>}
      {workspace && (
        <>
          <h3>Appeals ({workspace.appeals.length})</h3>
          {workspace.appeals.map((item) => (
            <AppealCard key={item.id} item={item} busy={busy} run={run} />
          ))}
          <h3>Cases ({workspace.total})</h3>
          {workspace.cases.map((item) => (
            <CaseCard
              key={`${item.id}:${item.updated_at}`}
              item={item}
              staff={workspace.staff}
              actor={actor}
              canApprove={workspace.can_approve}
              busy={busy}
              run={run}
            />
          ))}
          {!workspace.cases.length && <p>No cases in this filter.</p>}
          <div className="actions">
            <button
              disabled={busy || offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 25))}
            >
              Previous
            </button>
            <button
              disabled={busy || offset + 25 >= workspace.total}
              onClick={() => setOffset((value) => value + 25)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  )
}
