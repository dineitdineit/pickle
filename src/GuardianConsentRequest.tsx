import { useEffect, useState } from "react"

import { validatePolicyState, type ContentPolicyState } from "./ContentConsent"

import { guardianEmailBody, type AccountAgeStatus } from "./lib/age"

import { supabase } from "./lib/supabase"

export default function GuardianConsentRequest({
  status,

  busy,

  onRequest,
}: {
  status: AccountAgeStatus

  busy: boolean

  onRequest: () => void
}) {
  const [policy, setPolicy] = useState<ContentPolicyState | null>(null)

  const [error, setError] = useState("")

  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true

    setPolicy(null)

    setError("")

    setCopied(false)

    void (async () => {
      try {
        const result = await supabase.rpc("get_content_policy_state")

        if (result.error) throw result.error

        const current = validatePolicyState(result.data, status.user_id)

        if (current.version !== status.guardian_policy_version)
          throw new Error(
            "Policy changed. Retry the eligibility check to prepare the current request.",
          )

        if (alive) setPolicy(current)
      } catch {
        if (alive)
          setError(
            "Could not load the matching policies. Retry the eligibility check.",
          )
      }
    })()

    return () => {
      alive = false
    }
  }, [status.user_id, status.guardian_policy_version])

  const body =
    status.guardian_request_id && policy
      ? guardianEmailBody(status.guardian_request_id, policy.version)
      : ""

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable")

      await navigator.clipboard.writeText(body)

      setCopied(true)
    } catch {
      setError("Please copy the statement from the section below.")
    }
  }

  const documents = policy
    ? [
        { title: "Terms of Service", sections: policy.terms },

        { title: "Content Policy", sections: policy.content_policy },
      ]
    : []

  return (
    <section
      className="eligibility-guardian"
      aria-labelledby="guardian-heading"
    >
      <span className="eligibility-status">
        {status.guardian_status === "declined"
          ? "Review needed"
          : status.guardian_status === "revoked"
            ? "Consent withdrawn"
            : "Awaiting guardian consent"}
      </span>
      <h2 id="guardian-heading">Parent or guardian consent</h2>
      <p>
        {status.guardian_status === "declined"
          ? "The consent request was declined. Your guardian can contact us to ask for a review."
          : status.guardian_status === "revoked"
            ? "Guardian consent has been withdrawn. Account features are paused. Your guardian can contact us for help or deletion."
            : "Your account stays inactive while we confirm consent from your parent or legal guardian."}
      </p>
      {status.guardian_request_id ? (
        <>
          <div className="eligibility-request">
            <span>Request number</span>
            <strong>{status.guardian_request_id}</strong>
          </div>
          <ol className="eligibility-steps">
            <li>
              Show your guardian the Privacy Policy below and the Terms and
              Content Policy here.
            </li>
            <li>
              Ask them to send their completed consent statement from their own
              email to admin@getpickleapp.com.
            </li>
            <li>
              We’ll review their consent and authority before approving your
              account.
            </li>
          </ol>
          <p className="eligibility-hint">
            Do not send government IDs or your full birth date.
          </p>
          {policy && (
            <>
              <div className="eligibility-guardian-documents">
                {documents.map(({ title, sections }) => (
                  <details key={title}>
                    <summary>{title}</summary>
                    <div className="eligibility-document-body">
                      <p className="eligibility-guardian-version">
                        Policy version: {policy.version}
                      </p>
                      {sections.map((section) => (
                        <section key={section.title}>
                          <h3>{section.title}</h3>
                          <p>{section.body}</p>
                        </section>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
              <a
                className="eligibility-button eligibility-button-primary"
                href={`mailto:admin@getpickleapp.com?subject=${encodeURIComponent(`Pickle guardian consent — ${status.guardian_request_id}`)}&body=${encodeURIComponent(body)}`}
              >
                Prepare guardian email
              </a>
              <button
                type="button"
                className="eligibility-button eligibility-button-secondary"
                onClick={() => void copy()}
              >
                Copy guardian statement
              </button>
              <details className="eligibility-statement">
                <summary>Guardian consent statement</summary>
                <div className="eligibility-document-body">
                  <p className="whitespace-pre-wrap">{body}</p>
                </div>
              </details>
              {copied && (
                <p className="eligibility-hint" role="status">
                  Statement copied.
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          className="eligibility-button eligibility-button-primary"
          onClick={onRequest}
        >
          {busy ? "Preparing…" : "Prepare consent request"}
        </button>
      )}
      {error && (
        <p className="eligibility-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
