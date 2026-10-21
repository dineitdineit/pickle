export const NATIVE_CALLBACK = "com.getpickleapp.pickle://auth/callback"
export const NATIVE_RECOVERY = "com.getpickleapp.pickle://auth/recovery"
export interface ContentLink {
  kind: "recipe" | "post"
  id: string
}
export type AppLink = ContentLink | {
  kind: "auth"
  recovery: boolean
  code: string | null
  flowId?: string
  denied: boolean
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Treat every external intent as untrusted. Auth tokens never become app routes.
export function parseAppLink(value: string): AppLink | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.username || url.password || url.port || url.hash) return null
  const native = url.protocol === "com.getpickleapp.pickle:"
  if (
    native &&
    url.hostname === "auth" &&
    ["/callback", "/recovery"].includes(url.pathname)
  ) {
    if (
      [...url.searchParams.keys()].some(
        (key) =>
          ![
            "code",
            "flow_id",
            "error",
            "error_code",
            "error_description",
          ].includes(key),
      )
    )
      return null
    if (
      url.searchParams.getAll("code").length > 1 ||
      url.searchParams.getAll("flow_id").length > 1
    )
      return null
    const code = url.searchParams.get("code")
    if (code && (code.length > 2048 || /\s/.test(code))) return null
    return {
      kind: "auth",
      recovery: url.pathname === "/recovery",
      code,
      flowId: url.searchParams.get("flow_id") ?? undefined,
      denied:
        url.searchParams.has("error") || url.searchParams.has("error_code"),
    }
  }
  if (
    !(native && url.hostname === "open" && ["", "/"].includes(url.pathname)) &&
    !(
      url.protocol === "https:" &&
      url.hostname === "getpickleapp.com" &&
      url.pathname === "/"
    )
  )
    return null
  if (
    [...url.searchParams.keys()].some(
      (key) => !["recipe", "post"].includes(key),
    )
  )
    return null
  const entries = [...url.searchParams.entries()]
  if (entries.length !== 1) return null
  const [kind, id] = entries[0]
  return (kind === "recipe" || kind === "post") && uuid.test(id)
    ? { kind, id }
    : null
}
