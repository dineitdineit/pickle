export type UnitSystem = "US" | "Metric"
const GRAMS_PER_LB = 453.59237
const GRAMS_PER_OZ = GRAMS_PER_LB / 16
const aliases: Record<string, string> = {
  g: "g",
  gram: "g",
  grams: "g",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  cup: "cup",
  cups: "cup",
}
export interface IngredientQuantity {
  amount: number | null
  unit: string | null
  converted: boolean
}
export function convertIngredientQuantity(
  amount: number | null,
  unit: string | null,
  system: UnitSystem,
): IngredientQuantity {
  const original = { amount, unit, converted: false }
  if (amount === null || !Number.isFinite(amount) || amount < 0 || !unit)
    return original
  const normalized = aliases[unit.trim().toLowerCase()]
  if (system === "US") {
    if (normalized === "g") {
      const ounces = amount < 450
      return {
        amount: amount / (ounces ? GRAMS_PER_OZ : GRAMS_PER_LB),
        unit: ounces ? "oz" : "lb",
        converted: true,
      }
    }
    if (normalized === "ml") {
      const target = amount >= 200 ? "cup" : amount >= 15 ? "tbsp" : "tsp"
      return {
        amount: amount / { cup: 200, tbsp: 15, tsp: 5 }[target],
        unit: target,
        converted: true,
      }
    }
  } else {
    if (normalized === "lb")
      return { amount: amount * GRAMS_PER_LB, unit: "g", converted: true }
    if (normalized === "oz")
      return { amount: amount * GRAMS_PER_OZ, unit: "g", converted: true }
    if (normalized === "cup" || normalized === "tbsp" || normalized === "tsp")
      return {
        amount: amount * { cup: 200, tbsp: 15, tsp: 5 }[normalized],
        unit: "ml",
        converted: true,
      }
  }
  return original
}
const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  useGrouping: false,
})
export function formatIngredientQuantity(
  amount: number | null,
  unit: string | null,
  system: UnitSystem,
): string {
  const result = convertIngredientQuantity(amount, unit, system)
  const number =
    result.amount === null ? "" : quantityFormatter.format(result.amount)
  return [number, result.unit]
    .filter((value) => value !== null && value !== "")
    .join(" ")
}
