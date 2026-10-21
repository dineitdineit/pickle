type ShareBrowser = {
  share?: (data: ShareData) => Promise<void>
  clipboard?: { writeText: (text: string) => Promise<void> }
}
export function recipeShareUrl(recipeId: string) {
  const url = new URL("https://getpickleapp.com/")
  url.searchParams.set("recipe", recipeId)
  return url.toString()
}
export function photoPostShareUrl(postId: string) {
  const url = new URL("https://getpickleapp.com/")
  url.searchParams.set("post", postId)
  return url.toString()
}
export function sharePhotoPostLink(
  postId: string,
  author: string,
  browser: ShareBrowser = navigator,
) {
  return shareLink(
    `A kitchen moment by ${author} | Pickle`,
    photoPostShareUrl(postId),
    browser,
  )
}
/** Only call from a user click so native sharing retains user activation. */
export async function shareRecipe(
  recipe: {
    id: string
    title: string
  },
  browser: ShareBrowser = navigator,
): Promise<"shared" | "copied" | "cancelled" | "manual"> {
  return shareLink(
    `${recipe.title} | Pickle`,
    recipeShareUrl(recipe.id),
    browser,
  )
}
async function shareLink(
  title: string,
  url: string,
  browser: ShareBrowser,
): Promise<"shared" | "copied" | "cancelled" | "manual"> {
  if (browser.share) {
    try {
      await browser.share({ title, url })
      return "shared"
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        return "cancelled"
    }
  }
  try {
    if (browser.clipboard?.writeText) {
      await browser.clipboard.writeText(url)
      return "copied"
    }
  } catch {
    // Clipboard permission can be denied; let the user copy the visible URL.
  }
  return "manual"
}
