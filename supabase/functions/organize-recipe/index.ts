import { createClient } from "npm:@supabase/supabase-js@2.116.0"
import { createGateway, generateText, jsonSchema, Output } from "npm:ai@7.0.142"
import {
  organizedRecipeSchema,
  RECIPE_AI_MODEL,
  RECIPE_AI_PROVIDER_OPTIONS,
  RECIPE_ORGANIZER_SYSTEM,
  validateOrganizedRecipe,
  type OrganizedRecipe,
} from "../_shared/recipe-assistant.ts"
import { handleRecipeOrganizer } from "./handler.ts"

Deno.serve((request: Request) => {
  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY")
  // Require the chosen model explicitly; changing provider also requires a notice review.
  const model = Deno.env.get("RECIPE_AI_MODEL")
  const scoped = (token: string) =>
    createClient(url, anon, {
      global: { headers: { Authorization: token } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  return handleRecipeOrganizer(request, {
    configured: Boolean(
      apiKey &&
        model === RECIPE_AI_MODEL &&
        Deno.env.get("RECIPE_AI_ENABLED") === "true",
    ),
    authenticate: async (token) => {
      const { data, error } = await scoped(token).auth.getUser(
        token.replace(/^Bearer /i, ""),
      )
      return !error && !!data.user && !data.user.is_anonymous
    },
    reserve: async (token) => {
      const client = scoped(token)
      const age = await client
        .from("account_age_confirmations")
        .select("requires_guardian")
        .maybeSingle()
      if (age.error || !age.data) return "not_allowed"
      // Existing guardian approval predates this optional external AI processing.
      if (age.data.requires_guardian) return "guardian_ai_consent_required"
      const { data, error } = await client.rpc("reserve_recipe_ai_use")
      if (error) throw new Error("quota_unavailable")
      return data
    },
    organize: async (text, signal) => {
      const gateway = createGateway({ apiKey })
      const { output } = await generateText({
        model: gateway(model!),
        providerOptions: RECIPE_AI_PROVIDER_OPTIONS,
        system: RECIPE_ORGANIZER_SYSTEM,
        prompt: JSON.stringify(text),
        output: Output.object({
          name: "organized_recipe",
          schema: jsonSchema<OrganizedRecipe>(organizedRecipeSchema, {
            validate: (value) => {
              try {
                return {
                  success: true,
                  value: validateOrganizedRecipe(value, text),
                }
              } catch {
                return {
                  success: false,
                  error: new Error("Invalid recipe structure"),
                }
              }
            },
          }),
        }),
        maxOutputTokens: 10000,
        maxRetries: 0,
        abortSignal: signal,
        // No tools, network retrieval, telemetry or automatic publishing.
      })
      return output
    },
  })
})
