import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require=createRequire(import.meta.url)
function load(path,mocks={}) {
 const source=readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const module={exports:{}}
 new Function('require','module','exports','localStorage',js)(name=>name.endsWith('.css')?{}:mocks[name]??require(name),module,module.exports,{getItem(){return JSON.stringify(mocks.cache)}})
 return module.exports
}
const helpers=load('lib/submissions.ts')
const preview=load('RecipeSubmissionPreview.tsx',{'./lib/recipe':{recipeImageUrl:p=>p}})
function render(page,submission=null){const input=helpers.newRecipeInput();input.title='Retained title';input.ingredients[0].group_key='group';const component=load('RecipeUploadScreen.tsx',{'./lib/submissions':helpers,'./lib/recipe':{recipeImageUrl:p=>p},'./lib/supabase':{supabase:{}},'./RecipeSubmissionPreview':preview,cache:{id:'draft',input,page,version:null}}).default;return renderToStaticMarkup(React.createElement(component,{userId:'user',submission,tags:[],onBack(){},onSaved(){}}))}
for(const page of [0,1,2])test(`wizard page ${page+1} renders with draft/cancel and correct navigation`,()=>{const html=render(page);assert.ok(html.includes('>Cancel</button>'));assert.ok(html.includes('>Save draft</button>'));assert.equal(html.includes('>Previous</button>'),page>0);assert.equal(html.includes('>Next →</button>'),page<2);assert.equal(html.includes('>Publish</button>'),page===2);if(page===0){assert.ok(html.indexOf('aria-label="Recipe photo"')<html.indexOf('Recipe name'));assert.ok(html.includes('Retained title'));assert.ok(html.includes('recipe-tag-input'))}if(page===1){assert.ok(html.includes('Add ingredient group'));assert.ok(html.includes('Ingredients photo'));assert.ok(html.includes('Servings'))}if(page===2){assert.ok(html.includes('Upload multiple step photos'));assert.ok(html.includes('multiple=""'));assert.ok(html.includes('Finished dish photo'));assert.ok(html.includes('Add step'))}})
