import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {test} from 'node:test'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'
const require=createRequire(import.meta.url)
function load(path,mocks={}) {
 const m={exports:{}}
 new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>mocks[name]??(name.endsWith('.css')?{}:require(name)),m,m.exports)
 return m.exports
}
const model=load('lib/savedRecipes.ts',{'./supabase':{supabase:{}}})
const recipe={id:'older-recipe',title:'Ginger rice',short_description:'Dinner',cover_image:null,video_url:null,difficulty:'Easy',total_time_minutes:10,cook_state:'want_to_cook',saved_at:'2026-01-01T00:00:00.000Z'}
test('saved details are fetched from the account-scoped RPC with server query, state and cursor',async()=>{
 const calls=[]
 const result=await model.loadSavedPage(' ginger ','cooked',{id:'anchor',saved_at:recipe.saved_at},{rpc:async(name,args)=>{calls.push({name,args});return {data:[recipe],error:null}}})
 assert.equal(result.rows[0].id,'older-recipe')
 assert.deepEqual(calls,[{name:'search_saved_recipes',args:{p_query:'ginger',p_state:'cooked',p_before:recipe.saved_at,p_before_id:'anchor',p_limit:24}}])
})
test('pagination uses the last visible row, excluding the lookahead row',()=>{
 const rows=Array.from({length:25},(_,i)=>({...recipe,id:'r'+i}))
 const page=model.savedPage(rows)
 assert.equal(page.rows.length,24);assert.equal(page.hasMore,true);assert.equal(page.cursor.id,'r23')
 assert.equal(model.savedPage([]).cursor,null);assert.equal(model.savedPage([]).hasMore,false)
 assert.throws(()=>model.savedPage([{...recipe,cook_state:'unknown'}]))
 assert.throws(()=>model.savedPage(null))
})
function table(result) {
 const calls=[],chain={}
 for(const method of ['update','delete','eq','select'])chain[method]=(...args)=>{calls.push([method,...args]);return chain}
 chain.maybeSingle=async()=>result
 chain.then=(resolve,reject)=>Promise.resolve(result).then(resolve,reject)
 return {calls,client:{from:name=>{calls.push(['from',name]);return chain}}}
}
test('cooking-state updates require a matching server-confirmed account, recipe and value',async()=>{
 const good=table({data:{user_id:'me',recipe_id:recipe.id,cook_state:'cooked'},error:null})
 assert.equal(await model.changeSavedState('me',recipe.id,'cooked',good.client),'cooked')
 assert.ok(good.calls.some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]==='me'))
 for(const data of [null,{user_id:'other',recipe_id:recipe.id,cook_state:'cooked'},{user_id:'me',recipe_id:recipe.id,cook_state:'want_to_cook'}]) {
  await assert.rejects(()=>model.changeSavedState('me',recipe.id,'cooked',table({data,error:null}).client))
 }
})
test('unsave cannot report success for an unconfirmed or inaccessible save',async()=>{
 await model.unsaveRecipe('me',recipe.id,table({data:[{recipe_id:recipe.id}],error:null}).client)
 await assert.rejects(()=>model.unsaveRecipe('me',recipe.id,table({data:[],error:null}).client))
})
test('saved screen shows saved-only search and all three state filters without a home catalogue',()=>{
 const data={rows:[recipe],pending:new Set(),loading:false,hasMore:false,change(){}}
 const Screen=load('SavedScreen.tsx',{'./useSavedRecipes':{default:()=>data},'./BackIcon':{default:()=>null},'./RetryState':{default:()=>null},'./SavedRecipeCard':{default:props=>React.createElement('div',null,props.recipe.title)}}).default
 const html=renderToStaticMarkup(React.createElement(Screen,{userId:'me',onBack(){},onSelectRecipe(){},onRequireLogin(){}}))
 assert.match(html,/Search saved recipes/);assert.match(html,/Want to cook/);assert.match(html,/Cooked/);assert.match(html,/Ginger rice/)
})
