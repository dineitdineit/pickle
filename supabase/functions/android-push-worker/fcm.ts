export interface Credential {
  project_id: string
  client_email: string
  private_key: string
}
export function credential(value: string | undefined): Credential {
  const row = JSON.parse(value ?? "null")
  if (
    !row ||
    !/^[a-z][a-z0-9-]{4,62}$/.test(row.project_id) ||
    typeof row.client_email !== "string" ||
    !row.client_email.endsWith(".iam.gserviceaccount.com") ||
    typeof row.private_key !== "string" ||
    !row.private_key.startsWith("-----BEGIN PRIVATE KEY-----")
  )
    throw new Error("invalid_credential")
  return row
}
function base64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}
function encoded(value: unknown) {
  return base64(new TextEncoder().encode(JSON.stringify(value)))
}
export async function assertion(config: Credential, now = Date.now()) {
  const pem = config.private_key
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s/g, "")
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const seconds = Math.floor(now / 1000)
  const payload = `${encoded({ alg: "RS256", typ: "JWT" })}.${encoded({
    iss: config.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: seconds,
    exp: seconds + 3600,
  })}`
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(payload),
  )
  return `${payload}.${base64(new Uint8Array(signature))}`
}
export async function accessToken(jwt: string, fetcher: typeof fetch) {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error("provider_auth_failed")
  const body = await response.json()
  if (typeof body.access_token !== "string" || !body.access_token)
    throw new Error("provider_auth_failed")
  return body.access_token as string
}
export interface Delivery {
  token: string
  recipient: string
  installation: string
  kind: "message" | "activity"
  target: string
  tag: string
}
export function payload(job: Delivery) {
  return {
    message: {
      token: job.token,
      notification: {
        title: "Pickle",
        body:
          job.kind === "message"
            ? "You have a new message."
            : "You have new activity in Pickle.",
      },
      data: {
        recipient: job.recipient,
        installation: job.installation,
        kind: job.kind,
        target: job.target,
      },
      android: {
        ttl: "300s",
        priority: "normal",
        notification: {
          channel_id: "pickle_activity",
          icon: "ic_stat_pickle",
          tag: job.tag,
          visibility: "PRIVATE",
          color: "#FA701F",
        },
      },
    },
  }
}
export function responseOutcome(
  status: number,
  body: unknown,
): "sent" | "retry" | "failed" | "invalid_token" {
  if (status >= 200 && status < 300) return "sent"
  const details = (body as { error?: { details?: { errorCode?: string }[] } })
    ?.error?.details
  if (
    Array.isArray(details) &&
    details.some((item) => item.errorCode === "UNREGISTERED")
  )
    return "invalid_token"
  return status >= 500 || [401, 408, 429].includes(status) ? "retry" : "failed"
}
