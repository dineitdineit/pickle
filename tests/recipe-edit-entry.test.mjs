import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
const source=readFileSync(new URL('../src/RecipeEditScreen.tsx',import.meta.url),'utf8')
const ast=ts.createSourceFile('editor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let fn;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='load')fn=node.getText(ast);ts.forEachChild(node,visit)}visit(ast)
function setup(owned,ignore=false){
 const state={},filters={};const context={userId:'owner',recipeId:'recipe',ignore,submissionColumns:'columns',setSubmission(v){state.submission=v},setTags(v){state.tags=v},setError(v){state.error=v},setLoading(v){state.loading=v},supabase:{from(table){const response=table==='recipe_submissions'?owned:{data:[]};return {select(){return this},eq(k,v){filters[k]=v;return this},order(){return this},maybeSingle(){return Promise.resolve(response)},then(resolve,reject){return Promise.resolve(response).then(resolve,reject)}}}}}
 const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 return {state,filters,load:new Function(...Object.keys(context),`${js};return load`)(...Object.values(context))}
}
test('detail edit loads the exact owned published submission',async()=>{
 const h=setup({data:{id:'submission',user_id:'owner',published_recipe_id:'recipe',status:'published'}});await h.load();assert.equal(h.state.submission.id,'submission');assert.deepEqual(h.filters,{user_id:'owner',published_recipe_id:'recipe',status:'published'});assert.equal(h.state.loading,false)
})
test('missing, foreign, draft or failed submissions never open an editor',async()=>{
 for(const result of [{data:null},{error:{}},{data:{user_id:'other',published_recipe_id:'recipe',status:'published'}},{data:{user_id:'owner',published_recipe_id:'other',status:'published'}},{data:{user_id:'owner',published_recipe_id:'recipe',status:'draft'}}]){const h=setup(result);await h.load();assert.equal(h.state.submission,undefined);assert.ok(h.state.error)}
})
test('an abandoned editor request cannot replace current screen state',async()=>{
 const h=setup({data:{id:'submission',user_id:'owner',published_recipe_id:'recipe',status:'published'}},true);await h.load();assert.deepEqual(h.state,{})
})
