import { validVideoUrl } from "./video"
export type IngredientInput = {
  key: string
  name: string
  group_key?: string
  group_name: string
  amount: string
  unit: string
  metric_amount: string
  metric_unit: string
  optional: boolean
  substitute: string
}
export type StepInput = {
  key: string
  title: string
  instruction: string
  step_image: string
  step_time_minutes: string
  is_final: boolean
}
export type RecipeInput = {
  title: string
  short_description: string
  description: string
  difficulty: string
  total_time_minutes: string
  servings: string
  video_url: string
  cover_image: string
  ingredients_image: string
  finished_image: string
  ingredients: IngredientInput[]
  steps: StepInput[]
  tag_ids: string[]
  tag_names: string[]
  nutrition: { calories: string; protein_g: string; carbs_g: string; fat_g: string; is_estimated: boolean } | null
}
export type Submission = {
  id: string
  user_id: string
  payload: RecipeInput
  status: "draft" | "published"
  published_recipe_id: string | null
  updated_at: string
  submitted_at: string | null
}
export type RecipeTag = { id: string; name: string; category: string }
export const submissionColumns = "id,user_id,payload,status,published_recipe_id,updated_at,submitted_at"
export const newIngredient = (): IngredientInput => ({ key: crypto.randomUUID(), name: "", group_name: "Ingredients", amount: "", unit: "", metric_amount: "", metric_unit: "", optional: false, substitute: "" })
export const newStep = (): StepInput => ({ key: crypto.randomUUID(), title: "", instruction: "", step_image: "", step_time_minutes: "", is_final: false })
export const newRecipeInput = (): RecipeInput => ({ title: "", short_description: "", description: "", difficulty: "", total_time_minutes: "", servings: "", video_url: "", cover_image: "", ingredients_image: "", finished_image: "", ingredients: [newIngredient()], steps: [newStep()], tag_ids: [], tag_names: [], nutrition: null })

export function restoreRecipeInput(payload: RecipeInput): RecipeInput {
  const result = { ...newRecipeInput(), ...payload }
  for (const field of ["total_time_minutes", "servings"] as const) result[field] = String(payload[field] ?? "")
  result.ingredients = (payload.ingredients ?? []).map(item => ({ ...newIngredient(), ...item, key: item.key || crypto.randomUUID(), amount: String(item.amount ?? ""), metric_amount: String(item.metric_amount ?? "") }))
  result.steps = (payload.steps ?? []).map(item => ({ ...newStep(), ...item, key: item.key || crypto.randomUUID(), step_time_minutes: String(item.step_time_minutes ?? "") }))
  if (payload.nutrition) result.nutrition = { ...payload.nutrition, calories: String(payload.nutrition.calories ?? ""), protein_g: String(payload.nutrition.protein_g ?? ""), carbs_g: String(payload.nutrition.carbs_g ?? ""), fat_g: String(payload.nutrition.fat_g ?? "") }
  result.video_url = String(payload.video_url ?? "")
  const groupKeys = new Map<string, string>()
  result.ingredients = result.ingredients.map(item => {
    const key = item.group_key || groupKeys.get(item.group_name) || crypto.randomUUID()
    groupKeys.set(item.group_name, key)
    return { ...item, group_key: key }
  })
  return result
}

