import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import ts from "typescript"

const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const ast = ts.createSourceFile(
  "App.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)
let syncUrl, selectTaggedRecipe
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === "useEffect" &&
    node.arguments[0]?.getText(ast).includes('url.searchParams.set("recipe"')
  ) {
    syncUrl = node.arguments[0].getText(ast)
  }
  if (
    ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(ast) === "PhotoPostsScreen"
  ) {
    const attr = node.attributes.properties.find(
      (attr) => attr.name?.getText(ast) === "onSelectRecipe",
    )
    if (attr) selectTaggedRecipe = attr.initializer.expression.getText(ast)
  }
  ts.forEachChild(node, visit)
}
visit(ast)
function evaluate(code, context) {
  assert.ok(code, "App navigation callback exists")
  const js = ts.transpileModule(`const fn = ${code}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  return new Function(...Object.keys(context), `${js};return fn`)(
    ...Object.values(context),
  )
}
const post = "11111111-1111-4111-8111-111111111111"
const recipe = "22222222-2222-4222-8222-222222222222"
function harness(search = `?post=${post}`) {
  const location = new URL(`https://getpickleapp.com/${search}`)
  const state = {
    selectedRecipeId: null,
    postFeed: { postId: post },
    showMyRecipes: false,
    startNewRecipe: false,
  }
  const historyState = { keep: "existing history state" }
  const window = {
    location,
    scrollTo() {},
    history: {
      state: historyState,
      replaceState(value, _title, url) {
        assert.equal(value, historyState)
        location.href = new URL(url, location.href).href
      },
    },
  }
  return {
    location,
    state,
    sync() {
      evaluate(syncUrl, { window, ...state })()
    },
    selectRecipe(id) {
      evaluate(selectTaggedRecipe, {
        window,
        setPostFeed(value) {
          state.postFeed = value
        },
        setSelectedRecipeId(value) {
          state.selectedRecipeId = value
        },
      })(id)
    },
  }
}

test("a tagged recipe opened from a shared post has a reloadable recipe-only URL", () => {
  const h = harness()
  h.selectRecipe(recipe)
  h.sync()
  assert.equal(h.state.postFeed, null)
  assert.equal(h.location.search, `?recipe=${recipe}`)
})

test("leaving a shared post for Home removes the old post from the URL", () => {
  const h = harness()
  h.state.postFeed = null
  h.sync()
  assert.equal(h.location.search, "")
})

test("a post overlay owns the URL until returning to its underlying recipe", () => {
  const h = harness(`?recipe=${recipe}`)
  h.state.selectedRecipeId = recipe
  h.sync()
  assert.equal(h.location.search, `?post=${post}`)
  h.state.postFeed = null
  h.sync()
  assert.equal(h.location.search, `?recipe=${recipe}`)
})

test("upload navigation clears a previous post route and preserves new-draft intent", () => {
  const h = harness()
  h.state.postFeed = null
  h.state.showMyRecipes = true
  h.state.startNewRecipe = true
  h.sync()
  assert.equal(h.location.search, "?upload=new")
})
