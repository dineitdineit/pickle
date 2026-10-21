import { useEffect, useRef, useState } from "react"
import { ReportDialog } from "./ReportButton"
import UserSafetyIcon from "./UserSafetyIcon"
import { supabase } from "./lib/supabase"
import "./user-actions.css"
export interface BlockState {
  user_id: string
  blocked: boolean
  can_contact: boolean
}
interface Props {
  targetId: string
  userId: string | null
  name: string
  blocked: boolean
  disabled: boolean
  onRequireLogin: () => void
  onChanged: (state: BlockState) => void
  onBusy: (busy: boolean) => void
}
export default function UserActionsMenu({
  targetId,
  userId,
  name,
  blocked,
  disabled,
  onRequireLogin,
  onChanged,
  onBusy,
}: Props) {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const guard = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [open])
  useEffect(() => {
    if (confirm) dialog.current?.showModal()
  }, [confirm])
  function closeDialog() {
    if (guard.current) return
    setConfirm(false)
    setError("")
    trigger.current?.focus()
  }
  async function changeBlock() {
    if (!userId) {
      onRequireLogin()
      return
    }
    if (guard.current) return
    guard.current = true
    setBusy(true)
    onBusy(true)
    setError("")
    try {
      const { data, error: failure } = await supabase.rpc("set_user_block", {
        p_user_id: targetId,
        p_blocked: !blocked,
      })
      if (
        failure ||
        data?.user_id !== targetId ||
        data.blocked !== !blocked ||
        typeof data.can_contact !== "boolean" ||
        (data.blocked && data.can_contact)
      )
        throw failure ?? new Error("Block state not confirmed")
      if (!alive.current) return
      onChanged(data)
      setConfirm(false)
      setOpen(false)
      trigger.current?.focus()
      window.dispatchEvent(new Event("pickle:blocks-changed"))
    } catch {
      if (alive.current)
        setError("Could not update this block. Please try again.")
    } finally {
      guard.current = false
      if (alive.current) {
        setBusy(false)
        onBusy(false)
      }
    }
  }
  return (
    <div className="user-actions" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="user-profile-icon"
        aria-label="User options"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div
          className="user-actions-popover"
          role="menu"
          aria-label="User options"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              setOpen(false)
              trigger.current?.focus()
            }
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                'button[role="menuitem"]',
              ),
            )
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            )
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault()
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        buttons.length) %
                      buttons.length
              buttons[next]?.focus()
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              if (!userId) {
                onRequireLogin()
                return
              }
              setError("")
              setConfirm(true)
            }}
          >
            <UserSafetyIcon kind="block" />
            {blocked ? "Unblock" : "Block"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="user-actions-report"
            onClick={() => {
              setOpen(false)
              if (!userId) {
                onRequireLogin()
                return
              }
              setReport(true)
            }}
          >
            <UserSafetyIcon kind="report" />
            Report
          </button>
        </div>
      )}
      {report && (
        <ReportDialog
          targetType="user"
          targetId={targetId}
          userId={userId}
          onRequireLogin={onRequireLogin}
          onClose={() => {
            setReport(false)
            trigger.current?.focus()
          }}
        />
      )}
      {confirm && (
        <dialog
          ref={dialog}
          className="report-dialog"
          aria-label={`${blocked ? "Unblock" : "Block"} ${name}`}
          onCancel={(event) => {
            if (guard.current) event.preventDefault()
            else closeDialog()
          }}
        >
          <h2>
            {blocked ? "Unblock" : "Block"} {name}?
          </h2>
          <p>
            {blocked
              ? "You can follow and message each other again unless this user has also blocked you. Previous follows will not be restored."
              : "You will unfollow each other. Your recipes, comments, reviews and messages will be hidden from each other. Recipe alerts will stop. They will not be notified."}
          </p>
          {error && (
            <p className="report-error" role="alert">
              {error}
            </p>
          )}
          <div className="report-actions">
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={closeDialog}
            >
              Cancel
            </button>
            <button
              type="button"
              className="report-primary"
              disabled={busy}
              onClick={() => void changeBlock()}
            >
              {busy ? "Saving…" : blocked ? "Unblock" : "Block"}
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}
