import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { supabase } from "./lib/supabase"
import { recipeImageUrl } from "./lib/recipe"
import { newIngredient, newRecipeInput, newStep, recipeSubmissionPayload, restoreRecipeInput, validateRecipeInput, type RecipeInput, type RecipeTag, type Submission } from "./lib/submissions"
import RecipeSubmissionPreview from "./RecipeSubmissionPreview"
import "./submissions.css"

type Props = { userId: string; submission: Submission | null; tags: RecipeTag[]; onBack: () => void; onSaved: (id: string) => void }
export default function RecipeUploadScreen({ userId, submission, tags, onBack, onSaved }: Props) {
  const cacheKey = submission ? `pickle:recipe-draft:${userId}:${submission.id}` : `pickle:recipe-new:${userId}`
  const [initial] = useState(() => {
    const fallback = { id: submission?.id ?? crypto.randomUUID(), input: submission ? restoreRecipeInput(submission.payload) : newRecipeInput() }
    try {
      const saved = JSON.parse(localStorage.getItem(cacheKey) || "null")
      if (saved?.input && saved?.id && saved.version === (submission?.updated_at ?? null)) return { id: saved.id as string, input: restoreRecipeInput(saved.input) }
    } catch { /* Browser draft cache is optional. */ }
    return fallback
  })
  const [input, setInput] = useState<RecipeInput>(initial.input)
  const [version, setVersion] = useState(submission?.updated_at ?? null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState("")
  const [preview, setPreview] = useState(false)
  const guard = useRef(false)
  const errorPanel = useRef<HTMLDivElement>(null)
  const editable = !submission || submission.status === "draft"

  useEffect(() => {
    if (!editable) return
    try { localStorage.setItem(cacheKey, JSON.stringify({ id: initial.id, input, version })) } catch { /* Server draft saving remains available. */ }
  }, [cacheKey, input, initial.id, version, editable])
  function update<K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) { setInput(current => ({ ...current, [key]: value })); setMessage("") }
  function updateIngredient(index: number, field: string, value: string | boolean) { setInput(current => ({ ...current, ingredients: current.ingredients.map((item,i) => i === index ? { ...item, [field]: value } : item) })); setMessage("") }
  function updateStep(index: number, field: string, value: string | boolean) { setInput(current => ({ ...current, steps: current.steps.map((item,i) => i === index ? { ...item, [field]: value } : item) })); setMessage("") }

  async function photo(event: ChangeEvent<HTMLInputElement>, target: "cover_image" | "ingredients_image" | number) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || guard.current) return
    const ext: Record<string,string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }
    if (!ext[file.type] || file.size > 5 * 1024 * 1024) { setErrors(["Choose a JPG, PNG or WebP image up to 5 MB."]); return }
    guard.current = true
    setUploading(String(target)); setErrors([]); setMessage("")
    try {
      const bitmap = await createImageBitmap(file)
      bitmap.close()
      const path = `${userId}/${initial.id}/${crypto.randomUUID()}.${ext[file.type]}`
      const { error } = await supabase.storage.from("community_recipe_images").upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      if (typeof target === "number") updateStep(target, "step_image", `community:${path}`)
      else update(target, `community:${path}`)
    } catch (error) { console.error("Recipe photo upload failed", error); setErrors(["Could not upload this image. Check the file and try again."]) }
    finally { guard.current = false; setUploading(null) }
  }
  async function save(submit: boolean) {
    if (guard.current || !editable) return
    const issues = validateRecipeInput(input, submit)
    setErrors(issues); setMessage("")
    if (issues.length) { requestAnimationFrame(() => errorPanel.current?.focus()); return }
    guard.current = true; setBusy(true)
    try {
      const { data, error } = await supabase.rpc("save_recipe_submission", { p_id: initial.id, p_payload: recipeSubmissionPayload(input), p_submit: submit, p_expected_updated_at: version })
      if (error || !data?.id || data.status !== (submit ? "published" : "draft") || (submit && !data.recipe_id)) throw error ?? new Error("Submission was not saved")
      setVersion(data.updated_at)
      try { localStorage.removeItem(cacheKey) } catch { /* Optional browser cache. */ }
      setMessage(submit ? "Recipe published." : "Draft saved.")
      onSaved(data.id)
    } catch (error: any) {
      console.error("Recipe submission failed", error)
      setErrors([error?.code === "40001" ? "This draft changed in another window. Your changes are kept on this device; reload the draft before saving." : "Could not save your recipe. Your changes are kept on this device. Please try again."])
    } finally { guard.current = false; setBusy(false) }
  }
  function imageField(label: string, value: string, target: "cover_image" | "ingredients_image" | number) {
    return <div className="submission-image-field"><span className="submission-field-label">{label} <small>optional</small></span>{value && <img src={recipeImageUrl(value)} alt={label} />}<label className="submission-photo-button">{uploading === String(target) ? "Uploading…" : value ? "Change photo" : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || uploading !== null || !editable} onChange={event => void photo(event,target)} /></label>{value && editable && <button type="button" className="submission-text-button" disabled={busy || uploading !== null} onClick={() => typeof target === "number" ? updateStep(target,"step_image","") : update(target,"")}>Remove photo</button>}<p className="submission-muted">JPG, PNG or WebP · up to 5 MB</p></div>
  }
  const disabled = busy || uploading !== null || !editable
  return <div className="recipe-upload submission-ui">
    <div className="submission-heading"><button type="button" onClick={onBack} aria-label="Back to my recipes">‹</button><h1>{editable ? submission ? "Edit recipe" : "Upload recipe" : "Published recipe"}</h1></div>
    {!editable && <p className="submission-notice">Your recipe has been published.</p>}
    {errors.length > 0 && <div className="submission-errors" role="alert" ref={errorPanel} tabIndex={-1}><strong>Please check your recipe</strong><ul>{errors.map((error,index) => <li key={index}>{error}</li>)}</ul></div>}
    {message && <p role="status" className="submission-notice">{message}</p>}
    <div className="submission-view-toggle"><button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Details</button><button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button></div>
    {preview ? <RecipeSubmissionPreview input={input} tags={tags} /> : <form noValidate onSubmit={event => { event.preventDefault(); void save(true) }}>
      <p className="submission-muted">Fields marked * are required to publish. You can save an unfinished draft.</p>
      <fieldset disabled={disabled}>
        <section className="submission-form-section"><h2>Recipe details</h2>
          <label>Recipe name *<input required maxLength={150} value={input.title} onChange={event => update("title",event.target.value)} /></label>
          <label>Short description <small>optional</small><input maxLength={300} value={input.short_description} onChange={event => update("short_description",event.target.value)} /></label>
          <label>About this recipe <small>optional</small><textarea rows={4} maxLength={10000} value={input.description} onChange={event => update("description",event.target.value)} /></label>
          <div className="submission-grid"><label>Difficulty *<select required value={input.difficulty} onChange={event => update("difficulty",event.target.value)}><option value="">Select difficulty</option>{["Easy","Intermediate","Advanced"].map(value => <option key={value}>{value}</option>)}</select></label><label>Total time (min) *<input type="number" min={1} max={100000} step={1} required value={input.total_time_minutes} onChange={event => update("total_time_minutes",event.target.value)} /></label><label>Servings <small>optional</small><input type="number" min={1} max={100000} step={1} value={input.servings} onChange={event => update("servings",event.target.value)} /></label></div>
          <div className="submission-grid">{imageField("Recipe photo",input.cover_image,"cover_image")}{imageField("Ingredients photo",input.ingredients_image,"ingredients_image")}</div>
        </section>
        <section className="submission-form-section"><h2>Ingredients *</h2>{input.ingredients.map((item,index) => <div key={item.key} className="submission-item"><div className="submission-item-heading"><h3>Ingredient {index+1}</h3><button type="button" className="submission-text-button" disabled={input.ingredients.length<=1} onClick={() => update("ingredients",input.ingredients.filter((_,i) => i!==index))}>Remove ingredient {index+1}</button></div><label>Name *<input required maxLength={200} value={item.name} onChange={event => updateIngredient(index,"name",event.target.value)} /></label><div className="submission-grid"><label>Group *<input required maxLength={100} value={item.group_name} onChange={event => updateIngredient(index,"group_name",event.target.value)} /></label><label>Quantity <small>optional</small><input type="number" min={0} max={1000000} step="any" value={item.amount} onChange={event => updateIngredient(index,"amount",event.target.value)} /></label><label>Unit <small>optional</small><input maxLength={40} placeholder="g, cups, tbsp…" value={item.unit} onChange={event => updateIngredient(index,"unit",event.target.value)} /></label></div><label className="submission-checkbox"><input type="checkbox" checked={item.optional} onChange={event => updateIngredient(index,"optional",event.target.checked)} />Optional ingredient</label><details><summary>Substitute &amp; metric quantity <small>optional</small></summary><label>Substitute<input maxLength={300} value={item.substitute} onChange={event => updateIngredient(index,"substitute",event.target.value)} /></label><div className="submission-grid"><label>Metric quantity<input type="number" min={0} max={1000000} step="any" value={item.metric_amount} onChange={event => updateIngredient(index,"metric_amount",event.target.value)} /></label><label>Metric unit<input maxLength={40} value={item.metric_unit} onChange={event => updateIngredient(index,"metric_unit",event.target.value)} /></label></div></details></div>)}<button type="button" className="submission-secondary" disabled={input.ingredients.length>=100} onClick={() => update("ingredients",[...input.ingredients,newIngredient()])}>Add ingredient</button></section>
        <section className="submission-form-section"><h2>Cooking steps *</h2>{input.steps.map((item,index) => <div key={item.key} className="submission-item"><div className="submission-item-heading"><h3>Step {index+1}</h3><div className="submission-inline-actions"><button type="button" aria-label={`Move step ${index+1} up`} disabled={index===0} onClick={() => { const steps=[...input.steps]; [steps[index-1],steps[index]]=[steps[index],steps[index-1]]; update("steps",steps) }}>↑</button><button type="button" aria-label={`Move step ${index+1} down`} disabled={index===input.steps.length-1} onClick={() => { const steps=[...input.steps]; [steps[index+1],steps[index]]=[steps[index],steps[index+1]]; update("steps",steps) }}>↓</button><button type="button" className="submission-text-button" disabled={input.steps.length<=1} onClick={() => update("steps",input.steps.filter((_,i) => i!==index))}>Remove step {index+1}</button></div></div><label>Step title <small>optional</small><input maxLength={150} value={item.title} onChange={event => updateStep(index,"title",event.target.value)} /></label><label>Instruction *<textarea required rows={4} maxLength={10000} value={item.instruction} onChange={event => updateStep(index,"instruction",event.target.value)} /></label><label>Step time (min) <small>optional</small><input type="number" min={0} max={100000} step={1} value={item.step_time_minutes} onChange={event => updateStep(index,"step_time_minutes",event.target.value)} /></label><label className="submission-checkbox"><input type="checkbox" checked={item.is_final} onChange={event => updateStep(index,"is_final",event.target.checked)} />Finish &amp; serve step</label>{imageField(`Step ${index+1} photo`,item.step_image,index)}</div>)}<button type="button" className="submission-secondary" disabled={input.steps.length>=30} onClick={() => update("steps",[...input.steps,newStep()])}>Add step</button></section>
        <section className="submission-form-section"><h2>Tags <small>optional</small></h2>{[...new Set(tags.map(tag => tag.category))].map(category => <div key={category}><h3>{category}</h3><div className="submission-tag-options">{tags.filter(tag => tag.category===category).map(tag => <label className="submission-checkbox" key={tag.id}><input type="checkbox" checked={input.tag_ids.includes(tag.id)} onChange={event => update("tag_ids",event.target.checked ? [...input.tag_ids,tag.id] : input.tag_ids.filter(id => id!==tag.id))} />{tag.name}</label>)}</div></div>)}</section>
        <section className="submission-form-section"><h2>Nutrition <small>optional</small></h2><label className="submission-checkbox"><input type="checkbox" checked={Boolean(input.nutrition)} onChange={event => update("nutrition",event.target.checked ? { calories: "", protein_g: "", carbs_g: "", fat_g: "", is_estimated: true } : null)} />Include nutrition per serving</label>{input.nutrition && <><p className="submission-muted">Fill all four values, or turn this section off.</p><div className="submission-grid">{([ ["calories","Calories (kcal)"], ["protein_g","Protein (g)"], ["carbs_g","Carbs (g)"], ["fat_g","Fat (g)"] ] as const).map(([key,label]) => <label key={key}>{label} *<input type="number" min={0} max={100000} step={1} value={input.nutrition![key]} onChange={event => update("nutrition",{ ...input.nutrition!, [key]: event.target.value })} /></label>)}</div><label className="submission-checkbox"><input type="checkbox" checked={input.nutrition.is_estimated} onChange={event => update("nutrition",{ ...input.nutrition!, is_estimated: event.target.checked })} />Values are estimates</label></>}</section>
      </fieldset>
    </form>}
    {editable && <div className="submission-save-bar"><button type="button" className="submission-secondary" disabled={disabled} onClick={() => void save(false)}>{busy ? "Saving…" : "Save draft"}</button><button type="button" className="submission-primary" disabled={disabled} onClick={() => void save(true)}>{busy ? "Saving…" : "Publish recipe"}</button></div>}
  </div>
}
