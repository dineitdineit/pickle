import { useEffect, useRef, useState } from "react"
import { supabase } from "./lib/supabase"
import {
  applyOrganizedRecipe,
  recipeAssistantError,
  recipeAssistantSnapshot,
  validateOrganizedRecipe,
  type OrganizedRecipe,
} from "./lib/recipeAssistant"
import type { IngredientInput, RecipeInput, StepInput } from "./lib/submissions"
import { RECIPE_AI_NOTICE_VERSION } from "../supabase/functions/_shared/recipe-assistant"
interface Props {
  input: RecipeInput
  disabled: boolean
  onTextChange: (key: "ingredient_text" | "step_text", value: string) => void
  onApply: (ingredients: IngredientInput[], steps: StepInput[]) => void
}
export default function RecipeTextAssistant({
  input,
  disabled,
  onTextChange,
  onApply,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [aiConsent, setAiConsent] = useState(false)
  const [suggestion, setSuggestion] = useState<{
    result: OrganizedRecipe
    snapshot: string
  } | null>(null)
  const current = useRef(input)
  current.current = input
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const snapshot = recipeAssistantSnapshot(input)
  const ready = suggestion?.snapshot === snapshot ? suggestion.result : null
  async function organize() {
    if (
      disabled ||
      !aiConsent ||
      request.current ||
      !input.ingredient_text.trim() ||
      !input.step_text.trim()
    )
      return
    const controller = new AbortController()
    request.current = controller
    const before = recipeAssistantSnapshot(input)
    setLoading(true)
    setError("")
    setSuggestion(null)
    try {
      const { data, error: failure } = await supabase.functions.invoke(
        "organize-recipe",
        {
          body: {
            ingredients: input.ingredient_text,
            steps: input.step_text,
            consent: true,
            consent_version: RECIPE_AI_NOTICE_VERSION,
          },
          signal: controller.signal,
          timeout: 45000,
        },
      )
      if (
        controller.signal.aborted ||
        before !== recipeAssistantSnapshot(current.current)
      )
        return
      if (failure) {
        let code = "failed"
        try {
          code = (await failure.context?.json())?.error ?? code
        } catch {
          /* A network failure has no JSON body. */
        }
        setError(recipeAssistantError(code))
        return
      }
      const result = validateOrganizedRecipe(data?.result, {
        ingredients: input.ingredient_text,
        steps: input.step_text,
      })
      setSuggestion({ result, snapshot: before })
    } catch {
      if (
        !controller.signal.aborted &&
        before === recipeAssistantSnapshot(current.current)
      )
        setError(recipeAssistantError("failed"))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
      if (request.current === controller) request.current = null
    }
  }
  const replacesContent =
    input.ingredients.some(
      (i) =>
        i.name.trim() ||
        i.amount.trim() ||
        i.unit.trim() ||
        i.substitute.trim() ||
        i.metric_amount.trim() ||
        i.metric_unit.trim() ||
        i.optional ||
        i.group_name !== "Ingredients",
    ) ||
    input.steps.some(
      (s) =>
        s.instruction.trim() ||
        s.step_image ||
        s.title.trim() ||
        s.step_time_minutes.trim() ||
        s.is_final,
    )
  return (
    <section
      className="recipe-text-assistant"
      aria-labelledby="recipe-text-heading"
      aria-busy={loading}
    >
      <h3 id="recipe-text-heading">Write it your way</h3>
      <p>
        Paste or type your ingredients and cooking steps in any format. AI can
        arrange them into editable fields, or you can enter them yourself on the
        next pages.
      </p>
      <label>
        Ingredients
        <textarea
          rows={5}
          maxLength={10000}
          value={input.ingredient_text}
          disabled={disabled}
          placeholder={"1 egg\n1 tbsp cooking oil\nsalt"}
          onChange={(e) => onTextChange("ingredient_text", e.target.value)}
        />
      </label>
      <label>
        Cooking steps
        <textarea
          rows={6}
          maxLength={20000}
          value={input.step_text}
          disabled={disabled}
          placeholder={
            "Add oil to pan\nCrack egg into oil\nSeason with salt\nFry on low heat\nServe once the egg hardens"
          }
          onChange={(e) => onTextChange("step_text", e.target.value)}
        />
      </label>
      <small>
        Optional AI organization sends these two text boxes through Vercel AI
        Gateway to Google Vertex AI (Gemini 2.5 Flash Lite). Processing may
        occur outside your country. Don’t include personal information. AI can
        make mistakes; check quantities and instructions before publishing.
        Manual entry is always available.
      </small>
      <details>
        <summary>AI data use</summary>
        <p>
          Google inference may run in the United States or the European Union.
          We restrict requests to Google Vertex AI and request no prompt
          training. Provider technical, billing and security records follow
          their own retention terms; Pickle’s 30-day deletion policy does not
          control those records. We do not promise enforced zero retention on
          the current Hobby plan.
        </p>
        <p>
          Your original text stays in your private draft; applied suggestions
          become editable recipe content. Accounts requiring guardian consent
          can use manual entry while separate AI guardian approval is
          unavailable.
        </p>
      </details>
      <label className="recipe-ai-consent">
        <input
          type="checkbox"
          checked={aiConsent}
          disabled={disabled || loading}
          onChange={(event) => setAiConsent(event.target.checked)}
        />
        <span>
          I agree to send these ingredients and steps to Vercel and Google for
          AI organization.
        </span>
      </label>
      <button
        type="button"
        className="submission-primary"
        disabled={
          disabled ||
          !aiConsent ||
          loading ||
          !input.ingredient_text.trim() ||
          !input.step_text.trim()
        }
        onClick={() => void organize()}
      >
        {loading ? "Organizing…" : "Organize with AI"}
      </button>
      {loading && (
        <button
          type="button"
          className="submission-text-button"
          onClick={() => {
            request.current?.abort()
            request.current = null
            setLoading(false)
          }}
        >
          Cancel AI
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {ready && (
        <div className="recipe-ai-review" aria-live="polite">
          <h4>Review AI suggestions</h4>
          <ul>
            {ready.ingredients.map((i, n) => (
              <li key={n}>
                {[i.amount, i.unit, i.name].filter(Boolean).join(" ")}
                {i.note && ` — ${i.note}`}
                {(!i.amount || !i.unit) && (
                  <strong> · Check quantity / unit</strong>
                )}
              </li>
            ))}
          </ul>
          <ol>
            {ready.steps.map((s, n) => (
              <li key={n}>{s.instruction}</li>
            ))}
          </ol>
          {ready.notes.map((note, n) => (
            <p key={n}>{note}</p>
          ))}
          <p>
            {replacesContent
              ? "Using these suggestions replaces the current ingredients and steps, including step photos. Your recipe photo and other details stay the same."
              : "Use these suggestions, then review and edit the fields on the Ingredients and Cooking steps pages."}
          </p>
          <button
            type="button"
            className="submission-primary"
            disabled={disabled}
            onClick={() => {
              if (
                suggestion?.snapshot !==
                recipeAssistantSnapshot(current.current)
              )
                return
              const next = applyOrganizedRecipe(ready)
              onApply(next.ingredients, next.steps)
              setSuggestion(null)
            }}
          >
            {replacesContent
              ? "Replace ingredients and steps"
              : "Use suggestions"}
          </button>
          <button
            type="button"
            className="submission-text-button"
            onClick={() => setSuggestion(null)}
          >
            Keep current fields
          </button>
        </div>
      )}
    </section>
  )
}
