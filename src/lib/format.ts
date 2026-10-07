/** Keep each screen's existing time labels while sharing the calculation. */
export function formatTime(
  totalMinutes: number | null,
  style: "short" | "compact" | "readable" = "short",
) {
  if (totalMinutes === null) return "—"
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (style === "short")
    return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`
  const minuteUnit = style === "compact" ? "min" : " min"
  const hourUnit = style === "compact" ? "h" : " hr"
  if (hours === 0) return `${minutes}${minuteUnit}`
  return `${hours}${hourUnit}${minutes ? ` ${minutes}${minuteUnit}` : ""}`
}
