import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
const source=readFileSync(new URL('../src/lib/profileRecipes.ts',import.meta.url),'utf8')
function query() {
  const calls=[]
  const builder=new Proxy({}, {get(_,method){return (...args)=>{calls.push([method,...args]);return builder}}})
  const module={exports:{}}
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  new Function('require','module','exports',js)(()=>({supabase:{from(table){calls.push(['from',table]);return builder}}}),module,module.exports)
  module.exports.profileRecipeQuery('profile-owner',30)
  return calls
}
test('profile search stays scoped to public recipes by the displayed author and includes pagination',()=>{
  const calls=query()
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='author_id'&&c[2]==='profile-owner'))
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='is_hidden'&&c[2]===false))
  assert.deepEqual(calls.at(-1),['limit',31])
})

