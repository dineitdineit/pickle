import { useEffect, useRef, useState } from "react"

declare global {
  interface Window {
    adsbygoogle?: Record<string, never>[]
  }
}

// Enable only after site approval and the publisher's privacy setup is complete.
const client = import.meta.env.VITE_ADSENSE_CLIENT ?? ""
const slot = import.meta.env.VITE_ADSENSE_HOME_SLOT ?? ""
const configured = import.meta.env.VITE_ADSENSE_ENABLED === "true" &&
  /^ca-pub-\d{16}$/.test(client) && /^\d+$/.test(slot)

export default function HomeAdSidebar() {
  const [wide, setWide] = useState(false)
  const [failed, setFailed] = useState(false)
  const requested = useRef(false)
  const ad = useRef<HTMLModElement>(null)
  const webHost = ["getpickleapp.com", "www.getpickleapp.com"].includes(window.location.hostname)

  useEffect(() => {
    if (!configured || !webHost) return
    const media = window.matchMedia("(min-width: 1440px)")
    const update = () => setWide(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [webHost])

  useEffect(() => {
    if (!wide) {
      requested.current = false
      return
    }
    if (failed || !ad.current) return
    let script = document.querySelector<HTMLScriptElement>("script[data-pickle-adsense]")
    if (!script) {
      script = document.createElement("script")
      script.async = true
      script.crossOrigin = "anonymous"
      script.dataset.pickleAdsense = "true"
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`
      document.head.appendChild(script)
    }
    const onError = () => setFailed(true)
    script.addEventListener("error", onError)
    try {
      if (!requested.current && !ad.current.hasAttribute("data-adsbygoogle-status")) {
        requested.current = true
        (window.adsbygoogle = window.adsbygoogle || []).push({})
      }
    } catch {
      setFailed(true)
    }
    return () => script.removeEventListener("error", onError)
  }, [wide, failed])

  if (!configured || !webHost || !wide || failed) return null
  return (
    <aside className="web-ad-sidebar" aria-label="Advertisement">
      <p>Advertisement</p>
      <ins ref={ad} className="adsbygoogle" style={{ display: "inline-block", width: 160, height: 600 }} data-ad-client={client} data-ad-slot={slot} />
    </aside>
  )
}
