import { useEffect, useMemo, useRef, useState } from "react"
import usePostDraft from "./usePostDraft"
import { hasPostDraftContent, type PostDraftSnapshot } from "./lib/postDrafts"
import BackIcon from "./BackIcon"
import PostRecipePicker from "./PostRecipePicker"
import type { RecipeTagChoice } from "./lib/postRecipeTags"
import PhotoCropDialog from "./PhotoCropDialog"
import { requireContentConsent } from "./ContentConsent"
import { privateImage } from "./lib/imagePrivacy"
import {
  newPhotoEdits,
  postFilters,
  renderPostPhoto,
  type Adjustment,
  type PhotoEdits,
} from "./lib/postPhoto"
import { sharePhotoPost, type PostPhotoDraft } from "./lib/photoPosts"
import { supabase } from "./lib/supabase"
import "./photo-posts.css"
import "./submissions.css"

function LocalPhoto({
  file,
  ...props
}: { file: File } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return <img {...props} src={url || undefined} />
}
const adjustments: Adjustment[] = [
  "tilt",
  "brightness",
  "contrast",
  "sharpness",
  "temperature",
  "saturation",
  "highlights",
  "shadows",
  "vignette",
]

export default function PostComposer({
  userId,
  onClose,
  onShared,
  initialRecipe = null,
}: {
  userId: string
  onClose: () => void
  onShared: (id: string) => void
  initialRecipe?: RecipeTagChoice | null
}) {
  const [stage, setStage] = useState<"select" | "edit" | "caption">("select")
  const [photos, setPhotos] = useState<PostPhotoDraft[]>([])
  const [selected, setSelected] = useState(0)
  const [tab, setTab] = useState("Filters")
  const [tool, setTool] = useState<Adjustment>("brightness")
  const [crop, setCrop] = useState(false)
  const [caption, setCaption] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [progress, setProgress] = useState("")
  const [previewBusy, setPreviewBusy] = useState(false)
  const [recipeTag, setRecipeTag] = useState<RecipeTagChoice | null>(
    () => initialRecipe,
  )
  const [publishAttempted, setPublishAttempted] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const exitDialog = useRef<HTMLDialogElement>(null)
  const locked = useRef(false)
  const postId = useRef<string>(crypto.randomUUID())
  const openedGallery = useRef(false)
  const snapshot = useMemo<PostDraftSnapshot>(
    () => ({
      id: postId.current,
      photos,
      caption,
      recipeTag,
      stage,
      selected,
      tab,
      tool,
      publishAttempted,
    }),
    [photos, caption, recipeTag, stage, selected, tab, tool, publishAttempted],
  )
  const recovery = usePostDraft({
    userId,
    snapshot,
    restore: restoreDraft,
    checkShared,
    onShared,
    onBack: back,
  })
  function restoreDraft(saved: PostDraftSnapshot) {
    postId.current = saved.id
    setPhotos(saved.photos)
    setCaption(saved.caption)
    setRecipeTag(saved.recipeTag)
    setStage(saved.stage)
    setSelected(saved.selected)
    setTab(saved.tab)
    setTool(saved.tool)
    setPublishAttempted(saved.publishAttempted)
    setError("")
    setCrop(false)
  }
  async function checkShared(id: string) {
    const result = await supabase
      .from("photo_posts")
      .select("id,status")
      .eq("id", id)
      .eq("author_id", userId)
      .maybeSingle()
    if (result.error)
      throw new Error(
        "Could not check your previous Share. Connect to the internet and retry; your draft is still saved.",
      )
    return result.data?.id === id && result.data.status === "published"
  }
  function back() {
    if (locked.current) return
    if (crop) {
      setCrop(false)
      return
    }
    if (exitOpen) {
      setExitOpen(false)
      return
    }
    if (stage === "select") void close()
    else setStage(stage === "caption" ? "edit" : "select")
  }
  useEffect(() => {
    if (exitOpen) exitDialog.current?.showModal()
  }, [exitOpen])
  useEffect(() => {
    if (
      recovery.mode === "editing" &&
      recovery.openGallery &&
      !openedGallery.current
    ) {
      openedGallery.current = true
      gallery.current?.click()
    }
  }, [recovery.mode, recovery.openGallery])
  const active = photos[selected]
  useEffect(() => {
    if (stage !== "edit" || !active) return
    let valid = true
    setPreviewBusy(true)
    const timer = window.setTimeout(() => {
      renderPostPhoto(active.file, active.edits, 1000)
        .then((result) => {
          if (!valid || !canvas.current) return
          const target = canvas.current
          target.width = result.width
          target.height = result.height
          target.getContext("2d")?.drawImage(result, 0, 0)
        })
        .catch(() => {
          if (valid)
            setError("Could not preview this photo. Please try another photo.")
        })
        .finally(() => {
          if (valid) setPreviewBusy(false)
        })
    }, 100)
    return () => {
      valid = false
      clearTimeout(timer)
    }
  }, [active, stage])
  function update(values: Partial<PhotoEdits>) {
    setPhotos((current) =>
      current.map((p, i) =>
        i === selected ? { ...p, edits: { ...p.edits, ...values } } : p,
      ),
    )
  }
  async function add(files: FileList | null) {
    if (!files?.length || locked.current) return
    if (photos.length + files.length > 10) {
      setError("Choose up to 10 photos per post.")
      return
    }
    locked.current = true
    setBusy(true)
    setError("")
    try {
      const added: PostPhotoDraft[] = []
      for (const file of Array.from(files)) {
        const clean = await privateImage(file)
        added.push({
          id: crypto.randomUUID(),
          original: clean,
          file: clean,
          edits: newPhotoEdits(),
        })
      }
      setSelected(photos.length)
      setPhotos((current) => [...current, ...added])
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not open these photos.",
      )
    } finally {
      locked.current = false
      setBusy(false)
      if (gallery.current) gallery.current.value = ""
      if (camera.current) camera.current.value = ""
    }
  }
  async function close() {
    if (locked.current) return
    if (recovery.memoryOnly && hasPostDraftContent(snapshot)) {
      setExitOpen(true)
      return
    }
    locked.current = true
    setBusy(true)
    try {
      await recovery.flush()
      recovery.leaveWithoutSaving()
      onClose()
    } catch {
      setExitOpen(true)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  async function discard() {
    if (
      locked.current ||
      !window.confirm(
        "Discard this post draft? Its photos, edits, caption and recipe tag will be removed from this device.",
      )
    )
      return
    locked.current = true
    setBusy(true)
    try {
      await recovery.discard()
      void supabase.rpc("discard_recipe_uploads", {
        p_submission: postId.current,
      })
      onClose()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not discard your draft. Please retry.",
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  async function share() {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError("")
    try {
      if (!(await requireContentConsent(userId))) return
      const attempting = { ...snapshot, publishAttempted: true }
      await recovery.flush(attempting)
      setPublishAttempted(true)
      const id = await sharePhotoPost(
        userId,
        postId.current,
        caption,
        photos,
        setProgress,
        recipeTag?.id ?? null,
      )
      await recovery.published(id)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not share your post.",
      )
    } finally {
      locked.current = false
      setBusy(false)
      setProgress("")
    }
  }
  function move(direction: number) {
    const next = selected + direction
    if (next < 0 || next >= photos.length) return
    const changed = [...photos]
    ;[changed[selected], changed[next]] = [changed[next], changed[selected]]
    setPhotos(changed)
    setSelected(next)
  }
  function positionText(event: React.PointerEvent<HTMLCanvasElement>) {
    if (
      tab !== "Text" ||
      !active?.edits.text ||
      (event.type === "pointermove" &&
        !event.currentTarget.hasPointerCapture(event.pointerId))
    )
      return
    if (event.type === "pointerdown")
      event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    update({
      textX: Math.max(
        0.1,
        Math.min(0.9, (event.clientX - rect.left) / rect.width),
      ),
      textY: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    })
  }
  if (recovery.mode !== "editing")
    return (
      <section className="post-composer photo-post-screen">
        <header className="post-topbar">
          <button
            type="button"
            aria-label="Close post drafts"
            onClick={() => {
              recovery.leaveWithoutSaving()
              onClose()
            }}
          >
            <BackIcon />
          </button>
          <h1>New post</h1>
          <span />
        </header>
        {(recovery.mode === "checking" ||
          recovery.mode === "checking-share") && (
          <p role="status">
            {recovery.mode === "checking-share"
              ? "Checking your previous Share…"
              : "Checking for a saved draft…"}
          </p>
        )}
        {recovery.mode === "offer" && recovery.recovered && (
          <div className="post-recovery-panel">
            <h2>Continue your post?</h2>
            <p>
              {recovery.recovered.snapshot.photos.length}{" "}
              {recovery.recovered.snapshot.photos.length === 1
                ? "photo"
                : "photos"}{" "}
              · Saved {new Date(recovery.recovered.updatedAt).toLocaleString()}
            </p>
            {recovery.recovered.snapshot.photos[0] && (
              <LocalPhoto
                className="post-recovery-photo"
                file={recovery.recovered.snapshot.photos[0].file}
                alt="Saved post draft"
              />
            )}
            {recovery.recovered.snapshot.caption && (
              <p className="post-recovery-caption">
                {recovery.recovered.snapshot.caption.slice(0, 160)}
              </p>
            )}
            {recovery.recovered.snapshot.recipeTag && (
              <p>
                Tagged recipe:{" "}
                <strong>{recovery.recovered.snapshot.recipeTag.title}</strong>
              </p>
            )}
            <p className="post-hint">
              Drafts stay on this device for up to 30 days. They aren’t shared
              until you press Share.
            </p>
            <button
              type="button"
              className="post-primary"
              onClick={() => void recovery.resume()}
            >
              Resume draft
            </button>
            <button
              type="button"
              className="post-draft-discard"
              onClick={() => {
                if (
                  window.confirm(
                    "Discard the saved post draft and start a new post?",
                  )
                )
                  void recovery.startNew()
              }}
            >
              Discard & start new
            </button>
            <button
              type="button"
              onClick={() => {
                recovery.leaveWithoutSaving()
                onClose()
              }}
            >
              Not now
            </button>
          </div>
        )}
        {recovery.mode === "storage-error" && (
          <div className="post-recovery-panel">
            <h2>Couldn’t load drafts</h2>
            <p>Your device’s draft storage is unavailable.</p>
            <button type="button" onClick={recovery.retryLoad}>
              Retry
            </button>
            <button type="button" onClick={recovery.continueWithoutSaving}>
              Continue without draft saving
            </button>
          </div>
        )}
        {recovery.error && (
          <p role="alert" className="post-error">
            {recovery.error}
          </p>
        )}
      </section>
    )
  return (
    <section className="post-composer photo-post-screen">
      <header className="post-topbar">
        <button
          type="button"
          aria-label={
            stage === "select" ? "Save and close post" : "Previous step"
          }
          disabled={busy}
          onClick={back}
        >
          <BackIcon />
        </button>
        <h1>
          {stage === "select"
            ? "New post"
            : stage === "edit"
              ? "Edit photos"
              : "New post"}
        </h1>
        <button
          type="button"
          className="post-primary"
          disabled={busy || !photos.length}
          onClick={() =>
            stage === "caption"
              ? void share()
              : setStage(stage === "select" ? "edit" : "caption")
          }
        >
          {stage === "caption" ? "Share" : "Next"}
        </button>
      </header>
      <div className="post-draft-toolbar">
        <span role="status">
          {recovery.memoryOnly
            ? "Draft saving is off for this post"
            : recovery.status === "saving"
              ? "Saving draft…"
              : recovery.status === "saved"
                ? "Draft saved on this device"
                : recovery.status === "error"
                  ? "Draft not saved"
                  : "Drafts save on this device"}
        </span>
        <button type="button" disabled={busy} onClick={() => void close()}>
          Save & close
        </button>
      </div>
      {recovery.error && (
        <div className="post-error" role="alert">
          <p>{recovery.error}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void recovery.flush().catch(() => {})}
          >
            Retry saving
          </button>
        </div>
      )}
      {hasPostDraftContent(snapshot) && (
        <button
          type="button"
          className="post-draft-discard"
          disabled={busy}
          onClick={() => void discard()}
        >
          Discard draft
        </button>
      )}
      {exitOpen && (
        <dialog
          ref={exitDialog}
          aria-labelledby="post-draft-exit-title"
          className="post-draft-exit"
          onCancel={(event) => {
            event.preventDefault()
            setExitOpen(false)
          }}
        >
          <h2 id="post-draft-exit-title">Draft not saved</h2>
          <p>
            Stay here to retry saving, or close without saving your latest
            changes.
          </p>
          <button type="button" autoFocus onClick={() => setExitOpen(false)}>
            Keep editing
          </button>
          <button
            type="button"
            onClick={() => {
              recovery.leaveWithoutSaving()
              onClose()
            }}
          >
            Close without saving
          </button>
        </dialog>
      )}
      <input
        ref={gallery}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => void add(event.currentTarget.files)}
      />
      <input
        ref={camera}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void add(event.currentTarget.files)}
      />
      {error && (
        <p role="alert" className="post-error">
          {error}
        </p>
      )}
      {busy && <p role="status">{progress || "Preparing photos…"}</p>}
      {recipeTag && stage !== "caption" && (
        <p className="post-hint">
          Tagged recipe: <strong>{recipeTag.title}</strong>
        </p>
      )}
      {stage === "select" && (
        <>
          <p>
            Share up to 10 photos. Select photos from your gallery or take a new
            one.
          </p>
          <div className="post-select-actions">
            <button
              type="button"
              disabled={busy || photos.length === 10}
              onClick={() => gallery.current?.click()}
            >
              ＋ Select photos
            </button>
            <button
              type="button"
              disabled={busy || photos.length === 10}
              onClick={() => camera.current?.click()}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M3 7h4l2-3h6l2 3h4v13H3Z" />
                <circle cx="12" cy="13" r="4" />
              </svg>{" "}
              Camera
            </button>
          </div>
          <p className="post-hint">JPG, PNG or WebP · Up to 5 MB per photo</p>
          <div className="post-selection-grid">
            {photos.map((photo, i) => (
              <button
                type="button"
                key={photo.id}
                className={i === selected ? "is-selected" : ""}
                onClick={() => setSelected(i)}
              >
                <LocalPhoto file={photo.file} alt={`Selected photo ${i + 1}`} />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {stage === "edit" && active && (
        <>
          <div
            className={`post-canvas-wrap ${
              tab === "Text" ? "post-drag-text" : ""
            }`}
            aria-busy={previewBusy}
          >
            <canvas
              ref={canvas}
              aria-label={`Edited photo ${selected + 1}`}
              onPointerDown={positionText}
              onPointerMove={positionText}
            />
            {previewBusy && (
              <span className="post-preview-status" role="status">
                Updating…
              </span>
            )}
          </div>
          <div className="post-thumbnail-strip">
            {photos.map((p, i) => (
              <button
                type="button"
                key={p.id}
                aria-label={`Edit photo ${i + 1}`}
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
              >
                <LocalPhoto file={p.file} alt="" />
              </button>
            ))}
          </div>
          <div className="post-order">
            <button type="button" disabled={!selected} onClick={() => move(-1)}>
              ← Move earlier
            </button>
            <span>
              {selected + 1} / {photos.length}
            </span>
            <button
              type="button"
              disabled={selected === photos.length - 1}
              onClick={() => move(1)}
            >
              Move later →
            </button>
            <button
              type="button"
              onClick={() => {
                setPhotos((current) => current.filter((_, i) => i !== selected))
                setSelected(Math.max(0, selected - 1))
                if (photos.length === 1) setStage("select")
              }}
            >
              Remove
            </button>
          </div>
          <div
            className="post-tabs"
            role="tablist"
            aria-label="Photo editing tools"
          >
            {["Filters", "Edit", "Text"].map((value) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab === value}
                key={value}
                onClick={() => setTab(value)}
              >
                {value}
              </button>
            ))}
          </div>
          {tab === "Filters" && (
            <div className="post-tools">
              {postFilters.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={active.edits.filter === value}
                  onClick={() => update({ filter: value })}
                >
                  {value}
                </button>
              ))}
            </div>
          )}
          {tab === "Edit" && (
            <>
              <div className="post-tools">
                <button type="button" onClick={() => setCrop(true)}>
                  Crop
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update({ rotation: (active.edits.rotation + 90) % 360 })
                  }
                >
                  Rotate 90°
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Reset this photo and all its edits?"))
                      setPhotos((current) =>
                        current.map((p, i) =>
                          i === selected
                            ? { ...p, file: p.original, edits: newPhotoEdits() }
                            : p,
                        ),
                      )
                  }}
                >
                  Reset photo
                </button>
                {adjustments.map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={tool === value}
                    onClick={() => setTool(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <label className="post-slider">
                {tool}{" "}
                <output>
                  {active.edits[tool]}
                  {tool === "tilt" ? "°" : ""}
                </output>
                <input
                  type="range"
                  min={
                    tool === "tilt"
                      ? -15
                      : ["sharpness", "vignette"].includes(tool)
                        ? 0
                        : -100
                  }
                  max={tool === "tilt" ? 15 : 100}
                  value={active.edits[tool]}
                  onChange={(event) =>
                    update({ [tool]: Number(event.target.value) })
                  }
                />
              </label>
            </>
          )}
          {tab === "Text" && (
            <div className="post-text-tools">
              <label>
                Text on photo
                <input
                  type="text"
                  maxLength={120}
                  placeholder="Add a few words"
                  value={active.edits.text}
                  onChange={(event) => update({ text: event.target.value })}
                />
              </label>
              <label>
                Color
                <input
                  aria-label="Text color"
                  type="color"
                  value={active.edits.textColor}
                  onChange={(event) =>
                    update({ textColor: event.target.value })
                  }
                />
              </label>
              <label className="post-slider">
                Text size
                <input
                  type="range"
                  min="2"
                  max="10"
                  step="0.5"
                  value={active.edits.textSize}
                  onChange={(event) =>
                    update({ textSize: Number(event.target.value) })
                  }
                />
              </label>
              <p className="post-hint">Drag on the photo to position text.</p>
              <label className="post-slider">
                Horizontal position
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={active.edits.textX * 100}
                  onChange={(event) =>
                    update({ textX: Number(event.target.value) / 100 })
                  }
                />
              </label>
              <label className="post-slider">
                Vertical position
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={active.edits.textY * 100}
                  onChange={(event) =>
                    update({ textY: Number(event.target.value) / 100 })
                  }
                />
              </label>
            </div>
          )}
          {crop && (
            <PhotoCropDialog
              source={active.file}
              onClose={() => setCrop(false)}
              onApply={async (file) => {
                const clean = await privateImage(file)
                setPhotos((current) =>
                  current.map((p, i) =>
                    i === selected ? { ...p, file: clean } : p,
                  ),
                )
                setCrop(false)
              }}
            />
          )}
        </>
      )}
      {stage === "caption" && (
        <>
          <div className="post-caption-photos">
            {photos.map((photo, i) => (
              <EditedThumbnail key={photo.id} photo={photo} index={i} />
            ))}
          </div>
          <label className="post-caption-label">
            Caption
            <textarea
              rows={5}
              maxLength={2200}
              disabled={busy}
              placeholder="What’s on your plate?"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
          </label>
          <p className="post-hint">
            {caption.length.toLocaleString()} / 2,200 · Public post
          </p>
          <PostRecipePicker
            value={recipeTag}
            onChange={setRecipeTag}
            disabled={busy}
          />
          <p className="post-hint">
            Share photos you have permission to post. Your photos and caption
            must follow our content policy.
          </p>
        </>
      )}
    </section>
  )
}

function EditedThumbnail({
  photo,
  index,
}: {
  photo: PostPhotoDraft
  index: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let valid = true
    renderPostPhoto(photo.file, photo.edits, 360)
      .then((result) => {
        if (!valid || !ref.current) return
        ref.current.width = result.width
        ref.current.height = result.height
        ref.current.getContext("2d")?.drawImage(result, 0, 0)
      })
      .catch(() => {})
    return () => {
      valid = false
    }
  }, [photo])
  return <canvas ref={ref} aria-label={`Final photo ${index + 1}`} />
}
