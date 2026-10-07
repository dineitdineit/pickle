export type IngredientRow = {
  id: string
  group_name: string | null
  amount: number | null
  unit: string | null
  optional: boolean | null
  substitute: string | null
  display_order: number | null
  ingredients: { name: string } | null
}

export type StepRow = {
  id: string
  step_number: number
  title: string | null
  instruction: string
  step_image: string | null
  step_time_minutes: number | null
  is_final: boolean | null
}

export type Nutrition = {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  is_estimated: boolean
}
