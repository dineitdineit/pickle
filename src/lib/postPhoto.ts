export const postFilters = [
  "Original",
  "Warm",
  "Cool",
  "Vivid",
  "Mono",
  "Vintage",
] as const
export type PostFilter = typeof postFilters[number]
export type Adjustment = "tilt" | "brightness" | "contrast" | "sharpness" | "temperature" | "saturation" | "highlights" | "shadows" | "vignette"
export interface PhotoEdits {
  filter: PostFilter
  rotation: number
  tilt: number
  brightness: number
  contrast: number
  sharpness: number
  temperature: number
  saturation: number
  highlights: number
  shadows: number
  vignette: number
  text: string
  textColor: string
  textSize: number
  textX: number
  textY: number
}
export const newPhotoEdits = (): PhotoEdits => ({
  filter: "Original",
  rotation: 0,
  tilt: 0,
  brightness: 0,
  contrast: 0,
  sharpness: 0,
  temperature: 0,
  saturation: 0,
  highlights: 0,
  shadows: 0,
  vignette: 0,
  text: "",
  textColor: "#ffffff",
  textSize: 4,
  textX: 0.5,
  textY: 0.5,
})
const clamp = (n: number, min = 0, max = 255) => Math.max(min, Math.min(max, n))

/** Pixel edits are shared by the preview and exported file, not CSS-only filters. */
export function editPhotoPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  e: PhotoEdits,
) {
  const temperature =
    e.temperature +
    (e.filter === "Warm"
      ? 25
      : e.filter === "Cool"
        ? -25
        : e.filter === "Vintage"
          ? 15
          : 0)
  const saturation =
    (1 + e.saturation / 100) *
    (e.filter === "Mono"
      ? 0
      : e.filter === "Vivid"
        ? 1.3
        : e.filter === "Vintage"
          ? 0.7
          : 1)
  const contrast =
    (1 + e.contrast / 100) *
    (e.filter === "Vivid" ? 1.1 : e.filter === "Vintage" ? 0.9 : 1)
  const exposure = Math.pow(2, e.brightness / 100)
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i],
      g = data[i + 1],
      b = data[i + 2]
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    const tone = e.highlights * luma * luma + e.shadows * Math.pow(1 - luma, 2)
    r += temperature * 0.35 + tone
    g += temperature * 0.05 + tone
    b -= temperature * 0.35 - tone
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
    let edge = 1
    if (e.vignette) {
      const pixel = i / 4,
        x = ((pixel % width) + 0.5) / width - 0.5,
        y = (Math.floor(pixel / width) + 0.5) / height - 0.5
      edge -= (clamp((x * x + y * y - 0.04) / 0.46, 0, 1) * e.vignette) / 100
    }
    data[i] = clamp(
      ((gray + (r - gray) * saturation - 128) * contrast + 128) *
        exposure *
        edge,
    )
    data[i + 1] = clamp(
      ((gray + (g - gray) * saturation - 128) * contrast + 128) *
        exposure *
        edge,
    )
    data[i + 2] = clamp(
      ((gray + (b - gray) * saturation - 128) * contrast + 128) *
        exposure *
        edge,
    )
  }
  if (e.sharpness > 0) {
    const original = new Uint8ClampedArray(data),
      amount = (e.sharpness / 100) * 1.5
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const left = (y * width + Math.max(0, x - 1)) * 4,
          right = (y * width + Math.min(width - 1, x + 1)) * 4
        const top = (Math.max(0, y - 1) * width + x) * 4,
          bottom = (Math.min(height - 1, y + 1) * width + x) * 4
        for (let c = 0; c < 3; c++) {
          const blur =
            (original[left + c] +
              original[right + c] +
              original[top + c] +
              original[bottom + c]) /
            4
          data[offset + c] = clamp(
            original[offset + c] + (original[offset + c] - blur) * amount,
          )
        }
      }
  }
}

function drawText(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  e: PhotoEdits,
) {
  if (!e.text.trim()) return
  const size = (width * e.textSize) / 100
  context.font = `600 ${size}px Inter, sans-serif`
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillStyle = e.textColor
  context.strokeStyle =
    e.textColor.toLowerCase() === "#000000" ? "#ffffff80" : "#00000080"
  context.lineWidth = Math.max(1, size * 0.05)
  context.lineJoin = "round"
  const lines: string[] = []
  for (const paragraph of e.text.slice(0, 120).split("\n")) {
    let line = ""
    for (const char of paragraph) {
      if (line && context.measureText(line + char).width > width * 0.84) {
        lines.push(line)
        line = ""
      }
      line += char
    }
    lines.push(line)
  }
  const visible = lines.slice(0, 5),
    lineHeight = size * 1.2
  const x = clamp(e.textX, 0.1, 0.9) * width
  const y = clamp(
    e.textY * height,
    (lineHeight * visible.length) / 2,
    height - (lineHeight * visible.length) / 2,
  )
  visible.forEach((line, index) => {
    const lineY = y + (index - (visible.length - 1) / 2) * lineHeight
    context.strokeText(line, x, lineY)
    context.fillText(line, x, lineY)
  })
}

export async function renderPostPhoto(
  file: File,
  edits: PhotoEdits,
  limit = 2400,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  })
  try {
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height))
    const w = bitmap.width * scale,
      h = bitmap.height * scale
    const quarter = Math.round(edits.rotation / 90) % 2 !== 0
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(quarter ? h : w))
    canvas.height = Math.max(1, Math.round(quarter ? w : h))
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Could not edit this photo.")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    const angle = ((edits.rotation + edits.tilt) * Math.PI) / 180
    const cos = Math.abs(Math.cos(angle)),
      sin = Math.abs(Math.sin(angle))
    const cover = Math.max(
      (cos * canvas.width + sin * canvas.height) / w,
      (sin * canvas.width + cos * canvas.height) / h,
    )
    context.save()
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(angle)
    context.scale(cover, cover)
    context.drawImage(bitmap, -w / 2, -h / 2, w, h)
    context.restore()
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    editPhotoPixels(pixels.data, canvas.width, canvas.height, edits)
    context.putImageData(pixels, 0, 0)
    drawText(context, canvas.width, canvas.height, edits)
    return canvas
  } finally {
    bitmap.close()
  }
}

export async function exportPostPhoto(
  file: File,
  edits: PhotoEdits,
): Promise<File> {
  const canvas = await renderPostPhoto(file, edits)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Could not prepare the photo.")),
      "image/webp",
      0.9,
    ),
  )
  if (blob.size > 5 * 1024 * 1024)
    throw new Error("The edited photo is too large. Try a smaller photo.")
  return new File(
    [blob],
    `photo.${blob.type === "image/webp" ? "webp" : "png"}`,
    { type: blob.type },
  )
}
