import PickleLogo from "./PickleLogo"

import "./account-eligibility.css"

import GuardianConsentRequest from "./GuardianConsentRequest"

import {
  clearDeletedAccountCache,
  confirmedDeletionReceipt,
  rememberDeletionReceipt,
} from "./lib/accountData"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { supabase } from "./lib/supabase"

import {
  checkedAgeStatus,
  isEligibleBirthday,
  type AccountAgeStatus,
} from "./lib/age"

import { privacySections, termsSections } from "./profileContent"

export default function AccountAgeGate({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null | undefined>(undefined)

  const [eligible, setEligible] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const [birthday, setBirthday] = useState("")

  const [busy, setBusy] = useState(false)

  const [retry, setRetry] = useState(0)

  const [ageStatus, setAgeStatus] = useState<AccountAgeStatus | null>(null)

  const generation = useRef(0)

  const guard = useRef(false)

  useEffect(() => {
    let alive = true

    let authEvent = false

    const apply = (id: string | null) => {
      if (!alive) return

      setUserId(id)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authEvent = true

      apply(
        session?.user && !session.user.is_anonymous ? session.user.id : null,
      )
    })

    void supabase.auth.getSession().then(({ data, error: failure }) => {
      if (!alive || authEvent) return

      if (failure) {
        setError("Could not verify your session. Please reload.")

        setLoading(false)

        return
      }

      apply(
        data.session?.user && !data.session.user.is_anonymous
          ? data.session.user.id
          : null,
      )
    })

    return () => {
      alive = false

      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const current = ++generation.current

    setBirthday("")

    guard.current = false

    setBusy(false)

    setEligible(null)

    setAgeStatus(null)

    setError("")

    if (userId === undefined) return

    if (!userId) {
      setLoading(false)

      return
    }

    setLoading(true)

    void supabase

      .rpc("get_account_age_status_v2")

      .then(({ data, error: failure }) => {
        if (generation.current !== current) return

        try {
          if (failure) throw failure

          const status = checkedAgeStatus(data, userId)

          setAgeStatus(status)

          setEligible(status.eligible ? userId : null)
        } catch {
          setError("Could not check your account eligibility. Please retry.")
        }

        setLoading(false)
      })

    return () => {
      generation.current++
    }
  }, [userId, retry])

  useEffect(() => {
    if (!userId || !ageStatus?.guardian_required) return

    let alive = true

    let checking = false

    const current = generation.current

    async function check() {
      if (checking || document.visibilityState === "hidden") return

      checking = true

      try {
        const result = await supabase.rpc("get_account_age_status_v2")

        if (!alive || generation.current !== current) return

        if (result.error) throw result.error

        const status = checkedAgeStatus(result.data, userId!)

        setAgeStatus(status)

        setEligible(status.eligible ? userId! : null)
      } catch {
        if (alive && generation.current === current) {
          setEligible(null)

          setError(
            "Could not confirm guardian consent. Retry the eligibility check.",
          )
        }
      } finally {
        checking = false
      }
    }

    const timer = window.setInterval(() => void check(), 30000)

    const focus = () => void check()

    window.addEventListener("focus", focus)

    return () => {
      alive = false

      window.clearInterval(timer)

      window.removeEventListener("focus", focus)
    }
  }, [userId, ageStatus?.guardian_required, retry])

  async function confirmAge() {
    if (!userId || guard.current) return

    if (!isEligibleBirthday(birthday)) {
      setError("You must be 13 or older to use a Pickle account.")

      return
    }

    guard.current = true

    setBusy(true)

    setError("")

    const current = generation.current

    try {
      const { data, error: failure } = await supabase.rpc(
        "confirm_account_age_v2",

        { p_birth_date: birthday },
      )

      if (generation.current !== current) return

      if (failure)
        throw new Error("Your age confirmation was not saved. Please retry.")

      const status = checkedAgeStatus(data, userId)

      setAgeStatus(status)

      setBirthday("")

      setEligible(status.eligible ? userId : null)
    } catch (failure) {
      if (generation.current === current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not confirm eligibility.",
        )
    } finally {
      if (generation.current === current) {
        guard.current = false

        setBusy(false)
      }
    }
  }

  async function startGuardianRequest() {
    if (!userId || guard.current) return

    guard.current = true

    setBusy(true)

    setError("")

    const current = generation.current

    try {
      const result = await supabase.rpc("request_guardian_consent")

      if (generation.current !== current) return

      if (result.error)
        throw new Error("Could not prepare the guardian request. Please retry.")

      setAgeStatus(checkedAgeStatus(result.data, userId))
    } catch (failure) {
      if (generation.current === current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not prepare the request.",
        )
    } finally {
      if (generation.current === current) {
        guard.current = false

        setBusy(false)
      }
    }
  }

  async function deleteAccount() {
    if (
      guard.current ||
      !window.confirm(
        "Request deletion of your account, published recipes and photos? Failed cleanup retries automatically. Minimal receipts/backups expire in 30 days; minimum enforcement history follows the 90-day policy. This cannot be undone.",
      )
    )
      return

    guard.current = true

    setBusy(true)

    setError("")

    const current = generation.current

    try {
      const { data, error: failure } = await supabase.functions.invoke(
        "delete-account",

        { method: "POST" },
      )

      if (generation.current !== current) return

      if (failure || !userId)
        throw new Error(
          "Could not accept deletion. Contact admin@getpickleapp.com.",
        )

      const receipt = confirmedDeletionReceipt(data, userId)

      rememberDeletionReceipt(receipt)

      if (userId && !(await clearDeletedAccountCache(userId)))
        window.alert(
          "Account deletion was requested, but this device’s cached drafts could not be cleared. Clear Pickle’s app storage in Android Settings, or clear this site’s data in your browser.",
        )

      await supabase.auth.signOut({ scope: "local" })

      window.location.replace("/")
    } catch (failure) {
      if (generation.current === current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not delete account.",
        )
    } finally {
      if (generation.current === current) {
        guard.current = false

        setBusy(false)
      }
    }
  }

  if (userId === null || (userId && eligible === userId)) return children

  const sessionFailed = !loading && userId === undefined

  const guardianRequired = !!ageStatus?.guardian_required

  return (
    <main className="eligibility-screen">
      <div className="eligibility-shell">
        <header className="eligibility-brand">
          <PickleLogo size={28} iconSize={40} />
        </header>
        <section
          className="eligibility-card"
          aria-labelledby="eligibility-title"
          aria-busy={loading}
        >
          <header className="eligibility-heading">
            <h1 id="eligibility-title">
              {loading ? "Checking your account…" : "Account Eligibility"}
            </h1>
            {(sessionFailed || guardianRequired) && (
              <p>
                {sessionFailed
                  ? "We couldn’t verify your session. Reload to try again."
                  : "Let’s complete your guardian’s consent review."}
              </p>
            )}
          </header>
          {loading ? (
            <div className="eligibility-loading" role="status">
              <span className="eligibility-spinner" aria-hidden="true" />
              Please wait a moment.
            </div>
          ) : sessionFailed ? (
            <button
              type="button"
              className="eligibility-button eligibility-button-primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          ) : guardianRequired && ageStatus ? (
            <GuardianConsentRequest
              key={`${ageStatus.user_id}:${ageStatus.guardian_request_id}`}
              status={ageStatus}
              busy={busy}
              onRequest={() => void startGuardianRequest()}
            />
          ) : (
            <>
              <div className="eligibility-age-note">
                <strong>For ages 13 and over</strong>
                <p>
                  At age 13, a parent or legal guardian must confirm consent
                  before your account can be activated.
                </p>
              </div>
              <form
                className="eligibility-form"
                onSubmit={(event) => {
                  event.preventDefault()

                  void confirmAge()
                }}
              >
                <label htmlFor="eligibility-birthday">Date of birth</label>
                <input
                  id="eligibility-birthday"
                  type="date"
                  required
                  value={birthday}
                  disabled={busy}
                  onChange={(event) => setBirthday(event.target.value)}
                  aria-describedby="eligibility-date-help"
                />
                <p id="eligibility-date-help" className="eligibility-hint">
                  Your birth date is used for this check and isn’t saved.
                </p>
                <button
                  disabled={busy || !birthday}
                  className="eligibility-button eligibility-button-primary"
                >
                  {busy ? "Checking…" : "Continue"}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </button>
              </form>
            </>
          )}
          {error && (
            <p className="eligibility-error" role="alert">
              {error}
            </p>
          )}
          {!loading && !sessionFailed && (guardianRequired || error) && (
            <button
              type="button"
              className="eligibility-button eligibility-button-secondary"
              disabled={busy}
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry eligibility check
            </button>
          )}
          <div className="eligibility-documents">
            <details>
              <summary>About this check</summary>
              <div className="eligibility-document-body">
                <p>
                  We retain the eligibility result, rule version and
                  confirmation time. Age entry is a self-declaration. Your birth
                  date is used to check eligibility and isn’t saved.
                </p>
              </div>
            </details>
            <details>
              <summary>Privacy Policy</summary>
              <div className="eligibility-document-body">
                {privacySections.map((section) => (
                  <section key={section.title}>
                    <h2>{section.title}</h2>
                    <p>{section.body}</p>
                  </section>
                ))}
              </div>
            </details>
            {!guardianRequired && (
              <details>
                <summary>Terms of Service</summary>
                <div className="eligibility-document-body">
                  {termsSections.map((section) => (
                    <section key={section.title}>
                      <h2>{section.title}</h2>
                      <p>{section.body}</p>
                    </section>
                  ))}
                </div>
              </details>
            )}
          </div>
        </section>
        <footer className="eligibility-footer">
          <p>
            Need a hand?
            <a href="mailto:admin@getpickleapp.com">admin@getpickleapp.com</a>
          </p>
          {!sessionFailed && (
            <div className="eligibility-account-actions">
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => void supabase.auth.signOut()}
              >
                Sign out
              </button>
              <span aria-hidden="true" />
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => void deleteAccount()}
              >
                Delete account
              </button>
            </div>
          )}
        </footer>
      </div>
    </main>
  )
}
