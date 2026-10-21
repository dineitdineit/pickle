/** Human-readable inbox age; future clock skew is treated as just now. */
export function timeAgo(value: string, now = Date.now()) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ""
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return "Just now"
  const units: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ]
  for (const [duration, label] of units) {
    if (seconds >= duration) {
      const count = Math.floor(seconds / duration)
      return `${count} ${label}${count === 1 ? "" : "s"} ago`
    }
  }
  return "Just now"
}
