import { useEffect, useRef, useState } from 'react'
import { videoSource } from './lib/video'
import './video.css'
export function PlayIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 4v16l13-8z" /></svg> }
export function VideoBadge({ url }: { url?: string | null }) {
  return url && videoSource(url) ? <span className="recipe-video-badge" role="img" aria-label="Video available"><PlayIcon /></span> : null
}
export default function RecipeVideo({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null)
  const [failed, setFailed] = useState(false)
  const source = videoSource(url)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; close.current?.focus()
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('button, a, iframe, video') ?? [])
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus() }
  }, [onClose])
  if (!source) return null
  return <div className="recipe-video-screen" role="dialog" aria-modal="true" aria-label={`${title} video`} ref={root}>
    <header><button ref={close} onClick={onClose} aria-label="Back to recipe">←</button><h2>{title}</h2></header>
    <div className="recipe-video-player">
      {source.kind === 'embed' ? <iframe src={source.url} title={`${title} video`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : source.kind === 'file' && !failed ? <video src={source.url} controls autoPlay playsInline tabIndex={0} onError={() => setFailed(true)} /> : <div className="recipe-video-external"><p>Watch this video on its original site.</p><a href={source.url} target="_blank" rel="noopener noreferrer">Open video ↗</a></div>}
    </div>
  </div>
}
