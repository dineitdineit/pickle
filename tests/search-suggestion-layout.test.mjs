import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require=createRequire(import.meta.url)
test('suggestions separate recent and recommended icons, show five users and provide more-user search',()=>{
  const source=readFileSync(new URL('../src/SearchSuggestions.tsx',import.meta.url),'utf8')
  const data={keywords:[{keyword:'chicken'},{keyword:'chicken soup'}],users:Array.from({length:8},(_,i)=>({id:String(i),username:`cook${i}`,display_name:`Cook ${i}`,recipe_count:5,view_count:10}))}
  let index=0;const mocks={'react':{...React,useState(initial){return React.useState(index++===0?data:initial)}},'./lib/supabase':{supabase:{}},'./recentSearches':{getRecentSearches:()=>['chicken'],removeRecentSearch:()=>[]}}
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const module={exports:{}};new Function('require','module','exports',js)(name=>name === "./RecipeImage" ? {default:"img"} : name.endsWith('.css')?{}:name === "./RecipeImage" ? {default:"img"} : name === "./lib/imagePrivacy" ? {privateImage: async file => file} : mocks[name]??require(name),module,module.exports)
  const html=renderToStaticMarkup(React.createElement(module.exports.default,{query:'chicken',onKeyword(){},onUser(){},onMoreUsers(){}}))
  assert.match(html,/M12 7v5l3 2/);assert.match(html,/m16 16 5 5/);assert.match(html,/Remove chicken from recent searches/)
  assert.equal((html.match(/class="search-cook"/g)??[]).length,5);assert.match(html,/Search more users/);assert.ok(!html.includes('Cook 5'));assert.ok(html.indexOf('Recent searches')<html.indexOf('Popular search keywords'));assert.ok(html.indexOf('Popular search keywords')<html.indexOf('Matching cooks'))
})
