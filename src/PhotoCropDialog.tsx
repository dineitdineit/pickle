import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react"
import { adjustCrop, type CropArea, type CropHandle } from "./lib/photoCrop"
type Props = {
  source: File | string
  onClose: () => void
  onApply: (file: File) => Promise<void>
}
export default function PhotoCropDialog({ source, onClose, onApply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    area: CropArea
    handle: CropHandle
    x: number
    y: number
    pointerId: number
  } | null>(null)
  const image = useRef<HTMLImageElement | null>(null)
  const saving = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const [imageUrl, setImageUrl] = useState("")
  const [area, setArea] = useState<CropArea>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    const modal = dialog.current
    modal?.showModal()
    return () => {
      modal?.close()
    }
  }, [])
  useEffect(() => {
    let active = true
    const url =
      typeof source === "string" ? source : URL.createObjectURL(source)
    const photo = new Image()
    photo.crossOrigin = "anonymous"
    photo.onload = () => {
      if (active) {
        image.current = photo
        setImageUrl(url)
        setArea({
          x: photo.naturalWidth * 0.1,
          y: photo.naturalHeight * 0.1,
          width: photo.naturalWidth * 0.8,
          height: photo.naturalHeight * 0.8,
        })
        setLoaded(true)
      }
    }
    photo.onerror = () => {
      if (active)
        setError("Could not open this photo. Please choose another image.")
    }
    photo.src = url
    return () => {
      active = false
      image.current = null
      if (typeof source !== "string") URL.revokeObjectURL(url)
    }
  }, [source])
  function startDrag(event: PointerEvent<HTMLElement>, handle: CropHandle) {
    if (busy) return
    event.preventDefault()
    event.stopPropagation()
    viewport.current?.setPointerCapture(event.pointerId)
    drag.current = {
      area,
      handle,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    }
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current,
      photo = image.current,
      bounds = viewport.current?.getBoundingClientRect()
    if (
      !start ||
      start.pointerId !== event.pointerId ||
      !photo ||
      !bounds ||
      busy
    )
      return
    setArea(
      adjustCrop(
        start.area,
        start.handle,
        ((event.clientX - start.x) * photo.naturalWidth) / bounds.width,
        ((event.clientY - start.y) * photo.naturalHeight) / bounds.height,
        photo.naturalWidth,
        photo.naturalHeight,
      ),
    )
  }
  function keyboardAdjust(
    event: KeyboardEvent<HTMLElement>,
    handle: CropHandle,
  ) {
    const photo = image.current
    if (
      !photo ||
      busy ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return
    event.preventDefault()
    event.stopPropagation()
    const dx =
      event.key === "ArrowLeft"
        ? -photo.naturalWidth * 0.01
        : event.key === "ArrowRight"
          ? photo.naturalWidth * 0.01
          : 0
    const dy =
      event.key === "ArrowUp"
        ? -photo.naturalHeight * 0.01
        : event.key === "ArrowDown"
          ? photo.naturalHeight * 0.01
          : 0
    setArea((current) =>
      adjustCrop(
        current,
        handle,
        dx,
        dy,
        photo.naturalWidth,
        photo.naturalHeight,
      ),
    )
  }
  async function apply(original = false) {
    if (saving.current || !loaded || !image.current) return
    saving.current = true
    setBusy(true)
    setError("")
    try {
      let file: File
      if (original && typeof source !== "string") file = source
      else {
        const photo = image.current
        const output = document.createElement("canvas")
        const scale = Math.min(1, 1200 / Math.max(area.width, area.height))
        output.width = Math.max(1, Math.round(area.width * scale))
        output.height = Math.max(1, Math.round(area.height * scale))
        const context = output.getContext("2d")
        if (!context)
          throw new Error("Could not crop this photo. Please try again.")
        context.fillStyle = "var(--color-white)"
        context.fillRect(0, 0, output.width, output.height)
        context.drawImage(
          photo,
          area.x,
          area.y,
          area.width,
          area.height,
          0,
          0,
          output.width,
          output.height,
        )
        const blob = await new Promise<Blob>((resolve, reject) =>
          output.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error("Could not crop this photo.")),
            "image/jpeg",
            0.9,
          ),
        )
        file = new File([blob], "recipe-photo.jpg", { type: "image/jpeg" })
      }
      await onApply(file)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save this photo. Please try again.",
      )
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="photo-crop-dialog"
      aria-labelledby="photo-crop-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!saving.current) onClose()
      }}
    >
      <h2 id="photo-crop-title">Crop photo</h2>
      <p className="submission-muted">
        Drag the box to move it. Drag a corner to resize.
      </p>
      {error && (
        <p className="photo-crop-error" role="alert">
          {error}
        </p>
      )}
      {!loaded && !error && <p role="status">Loading photo…</p>}
      {loaded && image.current && (
        <div
          ref={viewport}
          className="photo-crop-viewport"
          style={{
            width: `min(100%, ${(55 * image.current.naturalWidth) / image.current.naturalHeight}dvh)`,
            marginInline: "auto",
          }}
          onPointerMove={moveDrag}
          onPointerUp={() => {
            drag.current = null
          }}
          onPointerCancel={() => {
            drag.current = null
          }}
          onLostPointerCapture={() => {
            drag.current = null
          }}
        >
          <img src={imageUrl} alt="Original photo" draggable={false} />
          <div
            className="photo-crop-selection"
            role="group"
            tabIndex={busy ? -1 : 0}
            aria-label="Crop selection. Use arrow keys to move."
            style={{
              left: `${(area.x / image.current.naturalWidth) * 100}%`,
              top: `${(area.y / image.current.naturalHeight) * 100}%`,
              width: `${(area.width / image.current.naturalWidth) * 100}%`,
              height: `${(area.height / image.current.naturalHeight) * 100}%`,
            }}
            onPointerDown={(event) => startDrag(event, "move")}
            onKeyDown={(event) => keyboardAdjust(event, "move")}
          >
            <div className="photo-crop-grid" aria-hidden="true" />
            {(["nw", "ne", "sw", "se"] as const).map((handle) => (
              <button
                key={handle}
                type="button"
                className={`photo-crop-handle handle-${handle}`}
                aria-label={`Resize crop ${{ nw: "top left", ne: "top right", sw: "bottom left", se: "bottom right" }[handle]} corner. Use arrow keys to resize.`}
                disabled={busy}
                onPointerDown={(event) => startDrag(event, handle)}
                onKeyDown={(event) => keyboardAdjust(event, handle)}
              />
            ))}
          </div>
        </div>
      )}
      <div className="photo-crop-actions">
        <button
          type="button"
          className="submission-secondary"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        {typeof source !== "string" && (
          <button
            type="button"
            className="submission-secondary"
            disabled={busy || !loaded}
            onClick={() => void apply(true)}
          >
            Use original
          </button>
        )}
        <button
          type="button"
          className="submission-primary"
          disabled={busy || !loaded}
          onClick={() => void apply()}
        >
          {busy ? "Saving…" : "Apply crop"}
        </button>
      </div>
    </dialog>
  )
}
