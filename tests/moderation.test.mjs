import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import ts from "typescript"

function componentFunction(file, name, context) {
  const source = readFileSync(
    new URL(`../src/${file}`, import.meta.url),
    "utf8",
  )
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let fn
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      fn = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(fn)
  const js = ts.transpileModule(fn, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText
  return new Function(...Object.keys(context), `${js}; return ${name};`)(
    ...Object.values(context),
  )
}

const quietConsole = { error() {} }

test("recipe comment loading excludes removed/hidden rows for admins and orphan replies from counts", async () => {
  const fixture = [
    {
      id: "active",
      user_id: "admin",
      parent_comment_id: null,
      moderation_status: "active",
    },
    {
      id: "reply",
      user_id: "admin",
      parent_comment_id: "active",
      moderation_status: "active",
    },
    {
      id: "removed",
      user_id: "admin",
      parent_comment_id: null,
      moderation_status: "removed",
    },
    {
      id: "hidden",
      user_id: "admin",
      parent_comment_id: null,
      moderation_status: "hidden",
    },
    {
      id: "orphan",
      user_id: "admin",
      parent_comment_id: "removed",
      moderation_status: "active",
    },
  ]
  let rows, count, likeIds
  const state = Object.fromEntries(
    [
      "setLoading",
      "setUserId",
      "setMessage",
      "setProfiles",
      "setLikeCounts",
      "setLikedCommentIds",
    ].map((name) => [name, () => {}]),
  )
  const supabase = {
    from(table) {
      const filters = []
      const query = {
        select() {
          return query
        },
        eq(key, value) {
          filters.push([key, value])
          return query
        },
        in(key, ids) {
          if (table === "comment_likes") likeIds = ids
          return query
        },
        order() {
          return query
        },
        then(resolve, reject) {
          const data =
            table === "recipe_comments"
              ? fixture.filter((row) =>
                  filters.every(([k, v]) => k === "recipe_id" || row[k] === v),
                )
              : []
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  const load = componentFunction("RecipeComments.tsx", "loadComments", {
    ...state,
    supabase,
    recipeId: "recipe",
    console: quietConsole,
    getCurrentUser: async () => ({ data: { user: { id: "admin" } } }),
    setComments(value) {
      rows = value
    },
    onCountChange(value) {
      count = value
    },
  })
  await load()
  assert.deepEqual(
    rows.map((row) => row.id),
    ["active", "reply"],
  )
  assert.equal(count, 2)
  assert.deepEqual(likeIds, ["active", "reply"])
})

for (const action of ["dismiss", "hide", "remove"]) {
  test(`admin ${action} confirms persisted state before reporting success`, async () => {
    let success = "",
      busy = "comment",
      refreshed = false
    const state =
      action === "dismiss"
        ? { status: "dismissed" }
        : { moderation_status: action === "hide" ? "hidden" : "removed" }
    const query = {
      select() {
        return query
      },
      eq() {
        return query
      },
      async maybeSingle() {
        return { data: state, error: null }
      },
    }
    const moderate = componentFunction("AdminDashboard.tsx", "moderate", {
      busyCommentId: null,
      window: { confirm: () => true },
      console: quietConsole,
      setBusyCommentId(value) {
        busy = value
      },
      setPageMessage() {},
      setActionMessage(value) {
        success = value
      },
      loadReports: async () => {
        refreshed = true
        return true
      },
      supabase: { rpc: async () => ({ error: null }), from: () => query },
    })
    await moderate(
      { commentId: "comment", reports: [{ id: "report" }] },
      action,
    )
    assert.ok(success.length > 0)
    assert.equal(refreshed, true)
    assert.equal(busy, null)
  })
}

test("admin does not claim removal succeeded if the persisted comment is still active", async () => {
  let error = "",
    success = "",
    busy
  const query = {
    select() {
      return query
    },
    eq() {
      return query
    },
    async maybeSingle() {
      return { data: { moderation_status: "active" }, error: null }
    },
  }
  const moderate = componentFunction("AdminDashboard.tsx", "moderate", {
    busyCommentId: null,
    window: { confirm: () => true },
    console: quietConsole,
    setBusyCommentId(value) {
      busy = value
    },
    setPageMessage(value) {
      error = value
    },
    setActionMessage(value) {
      success = value
    },
    loadReports: async () => {
      throw new Error("Should not report success")
    },
    supabase: { rpc: async () => ({ error: null }), from: () => query },
  })
  await moderate(
    { commentId: "comment", reports: [{ id: "report" }] },
    "remove",
  )
  assert.equal(success, "")
  assert.ok(error.includes("Could not confirm"))
  assert.equal(busy, null)
})
