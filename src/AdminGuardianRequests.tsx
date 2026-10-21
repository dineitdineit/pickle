import { useEffect, useRef, useState } from "react"
import { supabase } from "./lib/supabase"

interface Request {
  request_id: string
  user_id: string
  username: string
  display_name: string
  policy_version: string
  status: string
  requested_at: string
  evidence_reference: string | null
}
export default function AdminGuardianRequests() {
  const [status, setStatus] = useState("pending")
  const [offset, setOffset] = useState(0)
  const [requests, setRequests] = useState<Request[]>([])
  const [selected, setSelected] = useState<Request | null>(null)
  const [reference, setReference] = useState("")
  const [verified, setVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(false)
  const guard = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    setRequests([])
    setSelected(null)
    setLoading(true)
    setError("")
    void (async () => {
      try {
        const result = await supabase.rpc("admin_guardian_requests_page", {
          p_status: status,
          p_offset: offset,
        })
        if (result.error || !Array.isArray(result.data))
          throw new Error("Could not load guardian requests.")
        if (generation.current === current) setRequests(result.data)
      } catch {
        if (generation.current === current)
          setError("Could not load guardian requests.")
      } finally {
        if (generation.current === current) setLoading(false)
      }
    })()
    return () => {
      generation.current++
    }
  }, [status, offset, refresh])
  async function review(decision: string) {
    if (
      !selected ||
      guard.current ||
      reference.trim().length < 6 ||
      (decision === "approved" && !verified)
    )
      return
    guard.current = true
    setBusy(true)
    setError("")
    const current = generation.current
    try {
      const result = await supabase.rpc("review_guardian_consent", {
        p_request_id: selected.request_id,
        p_decision: decision,
        p_evidence_reference: reference.trim(),
        p_verified: verified,
      })
      if (generation.current !== current) return
      if (
        result.error ||
        result.data?.request_id !== selected.request_id ||
        result.data?.status !== decision
      )
        throw new Error(
          "Decision was not confirmed. Reload the request before retrying.",
        )
      setRefresh((value) => value + 1)
    } catch (failure) {
      if (generation.current === current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not review consent.",
        )
    } finally {
      guard.current = false
      if (generation.current === current) setBusy(false)
    }
  }
  return (
    <details className="admin-report-card mb-5">
      <summary>Guardian consent requests</summary>
      <p>
        Manual review for accounts declared age 13. Check explicit consent and
        the adult guardian’s authority in the official mailbox before approving.
        An account holder’s statement alone is insufficient. Store only an
        internal evidence reference here, without email contents or identity
        documents.
      </p>
      <label>
        Status{" "}
        <select
          disabled={busy}
          value={status}
          onChange={(event) => {
            setOffset(0)
            setStatus(event.target.value)
          }}
        >
          {["pending", "approved", "declined", "revoked"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => setRefresh((value) => value + 1)}
      >
        Reload requests
      </button>
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !requests.length && <p>No {status} requests.</p>}
      <ul>
        {requests.map((request) => (
          <li key={request.request_id} className="mt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSelected(request)
                setReference("")
                setVerified(false)
                setError("")
              }}
            >
              {request.display_name || request.username} — {request.request_id}
            </button>
            <p className="text-label">
              {request.policy_version} ·{" "}
              {new Date(request.requested_at).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
      {selected && (
        <section className="space-y-3 mt-4">
          <h3>Review request: {selected.request_id}</h3>
          <p>Previous reference: {selected.evidence_reference || "None"}</p>
          <label className="block">
            Internal evidence reference
            <input
              className="block border rounded-lg p-2 w-full"
              disabled={busy}
              minLength={6}
              maxLength={160}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Consent case/ticket number"
            />
          </label>
          {selected.status !== "approved" && (
            <label className="block">
              <input
                type="checkbox"
                disabled={busy}
                checked={verified}
                onChange={(event) => setVerified(event.target.checked)}
              />{" "}
              I reviewed explicit current-policy consent from an adult
              parent/legal guardian and confirmed their authority.
            </label>
          )}
          <div className="flex gap-4">
            {selected.status !== "approved" && (
              <>
                <button
                  type="button"
                  disabled={busy || !verified || reference.trim().length < 6}
                  onClick={() => void review("approved")}
                >
                  Approve activation
                </button>
                {selected.status === "pending" && (
                  <button
                    type="button"
                    disabled={busy || reference.trim().length < 6}
                    onClick={() => void review("declined")}
                  >
                    Decline
                  </button>
                )}
              </>
            )}
            {selected.status === "approved" && (
              <button
                type="button"
                disabled={busy || reference.trim().length < 6}
                onClick={() => void review("revoked")}
              >
                Record withdrawal and pause account
              </button>
            )}
          </div>
        </section>
      )}
      <div className="flex gap-4 mt-3">
        <button
          type="button"
          disabled={busy || loading || offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 50))}
        >
          Previous requests
        </button>
        <button
          type="button"
          disabled={busy || loading || requests.length < 50 || offset >= 100000}
          onClick={() => setOffset((value) => value + 50)}
        >
          Next requests
        </button>
      </div>
      <p className="text-label">
        Showing up to 50 requests, page {Math.floor(offset / 50) + 1}. Guardian
        receipts remain in the operator’s mailbox under separate retention
        controls.
      </p>
    </details>
  )
}
