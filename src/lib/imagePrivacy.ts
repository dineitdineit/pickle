/** Decode pixels and create a new image; never forward source EXIF/XMP/IPTC. */
export async function privateImage(file: File): Promise<File> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    !file.size ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Choose a JPG, PNG or WebP image up to 5 MB.")
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  })
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 40000000
    )
      throw new Error("Choose a photo up to 40 megapixels.")
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context)
      throw new Error("Could not prepare this photo. Please try again.")
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Could not prepare this photo.")),
        "image/webp",
        0.9,
      ),
    )
    if (blob.size > 5 * 1024 * 1024)
      throw new Error("This photo is too large. Please choose a smaller photo.")
    // Browsers without WebP encoding can return PNG. Use the actual MIME type.
    const extension = blob.type === "image/webp" ? "webp" : "png"
    return new File([blob], `photo.${extension}`, { type: blob.type })
  } finally {
    bitmap.close()
  }
}
