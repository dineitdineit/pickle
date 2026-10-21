import { RecipeSummaryCard } from "./helpers/recipe-summary.mjs"
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require=createRequire(import.meta.url)
const source=readFileSync(new URL('../src/SearchScreen.tsx',import.meta.url),'utf8')
const ast=ts.createSourceFile('search.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let submit
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='searchRecipes')submit=node.getText(ast);ts.forEachChild(node,visit)}
visit(ast)
test('keyboard or suggested keyword submission commits the recipe query and closes suggestions',()=>{
  const state={};const context={authorId:undefined,query:'Chicken',PAGE_SIZE:8,setQuery(v){state.query=v},setSubmittedQuery(v){state.submitted=v},setEditing(v){state.editing=v},setShowAllUsers(v){state.allUsers=v},setVisibleCount(v){state.visible=v},addRecentSearch(v){state.recent=v}}
  const js=ts.transpileModule(submit,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
  const fn=new Function(...Object.keys(context),`${js};return searchRecipes`)(...Object.values(context));fn();assert.equal(state.submitted,'Chicken');assert.equal(state.editing,false);assert.equal(state.visible,8);fn('Adobo');assert.equal(state.query,'Adobo');assert.equal(state.recent,'Adobo')
})
function render(editing, authorId) {
  let index=0
  const recipes=[{id:'chicken',title:'Chicken soup',view_count:321,like_count:42,short_description:'A quick comforting soup',cover_image:null,difficulty:'Easy',total_time_minutes:20,ingredientNames:[],tagNames:[]},{id:'water',title:'Water recipe',difficulty:'Easy',total_time_minutes:5,ingredientNames:[],tagNames:[]}]
  const mockReact={...React,useState(initial){const i=index++;return React.useState(i===1?recipes:i===2?false:i===3?'Chicken':i===4?editing:initial)}}
  const mocks={'react':mockReact,'./RecipeSummaryCard':{default:RecipeSummaryCard},'./lib/supabase':{supabase:{}},'./RecipeVideo':{VideoBadge:()=>null},'./lib/format':{formatTime:()=>''},'./lib/recipe':{recipeImageUrl:()=>'',firstRelation:v=>v},'./recentSearches':{addRecentSearch(){}},'./SearchSuggestions':{default:()=>React.createElement('div',null,'Suggested cooks')},'./RankedSearchUsers':{default:()=>null}}
  const module={exports:{}};const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
  new Function('require','module','exports',js)(name=>name === "./RecipeImage" ? {default:"img"} : name === "./lib/imagePrivacy" ? {privateImage: async file => file} : mocks[name]??require(name),module,module.exports)
  return renderToStaticMarkup(React.createElement(module.exports.default,{authorId,query:'Water',setQuery(){},onBack(){},onSelectRecipe(){},onSelectUser(){}}))
}
test('typing shows suggestions and recipe results remain tied to the last submitted query',()=>{
  assert.match(render(true),/Suggested cooks/);assert.ok(!render(true).includes('Chicken soup'))
  const result=render(false);assert.match(result,/Chicken soup/);assert.ok(!result.includes('Water recipe'));assert.ok(!result.includes('Suggested cooks'));assert.match(result,/enterKeyHint="search"/)
})

test('profile search uses the shared results layout and excludes user suggestions',()=>{
 const input=render(true,'cook');assert.ok(!input.includes('Suggested cooks'));assert.match(input,/aria-label="Recipe suggestions"/);assert.match(input,/Search this cook&#x27;s recipes/)
 const result=render(false,'cook');assert.match(result,/Chicken soup/);assert.match(result,/recipe-summary-list/);assert.ok(!result.includes('Suggested cooks'))
})
test('profile submissions do not save recent searches',()=>{
 const state={};const context={authorId:'cook',query:'Chicken',PAGE_SIZE:8,setQuery(){},setSubmittedQuery(v){state.submitted=v},setEditing(){},setShowAllUsers(){},setVisibleCount(){},addRecentSearch(){state.logged=true}}
 const js=ts.transpileModule(submit,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 new Function(...Object.keys(context),`${js};return searchRecipes`)(...Object.values(context))();assert.equal(state.submitted,'Chicken');assert.equal(state.logged,undefined)
})

test('search recipes use the featured card with views, likes and a one-line description',()=>{
 const html=render(false);assert.match(html,/recipe-summary-card/);assert.match(html,/321 views · 42 likes/);assert.match(html,/A quick comforting soup/);assert.ok(!html.includes('Filipino'))
})
