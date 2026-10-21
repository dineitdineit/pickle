import { supabase } from "./supabase"

import { exportPostPhoto, type PhotoEdits } from "./postPhoto"

export interface PostPhotoDraft {
  id: string

  original: File

  file: File

  edits: PhotoEdits
}

interface PostConfirmation {
  id?: string

  status?: string
}

function confirmedPost(value: unknown, id: string, status: string) {
  const result = value as PostConfirmation | null

  if (result?.id !== id || result.status !== status)
    throw new Error("Could not confirm the post. Please try again.")
}

export async function sharePhotoPost(
  userId: string,

  id: string,

  caption: string,

  photos: PostPhotoDraft[],

  progress: (message: string) => void,

  recipeId: string | null = null,
) {
  if (photos.length < 1 || photos.length > 10 || caption.length > 2200)
    throw new Error("Choose 1–10 photos and a caption up to 2,200 characters.")

  const draft = await supabase.rpc("ensure_post_draft", { p_id: id })

  if (draft.error)
    throw new Error(
      "Could not start your post. Check your connection and account status.",
    )

  // A lost publish response must not upload another copy or publish different edits.

  if (draft.data?.id === id && draft.data?.status === "published") return id

  confirmedPost(draft.data, id, "draft")

  const paths: string[] = []

  for (let i = 0; i < photos.length; i++) {
    progress(`Preparing photo ${i + 1} of ${photos.length}…`)

    const photo = photos[i]

    const file = await exportPostPhoto(photo.file, photo.edits)

    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      ),

      (n) => n.toString(16).padStart(2, "0"),
    ).join("")

    const path = `${userId}/${id}/${photo.id}-${hash}.${
      file.type === "image/webp" ? "webp" : "png"
    }`

    progress(`Uploading photo ${i + 1} of ${photos.length}…`)

    const bucket = supabase.storage.from("community_recipe_images")

    const result = await bucket.upload(path, file, {
      upsert: false,

      contentType: file.type,

      cacheControl: "0",
    })

    if (result.error) {
      // The hash makes this path immutable. Only accept a retry when it already exists.

      const exists = await bucket.createSignedUrl(path, 1)

      if (exists.error || !exists.data?.signedUrl)
        throw new Error(
          "Photo upload failed. Your photos are still here; try Share again.",
        )
    }

    paths.push(`community:${path}`)
  }

  progress("Sharing your post…")

  const published = await supabase.rpc(
    recipeId ? "publish_recipe_photo_post" : "publish_photo_post",
    {
      p_id: id,

      p_caption: caption,

      p_photos: paths,

      ...(recipeId ? { p_recipe: recipeId } : {}),
    },
  )

  if (published.error)
    throw new Error(
      recipeId
        ? "Could not share with this recipe tag. It may be unavailable or blocked. Your photos are still here; remove or change the tag, then try again."
        : "Could not confirm sharing. Try Share again to check your post safely.",
    )

  confirmedPost(published.data, id, "published")

  // Obsolete uploads from edited retries are queued; linked photos are protected.

  void supabase.rpc("discard_recipe_uploads", { p_submission: id })

  return id
}
