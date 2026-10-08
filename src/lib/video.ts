function safeVideoUrl(value: string): boolean {
  if (!value.trim()) return true
  try { const url = new URL(value.trim()); return value.trim().length <= 2048 && url.protocol === 'https:' && !!url.hostname && !url.username && !url.password } catch { return false }
}
export function validVideoUrl(value: string): boolean {
  if (!value.trim()) return true
  if (!safeVideoUrl(value)) return false
  const url = new URL(value.trim()), host = url.hostname.toLowerCase()
  if (url.port) return false
  if (host === 'youtu.be') return /^\/[\w-]{11}\/?$/.test(url.pathname)
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
    return (url.pathname === '/watch' && /^[\w-]{11}$/.test(url.searchParams.get('v') ?? '')) || /^\/(?:shorts|embed|live)\/[\w-]{11}\/?$/.test(url.pathname)
  }
  return ['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(host) && /^\/(?:reel|reels|p|tv)\/[\w-]+\/?$/.test(url.pathname)
}
export function videoSource(value: string): { kind: 'embed' | 'file' | 'external'; url: string } | null {
  if (!value.trim() || !safeVideoUrl(value)) return null
  const url = new URL(value.trim()), host = url.hostname.toLowerCase()
  if (['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(host)) {
    const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
    if (id && /^[\w-]{11}$/.test(id)) return { kind: 'embed', url: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1` }
  }
  if (['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)) {
    const id = url.pathname.match(/(?:^\/|\/video\/)(\d+)\/?$/)?.[1]
    if (id) return { kind: 'embed', url: `https://player.vimeo.com/video/${id}?autoplay=1` }
  }
  if (/\.(mp4|webm|m4v|mov)$/i.test(url.pathname)) return { kind: 'file', url: url.href }
  return { kind: 'external', url: url.href }
}
