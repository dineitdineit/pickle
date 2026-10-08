import { formatTime } from "./lib/format"
import { recipeImageUrl } from "./lib/recipe"
import type { IngredientRow, StepRow, Nutrition } from "./recipeTypes"

function formatAmount(amount: number | null) {
  if (amount === null) return ""
  const fractions: Record<number, string> = {
    0.25: "¼",
    0.5: "½",
    0.75: "¾",
    0.33: "⅓",
    0.67: "⅔",
  }
  return fractions[amount] ?? String(amount)
}

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
  return (
    <section
      className={`recipe-content-section recipe-ingredients mt-6${
        !active ? " is-inactive" : ""
      }`}
    >
      <h2
        className="font-semibold text-[20px] mb-4"
        style={{ color: "#1F1F1F" }}
      >
        Ingredients
      </h2>
      {ingredientsImage && (
        <div className="recipe-ingredients-image rounded-[16px] overflow-hidden mb-5 bg-gray-100">
          <img
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
                className="font-semibold text-[15px] mb-2"
                style={{ color: "#1F1F1F" }}
              >
                {group}
              </h3>
            )}
            <div className="divide-y" style={{ borderColor: "#EAEAEA" }}>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between gap-4 py-3"
                  style={{ borderColor: "#EAEAEA" }}
                >
                  <div className="min-w-0">
                    <p className="text-[15px]" style={{ color: "#1F1F1F" }}>
                      {item.ingredients?.name || "Ingredient"}
                      {item.optional ? (
                        <span
                          className="text-[12px] ml-1"
                          style={{ color: "#6F6F6F" }}
                        >
                          (optional)
                        </span>
                      ) : null}
                    </p>
                    {item.substitute && (
                      <p
                        className="text-[12px] mt-0.5"
                        style={{ color: "#6F6F6F" }}
                      >
                        Sub: {item.substitute}
                      </p>
                    )}
                  </div>
                  <p
                    className="text-[14px] whitespace-nowrap font-medium"
                    style={{ color: "#1F1F1F" }}
                  >
                    {formatAmount(item.amount)} {item.unit || ""}
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
        className="font-semibold text-[20px] mb-4"
        style={{ color: "#1F1F1F" }}
      >
        Steps
      </h2>
      <div className="space-y-7">
        {steps.map((step) => (
          <article key={step.id}>
            {step.step_image && (
              <div className="rounded-[16px] overflow-hidden bg-gray-100 mb-3">
                <img
                  src={recipeImageUrl(step.step_image)}
                  alt={step.title || `Step ${step.step_number}`}
                  className="w-full aspect-[4/3] object-cover"
                />
              </div>
            )}
            <div className="flex gap-3">
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[14px] font-semibold"
                style={{ backgroundColor: "#F26B21" }}
              >
                {step.step_number}
              </div>
              <div className="pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    className="font-semibold text-[17px]"
                    style={{ color: "#1F1F1F" }}
                  >
                    {step.title || `Step ${step.step_number}`}
                  </h3>
                  {step.step_time_minutes ? (
                    <span
                      className="text-[12px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#FFF0E6", color: "#F26B21" }}
                    >
                      {formatTime(step.step_time_minutes)}
                    </span>
                  ) : null}
                </div>
                <p
                  className="text-[15px] leading-6 mt-1.5"
                  style={{ color: "#6F6F6F" }}
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
          className="font-semibold text-[20px] leading-none"
          style={{ color: "#1F1F1F" }}
        >
          Nutrition
        </h2>
        <span className="text-[12px] leading-none" style={{ color: "#8A8A8A" }}>
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
                  backgroundColor: "#F9F9F9",
                  border: "1px solid #EEEEEE",
                }}
              >
                <p className="text-[13px] mb-2" style={{ color: "#6F6F6F" }}>
                  {label}
                </p>
                <div className="flex" style={{ alignItems: "baseline" }}>
                  <span
                    className="font-semibold text-[22px] leading-none"
                    style={{ color: "#1F1F1F" }}
                  >
                    {value}
                  </span>
                  <span
                    className="text-[12px] leading-none ml-1"
                    style={{ color: "#8A8A8A" }}
                  >
                    {unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {nutrition.is_estimated && (
            <p
              className="mt-3 text-[10px] leading-[14px]"
              style={{ color: "#A0A0A0" }}
            >
              *Nutrition values are estimates and may not be accurate.
            </p>
          )}
        </>
      ) : (
        <div
          className="rounded-[14px] px-4 py-4"
          style={{ backgroundColor: "#FFF8F3" }}
        >
          <p className="text-[13px] leading-5" style={{ color: "#6F6F6F" }}>
            Nutrition information is not available for this recipe yet.
          </p>
        </div>
      )}
    </section>
  )
}
