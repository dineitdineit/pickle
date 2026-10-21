export function notificationText(kind: string, title?: string | null) {
  if (kind === "post_comment") return "commented on your post."
  if (kind === "post_reply") return "replied to your comment on a post."
  if (kind === "recipe_photo_post")
    return title
      ? `shared a photo after making your recipe, ${title}.`
      : "shared a photo after making your recipe."
  if (kind === "recipe_comment")
    return title
      ? `commented on your recipe, ${title}.`
      : "commented on your recipe."
  if (kind === "comment_reply")
    return title
      ? `replied to your comment on ${title}.`
      : "replied to your comment."
  if (kind === "new_recipe")
    return title
      ? `published ${title}.`
      : "published a recipe that is no longer available."
  return "started following you."
}

export function notificationTimeLabel(value: string, now = Date.now()) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ""
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60000))
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date(now).getFullYear()
      ? { year: "numeric" }
      : {}),
  })
}