export function validateRecipeInput(input: RecipeInput, submit: boolean, page?: 0 | 1 | 2): string[] {
  const errors: string[] = []
  if (page === undefined || page === 0) {
    if (!validVideoUrl(input.video_url)) errors.push("Only YouTube and Instagram video links are allowed. Enter a valid video link.")
    if (submit && !input.cover_image.trim()) errors.push("Recipe photo is required.")
    if (submit && !input.description.trim()) errors.push("Recipe description is required.")
    if (submit && !input.title.trim()) errors.push("Recipe name is required.")
    if (input.tag_names.length > 10 || input.tag_names.some(name => !name.trim() || name.trim().length > 40)) errors.push("Use up to 10 tags, each between 1 and 40 characters.")
  }
  function number(value: string, label: string, min: number, integer = false, max = 100000) {
    if (!value.trim()) return
    if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value.trim()) || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max || (integer && !Number.isInteger(Number(value)))) errors.push(`${label} must be ${integer ? "a whole number" : "a number"} between ${min} and ${max.toLocaleString()}.`)
  }
  if (page === undefined || page === 1) {
    if (submit && !input.servings.trim()) errors.push("Servings are required.")
    if (submit && !["Easy", "Intermediate", "Advanced"].includes(input.difficulty)) errors.push("Choose a difficulty.")
    if (submit && !input.total_time_minutes.trim()) errors.push("Total cooking time is required.")
    number(input.total_time_minutes, "Total cooking time", 1, true)
    number(input.servings, "Servings", 1, true)
    if (input.ingredients.length > 100 || (submit && !input.ingredients.length)) errors.push("Add between 1 and 100 ingredients.")
    input.ingredients.forEach((item, index) => {
      if (submit && !item.name.trim()) errors.push(`Ingredient ${index + 1} needs a name.`)
      if (submit && !item.group_name.trim()) errors.push(`Ingredient ${index + 1} needs a group.`)
      if (submit && !item.amount.trim()) errors.push(`Ingredient ${index + 1} needs a quantity.`)
      if (submit && !item.unit.trim()) errors.push(`Ingredient ${index + 1} needs a unit.`)
      number(item.amount, `Ingredient ${index + 1} quantity`, 0, false, 1000000)
      number(item.metric_amount, `Ingredient ${index + 1} metric quantity`, 0, false, 1000000)
    })
    if (input.nutrition) {
      for (const field of ["calories", "protein_g", "carbs_g", "fat_g"] as const) {
        if (submit && !input.nutrition[field].trim()) errors.push(`Fill in ${field.replace("_g", "")} or turn off nutrition.`)
        number(input.nutrition[field], field, 0, true)
      }
  }
  }
  if (page === undefined || page === 2) {
    if (input.steps.length > 30 || (submit && !input.steps.length)) errors.push("Add between 1 and 30 cooking steps.")
    input.steps.forEach((item, index) => {
      if (submit && !item.instruction.trim()) errors.push(`Step ${index + 1} needs an instruction.`)
      number(item.step_time_minutes, `Step ${index + 1} time`, 0, true)
    })
  }
  return errors
}

export function recipeSubmissionPayload(input: RecipeInput) {
  const number = (value: string) => value.trim() ? Number(value) : null
  return {
    ...input,
    video_url: input.video_url.trim(),
    tag_names: [...new Set(input.tag_names.map(name => name.trim()).filter(Boolean))],
    title: input.title.trim(), short_description: input.short_description.trim(), description: input.description.trim(),
    total_time_minutes: number(input.total_time_minutes), servings: number(input.servings),
    ingredients: input.ingredients.map(({ key: _key, ...item }) => ({ ...item, name: item.name.trim(), group_name: item.group_name.trim(), amount: number(item.amount), metric_amount: number(item.metric_amount), unit: item.unit.trim(), metric_unit: item.metric_unit.trim(), substitute: item.substitute.trim() })),
    steps: input.steps.map(({ key: _key, ...item }) => ({ ...item, title: item.title.trim(), instruction: item.instruction.trim(), step_time_minutes: number(item.step_time_minutes) })),
    nutrition: input.nutrition ? { ...input.nutrition, calories: number(input.nutrition.calories), protein_g: number(input.nutrition.protein_g), carbs_g: number(input.nutrition.carbs_g), fat_g: number(input.nutrition.fat_g) } : null,
  }
}

export function assignStepPhotos(steps: StepInput[], paths: string[]): StepInput[] {
  const next = steps.map(step => ({ ...step }))
  const empty = next.reduce<number[]>((slots, step, index) => step.step_image ? slots : [...slots, index], [])
  if (paths.length > empty.length + 30 - next.length) throw new Error("A recipe can have up to 30 steps.")
  paths.forEach((path, index) => {
    if (index < empty.length) next[empty[index]].step_image = path
    else next.push({ ...newStep(), step_image: path })
  })
  return next
}
