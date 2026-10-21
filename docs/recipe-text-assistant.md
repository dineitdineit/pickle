# Recipe text assistant

The first Recipe details page retains its existing fields. **Short description is required** (up to 300 characters); **About this recipe is optional**. The database enforces the same rule for publication, owner edits and direct recipe writes. Existing recipes already had valid short descriptions, so no content backfill was needed.

Users can type ingredients and cooking steps in any format into two optional text boxes. “Organize with AI” sends only those text boxes to the server. Suggestions appear first in a review panel. “Use suggestions” fills the existing editable ingredient and step pages; it does not save publicly or publish. When existing structured content is present, the action explicitly says it replaces ingredients/steps, including step photos. Other recipe details and the cover photo remain unchanged. Changed text, fields or photos invalidate pending suggestions. Leaving the page cancels its request. The original text is retained in the private recipe-submission payload and device draft cache.

The assistant extracts rather than writes a new recipe. Unspecified quantities/units remain blank and are flagged for review. Publication still requires the user to complete these fields. For example, `1 egg` can become quantity `1`, unit `piece`; `salt` has no invented quantity. User-provided fractional quantities may be normalized to decimal. The final extracted step is initially marked as the finishing step; its checkbox remains editable.

## Current availability

The `organize-recipe` Supabase Edge Function is deployed with JWT verification enabled. **AI calls are disabled by default.** On 2026-10-16 the operator reported saving an AI Gateway key, `google/gemini-2.5-flash-lite` and `RECIPE_AI_ENABLED=false`, using the Hobby plan. The local CLI is not authenticated, so these saved values have not been independently verified. No live model generation has been verified. The app receives `ai_not_configured` and keeps all entered text; manual entry remains available.

## Connect AI later

The prepared integration uses [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/getting-started), so the existing Vercel account can be used. A separate OpenAI account is not required for this route. The API usage/billing is separate from a ChatGPT subscription or Codex usage.

1. In the appropriate Vercel team, open AI Gateway, review billing/credits and create a dedicated API key. Set a small spending cap and alerts. Do not send the key in chat or put it in source control.
2. Choose a text model that supports structured JSON output from the [current model catalog](https://ai-gateway.vercel.sh/v1/models). The selected model is now pinned to `google/gemini-2.5-flash-lite`; requests are allowed only through `vertex`, with no-training routing requested. The server secret must match this model. Changing it requires reviewing the provider notice and code together. Use its exact `provider/model` ID.
3. Before enabling, identify that model's underlying provider(s), processing locations, input/output retention and training controls. Update the privacy notice and AI-specific disclosure with the actual provider and settings. Review the age-13 guardian consent scope for this new optional external processing. See `docs/legal/recipe-ai-data-use.ko.txt`.
4. In **Supabase → Edge Functions → Secrets**, add server-only values:
   - `AI_GATEWAY_API_KEY`: the dedicated Gateway key.
   - `RECIPE_AI_MODEL`: the selected exact model ID.
   - `RECIPE_AI_ENABLED`: `true`, only after the preceding review. Leaving this absent/false disables model calls.
5. Reopen the app and test the supplied egg recipe. Verify every extracted ingredient and action, blank salt quantity, fractions, mixed language, an unavailable provider and usage-limit feedback. Review and edit before publishing. No Android rebuild is needed merely to change these server secrets.

Never use a `VITE_` variable for the AI key: those values are bundled into the website/APK. To disable immediately, set `RECIPE_AI_ENABLED=false`. We do not create accounts, enable paid billing or spend AI credits automatically.

## Server safeguards

- The server validates the current Supabase user with `auth.getUser`; anonymous, ineligible, pending-guardian, restricted or deleting accounts cannot reserve generation.
- A separate unchecked checkbox, `consent: true`, matching `consent_version: recipe-ai-2026-10-16.1` and a click on the disclosed AI action are required. Accounts marked `requires_guardian` are blocked from AI until a separate AI guardian-approval flow exists, regardless of their general account approval. Manual entry stays available. No automatic call while typing. No photo, profile, email, full recipe details or chat content is forwarded by this function. Providers necessarily process technical request information separately.
- Maximum ingredients text 10,000 characters, steps text 20,000, HTTP body 128,000 bytes; stream size checked before JSON parsing.
- Atomic per-account quota: one request per minute and ten per UTC day; application maximum 500 per UTC day. Failed provider attempts consume quota, preventing unlimited retries. Reservations made directly through the authenticated RPC can consume the caller's own quota but cannot request generation or access another user's records. Set a Gateway spending cap as an additional cost control.
- Prompt data is treated as untrusted. No tools, browsing or publication access. Output is schema-validated and each item must cite an exact substring of the supplied text. This does not prove interpretation accuracy; user review remains essential.
- Server timeout 35 seconds; client timeout 45 seconds. No automatic model retries. Safe error codes; this code does not log prompt bodies, responses, tokens or secrets. No-store responses. Provider/platform logs and retention must be separately reviewed before activation.
- Private quota tables contain only account ID/day/count/time, expire by a daily cron after the previous UTC day, and cascade on account deletion. Global day counts contain no user ID. No AI prompt/output archive is created; ordinary private drafts retain the user's text under the existing account-deletion policy.
- Privileged quota logic is private; the public RPC is SECURITY INVOKER. No client access policies/grants on quota tables. No service-role key is used by this Edge Function.

## Validation

`tests/recipe-assistant.test.mjs` exercises extraction validation, missing quantities, stale snapshots, authentication, explicit action, input limits, unconfigured service, quotas/restrictions, safe errors and first-page rendering. `tests/recipe-assistant.integration.sql` uses synthetic accounts inside BEGIN/ROLLBACK to test publication/edit requirements, private draft text, DB constraints, quotas and age/anonymous guards. Deno checks the pinned AI SDK 7.0.142 function independently of the web build. Live AI quality and provider retention remain unverified until an account is connected.

## Provider review — 2026-10-16

The selected model has `google` and `vertex` serving routes. The public endpoint metadata lists `vertex` with `has_zdr=true`, `has_no_training=true`, and inference regions `us-east5` / `europe-central2`. Code uses a hard `only: ["vertex"]` allowlist and `disallowPromptTraining: true`, with no model fallback. Do not configure BYOK credentials or routing rules that bypass this reviewed path. No web grounding, tools or explicit caching are requested. Implicit provider caching and technical records have their own terms.

Vercel's current documentation limits its enforced per-request/team ZDR control to Pro/Enterprise. Pickle is on Hobby and does not set `zeroDataRetention: true` or promise account-enforced ZDR. No paid upgrade was performed. Vercel states that its Gateway does not retain prompt/output bodies; it documents routing-attempt details lasting 30 days and request-list lookback up to 36 days. These technical records are distinct from prompt bodies and Pickle's quota ledger.

The in-app privacy notice and `docs/legal/current/privacy-policy.en.txt` now include section 13, naming Vercel and Google Vertex, the data sent, optional action, overseas processing, retention limits, manual alternative and guardian restriction. General terms acceptance was not retroactively treated as AI consent. Exact legal contracting entities, account-specific DPA/subprocessor settings, billing cap and actual serving-region/log behavior still require confirmation before public release. This is ready for the operator to run a synthetic test after reviewing those settings, not a verified live-generation result.

Sources checked:
- https://ai-gateway.vercel.sh/v1/models/google/gemini-2.5-flash-lite/endpoints
- https://vercel.com/docs/ai-gateway/security-and-compliance/zdr
- https://vercel.com/docs/ai-gateway/security-and-compliance/disallow-prompt-training
- https://vercel.com/docs/ai-gateway/observability-and-spend/logs
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention
