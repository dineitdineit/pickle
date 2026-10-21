import {
  validateOrganizedRecipe,
  validateRecipeText,
  RECIPE_AI_NOTICE_VERSION,
  type OrganizedRecipe,
  type RecipeSourceText,
} from "../_shared/recipe-assistant.ts"
interface Dependencies {
  authenticate: (token: string) => Promise<boolean>
  reserve: (token: string) => Promise<string>
  configured: boolean
  organize: (
    text: RecipeSourceText,
    signal: AbortSignal,
  ) => Promise<OrganizedRecipe>
}
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
}
async function readBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 128000)
    throw new Error("invalid_input")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("invalid_input")
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 128000) {
        await reader.cancel()
        throw new Error("invalid_input")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(body))
}
export async function handleRecipeOrganizer(
  request: Request,
  deps: Dependencies,
) {
  const reply = (status: number, value: unknown) =>
    Response.json(value, { status, headers: cors })
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors })
  if (request.method !== "POST")
    return reply(405, { error: "method_not_allowed" })
  const token = request.headers.get("authorization") ?? ""
  if (!/^Bearer \S+$/i.test(token)) return reply(401, { error: "unauthorized" })
  try {
    if (!(await deps.authenticate(token)))
      return reply(401, { error: "unauthorized" })
    let text: RecipeSourceText
    try {
      const body = await readBody(request)
      if (
        body?.consent !== true ||
        body?.consent_version !== RECIPE_AI_NOTICE_VERSION
      )
        return reply(400, { error: "consent_required" })
      text = validateRecipeText(body)
    } catch {
      return reply(400, { error: "invalid_input" })
    }
    // An unconfigured deployment sends nothing to AI and consumes no usage quota.
    if (!deps.configured) return reply(503, { error: "ai_not_configured" })
    const permission = await deps.reserve(token)
    if (permission !== "allowed")
      return reply(permission === "rate_limited" ? 429 : 403, {
        error: ["rate_limited", "guardian_ai_consent_required"].includes(
          permission,
        )
          ? permission
          : "not_allowed",
      })
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(35000)])
    const result = validateOrganizedRecipe(
      await deps.organize(text, signal),
      text,
    )
    return reply(200, { result })
  } catch {
    // Never log user recipe text, bearer tokens, provider responses or API keys.
    return reply(502, { error: "organization_failed" })
  }
}
