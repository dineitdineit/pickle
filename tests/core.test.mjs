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
