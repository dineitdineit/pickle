import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import ts from "typescript"

function harness({ failKey, failPostDrafts = false } = {}) {
  const owner = "11111111-1111-4111-8111-111111111111"
  const other = "22222222-2222-4222-8222-222222222222"
  const owned = [
    `pickle:recipe-new:${owner}`,
    `pickle:recipe-draft:${owner}`,
    `pickle:recipe-draft:${owner}:existing-recipe`,
    `pickle:cooking:${owner}:recipe`,
    `pickle:settings:${owner}`,
  ]
  const retained = [
    `pickle:recipe-new:${other}`,
    `pickle:recipe-draft:${other}:recipe`,
    `pickle:cooking:${other}:recipe`,
    `pickle:settings:${other}`,
    `pickle:recipe-new:${owner}-different-account`,
    "unrelated-preference",
  ]
  const shared = [
    "pickle:recent-searches",
    "pickle:native-auth-intent",
    "pickle:native-recovery",
  ]
  const storage = new Map(
    [...owned, ...retained, ...shared].map((key) => [
      key,
      "private draft data",
    ]),
  )
  const postOwners = []
  const localStorage = {
    get length() {
      return storage.size
    },
    key(index) {
      return [...storage.keys()][index] ?? null
    },
    removeItem(key) {
      if (key === failKey?.(owner)) throw new Error("Storage unavailable")
      storage.delete(key)
    },
  }
  const module = { exports: {} }
  const js = ts.transpileModule(
    readFileSync(new URL("../src/lib/accountData.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  new Function("require", "module", "exports", "localStorage", js)(
    (name) => {
      assert.equal(name, "./postDrafts")
      return {
        async clearAccountPostDrafts(id) {
          postOwners.push(id)
          if (failPostDrafts) throw new Error("Draft database unavailable")
        },
      }
    },
    module,
    module.exports,
    localStorage,
  )
  return {
    owner,
    owned,
    retained,
    shared,
    storage,
    postOwners,
    clear: module.exports.clearDeletedAccountCache,
  }
}

test("account deletion clears new and existing recipe drafts while preserving other accounts", async () => {
  const h = harness()
  assert.equal(await h.clear(h.owner), true)
  for (const key of [...h.owned, ...h.shared])
    assert.equal(h.storage.has(key), false, key)
  for (const key of h.retained) assert.equal(h.storage.has(key), true, key)
  assert.deepEqual(h.postOwners, [h.owner])
})

test("a failed new-recipe cleanup reports failure and still attempts photo-draft cleanup", async () => {
  const h = harness({ failKey: (owner) => `pickle:recipe-new:${owner}` })
  assert.equal(await h.clear(h.owner), false)
  assert.equal(h.storage.has(`pickle:recipe-new:${h.owner}`), true)
  assert.deepEqual(h.postOwners, [h.owner])
})

test("photo-draft cleanup failure does not undo successful localStorage cleanup", async () => {
  const h = harness({ failPostDrafts: true })
  assert.equal(await h.clear(h.owner), false)
  for (const key of h.owned) assert.equal(h.storage.has(key), false, key)
  for (const key of h.retained) assert.equal(h.storage.has(key), true, key)
})
