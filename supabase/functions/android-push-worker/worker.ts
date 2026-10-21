import {
  accessToken,
  assertion,
  credential,
  payload,
  responseOutcome,
  type Delivery,
} from "./fcm.ts"
interface Result {
  data: unknown
  error: unknown
}
interface Dependencies {
  credential?: string
  expectedProject?: string
  enabled: boolean
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>
  fetch: typeof fetch
}
export async function handlePushWorker(request: Request, deps: Dependencies) {
  if (request.method !== "POST")
    return Response.json({ error: "method_not_allowed" }, { status: 405 })
  const secret = request.headers.get("X-Push-Worker-Secret") ?? ""
  if (!/^[a-f0-9]{64}$/.test(secret))
    return Response.json({ error: "unauthorized" }, { status: 401 })
  let stage = "authorize"
  let rpcCode: string | undefined
  const rpc = async (action: string, input: Record<string, unknown> = {}) => {
    const result = await deps.rpc("push_worker", {
      p_action: action,
      p_payload: input,
    })
    if (result.error) {
      const code = (result.error as { code?: string }).code
      rpcCode =
        typeof code === "string" && /^(PGRST[0-9]{3}|[0-9A-Z]{5})$/.test(code)
          ? code
          : undefined
      throw new Error("queue_unavailable")
    }
    return result.data
  }
  try {
    if ((await rpc("verify_secret", { secret })) !== true)
      return Response.json({ error: "unauthorized" }, { status: 401 })
    stage = "credential"
    let config, jwt: string
    try {
      config = credential(deps.credential)
      if (deps.expectedProject && config.project_id !== deps.expectedProject)
        throw new Error("project_mismatch")
      jwt = await assertion(config)
    } catch {
      await rpc("status", {
        ready: false,
        status: deps.credential ? "invalid_credential" : "credential_missing",
      })
      return Response.json({ configured: false, enabled: false }, {
        status: 503,
      })
    }
    // Validate OAuth without sending user data or a notification. Never return
    // credentials, assertions, access tokens, device tokens or provider bodies.
    let token: string
    stage = "provider_auth"
    try {
      token = await accessToken(jwt, deps.fetch)
    } catch {
      await rpc("status", { ready: false, status: "provider_auth_failed" })
      return Response.json({ configured: false, enabled: false }, {
        status: 503,
      })
    }
    stage = "status"
    await rpc("status", {
      ready: true,
      status: deps.enabled ? "ready" : "disabled",
    })
    if (!deps.enabled)
      return Response.json({ configured: true, enabled: false, sent: 0 })
    const counts = {
      sent: 0,
      retry: 0,
      failed: 0,
      skipped: 0,
      invalid_token: 0,
    }
    const started = Date.now()
    stage = "delivery"
    for (let i = 0; i < 10 && Date.now() - started < 35000; i++) {
      const job = (await rpc("claim")) as {
        id: string
        lease: string
        skipped?: boolean
      } | null
      if (!job) break
      if (job.skipped) {
        counts.skipped++
        continue
      }
      const target = (await rpc("prepare", job)) as Delivery | null
      let outcome: keyof typeof counts = "skipped"
      if (target) {
        try {
          const response = await deps.fetch(
            `https://fcm.googleapis.com/v1/projects/${config.project_id}/messages:send`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload(target)),
              signal: AbortSignal.timeout(10000),
            },
          )
          let body: unknown = null
          if (!response.ok) {
            try {
              body = await response.json()
            } catch {
              /* Only inspect typed error codes. */
            }
          }
          outcome = responseOutcome(response.status, body)
        } catch {
          outcome = "retry"
        }
      }
      if (
        (await rpc("ack", {
          ...job,
          outcome,
          ...(outcome === "invalid_token" ? { token: target?.token } : {}),
        })) !== true
      )
        throw new Error("ack_failed")
      counts[outcome]++
    }
    return Response.json(counts)
  } catch {
    return Response.json(
      { error: "push_worker_unavailable", stage, code: rpcCode },
      { status: 503 },
    )
  }
}
