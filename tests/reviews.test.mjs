import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import ts from "typescript"

const source = readFileSync(new URL("../src/RecipeReviews.tsx", import.meta.url), "utf8")
function action(name, context) {
  const ast = ts.createSourceFile("RecipeReviews.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let fn
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) fn = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const js = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  return new Function(...Object.keys(context), `${js}; return ${name}`)(...Object.values(context))
}
function setup({ ownReview = null, userId = "user", rating = 5, text = "", response = { data: { id: "saved" }, error: null } } = {}) {
  const calls = [], state = {}
  const query = {
    insert(value) { calls.push(["insert", value]); return query },
    update(value) { calls.push(["update", value]); return query },
    delete() { calls.push(["delete"]); return query },
    eq(key, value) { calls.push(["eq", key, value]); return query },
    select() { return query },
    async single() { return response },
  }
  const context = {
    userId, rating, text, ownReview, recipeId: "recipe", mutation: { current: false },
    supabase: { from(table) { assert.equal(table, "recipe_reviews"); return query } },
    console: { error() {} }, writeButton: { current: null },
    onRequireLogin() { state.login = true }, reload() { state.reloaded = true },
    ...Object.fromEntries(["Busy", "Message", "Editor", "Success", "ConfirmDelete"].map(name => [`set${name}`, value => { state[name] = value }])),
  }
  return { calls, state, context }
}
test("rating-only review saves without required text and confirms persistence", async () => {
  const { calls, state, context } = setup()
  await action("save", context)()
  assert.deepEqual(calls[0], ["insert", { rating: 5, content: "", recipe_id: "recipe", user_id: "user" }])
  assert.equal(state.Editor, false)
  assert.equal(state.reloaded, true)
  assert.equal(state.Busy, false)
})
test("editing a review updates only the current user's row and trims optional text", async () => {
  const { calls, context } = setup({ ownReview: { id: "review" }, rating: 3, text: "  Cooked this today.  " })
  await action("save", context)()
  assert.deepEqual(calls, [["update", { rating: 3, content: "Cooked this today." }], ["eq", "id", "review"], ["eq", "user_id", "user"]])
})
test("signed-out and invalid rating attempts do not write data", async () => {
  for (const values of [{ userId: null }, { rating: 0 }, { rating: 6 }]) {
    const { calls, context } = setup(values)
    await action("save", context)()
    assert.deepEqual(calls, [])
  }
})
test("failed or zero-row saves retain the form and do not claim success", async () => {
  for (const response of [{ data: null, error: { message: "Denied" } }, { data: null, error: null }]) {
    const { state, context } = setup({ response })
    await action("save", context)()
    assert.ok(state.Message.includes("Could not save"))
    assert.equal(state.Success, undefined)
    assert.equal(state.Editor, undefined)
    assert.equal(context.mutation.current, false)
  }
})
test("duplicate insert refreshes the existing review rather than claiming a second rating", async () => {
  const { state, context } = setup({ response: { data: null, error: { code: "23505" } } })
  await action("save", context)()
  assert.equal(state.reloaded, true)
  assert.ok(state.Message.includes("already rated"))
  assert.equal(state.Success, undefined)
})
test("review deletion confirms an owned row was removed before closing the dialog", async () => {
  const { calls, state, context } = setup({ ownReview: { id: "review" } })
  await action("remove", context)()
  assert.deepEqual(calls, [["delete"], ["eq", "id", "review"], ["eq", "user_id", "user"]])
  assert.equal(state.ConfirmDelete, false)
  assert.equal(state.reloaded, true)
})
test("zero-row deletion leaves confirmation open with an error", async () => {
  const { state, context } = setup({ ownReview: { id: "review" }, response: { data: null, error: null } })
  await action("remove", context)()
  assert.equal(state.ConfirmDelete, undefined)
  assert.equal(state.Success, undefined)
  assert.ok(state.Message.includes("Could not delete"))
})
