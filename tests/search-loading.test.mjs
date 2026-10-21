import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
const source=readFileSync(new URL('../src/SearchScreen.tsx',import.meta.url),'utf8')
const ast=ts.createSourceFile('search.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let callback
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0].getText(ast).includes('recipesLoaded.current'))callback=node.arguments[0].getText(ast);ts.forEachChild(node,visit)}visit(ast)
function setup(){
 const state={calls:0},context={authorId:undefined,editing:true,recipesLoaded:{current:false},recipeImageUrl:()=>'',firstRelation:v=>v,setLoading(v){state.loading=v},setLoadError(v){state.error=v},setRecipes(v){state.recipes=v},supabase:{from(){state.calls++;return {eq(column,value){(state.filters??=[]).push([column,value]);return this},select(){return this},async order(){return state.response??{data:[]}}}}}}
 const js=ts.transpileModule(`const effect=${callback}`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 return {state,context,run(){return new Function(...Object.keys(context),`${js};return effect`)(...Object.values(context))()}}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve))
test('suggestions do not fetch all recipes, and successful empty results are cached',async()=>{
 const h=setup();h.run();await settle();assert.equal(h.state.calls,0);h.context.editing=false;h.run();await settle();assert.equal(h.state.calls,1);assert.deepEqual(h.state.recipes,[]);h.run();await settle();assert.equal(h.state.calls,1)
})
test('failed search loads remain retryable and are not cached as empty results',async()=>{
 const h=setup();h.context.editing=false;h.state.response={error:{message:'offline'}};h.run();await settle();assert.equal(h.state.error,true);assert.equal(h.context.recipesLoaded.current,false);h.state.response={data:[]};h.run();await settle();assert.equal(h.state.error,false);assert.equal(h.context.recipesLoaded.current,true)
})
test('abandoned recipe loads cannot update the current search screen',async()=>{
 const h=setup();h.context.editing=false;const cleanup=h.run();cleanup();await settle();assert.equal(h.state.recipes,undefined);assert.equal(h.context.recipesLoaded.current,false)
})
test('local history storage failures never prevent searching or clearing history',()=>{
 const file=readFileSync(new URL('../src/recentSearches.ts',import.meta.url),'utf8');const module={exports:{}};const storage={getItem(){throw new Error('unavailable')},setItem(){throw new Error('unavailable')},removeItem(){throw new Error('unavailable')}}
 new Function('module','exports','localStorage',ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports,storage)
 assert.deepEqual(module.exports.addRecentSearch(' chicken '),['chicken']);assert.deepEqual(module.exports.clearRecentSearches(),[])
})

test('profile typing fetches only the selected author public recipes',async()=>{
 const h=setup();h.context.authorId='cook';h.run();await settle();assert.equal(h.state.calls,1);assert.deepEqual(h.state.filters,[['author_id','cook'],['is_hidden',false]])
})
