import { expect, test, type BrowserContext } from "@playwright/test"

const recipe = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Test ginger rice",
  difficulty: "Easy",
  total_time_minutes: 20,
  servings: 2,
  cover_image: null,
  video_url: null,
  view_count: 12,
}

async function mockBackend(
  context: BrowserContext,
  options = { failRecipes: false },
) {
  const unexpected: string[] = []
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === "http://127.0.0.1:4174") return route.continue()
    if (url.origin !== "https://pickle-test.invalid") {
      unexpected.push(url.origin + url.pathname)
      return route.abort()
    }
    const path = url.pathname
    if (path === "/rest/v1/recipes") {
      if (options.failRecipes) {
        return route.fulfill({
          // A non-retryable response reaches the UI error state immediately.
          status: 400,
          json: { message: "Simulated recipe-loading failure" },
        })
      }
      return route.fulfill({ json: [recipe] })
    }
    if (path === "/rest/v1/tags") {
      return route.fulfill({
        json: { id: "33333333-3333-4333-8333-333333333333" },
      })
    }
    if (
      path === "/rest/v1/recipe_tags" ||
      path === "/rest/v1/photo_posts" ||
      path === "/rest/v1/rpc/get_recipe_view_counts"
    ) {
      return route.fulfill({ json: [] })
    }
    if (path === "/rest/v1/rpc/get_public_visibility_version") {
      return route.fulfill({ json: "smoke-fixture-v1" })
    }
    unexpected.push(path)
    return route.fulfill({
      status: 500,
      json: { message: "Missing test fixture" },
    })
  })
  return unexpected
}

test("guest home loads recipes without runtime errors", async ({
  page,
  context,
}) => {
  const unexpected = await mockBackend(context)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: recipe.title, exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Discover", exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
  expect(unexpected).toEqual([])
})

test("leaving a shared post returns Home and stays there after reload", async ({
  page,
  context,
}) => {
  const unexpected = await mockBackend(context)
  await page.goto("/?post=11111111-1111-4111-8111-111111111111")
  await expect(
    page.getByRole("heading", { name: "Post unavailable", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Home", exact: true }).click()
  await expect(page).toHaveURL("http://127.0.0.1:4174/")
  await page.reload()
  await expect(
    page.getByRole("heading", { name: recipe.title, exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Post unavailable", exact: true }),
  ).toHaveCount(0)
  expect(unexpected).toEqual([])
})

test("home can recover after a temporary recipe-loading failure", async ({
  page,
  context,
}) => {
  const options = { failRecipes: true }
  const unexpected = await mockBackend(context, options)
  await page.goto("/")
  await expect(
    page
      .getByText("Couldn't load recipes", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible()
  options.failRecipes = false
  await page
    .getByRole("button", { name: "Try again", exact: true })
    .filter({ visible: true })
    .click()
  await expect(
    page.getByRole("heading", { name: recipe.title, exact: true }).first(),
  ).toBeVisible()
  expect(unexpected).toEqual([])
})
