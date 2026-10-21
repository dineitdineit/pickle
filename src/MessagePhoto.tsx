import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
export default function MessagePhoto({
  path,
  onLoad,
}: {
  path: string
  onLoad: () => void
}) {
  const [url, setUrl] = useState("")
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const result = await supabase.storage
          .from("chat_images")
          .createSignedUrl(path, 300)
        if (result.error || !result.data?.signedUrl)
          throw result.error ?? new Error("Photo unavailable")
        if (!ignore) {
          setUrl(result.data.signedUrl)
          setError(false)
        }
      } catch {
        if (!ignore) setError(true)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 240000)
    return () => {
      ignore = true
      window.clearInterval(timer)
    }
  }, [path, retry])
  return (
    <div className="message-photo">
      {error ? (
        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          Photo unavailable · Retry
        </button>
      ) : url ? (
        <button
          type="button"
          aria-label={expanded ? "Reduce photo" : "Expand photo"}
          onClick={() => setExpanded((value) => !value)}
        >
          <img
            className={expanded ? "is-expanded" : ""}
            src={url}
            alt="Shared photo"
            loading="lazy"
            decoding="async"
            onLoad={onLoad}
            onError={() => setError(true)}
          />
        </button>
      ) : (
        <span role="status">Loading photo…</span>
      )}
    </div>
  )
}
