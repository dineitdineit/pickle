import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { supabase } from "./lib/supabase"
import { recipeImageUrl } from "./lib/recipe"
import { assignStepPhotos, newIngredient, newRecipeInput, newStep, recipeSubmissionPayload, restoreRecipeInput, validateRecipeInput, type RecipeInput, type RecipeTag, type Submission } from "./lib/submissions"
import RecipeSubmissionPreview from "./RecipeSubmissionPreview"
import "./submissions.css"

type Props = { userId: string; submission: Submission | null; tags: RecipeTag[]; onBack: () => void; onSaved: (id: string) => void }
type PhotoTarget = "cover_image" | "ingredients_image" | "finished_image" | number
const pages = ["Recipe details", "Ingredients", "Cooking steps"]
function PlusCircle() {
  return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="16" cy="16" r="13" /><path d="M16 10v12M10 16h12" /></svg>
}
export default function RecipeUploadScreen({ userId, submission, tags, onBack, onSaved }: Props) {
  const cacheKey = submission ? `pickle:recipe-draft:${userId}:${submission.id}` : `pickle:recipe-new:${userId}`
  const [initial] = useState(() => {
    const fallback = { id: submission?.id ?? crypto.randomUUID(), input: restoreRecipeInput(submission?.payload ?? newRecipeInput()), version: submission?.updated_at ?? null, page: 0 }
    try {
      const saved = JSON.parse(localStorage.getItem(cacheKey) || "null")
      if (saved?.input && saved?.id && (!submission || saved.version === submission.updated_at)) return { id: saved.id as string, input: restoreRecipeInput(saved.input), version: saved.version ?? null, page: [0,1,2].includes(saved.page) ? saved.page : 0 }
    } catch { /* Browser draft cache is optional. */ }
    return fallback
  })
  const [input, setInput] = useState<RecipeInput>(initial.input)
  const [version, setVersion] = useState<string | null>(initial.version)
  const [page, setPage] = useState<number>(initial.page)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState("")
  const [preview, setPreview] = useState(false)
  const [tagText, setTagText] = useState("")
  const [cancelOpen, setCancelOpen] = useState(false)
  const [publishedId, setPublishedId] = useState<string | null>(null)
  const guard = useRef(false)
  const errorPanel = useRef<HTMLDivElement>(null)
  const pageHeading = useRef<HTMLHeadingElement>(null)
  const editable = (!submission || submission.status === "draft") && !publishedId
  const disabled = busy || uploading !== null || !editable
  useEffect(() => {
    if (!editable) return
    try { localStorage.setItem(cacheKey, JSON.stringify({ id: initial.id, input, version, page })) } catch { /* Server draft saving remains available. */ }
  }, [cacheKey, input, initial.id, version, page, editable])
  function update<K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) { setInput(current => ({ ...current, [key]: value })); setMessage("") }
  function updateIngredient(index: number, field: string, value: string | boolean) { setInput(current => ({ ...current, ingredients: current.ingredients.map((item,i) => i === index ? { ...item, [field]: value } : item) })); setMessage("") }
  function updateStep(index: number, field: string, value: string | boolean) { setInput(current => ({ ...current, steps: current.steps.map((item,i) => i === index ? { ...item, [field]: value } : item) })); setMessage("") }
  function goTo(next: number) {
    if (guard.current || busy || uploading !== null) return
    if (editable && next > page) {
      const issues = Array.from({ length: next }, (_, index) => validateRecipeInput(input, true, index as 0 | 1 | 2)).flat()
      if (tagText.trim()) issues.push("Press Add to include the tag you typed, or clear the tag input.")
      if (issues.length) {
        setErrors(issues); setMessage(""); setPreview(false)
        requestAnimationFrame(() => errorPanel.current?.focus())
        return
      }
    }
    setErrors([]); setMessage(""); setPage(next); setPreview(false)
    window.scrollTo({ top: 0 }); requestAnimationFrame(() => pageHeading.current?.focus())
  }
  function addTag() {
    const name = tagText.trim().replace(/^#+/, "").trim()
    if (!name) return
    if (name.length > 40) { setErrors(["Tags can have up to 40 characters."]); return }
    const existing = tags.find(tag => tag.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (!input.tag_ids.includes(existing.id)) update("tag_ids", [...input.tag_ids, existing.id])
    } else if (!input.tag_names.some(tag => tag.toLowerCase() === name.toLowerCase())) {
      if (input.tag_names.length >= 10) { setErrors(["You can add up to 10 new tags."]); return }
      update("tag_names", [...input.tag_names, name])
    }
    setTagText("")
  }
  async function uploadFile(file: File) {
    const ext: Record<string,string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }
    if (!ext[file.type] || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPG, PNG or WebP image up to 5 MB.")
    const bitmap = await createImageBitmap(file)
    bitmap.close()
    const path = `${userId}/${initial.id}/${crypto.randomUUID()}.${ext[file.type]}`
    const { error } = await supabase.storage.from("community_recipe_images").upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error("Could not upload the photo. Please try again.")
    return `community:${path}`
  }
  async function photo(event: ChangeEvent<HTMLInputElement>, target: PhotoTarget) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || guard.current || !editable) return
    guard.current = true; setUploading(String(target)); setErrors([]); setMessage("")
    try {
      const path = await uploadFile(file)
      if (typeof target === "number") updateStep(target, "step_image", path)
      else update(target, path)
    } catch (error) { console.error(error); setErrors([error instanceof Error ? error.message : "Could not upload this image."]) }
    finally { guard.current = false; setUploading(null) }
  }
  async function bulkPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (!files.length || guard.current || !editable) return
    const capacity = input.steps.filter(step => !step.step_image).length + 30 - input.steps.length
    if (files.length > capacity) { setErrors([`Choose up to ${capacity} photos. A recipe can have up to 30 steps.`]); return }
    guard.current = true; setErrors([]); setMessage("")
    const paths: string[] = []
    try {
      for (let i = 0; i < files.length; i++) {
        setUploading(`Photo ${i + 1} of ${files.length}`)
        paths.push(await uploadFile(files[i]))
      }
      setMessage(`${paths.length} photos added to cooking steps.`)
    } catch (error) {
      setErrors([`${paths.length} photos added. ${error instanceof Error ? error.message : "Upload failed."} Retry the remaining photos.`])
    } finally {
      if (paths.length) setInput(current => ({ ...current, steps: assignStepPhotos(current.steps, paths) }))
      guard.current = false; setUploading(null)
    }
  }
  async function save(submit: boolean) {
    if (guard.current || !editable) return
    const issues = validateRecipeInput(input, submit)
    if (tagText.trim()) issues.push("Press Add to include the tag you typed, or clear the tag input.")
    setErrors(issues); setMessage("")
    if (issues.length) { setPreview(false); requestAnimationFrame(() => errorPanel.current?.focus()); return }
    guard.current = true; setBusy(true)
    try {
      const { data, error } = await supabase.rpc("save_recipe_submission", { p_id: initial.id, p_payload: recipeSubmissionPayload(input), p_submit: submit, p_expected_updated_at: version })
      if (error || !data?.id || data.status !== (submit ? "published" : "draft") || (submit && !data.recipe_id)) throw error ?? new Error("Submission was not saved")
      setVersion(data.updated_at)
      if (submit) {
        try { localStorage.removeItem(cacheKey); localStorage.removeItem(`pickle:recipe-draft:${userId}:${initial.id}`) } catch { /* Optional cache. */ }
        setPublishedId(data.recipe_id)
        setMessage("업로드 되었습니다.")
        window.scrollTo({ top: 0 })
      } else setMessage("Draft saved. You can keep editing or return later.")
    } catch (error: any) {
      console.error("Recipe submission failed", error)
      setErrors([error?.code === "40001" ? "This draft changed in another window. Reload it before saving." : "Could not save your recipe. Your changes are kept on this device. Please try again."])
    } finally { guard.current = false; setBusy(false) }
  }
  function imageField(label: string, value: string, target: PhotoTarget) {
    return <div className="wizard-photo-field">
      <span className="submission-field-label">{label}{target === "cover_image" ? " *" : <small>optional</small>}</span>
      <label className={`wizard-photo-drop${value ? " has-photo" : ""}`}>
        {value ? <img src={recipeImageUrl(value)} alt={label} /> : <><PlusCircle /><span>Upload photo</span></>}
        <input aria-label={label} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => void photo(event,target)} />
        {value && editable && <span className="wizard-photo-change">Change photo</span>}
      </label>
      <div className="wizard-photo-caption"><small>JPG, PNG or WebP · up to 5 MB</small>{value && editable && <button type="button" className="submission-text-button" disabled={disabled} onClick={() => typeof target === "number" ? updateStep(target,"step_image","") : update(target,"")}>Remove</button>}</div>
    </div>
  }
  const groups = [...new Set(input.ingredients.map(item => item.group_key ?? item.key))].map(key => ({ key, rows: input.ingredients.map((item,index) => ({ item,index })).filter(({ item }) => (item.group_key ?? item.key) === key) }))
  if (publishedId) return <div className="recipe-upload submission-ui wizard-success"><span className="wizard-success-icon">✓</span><h1 role="status">업로드 되었습니다.</h1><p>Your recipe is now published and ready to share.</p><button className="submission-primary" onClick={() => onSaved(initial.id)}>Go to my recipes</button></div>
  return <div className="recipe-upload submission-ui recipe-wizard">
    <div className="wizard-title"><div><p className="wizard-eyebrow">SHARE YOUR KITCHEN</p><h1>{editable ? submission ? "Edit recipe" : "Create a recipe" : "Your recipe"}</h1></div><button className="submission-secondary" disabled={busy || uploading !== null} onClick={() => setPreview(value => !value)}>{preview ? "Back to editing" : "Preview"}</button></div>
    <nav className="wizard-progress" aria-label="Recipe creation steps">{pages.map((label,index) => <button key={label} disabled={busy || uploading !== null} aria-current={page === index ? "step" : undefined} onClick={() => goTo(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    <h2 className="wizard-page-heading" ref={pageHeading} tabIndex={-1}>{preview ? "Recipe preview" : pages[page]}</h2>
    <p className="submission-muted">Complete the fields marked * before continuing. Save a draft at any time.</p>
    {errors.length > 0 && <div className="submission-errors" role="alert" ref={errorPanel} tabIndex={-1}><strong>필수 항목을 입력하고 내용을 확인해줘.</strong><ul>{errors.map((error,index) => <li key={index}>{error}</li>)}</ul><div className="submission-inline-actions">{pages.map((label,index) => <button key={label} className="submission-text-button" onClick={() => goTo(index)}>{label}</button>)}</div></div>}
    {message && <p role="status" className="submission-notice">{message}</p>}
    {uploading && <p role="status" className="submission-notice">Uploading… {uploading.startsWith("Photo ") ? uploading : ""}</p>}
    {cancelOpen && <div className="wizard-cancel" role="alertdialog" aria-modal="false" aria-label="Cancel recipe creation"><p>Discard changes on this device? Drafts already saved to your account will remain.</p><button className="submission-secondary" onClick={() => setCancelOpen(false)}>Keep editing</button><button className="submission-text-button" onClick={() => { try { localStorage.removeItem(cacheKey) } catch { /* Optional cache. */ } onBack() }}>Discard changes</button></div>}
    {preview ? <RecipeSubmissionPreview input={input} tags={tags} /> : <form noValidate onSubmit={event => { event.preventDefault(); if (page < 2) goTo(page + 1); else void save(true) }}><fieldset disabled={disabled}>
      {page === 0 && <section className="wizard-basics">
        {imageField("Recipe photo",input.cover_image,"cover_image")}
        <div className="wizard-basic-fields">
          <label>Recipe name *<input required maxLength={150} value={input.title} placeholder="Give your recipe a name" onChange={event => update("title",event.target.value)} /></label>
          <label>Video link <small>optional</small><input type="url" maxLength={2048} value={input.video_url} placeholder="https://…" onChange={event => update("video_url",event.target.value)} /><small>Only YouTube and Instagram video links can be attached.</small></label>
          <label>Short description <small>optional</small><input maxLength={300} value={input.short_description} placeholder="A short introduction to your dish" onChange={event => update("short_description",event.target.value)} /></label>
          <label>About this recipe *<textarea required rows={5} maxLength={10000} value={input.description} placeholder="Tell us about your recipe…" onChange={event => update("description",event.target.value)} /></label>
          <label htmlFor="recipe-tag-input">Tags <small>optional</small></label><div className="wizard-tag-input"><input id="recipe-tag-input" list="recipe-tag-suggestions" maxLength={40} value={tagText} placeholder="e.g. Comfort food" onChange={event => setTagText(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addTag() } }} /><button type="button" className="submission-secondary" onClick={addTag}>Add</button></div>
          <datalist id="recipe-tag-suggestions">{tags.filter(tag => !input.tag_ids.includes(tag.id)).map(tag => <option key={tag.id} value={tag.name} />)}</datalist>
          <div className="submission-tags wizard-tags">{tags.filter(tag => input.tag_ids.includes(tag.id)).map(tag => <button type="button" key={tag.id} onClick={() => update("tag_ids",input.tag_ids.filter(id => id !== tag.id))} aria-label={`Remove tag ${tag.name}`}>{tag.name} ×</button>)}{input.tag_names.map(name => <button type="button" key={name} onClick={() => update("tag_names",input.tag_names.filter(tag => tag !== name))} aria-label={`Remove tag ${name}`}>{name} ×</button>)}</div>
        </div>
      </section>}
      {page === 1 && <section>
        <div className="submission-grid wizard-metadata"><label>Difficulty *<select required value={input.difficulty} onChange={event => update("difficulty",event.target.value)}><option value="">Select difficulty</option>{["Easy","Intermediate","Advanced"].map(value => <option key={value}>{value}</option>)}</select></label><label>Total time (min) *<input required type="number" min={1} max={100000} step={1} value={input.total_time_minutes} onChange={event => update("total_time_minutes",event.target.value)} /></label><label>Servings *<input required type="number" min={1} max={100000} step={1} value={input.servings} onChange={event => update("servings",event.target.value)} /></label></div>
        <div className="wizard-ingredients-photo">{imageField("Ingredients photo",input.ingredients_image,"ingredients_image")}</div>
        <h3>Ingredients *</h3><p className="submission-muted">Organize ingredients into groups such as Main ingredients, Sauce or Garnish.</p>
        {groups.map((group,groupIndex) => <section className="wizard-ingredient-group" key={group.key}>
          <div className="wizard-group-heading"><label>Group name *<input aria-label={`Ingredient group ${groupIndex + 1} name`} required maxLength={100} value={group.rows[0].item.group_name} onChange={event => update("ingredients",input.ingredients.map(item => (item.group_key ?? item.key) === group.key ? { ...item, group_name: event.target.value } : item))} /></label><button type="button" className="wizard-remove" aria-label={`Remove ingredient group ${groupIndex + 1}`} disabled={groups.length <= 1} onClick={() => update("ingredients",input.ingredients.filter(item => (item.group_key ?? item.key) !== group.key))}>−</button></div>
          {group.rows.map(({ item,index },rowIndex) => <div className="wizard-ingredient-item" key={item.key}>
            <div className="wizard-ingredient-row"><label>Name *<input required maxLength={200} placeholder="e.g. Chicken" value={item.name} onChange={event => updateIngredient(index,"name",event.target.value)} /></label><label>Quantity *<input required type="number" min={0} max={1000000} step="any" placeholder="500" value={item.amount} onChange={event => updateIngredient(index,"amount",event.target.value)} /></label><label>Unit *<input required maxLength={40} placeholder="g, ml, tbsp…" value={item.unit} onChange={event => updateIngredient(index,"unit",event.target.value)} /></label><button type="button" className="wizard-remove" aria-label={`Remove ingredient ${rowIndex + 1} from group ${groupIndex + 1}`} disabled={group.rows.length <= 1} onClick={() => update("ingredients",input.ingredients.filter((_,i) => i !== index))}>−</button></div>
            <details><summary>Optional ingredient, substitute &amp; metric quantity</summary><label className="submission-checkbox"><input type="checkbox" checked={item.optional} onChange={event => updateIngredient(index,"optional",event.target.checked)} />Optional ingredient</label><label>Substitute<input maxLength={300} value={item.substitute} onChange={event => updateIngredient(index,"substitute",event.target.value)} /></label><div className="submission-grid"><label>Metric quantity<input type="number" min={0} max={1000000} step="any" value={item.metric_amount} onChange={event => updateIngredient(index,"metric_amount",event.target.value)} /></label><label>Metric unit<input maxLength={40} value={item.metric_unit} onChange={event => updateIngredient(index,"metric_unit",event.target.value)} /></label></div></details>
          </div>)}
          <button type="button" className="wizard-add-row" disabled={input.ingredients.length >= 100} onClick={() => { const next=[...input.ingredients]; next.splice(group.rows[group.rows.length - 1].index + 1,0,{ ...newIngredient(), group_key:group.key, group_name:group.rows[0].item.group_name }); update("ingredients",next) }}><PlusCircle />Add ingredient</button>
        </section>)}
        <button type="button" className="submission-secondary wizard-add-group" disabled={input.ingredients.length >= 100} onClick={() => update("ingredients",[...input.ingredients,{ ...newIngredient(), group_key:crypto.randomUUID(), group_name:`Group ${groups.length + 1}` }])}><PlusCircle />Add ingredient group</button>
        <details className="wizard-nutrition"><summary>Nutrition per serving <small>optional</small></summary><label className="submission-checkbox"><input type="checkbox" checked={Boolean(input.nutrition)} onChange={event => update("nutrition",event.target.checked ? { calories:"", protein_g:"", carbs_g:"", fat_g:"", is_estimated:true } : null)} />Include nutrition</label>{input.nutrition && <><div className="submission-grid">{([["calories","Calories (kcal)"],["protein_g","Protein (g)"],["carbs_g","Carbs (g)"],["fat_g","Fat (g)"]] as const).map(([key,label]) => <label key={key}>{label} *<input type="number" min={0} max={100000} step={1} value={input.nutrition![key]} onChange={event => update("nutrition",{ ...input.nutrition!,[key]:event.target.value })} /></label>)}</div><label className="submission-checkbox"><input type="checkbox" checked={input.nutrition.is_estimated} onChange={event => update("nutrition",{ ...input.nutrition!, is_estimated:event.target.checked })} />Values are estimates</label></>}</details>
      </section>}
      {page === 2 && <section>
        <div className="wizard-step-toolbar"><p className="submission-muted">Describe each step clearly. Photos are optional.</p><label className="submission-photo-button wizard-bulk"><input aria-label="Upload multiple step photos" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => void bulkPhotos(event)} />Upload step photos together</label></div><p className="submission-muted">Photos fill steps without photos in selection order. Extra photos create new steps.</p>
        {input.steps.map((item,index) => <article className="wizard-step-card" key={item.key}>
          <div className="submission-item-heading"><h3><span className="wizard-step-number">{index + 1}</span>Step {index + 1}</h3><div className="submission-inline-actions"><button type="button" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => { const steps=[...input.steps]; [steps[index - 1],steps[index]]=[steps[index],steps[index - 1]]; update("steps",steps) }}>↑</button><button type="button" aria-label={`Move step ${index + 1} down`} disabled={index === input.steps.length - 1} onClick={() => { const steps=[...input.steps]; [steps[index + 1],steps[index]]=[steps[index],steps[index + 1]]; update("steps",steps) }}>↓</button><button type="button" className="wizard-remove" aria-label={`Remove step ${index + 1}`} disabled={input.steps.length <= 1} onClick={() => update("steps",input.steps.filter((_,i) => i !== index))}>−</button></div></div>
          <div className="wizard-step-layout"><div><label>Step title <small>optional</small><input maxLength={150} value={item.title} onChange={event => updateStep(index,"title",event.target.value)} /></label><label>Instruction *<textarea required rows={5} maxLength={10000} placeholder="Explain what to do in this step…" value={item.instruction} onChange={event => updateStep(index,"instruction",event.target.value)} /></label><label>Step time (min) <small>optional</small><input type="number" min={0} max={100000} step={1} value={item.step_time_minutes} onChange={event => updateStep(index,"step_time_minutes",event.target.value)} /></label><label className="submission-checkbox"><input type="checkbox" checked={item.is_final} onChange={event => updateStep(index,"is_final",event.target.checked)} />Finish &amp; serve step</label></div>{imageField(`Step ${index + 1} photo`,item.step_image,index)}</div>
        </article>)}
        <button type="button" className="wizard-add-step" disabled={input.steps.length >= 30} onClick={() => update("steps",[...input.steps,newStep()])}><PlusCircle /><span>Add step</span></button>
        <section className="wizard-finished"><h3>The finished dish</h3><p className="submission-muted">Add one photo of your finished recipe.</p>{imageField("Finished dish photo",input.finished_image,"finished_image")}</section>
      </section>}
    </fieldset></form>}
    <div className="submission-save-bar wizard-actions">
      <div className="submission-inline-actions wizard-cancel-actions">{editable && <button type="button" className="submission-text-button" disabled={busy || uploading !== null} onClick={() => setCancelOpen(true)}>Cancel</button>}</div>
      <div className="submission-inline-actions wizard-navigation">
        <button type="button" aria-label="Previous page" className={`submission-secondary wizard-page-button${page === 0 ? " wizard-previous-placeholder" : ""}`} disabled={page === 0 || busy || uploading !== null} onClick={() => goTo(page - 1)}><span className="wizard-desktop-label"><span aria-hidden="true">←</span> Previous</span><span className="wizard-mobile-label" aria-hidden="true">&lt;</span></button>
        <span className="wizard-page-count" aria-label={`Page ${page + 1} of 3`} aria-live="polite">{page + 1}/3</span>
        {page < 2 ? <button type="button" aria-label="Next page" className="submission-primary wizard-page-button" disabled={busy || uploading !== null} onClick={() => goTo(page + 1)}><span className="wizard-desktop-label">Next →</span><span className="wizard-mobile-label" aria-hidden="true">&gt;</span></button> : editable && <button type="button" className="submission-primary wizard-publish-button" disabled={disabled} onClick={() => void save(true)} aria-label={busy ? "Publishing…" : "Publish"}><span className="wizard-desktop-label">{busy ? "Publishing…" : "Publish"}</span><span className="wizard-mobile-label" aria-hidden="true">{busy ? "…" : "Publish"}</span></button>}
      </div>
      <div className="submission-inline-actions wizard-draft-actions">{editable ? <button type="button" className="submission-secondary" disabled={disabled} onClick={() => void save(false)}>{busy ? "Saving…" : "Save draft"}</button> : <button type="button" className="submission-secondary" onClick={onBack}>My recipes</button>}</div>
    </div>
  </div>
}
