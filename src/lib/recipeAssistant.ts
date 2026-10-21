import { newIngredient, newStep, type RecipeInput } from "./submissions"
import {
  validateOrganizedRecipe,
  type OrganizedRecipe,
} from "../../supabase/functions/_shared/recipe-assistant"
export { validateOrganizedRecipe }
export type { OrganizedRecipe }
export function recipeAssistantSnapshot(input: RecipeInput) {
  return JSON.stringify([
    input.ingredient_text,
    input.step_text,
    input.ingredients,
    input.steps,
  ])
}
export function applyOrganizedRecipe(result: OrganizedRecipe) {
  const groups = new Map<string, string>()
  return {
    ingredients: result.ingredients.map((item) => {
      const groupKey = groups.get(item.group) ?? crypto.randomUUID()
      groups.set(item.group, groupKey)
      return {
        ...newIngredient(),
        name: item.name,
        group_key: groupKey,
        group_name: item.group,
        amount: item.amount,
        unit: item.unit,
        substitute: item.note,
      }
    }),
    steps: result.steps.map((item, index) => ({
      ...newStep(),
      title: item.title,
      instruction: item.instruction,
      step_time_minutes: item.minutes,
      is_final: index === result.steps.length - 1,
    })),
  }
}
export function recipeAssistantError(code: string) {
  switch (code) {
    case "guardian_ai_consent_required":
      return "AI organization needs separate guardian approval, which isn’t available yet. You can still enter ingredients and steps manually."
    case "consent_required":
      return "Please reopen the updated recipe editor and agree to the AI notice before trying again. Your draft is unchanged."
    case "ai_not_configured":
      return "AI organization isn’t connected yet. Your text is saved with this draft. You can enter ingredients and steps manually on the next pages."
    case "rate_limited":
      return "AI use limit reached. Wait a minute before trying again; up to 10 requests are available per day."
    case "unauthorized":
      return "Please sign in again to organize this recipe. Your draft is still saved."
    case "not_allowed":
      return "AI organization isn’t available for this account. You can check your account status in settings."
    default:
      return "Couldn’t organize this recipe. Your text and existing fields are unchanged. Try again or enter them manually."
  }
}
