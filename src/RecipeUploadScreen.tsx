import { useAndroidBack } from "./lib/nativeNavigation"

import RecipeImage from "./RecipeImage"

import { privateImage } from "./lib/imagePrivacy"

import { useEffect, useRef, useState, type ChangeEvent } from "react"

import { supabase } from "./lib/supabase"

import { recipeImageUrl, resolveRecipeImageUrl } from "./lib/recipe"

import {
  assignStepPhotos,
  newIngredient,
  newRecipeInput,
  newStep,
  recipeSubmissionPayload,
  restoreRecipeInput,
  validateRecipeInput,
  type RecipeInput,
  type RecipeTag,
  type Submission,
} from "./lib/submissions"

import RecipeSubmissionPreview from "./RecipeSubmissionPreview"

import RecipeTextAssistant from "./RecipeTextAssistant"

import PhotoCropDialog from "./PhotoCropDialog"

import { requireContentConsent } from "./ContentConsent"

import useStepReorder from "./useStepReorder"

import { reorderSteps } from "./lib/stepReorder"

import "./submissions.css"

type Props = {
  userId: string

  submission: Submission | null

  tags: RecipeTag[]

  onBack: () => void

  onSaved: (id: string) => void
}

type PhotoTarget = "cover_image" | "ingredients_image" | number

const pages = ["Recipe details", "Ingredients", "Cooking steps"]

function PlusCircle() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="13" />
      <path d="M16 10v12M10 16h12" />
    </svg>
  )
}

