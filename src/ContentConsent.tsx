import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { supabase } from "./lib/supabase"
import "./content-consent.css"

export interface PolicySection {
  title: string
  body: string
}
export interface ContentPolicyState {
  user_id: string
  version: string
  terms: PolicySection[]
  content_policy: PolicySection[]
  accepted: boolean
}
export function validatePolicyState(
  value: unknown,
  userId: string,
): ContentPolicyState {
  const state = value as ContentPolicyState | null
  const sections = (rows: unknown) =>
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every(
      (row) => typeof row?.title === "string" && typeof row?.body === "string",
    )
  if (
    !state ||
    state.user_id !== userId ||
    typeof state.version !== "string" ||
    !state.version ||
    typeof state.accepted !== "boolean" ||
    !sections(state.terms) ||
    !sections(state.content_policy)
  )
    throw new Error("Could not verify the content policy. Please try again.")
  return state
}
export async function acceptContentPolicy(
  policy: ContentPolicyState,
  terms: boolean,
  content: boolean,
) {
  if (!terms || !content) throw new Error("Please agree to both policies.")
  const { data, error } = await supabase.rpc("accept_content_policy", {
    p_version: policy.version,
    p_terms_accepted: terms,
    p_content_accepted: content,
  })
  if (error)
    throw new Error(
      error.code === "40001"
        ? "The policy has changed. Cancel and try again to review the latest version."
        : "Could not save your agreement. Please try again.",
    )
  const confirmed = validatePolicyState(data, policy.user_id)
  if (!confirmed.accepted || confirmed.version !== policy.version)
    throw new Error("Your agreement was not confirmed. Please try again.")
}

export function ContentConsentDialog({
  policy,
  onDone,
}: {
  policy: ContentPolicyState
  onDone: (accepted: boolean) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const guard = useRef(false)
  const [terms, setTerms] = useState(false)
  const [content, setContent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  async function accept() {
    if (guard.current || !terms || !content) return
    guard.current = true
    setBusy(true)
    setError("")
    try {
      await acceptContentPolicy(policy, terms, content)
      onDone(true)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save your agreement.",
      )
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="content-consent-dialog"
      aria-labelledby="content-consent-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!guard.current) onDone(false)
      }}
    >
      <h2 id="content-consent-title">Before you share</h2>
      <p>
        Read and agree to both policies before sharing recipes, photos,
        comments, reviews or messages.
      </p>
      <small>Policy version: {policy.version}</small>
      <div className="content-consent-documents">
        <details>
          <summary>Terms of Service</summary>
          {policy.terms.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </details>
        <details>
          <summary>Content Policy</summary>
          {policy.content_policy.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </details>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void accept()
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={terms}
            disabled={busy}
            onChange={(event) => setTerms(event.target.checked)}
          />
          I agree to the Terms of Service.
        </label>
        <label>
          <input
            type="checkbox"
            checked={content}
            disabled={busy}
            onChange={(event) => setContent(event.target.checked)}
          />
          I agree to the Content Policy.
        </label>
        {error && (
          <p role="alert" className="content-consent-error">
            {error}
          </p>
        )}
        <div className="content-consent-actions">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => onDone(false)}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy || !terms || !content}>
            {busy ? "Saving…" : "Agree and continue"}
          </button>
        </div>
      </form>
    </dialog>
  )
}

const pending = new Map<string, Promise<boolean>>()
// No local acceptance cache: every operation checks the account and current server version.
export async function requireContentConsent(userId: string): Promise<boolean> {
  const existing = pending.get(userId)
  if (existing) return existing
  const task = (async () => {
    const { data, error } = await supabase.rpc("get_content_policy_state")
    if (error)
      throw new Error("Could not load the content policy. Please try again.")
    const policy = validatePolicyState(data, userId)
    if (policy.accepted) return true
    return new Promise<boolean>((resolve) => {
      const previousFocus = document.activeElement as HTMLElement | null
      const host = document.createElement("div")
      document.body.appendChild(host)
      const root = createRoot(host)
      let settled = false
      let subscription: { unsubscribe: () => void } | undefined
      const finish = (accepted: boolean) => {
        if (settled) return
        settled = true
        subscription?.unsubscribe()
        queueMicrotask(() => {
          root.unmount()
          host.remove()
          previousFocus?.focus()
          resolve(accepted)
        })
      }
      const authListener = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (session?.user.id !== userId) finish(false)
        },
      )
      subscription = authListener.data.subscription
      if (settled) subscription.unsubscribe()
      root.render(<ContentConsentDialog policy={policy} onDone={finish} />)
    })
  })()
  pending.set(userId, task)
  try {
    return await task
  } finally {
    if (pending.get(userId) === task) pending.delete(userId)
  }
}
