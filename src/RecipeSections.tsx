import RecipeImage from "./RecipeImage"

import { formatTime } from "./lib/format"

import { recipeImageUrl } from "./lib/recipe"

import type { IngredientRow, StepRow, Nutrition } from "./recipeTypes"

import { useState } from "react"

import {
  formatIngredientQuantity,
  type UnitSystem,
} from "./lib/ingredientUnits"

import "./ingredient-units.css"

export function IngredientsSection({
  groupedIngredients,

  recipeTitle,

  ingredientsImage,

  active,
}: {
  groupedIngredients: [string, IngredientRow[]][]

  recipeTitle: string

  ingredientsImage: string | null

  active: boolean
}) {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("US")

  return (
    <section
      className={`recipe-content-section recipe-ingredients mt-6${
        !ingredientsImage ? " no-ingredients-photo" : ""
      }${!active ? " is-inactive" : ""}`}
    >
      <div className="recipe-ingredients-header">
        <h2
          className="font-semibold text-section mb-4"
          style={{ color: "var(--color-ink)" }}
        >
          Ingredients
        </h2>
        <div
          className="ingredient-unit-switch"
          role="group"
          aria-label="Ingredient units"
          title="1 oz = 28.349523125 g; 1 lb = 453.59237 g; 1 cup = 200 ml; 1 tbsp = 15 ml; 1 tsp = 5 ml"
        >
          {(["US", "Metric"] as const).map((system) => (
            <button
              key={system}
              type="button"
              aria-pressed={unitSystem === system}
              onClick={() => setUnitSystem(system)}
            >
              {system}
            </button>
          ))}
        </div>
      </div>
      {ingredientsImage && (
        <div className="recipe-ingredients-image rounded-[16px] overflow-hidden mb-5 bg-gray-100">
          <RecipeImage
            src={recipeImageUrl(ingredientsImage)}
            alt={`${recipeTitle} ingredients`}
            className="w-full aspect-[4/3] object-cover"
          />
        </div>
      )}
      <div className="space-y-6">
        {groupedIngredients.map(([group, items]) => (
          <div key={group}>
            {group !== "Main" && (
              <h3
                className="font-semibold text-body mb-2"
                style={{ color: "var(--color-ink)" }}
              >
                {group}
              </h3>
            )}
            <div
              className="divide-y"
              style={{ borderColor: "var(--color-border)" }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between gap-4 py-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div className="min-w-0">
                    <p
                      className="text-body"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {item.ingredients?.name || "Ingredient"}
                      {item.optional ? (
                        <span
                          className="text-label ml-1"
                          style={{ color: "var(--color-gray)" }}
                        >
                          (optional)
                        </span>
                      ) : null}
                    </p>
                    {item.substitute && (
                      <p
                        className="text-label mt-0.5"
                        style={{ color: "var(--color-gray)" }}
                      >
                        Sub: {item.substitute}
                      </p>
                    )}
                  </div>
                  <p
                    className="text-body whitespace-nowrap font-medium"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {formatIngredientQuantity(
                      item.amount,

                      item.unit,

                      unitSystem,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function StepsSection({
  steps,

  active,
}: {
  steps: StepRow[]

  active: boolean
}) {
  return (
    <section
      className={`recipe-content-section mt-6${!active ? " is-inactive" : ""}`}
    >
      <h2
        className="font-semibold text-section mb-4"
        style={{ color: "var(--color-ink)" }}
      >
        Steps
      </h2>
      <div className="space-y-7">
        {steps.map((step) => (
          <article key={step.id}>
            {step.step_image && (
              <div className="rounded-[16px] overflow-hidden bg-gray-100 mb-3">
                <RecipeImage
                  src={recipeImageUrl(step.step_image)}
                  alt={step.title || `Step ${step.step_number}`}
                  className="w-full aspect-[4/3] object-cover"
                />
              </div>
            )}
            <div className="flex gap-3">
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-body font-semibold"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {step.step_number}
              </div>
              <div className="pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    className="font-semibold text-lead"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {step.title || `Step ${step.step_number}`}
                  </h3>
                  {step.step_time_minutes ? (
                    <span
                      className="text-label px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "var(--color-primary-soft)",

                        color: "var(--color-primary)",
                      }}
                    >
                      {formatTime(step.step_time_minutes)}
                    </span>
                  ) : null}
                </div>
                <p
                  className="text-body leading-6 mt-1.5"
                  style={{ color: "var(--color-ink)" }}
                >
                  {step.instruction}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function NutritionSection({
  nutrition,

  active,
}: {
  nutrition: Nutrition | null

  active: boolean
}) {
  return (
    <section
      className={`recipe-content-section mt-6${!active ? " is-inactive" : ""}`}
    >
      <div
        className="flex justify-between mb-4"
        style={{ alignItems: "baseline" }}
      >
        <h2
          className="font-semibold text-section leading-none"
          style={{ color: "var(--color-ink)" }}
        >
          Nutrition
        </h2>
        <span
          className="text-label leading-none"
          style={{ color: "var(--color-gray-soft)" }}
        >
          Per serving
        </span>
      </div>
      {nutrition ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Calories", nutrition.calories, "kcal"],

              ["Protein", nutrition.protein_g, "g"],

              ["Carbs", nutrition.carbs_g, "g"],

              ["Fat", nutrition.fat_g, "g"],
            ].map(([label, value, unit]) => (
              <div
                key={label}
                className="rounded-[14px] p-4"
                style={{
                  backgroundColor: "var(--color-surface)",

                  border: "1px solid var(--color-border)",
                }}
              >
                <p
                  className="text-body mb-2"
                  style={{ color: "var(--color-gray)" }}
                >
                  {label}
                </p>
                <div className="flex" style={{ alignItems: "baseline" }}>
                  <span
                    className="font-semibold text-title leading-none"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {value}
                  </span>
                  <span
                    className="text-label leading-none ml-1"
                    style={{ color: "var(--color-gray-soft)" }}
                  >
                    {unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {nutrition.is_estimated && (
            <p
              className="mt-3 text-caption leading-[16px]"
              style={{ color: "var(--color-gray-soft)" }}
            >
              *Nutrition values are estimates and may not be accurate.
            </p>
          )}
        </>
      ) : (
        <div
          className="rounded-[14px] px-4 py-4"
          style={{ backgroundColor: "var(--color-primary-faint)" }}
        >
          <p
            className="text-body leading-5"
            style={{ color: "var(--color-gray)" }}
          >
            Nutrition information is not available for this recipe yet.
          </p>
        </div>
      )}
    </section>
  )
}
