import { useCallback, useEffect, useRef, useState } from "react"

import { supabase } from "./lib/supabase"

import BackIcon from "./BackIcon"

import "./moderation-operations.css"

export interface AccountRestriction {
  id: string

  kind: string

  starts_at: string

  ends_at: string | null
}

export interface OwnDecision {
  id: string

  case_id: string

  outcome: string

  clause: string

  public_reason: string

  sanction: string

  state: string

  notified_at: string

  target_type: string

  target_id: string

  target_title?: string | null

  can_appeal: boolean

  appeal: {
    id: string

    status: string

    explanation: string

    response: string | null
  } | null
}

export interface AccountStatus {
  user_id: string

  can_publish: boolean

  can_message: boolean

  can_social: boolean

  can_report: boolean

  restrictions: AccountRestriction[]

  decisions: OwnDecision[]
}

async function loadAccountStatus(userId: string): Promise<AccountStatus> {
  const { data, error } = await supabase.rpc("get_my_moderation")

  if (
    error ||
    data?.user_id !== userId ||
    !Array.isArray(data.restrictions) ||
    !Array.isArray(data.decisions)
  )
    throw new Error("Could not load your account status. Please retry.")

  return data
}

export function AccountRestrictionBanner({
  userId,

  onOpen,
}: {
  userId: string | null

  onOpen: () => void
}) {
  const [restricted, setRestricted] = useState(false)

  useEffect(() => {
    let ignore = false

    setRestricted(false)

    const refresh = async () => {
      if (!userId) return

      try {
        const state = await loadAccountStatus(userId)

        if (!ignore) setRestricted(state.restrictions.length > 0)
      } catch {
        /* Next refresh retries; server guards remain active. */
      }
    }

    void refresh()

    window.addEventListener("pickle:safety-refresh", refresh)

    return () => {
      ignore = true

      window.removeEventListener("pickle:safety-refresh", refresh)
    }
  }, [userId])

  if (!restricted) return null

  return (
    <button className="account-restriction-banner" onClick={onOpen}>
      Your account has restrictions. View reason, duration and appeal options.
    </button>
  )
}

export default function AccountStatusScreen({
  userId,

  onBack,
}: {
  userId: string

  onBack: () => void
}) {
  const [data, setData] = useState<AccountStatus | null>(null)

  const [error, setError] = useState("")

  const [busy, setBusy] = useState(false)

  const [explanations, setExplanations] = useState<Record<string, string>>({})

  const [message, setMessage] = useState("")

  const guard = useRef(false)

  const generation = useRef(0)

  const load = useCallback(async () => {
    const version = ++generation.current

    try {
      const status = await loadAccountStatus(userId)

      if (version === generation.current) {
        setData(status)

        setError("")
      }
    } catch (failure) {
      if (version === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load account status.",
        )
    }
  }, [userId])

  useEffect(() => {
    void load()

    const refresh = () => {
      void load()
    }

    window.addEventListener("pickle:safety-refresh", refresh)

    return () => {
      generation.current++

      window.removeEventListener("pickle:safety-refresh", refresh)
    }
  }, [load])

  async function appeal(decision: OwnDecision) {
    const explanation = explanations[decision.id]?.trim() ?? ""

    if (guard.current || explanation.length < 20 || explanation.length > 2000)
      return

    guard.current = true

    setBusy(true)

    setError("")

    setMessage("")

    const version = generation.current

    try {
      const { data: result, error: failure } = await supabase.rpc(
        "submit_moderation_appeal",

        { p_decision: decision.id, p_explanation: explanation },
      )

      if (
        failure ||
        !result?.id ||
        result.decision_id !== decision.id ||
        result.explanation !== explanation
      )
        throw new Error("Appeal was not confirmed. Reload before retrying.")

      if (version !== generation.current) return

      setMessage("Appeal received. We aim to review it within 7 business days.")

      await load()
    } catch (failure) {
      if (version === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not submit appeal.",
        )
    } finally {
      guard.current = false

      setBusy(false)
    }
  }

  return (
    <div className="account-status-screen">
      <header>
        <button aria-label="Back" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>Account status</h1>
      </header>
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => void load()} disabled={busy}>
            Retry
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!data && !error && <p>Loading account status…</p>}
      {data && (
        <>
          <h2>Current restrictions</h2>
          {!data.restrictions.length && <p>No active account restrictions.</p>}
          {data.restrictions.map((restriction) => (
            <article key={restriction.id}>
              <strong>{restriction.kind.replace(/_/g, " ")}</strong>
              <p>
                {restriction.ends_at
                  ? `Ends: ${new Date(restriction.ends_at).toLocaleString()}`
                  : "No automatic end date"}
              </p>
            </article>
          ))}
          <p>
            Warnings do not block account features. A 3-day restriction blocks
            publishing, photo uploads and messages. Suspensions also restrict
            social interactions. You can still view notices, report concerns,
            appeal, delete your own content or delete your account.
          </p>
          <h2>Review history</h2>
          {!data.decisions.length && <p>No moderation decisions.</p>}
          {data.decisions.map((decision) => (
            <article key={decision.id}>
              <strong>
                {decision.target_type} · {decision.outcome.replace(/_/g, " ")}
              </strong>
              {decision.target_title && <p>{decision.target_title}</p>}
              <p>Clause: {decision.clause.replace(/_/g, " ")}</p>
              <p>{decision.public_reason}</p>
              <p>
                Account action: {decision.sanction.replace(/_/g, " ")} ·{" "}
                {decision.state}
              </p>
              <small>{new Date(decision.notified_at).toLocaleString()}</small>
              {decision.appeal && (
                <div>
                  <p>Appeal: {decision.appeal.status}</p>
                  {decision.appeal.response && (
                    <p>{decision.appeal.response}</p>
                  )}
                </div>
              )}
              {decision.can_appeal && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()

                    void appeal(decision)
                  }}
                >
                  <label>
                    Explain why this decision should be reviewed
                    <textarea
                      required
                      minLength={20}
                      maxLength={2000}
                      disabled={busy}
                      value={explanations[decision.id] ?? ""}
                      onChange={(event) =>
                        setExplanations((current) => ({
                          ...current,

                          [decision.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    disabled={
                      busy ||
                      (explanations[decision.id]?.trim().length ?? 0) < 20
                    }
                  >
                    {busy ? "Submitting…" : "Submit appeal"}
                  </button>
                </form>
              )}
            </article>
          ))}
          <p>
            Appeals can be submitted within 14 days of a decision notice. For
            additional information, contact{" "}
            <a href="mailto:admin@getpickleapp.com">admin@getpickleapp.com</a>.
          </p>
        </>
      )}
    </div>
  )
}
