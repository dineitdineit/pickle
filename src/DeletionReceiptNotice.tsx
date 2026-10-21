import { useEffect, useState } from "react"

import type { DeletionReceipt } from "./lib/accountData"

export default function DeletionReceiptNotice() {
  const [receipt, setReceipt] = useState<DeletionReceipt | null>(() => {
    try {
      const row = JSON.parse(
        sessionStorage.getItem("pickle:deletion-result") || "null",
      )

      return row &&
        typeof row.expires_at === "number" &&
        row.expires_at > Date.now() &&
        typeof row.completed === "boolean" &&
        typeof row.id === "string" &&
        /^[0-9a-f-]{36}$/i.test(row.id)
        ? row
        : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      sessionStorage.removeItem("pickle:deletion-result")
    } catch {
      /* Optional session storage. */
    }
  }, [])

  if (!receipt) return null

  return (
    <aside
      role="status"
      className="p-4 border-b text-body"
      style={{ background: "var(--color-primary-soft)" }}
    >
      <p>
        {receipt.completed
          ? "Your account and associated content have been deleted."
          : "Your deletion request was accepted. Your content is unavailable while cleanup continues. Failed steps retry automatically."}
      </p>
      <p>
        Minimal deletion records and encrypted receipt backups expire after 30
        days. Existing provider backups follow their separate retention
        settings.
      </p>
      <p>
        Reference: {receipt.id}. For help:{" "}
        <a href="mailto:admin@getpickleapp.com">admin@getpickleapp.com</a>
      </p>
      <button type="button" onClick={() => setReceipt(null)}>
        Dismiss
      </button>
    </aside>
  )
}
