import { supabase } from "./supabase"

import { privateImage } from "./imagePrivacy"

import type { DirectMessage } from "./messages"

const CHAT_PHOTO_LIMIT = 5 * 1024 * 1024

const types: Record<string, string> = {
  "image/jpeg": "jpg",

  "image/png": "png",

  "image/webp": "webp",
}

export function validateChatPhoto(file: File): string {
  if (!types[file.type]) throw new Error("Choose a JPEG, PNG or WebP photo.")

  if (!file.size || file.size > CHAT_PHOTO_LIMIT)
    throw new Error("Choose a photo up to 5 MB.")

  return types[file.type]
}

export async function uploadChatPhoto(
  file: File,

  userId: string,

  peerId: string,

  clientId: string,
): Promise<string> {
  file = await privateImage(file)

  const extension = validateChatPhoto(file)

  const path = `${userId}/${peerId}/${clientId}.${extension}`

  const bucket = supabase.storage.from("chat_images")

  const result = await bucket.upload(path, file, {
    contentType: file.type,

    upsert: false,
  })

  if (result.error) {
    // An upload may have succeeded even when its response was lost.

    const check = await bucket.createSignedUrl(path, 60)

    if (check.error || !check.data?.signedUrl)
      throw new Error("Could not upload your photo. Please try again.")
  }

  return path
}

export async function sendPhotoMessage(
  peerId: string,

  body: string,

  clientId: string,

  userId: string,

  path: string,
): Promise<DirectMessage> {
  const { data, error } = await supabase.rpc("send_direct_photo_message", {
    p_recipient_id: peerId,

    p_body: body.trim(),

    p_client_id: clientId,

    p_image_path: path,
  })

  if (
    error ||
    !data?.id ||
    data.sender_id !== userId ||
    data.recipient_id !== peerId ||
    data.client_id !== clientId ||
    data.body !== body.trim() ||
    data.image_path !== path
  )
    throw new Error("Photo delivery was not confirmed")

  return data
}

export function insertEmoji(
  text: string,

  emoji: string,

  start: number,

  end: number,
) {
  const next = text.slice(0, start) + emoji + text.slice(end)

  if (next.length > 3000) return null

  return { text: next, position: start + emoji.length }
}

export async function removeUnsentPhoto(path: string) {
  try {
    await supabase.storage.from("chat_images").remove([path])
  } catch {
    /* Account deletion also cleans retained uploads. */
  }
}
