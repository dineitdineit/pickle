import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { supabase } from "./lib/supabase"
import "./reports.css"

export const reportReasons = {
  spam: "Spam",
  harassment: "Harassment",
  hate_or_abusive: "Hate or abusive content",
  sexual_content: "Sexual content",
  personal_information: "Personal information",
  off_topic: "Off-topic",
  other: "Other",
}
export const reportTypeLabels = {
  recipe: "recipe",
  review: "review",
  user: "user",
  post: "post",
  post_comment: "post comment",
  message: "message",
}
export type ReportType = keyof typeof reportTypeLabels
interface Props {
  targetType: ReportType
  targetId: string
  userId: string | null
  onRequireLogin: () => void
  iconOnly?: boolean
}
export default function ReportButton(props: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={props.iconOnly ? "user-profile-icon" : "report-button"}
        aria-label={`Report ${reportTypeLabels[props.targetType]}`}
        onClick={() => (props.userId ? setOpen(true) : props.onRequireLogin())}
      >
        {props.iconOnly ? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        ) : (
          `Report ${reportTypeLabels[props.targetType]}`
        )}
      </button>
      {open && (
        <ReportDialog
          key={`${props.targetId}:${props.userId}`}
          {...props}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
interface DialogProps extends Props {
  onClose: () => void
}
export function ReportDialog({
  targetType,
  targetId,
  userId,
  onRequireLogin,
  onClose,
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const guard = useRef(false)
  const alive = useRef(true)
  const heading = useId()
  const [reason, setReason] = useState("")
  const [details, setDetails] = useState("")
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    alive.current = true
    dialog.current?.showModal()
    return () => {
      alive.current = false
    }
  }, [])
  async function submit() {
    if (!userId) {
      onClose()
      onRequireLogin()
      return
    }
    if (guard.current || !reason) return
    guard.current = true
    setBusy(true)
    setError("")
    try {
      const { data, error: failure } = await supabase.rpc(
        "submit_content_report",
        {
          p_type: targetType,
          p_target_id: targetId,
          p_reason: reason,
          p_details: details.trim() || null,
        },
      )
      if (
        failure ||
        !data?.id ||
        data.target_id !== targetId ||
        data.target_type !== targetType ||
        data.status !== "open"
      )
        throw failure ?? new Error("Report confirmation missing")
      if (alive.current) setSuccess(true)
    } catch (failure) {
      if (alive.current)
        setError(
          (failure as { code?: string })?.code === "54000"
            ? "You have reached the daily report limit. Try again later or contact admin@getpickleapp.com for urgent help."
            : "Could not submit your report. Please try again. The content may no longer be available.",
        )
    } finally {
      guard.current = false
      if (alive.current) setBusy(false)
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="report-dialog"
      aria-labelledby={heading}
      onCancel={(event) => {
        if (guard.current) event.preventDefault()
        else onClose()
      }}
    >
      <h2 id={heading}>Report {reportTypeLabels[targetType]}</h2>
      {targetType === "message" && !success && (
        <p>
          Only this message and its attached photo will be shared with the
          moderation team. Other messages in this conversation are not included.
        </p>
      )}
      {success ? (
        <>
          <p role="status">Your report has been sent for review.</p>
          <button
            type="button"
            autoFocus
            className="report-primary"
            onClick={onClose}
          >
            Done
          </button>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label>
            Reason
            <select
              required
              autoFocus
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="" disabled>
                Select a reason
              </option>
              {Object.entries(reportReasons).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Additional details (optional)
            <textarea
              maxLength={500}
              rows={3}
              disabled={busy}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </label>
          <small>{details.length}/500</small>
          {error && (
            <p className="report-error" role="alert">
              {error}
            </p>
          )}
          <div className="report-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              className="report-primary"
              disabled={busy || !reason}
              type="submit"
            >
              {busy ? "Sending…" : "Submit report"}
            </button>
          </div>
        </form>
      )}
    </dialog>,
    document.body,
  )
}