export default function RecipeUploadScreen({
  userId,

  submission,

  tags,

  onBack,

  onSaved,
}: Props) {
  const cacheKey = submission
    ? `pickle:recipe-draft:${userId}:${submission.id}`
    : `pickle:recipe-new:${userId}`

  const [initial] = useState(() => {
    const fallback = {
      id: submission?.id ?? crypto.randomUUID(),

      input: restoreRecipeInput(submission?.payload ?? newRecipeInput()),

      version: submission?.updated_at ?? null,

      page: 0,
    }

    try {
      const saved = JSON.parse(localStorage.getItem(cacheKey) || "null")

      if (
        saved?.input &&
        saved?.id &&
        (!submission || saved.version === submission.updated_at)
      )
        return {
          id: saved.id as string,

          input: restoreRecipeInput(saved.input),

          version: saved.version ?? null,

          page: [0, 1, 2].includes(saved.page) ? saved.page : 0,
        }
    } catch {
      /* Browser draft cache is optional. */
    }

    return fallback
  })

  const [input, setInput] = useState<RecipeInput>(initial.input)

  const [version, setVersion] = useState<string | null>(initial.version)

  const [page, setPage] = useState<number>(initial.page)

  const [busy, setBusy] = useState(false)

  const [uploading, setUploading] = useState<string | null>(null)

  const [errors, setErrors] = useState<string[]>([])

  const [checkedPages, setCheckedPages] = useState<number[]>([])

  const [message, setMessage] = useState("")

  const [preview, setPreview] = useState(false)

  const [tagText, setTagText] = useState("")

  const [cancelOpen, setCancelOpen] = useState(false)

  const [publishedId, setPublishedId] = useState<string | null>(null)

  const [cropSource, setCropSource] = useState<File | string | null>(null)

  const guard = useRef(false)

  const errorPanel = useRef<HTMLDivElement>(null)

  const editor = useRef<HTMLDivElement>(null)

  const pageHeading = useRef<HTMLHeadingElement>(null)

  const cancelDialog = useRef<HTMLDialogElement>(null)

  const editingPublished = submission?.status === "published"

  const editable = !publishedId

  const disabled = busy || uploading !== null || !editable

  useAndroidBack(() => {
    if (publishedId) {
      onSaved(initial.id)
      return true
    }

    if (disabled || guard.current) return true

    if (cropSource) setCropSource(null)
    else if (preview) setPreview(false)
    else if (page > 0) setPage(page - 1)
    else setCancelOpen(true)

    return true
  }, 200)

  const stepSort = useStepReorder(
    (from, to) => update("steps", reorderSteps(input.steps, from, to)),

    disabled,
  )

  const visibleErrors = errors.filter(
    (error) =>
      !/^(Recipe photo is required\.|Short description is required\.|Recipe name is required\.|Servings are required\.|Choose a difficulty\.|Total cooking time is required\.|Ingredient \d+ needs a (name|group|quantity|unit)\.|Step \d+ needs an instruction\.|Fill in (calories|protein|carbs|fat) or turn off nutrition\.)$/.test(
        error,
      ),
  )

  function required(value: string, fieldPage: number) {
    return checkedPages.includes(fieldPage) && !value.trim() ? (
      <span
        className="submission-required-error"
        role="alert"
        data-required-error
      >
        (required)
      </span>
    ) : null
  }

  function focusValidation() {
    requestAnimationFrame(() => {
      if (errorPanel.current) {
        errorPanel.current.focus()

        return
      }

      const marker = editor.current?.querySelector<HTMLElement>(
        "[data-required-error]",
      )

      const field = marker?.closest("label, .wizard-photo-field")

      field?.scrollIntoView({ block: "center", behavior: "smooth" })

      field

        ?.querySelector<HTMLElement>("input, select, textarea")

        ?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    if (cancelOpen) cancelDialog.current?.showModal()
    else cancelDialog.current?.close()
  }, [cancelOpen])

  useEffect(() => {
    if (!editable) return

    try {
      localStorage.setItem(
        cacheKey,

        JSON.stringify({ id: initial.id, input, version, page }),
      )
    } catch {
      /* Server draft saving remains available. */
    }
  }, [cacheKey, input, initial.id, version, page, editable])

  function update<K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) {
    setInput((current) => ({ ...current, [key]: value }))

    setMessage("")
  }

  function updateIngredient(
    index: number,

    field: string,

    value: string | boolean,
  ) {
    setInput((current) => ({
      ...current,

      ingredients: current.ingredients.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }))

    setMessage("")
  }

  function updateStep(index: number, field: string, value: string | boolean) {
    setInput((current) => ({
      ...current,

      steps: current.steps.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }))

    setMessage("")
  }

  function goTo(next: number) {
    if (guard.current || busy || uploading !== null) return

    if (editable && next > page) {
      setCheckedPages((current) => [
        ...new Set([
          ...current,

          ...Array.from({ length: next }, (_, index) => index),
        ]),
      ])

      const issues = Array.from({ length: next }, (_, index) =>
        validateRecipeInput(input, true, index as 0 | 1 | 2),
      ).flat()

      if (tagText.trim())
        issues.push(
          "Press Add to include the tag you typed, or clear the tag input.",
        )

      if (issues.length) {
        setErrors(issues)

        setMessage("")

        setPreview(false)

        focusValidation()

        return
      }
    }

    setErrors([])

    setMessage("")

    setPage(next)

    setPreview(false)

    window.scrollTo({ top: 0 })

    requestAnimationFrame(() => pageHeading.current?.focus())
  }

  function addTag() {
    const name = tagText.trim().replace(/^#+/, "").trim()

    if (!name) return

    if (name.length > 40) {
      setErrors(["Tags can have up to 40 characters."])

      return
    }

    const existing = tags.find(
      (tag) => tag.name.toLowerCase() === name.toLowerCase(),
    )

    if (existing) {
      if (!input.tag_ids.includes(existing.id))
        update("tag_ids", [...input.tag_ids, existing.id])
    } else if (
      !input.tag_names.some((tag) => tag.toLowerCase() === name.toLowerCase())
    ) {
      if (input.tag_names.length >= 10) {
        setErrors(["You can add up to 10 new tags."])

        return
      }

      update("tag_names", [...input.tag_names, name])
    }

    setTagText("")
  }

  async function uploadFile(file: File) {
    file = await privateImage(file)

    const ext: Record<string, string> = {
      "image/jpeg": "jpg",

      "image/png": "png",

      "image/webp": "webp",
    }

    if (!ext[file.type] || file.size > 5 * 1024 * 1024)
      throw new Error("Choose a JPG, PNG or WebP image up to 5 MB.")

    const bitmap = await createImageBitmap(file)

    bitmap.close()

    if (!(await requireContentConsent(userId)))
      throw new Error("Photo upload cancelled. Your recipe has been kept.")

    const path = `${userId}/${initial.id}/${crypto.randomUUID()}.${ext[file.type]}`

    const { error } = await supabase.storage

      .from("community_recipe_images")

      .upload(path, file, { contentType: file.type, upsert: false })

    if (error) throw new Error("Could not upload the photo. Please try again.")

    return `community:${path}`
  }

  async function photo(
    event: ChangeEvent<HTMLInputElement>,

    target: PhotoTarget,
  ) {
    const file = event.target.files?.[0]

    event.target.value = ""

    if (!file || guard.current || !editable) return

    if (target === "cover_image") {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      ) {
        setErrors(["Choose a JPG, PNG or WebP image up to 5 MB."])

        return
      }

      setErrors([])

      setCropSource(file)

      return
    }

    guard.current = true

    setUploading(String(target))

    setErrors([])

    setMessage("")

    try {
      const path = await uploadFile(file)

      if (typeof target === "number") updateStep(target, "step_image", path)
      else update(target, path)
    } catch (error) {
      console.error("Operation failed")

      setErrors([
        error instanceof Error ? error.message : "Could not upload this image.",
      ])
    } finally {
      guard.current = false

      setUploading(null)
    }
  }

  async function applyCoverCrop(file: File) {
    if (guard.current || !editable)
      throw new Error("Please wait and try again.")

    guard.current = true

    setUploading("cover_image")

    try {
      const path = await uploadFile(file)

      update("cover_image", path)

      setErrors([])

      setCropSource(null)
    } finally {
      guard.current = false

      setUploading(null)
    }
  }

  async function bulkPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])

    event.target.value = ""

    if (!files.length || guard.current || !editable) return

    const capacity =
      input.steps.filter((step) => !step.step_image).length +
      30 -
      input.steps.length

    if (files.length > capacity) {
      setErrors([
        `Choose up to ${capacity} photos. A recipe can have up to 30 steps.`,
      ])

      return
    }

    guard.current = true

    setErrors([])

    setMessage("")

    const paths: string[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        setUploading(`Photo ${i + 1} of ${files.length}`)

        paths.push(await uploadFile(files[i]))
      }

      setMessage(`${paths.length} photos added to cooking steps.`)
    } catch (error) {
      setErrors([
        `${paths.length} photos added. ${
          error instanceof Error ? error.message : "Upload failed."
        } Retry the remaining photos.`,
      ])
    } finally {
      if (paths.length)
        setInput((current) => ({
          ...current,

          steps: assignStepPhotos(current.steps, paths),
        }))

      guard.current = false

      setUploading(null)
    }
  }

  async function save(submit: boolean) {
    if (guard.current || !editable) return

    if (submit) setCheckedPages([0, 1, 2])

    const issues = validateRecipeInput(input, submit)

    if (tagText.trim())
      issues.push(
        "Press Add to include the tag you typed, or clear the tag input.",
      )

    setErrors(issues)

    setMessage("")

    if (issues.length) {
      setPreview(false)

      focusValidation()

      return
    }

    guard.current = true

    setBusy(true)

    try {
      if (
        (submit || editingPublished) &&
        !(await requireContentConsent(userId))
      )
        return

      const { data, error } = await supabase.rpc(
        editingPublished
          ? "update_recipe_submission"
          : "save_recipe_submission",

        {
          p_id: initial.id,

          p_payload: recipeSubmissionPayload(input),

          ...(!editingPublished ? { p_submit: submit } : {}),

          p_expected_updated_at: version,
        },
      )

      if (
        error ||
        !data?.id ||
        data.status !== (submit ? "published" : "draft") ||
        (submit && !data.recipe_id)
      )
        throw error ?? new Error("Submission was not saved")

      setVersion(data.updated_at)

      if (submit) {
        try {
          localStorage.removeItem(cacheKey)

          localStorage.removeItem(`pickle:recipe-draft:${userId}:${initial.id}`)
        } catch {
          /* Optional cache. */
        }

        setPublishedId(data.recipe_id)

        setMessage(editingPublished ? "Recipe updated." : "업로드 되었습니다.")

        window.scrollTo({ top: 0 })
      } else setMessage("Draft saved. You can keep editing or return later.")
    } catch (error: any) {
      console.error("Recipe submission failed")

      setErrors([
        error?.code === "40001"
          ? "This recipe changed in another window. Reload it before saving."
          : "Could not save your recipe. Your changes are kept on this device. Please try again.",
      ])
    } finally {
      guard.current = false

      setBusy(false)
    }
  }

  function imageField(label: string, value: string, target: PhotoTarget) {
    return (
      <div className="wizard-photo-field">
        <span className="submission-field-label">
          {label}
          {target === "cover_image" ? (
            <> * {required(value, 0)}</>
          ) : (
            <small>optional</small>
          )}
        </span>
        <label className={`wizard-photo-drop${value ? " has-photo" : ""}`}>
          {value ? (
            <RecipeImage src={recipeImageUrl(value)} alt={label} />
          ) : (
            <>
              <PlusCircle />
              <span>Upload photo</span>
            </>
          )}
          <input
            aria-label={label}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(event) => void photo(event, target)}
          />
          {value && editable && (
            <span className="wizard-photo-change">Change photo</span>
          )}
        </label>
        <div className="wizard-photo-caption">
          <div>
            <small>JPG, PNG or WebP · up to 5 MB</small>
            {target === "cover_image" && (
              <small className="wizard-photo-recommendation">
                Recommended: 1200 × 900 px (4:3)
              </small>
            )}
          </div>
          {value && editable && (
            <div className="submission-inline-actions">
              {target === "cover_image" && (
                <button
                  type="button"
                  className="submission-text-button"
                  disabled={disabled}
                  onClick={() => {
                    void resolveRecipeImageUrl(recipeImageUrl(value))
                      .then(setCropSource)
                      .catch(() => setErrors(["Could not open this photo."]))
                  }}
                >
                  Crop
                </button>
              )}
              <button
                type="button"
                className="submission-text-button"
                disabled={disabled}
                onClick={() =>
                  typeof target === "number"
                    ? updateStep(target, "step_image", "")
                    : update(target, "")
                }
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const groups = [
    ...new Set(input.ingredients.map((item) => item.group_key ?? item.key)),
  ].map((key) => ({
    key,

    rows: input.ingredients

      .map((item, index) => ({ item, index }))

      .filter(({ item }) => (item.group_key ?? item.key) === key),
  }))

  if (publishedId)
    return (
      <div className="recipe-upload submission-ui wizard-success">
        <span className="wizard-success-icon">✓</span>
        <h1 role="status">
          {editingPublished ? "Recipe updated." : "업로드 되었습니다."}
        </h1>
        <p>
          {editingPublished
            ? "Your changes are now live."
            : "Your recipe is now published and ready to share."}
        </p>
        <button
          className="submission-primary"
          onClick={() => onSaved(initial.id)}
        >
          Go to my recipes
        </button>
      </div>
    )

  return (
    <div ref={editor} className="recipe-upload submission-ui recipe-wizard">
      {cropSource && (
        <PhotoCropDialog
          source={cropSource}
          onClose={() => setCropSource(null)}
          onApply={applyCoverCrop}
        />
      )}
      <div className="wizard-title">
        <div>
          <p className="wizard-eyebrow">SHARE YOUR KITCHEN</p>
          <h1>
            {editable
              ? submission
                ? "Edit recipe"
                : "Create a recipe"
              : "Your recipe"}
          </h1>
        </div>
        <button
          className="submission-secondary"
          disabled={busy || uploading !== null}
          onClick={() => setPreview((value) => !value)}
        >
          {preview ? "Back to editing" : "Preview"}
        </button>
      </div>
      <nav className="wizard-progress" aria-label="Recipe creation steps">
        {pages.map((label, index) => (
          <button
            key={label}
            disabled={busy || uploading !== null}
            aria-current={page === index ? "step" : undefined}
            onClick={() => goTo(index)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <h2 className="wizard-page-heading" ref={pageHeading} tabIndex={-1}>
        {preview ? "Recipe preview" : pages[page]}
      </h2>
      <p className="submission-muted">
        {editingPublished
          ? "Complete the fields marked * before saving your changes."
          : "Complete the fields marked * before continuing. Save a draft at any time."}
      </p>
      {visibleErrors.length > 0 && (
        <div
          className="submission-errors"
          role="alert"
          ref={errorPanel}
          tabIndex={-1}
        >
          <ul>
            {visibleErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {message && (
        <p role="status" className="submission-notice">
          {message}
        </p>
      )}
      {uploading && (
        <p role="status" className="submission-notice">
          Uploading… {uploading.startsWith("Photo ") ? uploading : ""}
        </p>
      )}
      <dialog
        ref={cancelDialog}
        className="wizard-cancel"
        aria-labelledby="cancel-recipe-title"
        aria-describedby="cancel-recipe-description"
        onCancel={() => setCancelOpen(false)}
      >
        <h2 id="cancel-recipe-title">Are you sure you want to cancel?</h2>
        <p id="cancel-recipe-description" className="submission-muted">
          Saved drafts will remain.
        </p>
        <div className="wizard-cancel-buttons">
          <button
            type="button"
            className="submission-secondary"
            autoFocus
            onClick={() => setCancelOpen(false)}
          >
            Keep editing
          </button>
          <button
            type="button"
            className="submission-primary"
            onClick={() => {
              try {
                localStorage.removeItem(cacheKey)
              } catch {
                /* Optional cache. */
              }

              void supabase.rpc("discard_recipe_uploads", {
                p_submission: initial.id,
              })

              onBack()
            }}
          >
            Discard changes
          </button>
        </div>
      </dialog>
      {preview ? (
        <RecipeSubmissionPreview input={input} tags={tags} />
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()

            if (page < 2) goTo(page + 1)
            else void save(true)
          }}
        >
          <fieldset disabled={disabled}>
            {page === 0 && (
              <section className="wizard-basics">
                {imageField("Recipe photo", input.cover_image, "cover_image")}
                <div className="wizard-basic-fields">
                  <label>
                    Recipe name * {required(input.title, 0)}
                    <input
                      required
                      maxLength={150}
                      value={input.title}
                      placeholder="Give your recipe a name"
                      onChange={(event) => update("title", event.target.value)}
                    />
                  </label>
                  <label>
                    Video link <small>optional</small>
                    <input
                      type="url"
                      maxLength={2048}
                      value={input.video_url}
                      placeholder="https://…"
                      onChange={(event) =>
                        update("video_url", event.target.value)
                      }
                    />
                    <small>
                      Only YouTube and Instagram video links can be attached.
                    </small>
                  </label>
                  <label>
                    Short description * {required(input.short_description, 0)}
                    <input
                      required
                      maxLength={300}
                      value={input.short_description}
                      placeholder="A short introduction to your dish"
                      onChange={(event) =>
                        update("short_description", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    About this recipe <small>optional</small>
                    <textarea
                      rows={5}
                      maxLength={10000}
                      value={input.description}
                      placeholder="Tell us about your recipe…"
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                    />
                  </label>
                  <label htmlFor="recipe-tag-input">
                    Tags <small>optional</small>
                  </label>
                  <div className="wizard-tag-input">
                    <input
                      id="recipe-tag-input"
                      autoComplete="off"
                      maxLength={40}
                      value={tagText}
                      placeholder="Type a tag"
                      onChange={(event) => setTagText(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault()

                          addTag()
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="submission-secondary"
                      onClick={addTag}
                    >
                      Add
                    </button>
                  </div>
                  <div className="submission-tags wizard-tags">
                    {tags

                      .filter((tag) => input.tag_ids.includes(tag.id))

                      .map((tag) => (
                        <button
                          type="button"
                          key={tag.id}
                          onClick={() =>
                            update(
                              "tag_ids",

                              input.tag_ids.filter((id) => id !== tag.id),
                            )
                          }
                          aria-label={`Remove tag ${tag.name}`}
                        >
                          {tag.name} ×
                        </button>
                      ))}
                    {input.tag_names.map((name) => (
                      <button
                        type="button"
                        key={name}
                        onClick={() =>
                          update(
                            "tag_names",

                            input.tag_names.filter((tag) => tag !== name),
                          )
                        }
                        aria-label={`Remove tag ${name}`}
                      >
                        {name} ×
                      </button>
                    ))}
                  </div>
                </div>
                <RecipeTextAssistant
                  input={input}
                  disabled={disabled}
                  onTextChange={update}
                  onApply={(ingredients, steps) => {
                    setInput((current) => ({ ...current, ingredients, steps }))

                    setErrors([])

                    setMessage(
                      "Ingredients and steps added. Review them on the next pages before publishing.",
                    )
                  }}
                />
              </section>
            )}
            {page === 1 && (
              <section>
                <div className="submission-grid wizard-metadata">
                  <label>
                    Difficulty * {required(input.difficulty, 1)}
                    <select
                      required
                      value={input.difficulty}
                      onChange={(event) =>
                        update("difficulty", event.target.value)
                      }
                    >
                      <option value="">Select difficulty</option>
                      {["Easy", "Intermediate", "Advanced"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Total time (min) * {required(input.total_time_minutes, 1)}
                    <input
                      required
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      value={input.total_time_minutes}
                      onChange={(event) =>
                        update("total_time_minutes", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Servings * {required(input.servings, 1)}
                    <input
                      required
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      value={input.servings}
                      onChange={(event) =>
                        update("servings", event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="wizard-ingredients-photo">
                  {imageField(
                    "Ingredients photo",

                    input.ingredients_image,

                    "ingredients_image",
                  )}
                </div>
                <h3>Ingredients *</h3>
                <p className="submission-muted">
                  Organize ingredients into groups such as Main ingredients,
                  Sauce or Garnish.
                </p>
                {groups.map((group, groupIndex) => (
                  <section className="wizard-ingredient-group" key={group.key}>
                    <div className="wizard-group-heading">
                      <label>
                        Group name *{" "}
                        {required(group.rows[0].item.group_name, 1)}
                        <input
                          aria-label={`Ingredient group ${groupIndex + 1} name`}
                          required
                          maxLength={100}
                          value={group.rows[0].item.group_name}
                          onChange={(event) =>
                            update(
                              "ingredients",

                              input.ingredients.map((item) =>
                                (item.group_key ?? item.key) === group.key
                                  ? { ...item, group_name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="wizard-remove"
                        aria-label={`Remove ingredient group ${groupIndex + 1}`}
                        disabled={groups.length <= 1}
                        onClick={() =>
                          update(
                            "ingredients",

                            input.ingredients.filter(
                              (item) =>
                                (item.group_key ?? item.key) !== group.key,
                            ),
                          )
                        }
                      >
                        −
                      </button>
                    </div>
                    {group.rows.map(({ item, index }, rowIndex) => (
                      <div className="wizard-ingredient-item" key={item.key}>
                        <div className="wizard-ingredient-row">
                          <label>
                            Name * {required(item.name, 1)}
                            <input
                              required
                              maxLength={200}
                              placeholder="e.g. Chicken"
                              value={item.name}
                              onChange={(event) =>
                                updateIngredient(
                                  index,

                                  "name",

                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            Quantity * {required(item.amount, 1)}
                            <input
                              required
                              type="number"
                              min={0}
                              max={1000000}
                              step="any"
                              placeholder="500"
                              value={item.amount}
                              onChange={(event) =>
                                updateIngredient(
                                  index,

                                  "amount",

                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            Unit * {required(item.unit, 1)}
                            <input
                              required
                              maxLength={40}
                              placeholder="g, ml, tbsp…"
                              value={item.unit}
                              onChange={(event) =>
                                updateIngredient(
                                  index,

                                  "unit",

                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="wizard-remove"
                            aria-label={`Remove ingredient ${rowIndex + 1} from group ${groupIndex + 1}`}
                            disabled={group.rows.length <= 1}
                            onClick={() =>
                              update(
                                "ingredients",

                                input.ingredients.filter((_, i) => i !== index),
                              )
                            }
                          >
                            −
                          </button>
                        </div>
                        <details>
                          <summary>
                            Optional ingredient &amp; substitute
                          </summary>
                          <label className="submission-checkbox">
                            <input
                              type="checkbox"
                              checked={item.optional}
                              onChange={(event) =>
                                updateIngredient(
                                  index,

                                  "optional",

                                  event.target.checked,
                                )
                              }
                            />
                            Optional ingredient
                          </label>
                          <label>
                            Side note / substitute
                            <input
                              maxLength={300}
                              value={item.substitute}
                              onChange={(event) =>
                                updateIngredient(
                                  index,

                                  "substitute",

                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        </details>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="wizard-add-row"
                      disabled={input.ingredients.length >= 100}
                      onClick={() => {
                        const next = [...input.ingredients]

                        next.splice(
                          group.rows[group.rows.length - 1].index + 1,

                          0,

                          {
                            ...newIngredient(),

                            group_key: group.key,

                            group_name: group.rows[0].item.group_name,
                          },
                        )

                        update("ingredients", next)
                      }}
                    >
                      <PlusCircle />
                      Add ingredient
                    </button>
                  </section>
                ))}
                <button
                  type="button"
                  className="submission-secondary wizard-add-group"
                  disabled={input.ingredients.length >= 100}
                  onClick={() =>
                    update("ingredients", [
                      ...input.ingredients,

                      {
                        ...newIngredient(),

                        group_key: crypto.randomUUID(),

                        group_name: `Group ${groups.length + 1}`,
                      },
                    ])
                  }
                >
                  <PlusCircle />
                  Add ingredient group
                </button>
                <details className="wizard-nutrition">
                  <summary>
                    Nutrition per serving <small>optional</small>
                  </summary>
                  <label className="submission-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(input.nutrition)}
                      onChange={(event) =>
                        update(
                          "nutrition",

                          event.target.checked
                            ? {
                                calories: "",

                                protein_g: "",

                                carbs_g: "",

                                fat_g: "",

                                is_estimated: true,
                              }
                            : null,
                        )
                      }
                    />
                    Include nutrition
                  </label>
                  {input.nutrition && (
                    <>
                      <div className="submission-grid">
                        {([
                          ["calories", "Calories (kcal)"],

                          ["protein_g", "Protein (g)"],

                          ["carbs_g", "Carbs (g)"],

                          ["fat_g", "Fat (g)"],
                        ] as const).map(([key, label]) => (
                          <label key={key}>
                            {label} * {required(input.nutrition![key], 1)}
                            <input
                              type="number"
                              min={0}
                              max={100000}
                              step={1}
                              value={input.nutrition![key]}
                              onChange={(event) =>
                                update("nutrition", {
                                  ...input.nutrition!,

                                  [key]: event.target.value,
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <label className="submission-checkbox">
                        <input
                          type="checkbox"
                          checked={input.nutrition.is_estimated}
                          onChange={(event) =>
                            update("nutrition", {
                              ...input.nutrition!,

                              is_estimated: event.target.checked,
                            })
                          }
                        />
                        Values are estimates
                      </label>
                    </>
                  )}
                </details>
              </section>
            )}
            {page === 2 && (
              <section>
                <div className="wizard-step-toolbar">
                  <p className="submission-muted">
                    Describe each step clearly. Photos are optional.
                  </p>
                  <label className="submission-photo-button wizard-bulk">
                    <input
                      aria-label="Upload multiple step photos"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      disabled={disabled}
                      onChange={(event) => void bulkPhotos(event)}
                    />
                    Upload step photos together
                  </label>
                </div>
                <p className="submission-muted">
                  Photos fill steps without photos in selection order. Extra
                  photos create new steps.
                </p>
                <p className="submission-muted" id="step-reorder-help">
                  Hold the drag handle, then drag to reorder steps.
                </p>
                <p className="sr-only" role="status" aria-live="polite">
                  {stepSort.announcement}
                </p>
                <div
                  ref={stepSort.list}
                  className={
                    stepSort.motion
                      ? "wizard-step-list is-reordering"
                      : "wizard-step-list"
                  }
                >
                  {input.steps.map((item, index) => (
                    <article
                      className={`wizard-step-card${
                        stepSort.motion?.source === index ? " is-dragging" : ""
                      }`}
                      style={stepSort.style(index)}
                      key={item.key}
                    >
                      <div className="submission-item-heading">
                        <h3>
                          <span className="wizard-step-number">
                            {index + 1}
                          </span>
                          Step {index + 1}
                        </h3>
                        <div className="submission-inline-actions">
                          <button
                            type="button"
                            className="wizard-step-drag"
                            aria-label={`Reorder step ${index + 1}`}
                            aria-describedby="step-reorder-help"
                            disabled={disabled || input.steps.length <= 1}
                            onPointerDown={(event) =>
                              stepSort.start(event, index)
                            }
                            onPointerMove={stepSort.move}
                            onPointerUp={(event) =>
                              stepSort.finish(event, true)
                            }
                            onPointerCancel={(event) =>
                              stepSort.finish(event, false)
                            }
                            onLostPointerCapture={(event) =>
                              stepSort.finish(event, false)
                            }
                            onKeyDown={(event) =>
                              stepSort.keyboard(
                                event,

                                index,

                                input.steps.length,
                              )
                            }
                            onContextMenu={(event) => event.preventDefault()}
                          >
                            <svg
                              width="22"
                              height="24"
                              viewBox="0 0 22 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              {[6, 12, 18].map((y) => (
                                <g key={y}>
                                  <circle cx="7" cy={y} r="1.8" />
                                  <circle cx="15" cy={y} r="1.8" />
                                </g>
                              ))}
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="wizard-remove"
                            aria-label={`Remove step ${index + 1}`}
                            disabled={
                              input.steps.length <= 1 ||
                              Boolean(stepSort.motion)
                            }
                            onClick={() =>
                              update(
                                "steps",

                                input.steps.filter((_, i) => i !== index),
                              )
                            }
                          >
                            −
                          </button>
                        </div>
                      </div>
                      <div className="wizard-step-layout">
                        <div>
                          <label>
                            Step title <small>optional</small>
                            <input
                              maxLength={150}
                              value={item.title}
                              onChange={(event) =>
                                updateStep(index, "title", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Instruction * {required(item.instruction, 2)}
                            <textarea
                              required
                              rows={5}
                              maxLength={10000}
                              placeholder="Explain what to do in this step…"
                              value={item.instruction}
                              onChange={(event) =>
                                updateStep(
                                  index,

                                  "instruction",

                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            Step time (min) <small>optional</small>
                            <input
                              type="number"
                              min={0}
                              max={100000}
                              step={1}
                              value={item.step_time_minutes}
                              onChange={(event) =>
                                updateStep(
                                  index,

                                  "step_time_minutes",

                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label className="submission-checkbox">
                            <input
                              type="checkbox"
                              checked={item.is_final}
                              onChange={(event) =>
                                updateStep(
                                  index,

                                  "is_final",

                                  event.target.checked,
                                )
                              }
                            />
                            Finish &amp; serve step
                          </label>
                        </div>
                        {imageField(
                          `Step ${index + 1} photo`,

                          item.step_image,

                          index,
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  type="button"
                  className="wizard-add-step"
                  disabled={input.steps.length >= 30}
                  onClick={() => update("steps", [...input.steps, newStep()])}
                >
                  <PlusCircle />
                  <span>Add step</span>
                </button>
              </section>
            )}
          </fieldset>
        </form>
      )}
      {page === 2 && editable && (
        <div className="wizard-publish-actions">
          <button
            type="button"
            className="submission-primary"
            disabled={disabled}
            onClick={() => void save(true)}
          >
            {busy
              ? editingPublished
                ? "Saving…"
                : "Publishing…"
              : editingPublished
                ? "Save changes"
                : "Publish"}
          </button>
        </div>
      )}
      <div className="submission-save-bar wizard-actions">
        <div className="submission-inline-actions wizard-cancel-actions">
          {editable && (
            <button
              type="button"
              className="submission-text-button"
              disabled={busy || uploading !== null}
              onClick={() => setCancelOpen(true)}
            >
              Cancel
            </button>
          )}
        </div>
        <div className="submission-inline-actions wizard-navigation">
          <button
            type="button"
            aria-label="Previous page"
            className={`submission-secondary wizard-page-button${
              page === 0 ? " wizard-previous-placeholder" : ""
            }`}
            disabled={page === 0 || busy || uploading !== null}
            onClick={() => goTo(page - 1)}
          >
            <span className="wizard-desktop-label">
              <span aria-hidden="true">←</span> Previous
            </span>
            <span className="wizard-mobile-label" aria-hidden="true">
              &lt;
            </span>
          </button>
          <span
            className="wizard-page-count"
            aria-label={`Page ${page + 1} of 3`}
            aria-live="polite"
          >
            {page + 1}/3
          </span>
          {page < 2 ? (
            <button
              type="button"
              aria-label="Next page"
              className="submission-primary wizard-page-button"
              disabled={busy || uploading !== null}
              onClick={() => goTo(page + 1)}
            >
              <span className="wizard-desktop-label">Next →</span>
              <span className="wizard-mobile-label" aria-hidden="true">
                &gt;
              </span>
            </button>
          ) : (
            editable && (
              <button
                type="button"
                className="submission-primary wizard-publish-button"
                disabled={disabled}
                onClick={() => void save(true)}
                aria-label={
                  busy
                    ? editingPublished
                      ? "Saving…"
                      : "Publishing…"
                    : editingPublished
                      ? "Save changes"
                      : "Publish"
                }
              >
                <span className="wizard-desktop-label">
                  {busy
                    ? editingPublished
                      ? "Saving…"
                      : "Publishing…"
                    : editingPublished
                      ? "Save changes"
                      : "Publish"}
                </span>
                <span className="wizard-mobile-label" aria-hidden="true">
                  {busy ? "…" : editingPublished ? "Save" : "Publish"}
                </span>
              </button>
            )
          )}
        </div>
        <div className="submission-inline-actions wizard-draft-actions">
          {editable && !editingPublished ? (
            <button
              type="button"
              className="submission-secondary"
              disabled={disabled}
              onClick={() => void save(false)}
            >
              {busy ? "Saving…" : "Save draft"}
            </button>
          ) : (
            <button
              type="button"
              className="submission-secondary"
              onClick={onBack}
            >
              My recipes
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
