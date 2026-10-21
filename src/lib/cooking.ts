import type { IngredientRow, StepRow } from "../recipeTypes"

export interface CookingTimer {
  remainingMs: number

  endsAt: number | null
}

export interface CookingProgress {
  version: 1

  signature: string

  updatedAt: number

  ingredients: string[]

  steps: string[]

  activeStep: string | null

  servings: number | null

  units: "US" | "Metric"

  timers: Record<string, CookingTimer>
}

export const COOKING_TTL = 30 * 86400000

const MAX_TIMER_MS = 24 * 3600000

export function cookingKey(recipeId: string, userId: string | null) {
  return `pickle:cooking:${userId ?? "guest"}:${recipeId}`
}

export function validServings(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0.5 &&
    value <= 1000
  )
}

export function scaledIngredientAmount(
  amount: number | null,

  unit: string | null,

  original: number | null,

  servings: number | null,
) {
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null

  if (
    !validServings(original) ||
    !validServings(servings) ||
    /^(to taste|as needed)$/i.test(unit?.trim() ?? "")
  )
    return amount

  return (amount * servings) / original
}

/** Change detection only: never used for authentication or access control. */

export function cookingSignature(
  ingredients: IngredientRow[],

  steps: StepRow[],

  servings: number | null,
) {
  const source = JSON.stringify([servings, ingredients, steps])

  let hash = 2166136261

  for (let i = 0; i < source.length; i++)
    hash = Math.imul(hash ^ source.charCodeAt(i), 16777619)

  return (hash >>> 0).toString(36)
}

export function freshCookingProgress(
  signature: string,

  steps: StepRow[],

  servings: number | null,
): CookingProgress {
  return {
    version: 1,

    signature,

    updatedAt: Date.now(),

    ingredients: [],

    steps: [],

    activeStep: steps[0]?.id ?? null,

    servings: validServings(servings) ? servings : null,

    units: "US",

    timers: {},
  }
}

export function restoreCookingProgress(
  value: unknown,

  signature: string,

  ingredients: IngredientRow[],

  steps: StepRow[],

  servings: number | null,

  now = Date.now(),
): CookingProgress {
  const fresh = freshCookingProgress(signature, steps, servings)

  const row = value as Partial<CookingProgress> | null

  if (
    !row ||
    row.version !== 1 ||
    row.signature !== signature ||
    !Number.isFinite(row.updatedAt) ||
    now - row.updatedAt! > COOKING_TTL ||
    row.updatedAt! > now + 60000
  )
    return fresh

  const ids = new Set(ingredients.map((item) => item.id)),
    stepIds = new Set(steps.map((step) => step.id))

  const selected = (values: unknown, allowed: Set<string>) =>
    Array.isArray(values)
      ? [
          ...new Set(
            values.filter(
              (id): id is string => typeof id === "string" && allowed.has(id),
            ),
          ),
        ]
      : []

  const timers: Record<string, CookingTimer> = {}

  if (
    row.timers &&
    typeof row.timers === "object" &&
    !Array.isArray(row.timers)
  )
    for (const [id, timer] of Object.entries(row.timers)) {
      if (!stepIds.has(id) || !timer || typeof timer !== "object") continue

      if (
        typeof timer.remainingMs !== "number" ||
        !Number.isFinite(timer.remainingMs) ||
        timer.remainingMs < 0 ||
        timer.remainingMs > MAX_TIMER_MS
      )
        continue

      if (
        timer.endsAt !== null &&
        (typeof timer.endsAt !== "number" ||
          !Number.isFinite(timer.endsAt) ||
          timer.endsAt > now + MAX_TIMER_MS)
      )
        continue

      timers[id] = { remainingMs: timer.remainingMs, endsAt: timer.endsAt }
    }

  return {
    ...fresh,

    updatedAt: row.updatedAt!,

    ingredients: selected(row.ingredients, ids),

    steps: selected(row.steps, stepIds),

    activeStep:
      typeof row.activeStep === "string" && stepIds.has(row.activeStep)
        ? row.activeStep
        : fresh.activeStep,

    servings:
      validServings(servings) && validServings(row.servings)
        ? row.servings
        : fresh.servings,

    units: row.units === "Metric" ? "Metric" : "US",

    timers,
  }
}

export function timerRemaining(timer: CookingTimer, now: number) {
  return Math.max(
    0,

    Math.min(
      MAX_TIMER_MS,

      timer.remainingMs,

      timer.endsAt === null ? timer.remainingMs : timer.endsAt - now,
    ),
  )
}

export function startCookingTimer(minutes: number, now: number): CookingTimer {
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)
    throw new Error("Choose a duration between 0 and 1,440 minutes.")

  const remainingMs = Math.round(minutes * 60000)

  if (remainingMs < 1000)
    throw new Error("Choose a timer of at least one second.")

  return { remainingMs, endsAt: now + remainingMs }
}

export function pauseCookingTimer(
  timer: CookingTimer,

  now: number,
): CookingTimer {
  return { remainingMs: timerRemaining(timer, now), endsAt: null }
}

export function timerLabel(milliseconds: number) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000)

  const s = String(seconds % 60).padStart(2, "0")

  const minutes = Math.floor(seconds / 60)

  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${s}`
    : `${minutes}:${s}`
}

export function toggleCookingId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
}
