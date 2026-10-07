import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)

// Transpile the small, dependency-free helpers without starting a browser or
// connecting to a live account. Auth/storage dependencies are explicit mocks.
function loadHelper(path, mocks = {}) {
  const source = readFileSync(
    new URL(`../src/lib/${path}.ts`, import.meta.url),
    "utf8",
  )
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })
  const module = { exports: {} }
  new Function("require", "module", "exports", outputText)(
    (name) => mocks[name] ?? require(name),
    module,
    module.exports,
  )
  return module.exports
}

const { formatTime } = loadHelper("format")

test("time labels preserve the existing mobile, card and desktop styles", () => {
  for (const [minutes, short, compact, readable] of [
    [null, "—", "—", "—"],
    [0, "0m", "0min", "0 min"],
    [50, "50m", "50min", "50 min"],
    [60, "1h 0m", "1h", "1 hr"],
    [90, "1h 30m", "1h 30min", "1 hr 30 min"],
  ]) {
    assert.equal(formatTime(minutes), short)
    assert.equal(formatTime(minutes, "compact"), compact)
    assert.equal(formatTime(minutes, "readable"), readable)
  }
})

test("relations handle object, array, empty and missing joins", () => {
  const { firstRelation } = loadHelper("recipe", {
    "./supabase": { supabase: {} },
  })
  const ingredient = { name: "Garlic" }
  assert.equal(firstRelation(ingredient), ingredient)
  assert.equal(firstRelation([ingredient]), ingredient)
  assert.equal(firstRelation([]), null)
  assert.equal(firstRelation(null), null)
})

test("recipe image URLs use the recipe_images bucket and allow empty images", () => {
  const calls = []
  const { recipeImageUrl } = loadHelper("recipe", {
    "./supabase": {
      supabase: {
        storage: {
          from: (bucket) => ({
            getPublicUrl: (path) => {
              calls.push({ bucket, path })
              return { data: { publicUrl: `https://images.example/${path}` } }
            },
          }),
        },
      },
    },
  })
  assert.equal(recipeImageUrl(null), "")
  assert.equal(
    recipeImageUrl("adobo.webp"),
    "https://images.example/adobo.webp",
  )
  assert.deepEqual(calls, [{ bucket: "recipe_images", path: "adobo.webp" }])
})

test("auth normalizes only a missing session and leaves the SDK unchanged", async () => {
  let response = {
    data: { user: null },
    error: { name: "AuthSessionMissingError" },
  }
  const getUser = async () => response
  const supabase = { auth: { getUser } }
  const { getCurrentUser } = loadHelper("auth", { "./supabase": { supabase } })
  assert.deepEqual(await getCurrentUser(), {
    data: { user: null },
    error: null,
  })
  assert.equal(supabase.auth.getUser, getUser)
  response = { data: { user: { id: "user-1" } }, error: null }
  assert.equal(await getCurrentUser(), response)
  response = {
    data: { user: null },
    error: { name: "AuthApiError", message: "Failed request" },
  }
  assert.equal(await getCurrentUser(), response)
})

const { shareRecipe, recipeShareUrl } = loadHelper("share")
const shareTarget = { id: "recipe-1", title: "Chicken Adobo" }

test("sharing uses a clean production recipe URL", async () => {
  assert.equal(
    recipeShareUrl("recipe-1"),
    "https://getpickleapp.com/?recipe=recipe-1",
  )
  let payload
  assert.equal(
    await shareRecipe(shareTarget, {
      share: async (data) => {
        payload = data
      },
    }),
    "shared",
  )
  assert.deepEqual(payload, {
    title: "Chicken Adobo | Pickle",
    url: recipeShareUrl("recipe-1"),
  })
})

test("unsupported native sharing copies the recipe URL", async () => {
  let copied
  assert.equal(
    await shareRecipe(shareTarget, {
      clipboard: {
        writeText: async (url) => {
          copied = url
        },
      },
    }),
    "copied",
  )
  assert.equal(copied, recipeShareUrl("recipe-1"))
})

test("cancelling native share does not copy anything", async () => {
  let copied = false
  const error = new Error("Cancelled")
  error.name = "AbortError"
  assert.equal(
    await shareRecipe(shareTarget, {
      share: async () => {
        throw error
      },
      clipboard: {
        writeText: async () => {
          copied = true
        },
      },
    }),
    "cancelled",
  )
  assert.equal(copied, false)
})

test("native share failure falls back to copying", async () => {
  assert.equal(
    await shareRecipe(shareTarget, {
      share: async () => {
        throw new Error("Unavailable")
      },
      clipboard: { writeText: async () => {} },
    }),
    "copied",
  )
})

test("clipboard denial or missing support offers a manual link", async () => {
  assert.equal(await shareRecipe(shareTarget, {}), "manual")
  assert.equal(
    await shareRecipe(shareTarget, {
      clipboard: {
        writeText: async () => {
          throw new Error("Denied")
        },
      },
    }),
    "manual",
  )
})

const { carouselIndex } = loadHelper("carousel")
test("carousel follows scroll position without skipping or exceeding its bounds", () => {
  assert.equal(carouselIndex(0, 360, 5), 0)
  assert.equal(carouselIndex(150, 360, 5), 0)
  assert.equal(carouselIndex(200, 360, 5), 1)
  assert.equal(carouselIndex(376, 360, 5), 1)
  assert.equal(carouselIndex(752, 360, 5), 2)
  assert.equal(carouselIndex(-40, 360, 5), 0)
  assert.equal(carouselIndex(2000, 360, 5), 4)
  assert.equal(carouselIndex(200, 0, 5), 0)
  assert.equal(carouselIndex(200, 360, 0), 0)
})

test("recipe strips leave finger scrolling to the browser while retaining mouse dragging", () => {
  const source = readFileSync(
    new URL("../src/RecipeStrip.tsx", import.meta.url),
    "utf8",
  )
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  })
  const module = { exports: {} }
  const react = require("react")
  const mockReact = { ...react, useRef: (value) => ({ current: value }) }
  new Function("require", "module", "exports", outputText)(
    (name) =>
      name === "react"
        ? mockReact
        : name === "./lib/format"
          ? { formatTime }
          : require(name),
    module,
    module.exports,
  )
  const strip = module.exports.default({
    title: "Recipes",
    recipes: [],
    onSelectRecipe: () => {},
    onSeeMore: () => {},
  })
  const track = strip.props.children[1]
  const captures = new Set()
  const element = {
    scrollLeft: 100,
    hasPointerCapture: (id) => captures.has(id),
    setPointerCapture: (id) => captures.add(id),
  }
  track.props.ref.current = element
  const touch = { pointerType: "touch", button: 0, pointerId: 1, clientX: 200 }
  track.props.onPointerDown(touch)
  track.props.onPointerMove({ ...touch, clientX: 100 })
  assert.equal(element.scrollLeft, 100)
  assert.equal(track.props.style.touchAction, "pan-x pan-y pinch-zoom")
  const mouse = { ...touch, pointerType: "mouse" }
  track.props.onPointerDown(mouse)
  track.props.onPointerMove({ ...mouse, clientX: 120 })
  assert.equal(element.scrollLeft, 180)
  assert.equal(captures.has(1), true)
})
