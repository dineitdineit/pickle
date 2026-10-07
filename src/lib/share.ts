type ShareBrowser = {
  share?: (data: ShareData) => Promise<void>
  clipboard?: { writeText: (text: string) => Promise<void> }
}

export function recipeShareUrl(recipeId: string) {
  const url = new URL("https://getpickleapp.com/")
  url.searchParams.set("recipe", recipeId)
  return url.toString()
}

/** Only call from a user click so native sharing retains user activation. */
export async function shareRecipe(
  recipe: {
    id: string
    title: string
  },
  browser: ShareBrowser = navigator,
): Promise<"shared" | "copied" | "cancelled" | "manual"> {
  const url = recipeShareUrl(recipe.id)
  if (browser.share) {
    try {
      await browser.share({ title: `${recipe.title} | Pickle`, url })
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
