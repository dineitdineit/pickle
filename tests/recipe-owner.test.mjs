import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source=readFileSync(new URL('../src/MyRecipesScreen.tsx',import.meta.url),'utf8')
const ast=ts.createSourceFile('my-recipes.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let fn
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='deleteRecipe')fn=node.getText(ast);ts.forEachChild(node,visit)}
visit(ast)
function setup(response){
 const state={rows:[{id:'owned'},{id:'other'}],count:2},calls=[]
 const context={deleteTarget:{id:'owned',updated_at:'version'},deleteGuard:{current:false},userId:'user',localStorage:{removeItem(key){state.removedCache=key}},onShowList(){state.refreshed=true},supabase:{async rpc(name,args){calls.push({name,args});return response}},setRows(fn){state.rows=fn(state.rows)},setCount(fn){state.count=fn(state.count)},setRefresh(fn){state.refresh=fn(0)},setDeleting(value){state.deleting=value},setDeleteError(value){state.error=value},setDeleteTarget(value){state.target=value},setNotice(value){state.notice=value}}
 const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 return {state,calls,context,remove:new Function(...Object.keys(context),`${js};return deleteRecipe`)(...Object.values(context))}
}
test('confirmed deletion removes only the owned list entry and invalidates its draft cache',async()=>{
 const {state,calls,remove}=setup({data:{id:'owned',deleted:true},error:null});await remove()
 assert.equal(calls[0].name,'delete_recipe_submission');assert.equal(calls[0].args.p_expected_updated_at,'version')
 assert.deepEqual(state.rows,[{id:'other'}]);assert.equal(state.count,1);assert.equal(state.removedCache,'pickle:recipe-draft:user:owned');assert.equal(state.notice,'Recipe deleted.')
})
test('failed, stale or unconfirmed deletion preserves the recipe and shows an error',async()=>{
 for(const response of [{error:{code:'40001'}},{error:{code:'42501'}},{data:{id:'other',deleted:true}},{data:{id:'owned',deleted:false}}]){
  const {state,remove}=setup(response);await remove();assert.equal(state.rows.length,2);assert.equal(state.notice,undefined);assert.ok(state.error);assert.equal(state.deleting,false)
 }
})
test('a repeated delete click while busy does not send another request',async()=>{
 const {calls,context,remove}=setup({});context.deleteGuard.current=true;await remove();assert.equal(calls.length,0)
})
