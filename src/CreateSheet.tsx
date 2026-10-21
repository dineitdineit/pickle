import { useEffect, useRef } from "react"
import "./create-sheet.css"

type Props = {
  onClose: () => void
  onRecipe: () => void
  onPost: () => void
}

function CreateIcon({ kind }: { kind: "post" | "waraeat" | "recipe" }) {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "post" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="m3 16 5-5 5 5 3-3 5 5" />
        </>
      ) : kind === "waraeat" ? (
        <>
          <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
          <circle cx="12" cy="12" r="5" />
        </>
      ) : (
        <>
          <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z" />
          <path d="M12 5v15M6 8h3M6 11h3M15 8h3M15 11h3" />
        </>
      )}
    </svg>
  )
}

export default function CreateSheet({ onClose, onRecipe, onPost }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const modal = dialog.current
    const previousFocus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    modal?.showModal()
    document.body.style.overflow = "hidden"
    closeButton.current?.focus()
    return () => {
      modal?.close()
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="create-sheet"
      aria-labelledby="create-sheet-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="create-sheet-panel">
        <div className="create-sheet-handle" aria-hidden="true" />
        <header className="create-sheet-heading">
          <h2 id="create-sheet-title">Create</h2>
          <button
            ref={closeButton}
            type="button"
            className="create-sheet-close"
            aria-label="Close create menu"
            onClick={onClose}
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
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="create-sheet-options">
          <button
            type="button"
            className="create-sheet-option"
            onClick={onPost}
          >
            <span className="create-sheet-icon">
              <CreateIcon kind="post" />
            </span>
            <span className="create-sheet-copy">
              <strong>Post</strong>
              <span>Share a photo and a few words</span>
            </span>
          </button>
          <button type="button" className="create-sheet-option" disabled>
            <span className="create-sheet-icon">
              <CreateIcon kind="waraeat" />
            </span>
            <span className="create-sheet-copy">
              <strong>Waraeat</strong>
              <span>Share a moment</span>
            </span>
            <span className="create-sheet-soon">Coming soon</span>
          </button>
          <button
            type="button"
            className="create-sheet-option"
            onClick={onRecipe}
          >
            <span className="create-sheet-icon">
              <CreateIcon kind="recipe" />
            </span>
            <span className="create-sheet-copy">
              <strong>Recipe</strong>
              <span>Share ingredients and cooking steps</span>
            </span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </dialog>
  )
}
