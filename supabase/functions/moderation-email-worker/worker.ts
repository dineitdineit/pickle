interface Job {
  id: string
  lease_token: string
  to_email: string
  sender: string
  subject: string
  body: string
}
interface Result {
  data: unknown
  error: unknown
}
interface Dependencies {
  secret?: string
  apiKey?: string
  sender?: string
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>
  fetch: typeof fetch
}
async function matchesSecret(
  provided: string,
  expected: string,
): Promise<boolean> {
  if (!provided || provided.length > 256) return false
  const encode = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(provided)),
    crypto.subtle.digest("SHA-256", encode.encode(expected)),
  ])
  const left = new Uint8Array(a),
    right = new Uint8Array(b)
  let difference = 0
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i]
  return difference === 0
}
export async function handleWorker(
  request: Request,
  deps: Dependencies,
): Promise<Response> {
  if (request.method !== "POST")
    return Response.json({ error: "method_not_allowed" }, { status: 405 })
  if (!deps.secret || deps.secret.length < 32)
    return Response.json({ error: "worker_not_configured" }, { status: 503 })
  if (
    !(await matchesSecret(
      request.headers.get("X-Moderation-Worker-Secret") ?? "",
      deps.secret,
    ))
  )
    return Response.json({ error: "unauthorized" }, { status: 401 })
  // Configuration failures must never consume retries or discard pending notices.
  if (!deps.apiKey || !deps.sender)
    return Response.json({ error: "email_not_configured" }, { status: 503 })
  let jobs: Job[]
  try {
    const result = await deps.rpc("claim_moderation_emails", {
      p_sender: deps.sender,
      p_limit: 5,
    })
    if (result.error || !Array.isArray(result.data))
      throw new Error("claim_failed")
    jobs = (result.data as Job[])
  } catch {
    return Response.json({ error: "queue_unavailable" }, { status: 503 })
  }
  const totals = { accepted: 0, retry: 0, failed: 0, unconfirmed: 0 }
  for (const job of jobs) {
    let outcome: "sent" | "retry" | "failed" = "retry",
      providerId: string | null = null,
      error: string | null = "network_error"
    try {
      const response = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deps.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `pickle/moderation/${job.id}`,
        },
        body: JSON.stringify({
          from: job.sender,
          to: [job.to_email],
          subject: job.subject,
          text: job.body,
          reply_to: job.sender,
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) {
        const data = await response.json()
        if (typeof data?.id !== "string" || !data.id)
          throw new Error("missing_confirmation")
        outcome = "sent"
        providerId = data.id
        error = null
      } else {
        // Never store provider response bodies; they can contain email addresses.
        outcome =
          response.status >= 500 ||
          [408, 409, 425, 429].includes(response.status)
            ? "retry"
            : "failed"
        error = `provider_http_${response.status}`
      }
    } catch {
      outcome = "retry"
      error = "delivery_unconfirmed"
    }
    try {
      const result = await deps.rpc("finish_moderation_email", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_outcome: outcome,
        p_provider_id: providerId,
        p_error: error,
      })
      if (result.error || result.data !== true)
        throw new Error("acknowledgement_failed")
      if (outcome === "sent") totals.accepted++
      else totals[outcome]++
    } catch {
      totals.unconfirmed++
    }
  }
  return Response.json(totals, { status: totals.unconfirmed ? 503 : 200 })
}
