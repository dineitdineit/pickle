import { recipeImageUrl } from "./lib/recipe"
import type { RecipeInput, RecipeTag } from "./lib/submissions"

export default function RecipeSubmissionPreview({ input, tags }: { input: RecipeInput; tags: RecipeTag[] }) {
  return <article className="submission-preview">
    {input.cover_image && <img className="submission-cover" src={recipeImageUrl(input.cover_image)} alt={input.title || "Recipe photo"} />}
    <h2>{input.title || "Untitled recipe"}</h2>
    {input.short_description && <p>{input.short_description}</p>}
    <p className="submission-muted">{input.difficulty || "Difficulty not set"} · {input.total_time_minutes || "—"} min{input.servings ? ` · ${input.servings} servings` : ""}</p>
    {input.tag_ids.length > 0 && <div className="submission-tags">{tags.filter(tag => input.tag_ids.includes(tag.id)).map(tag => <span key={tag.id}>{tag.name}</span>)}</div>}
    {input.description && <p className="submission-prose">{input.description}</p>}
    <h3>Ingredients</h3>
    {input.ingredients_image && <img className="submission-cover" src={recipeImageUrl(input.ingredients_image)} alt="Ingredients" />}
    {input.ingredients.map((item, index) => <div key={index} className="submission-preview-ingredient"><strong>{item.name || "Unnamed ingredient"}{item.optional && " (optional)"}</strong><span>{item.amount} {item.unit}</span><p className="submission-muted">{item.group_name}{item.metric_amount !== "" && item.metric_amount != null ? ` · ${item.metric_amount} ${item.metric_unit}` : ""}{item.substitute ? ` · Substitute: ${item.substitute}` : ""}</p></div>)}
    <h3>Steps</h3>
    {input.steps.map((item, index) => <section key={index} className="submission-preview-step"><h4>{index + 1}. {item.title || "Cooking step"}{item.is_final ? " · Finish & serve" : ""}</h4>{item.step_time_minutes !== "" && item.step_time_minutes != null && <p className="submission-muted">{item.step_time_minutes} min</p>}{item.step_image && <img className="submission-step-photo" src={recipeImageUrl(item.step_image)} alt={`Step ${index + 1}`} />}<p className="submission-prose">{item.instruction || "No instruction yet"}</p></section>)}
    {input.nutrition && <><h3>Nutrition per serving</h3><div className="submission-nutrition-values">{[["Calories", input.nutrition.calories, "kcal"], ["Protein", input.nutrition.protein_g, "g"], ["Carbs", input.nutrition.carbs_g, "g"], ["Fat", input.nutrition.fat_g, "g"]].map(([name,value,unit]) => <p key={name}>{name}: {value} {unit}</p>)}</div>{input.nutrition.is_estimated && <p className="submission-muted">Nutrition values are estimates.</p>}</>}
  </article>
}
