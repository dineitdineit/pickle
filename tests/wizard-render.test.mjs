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
 new Function('require','module','exports','localStorage',js)(name=>name === './lib/nativeNavigation' ? {useAndroidBack(){}} : name === "./RecipeImage" ? {default:"img"} : name.endsWith('.css')?{}:name === "./RecipeImage" ? {default:"img"} : name === "./lib/imagePrivacy" ? {privateImage: async file => file} : mocks[name]??require(name),module,module.exports,{getItem(){return JSON.stringify(mocks.cache)}})
 return module.exports
}
const helpers=load('lib/submissions.ts',{'./video':load('lib/video.ts')})
const preview=load('RecipeSubmissionPreview.tsx',{'./lib/recipe':{recipeImageUrl:p=>p}})
function render(page, checkedPages=[], editInput=()=>{}) {
 const input=helpers.newRecipeInput();input.title='Retained title';input.ingredients[0].group_key='group';editInput(input)
 let stateIndex=0
 const component=load('RecipeUploadScreen.tsx',{'react':{...React,useState(initial){const index=stateIndex++;return React.useState(index===7?checkedPages:index===6&&checkedPages.length?helpers.validateRecipeInput(input,true,page):initial)}},'./ContentConsent':{requireContentConsent:async()=>true},'./lib/submissions':helpers,'./lib/recipe':{recipeImageUrl:p=>p},'./lib/supabase':{supabase:{}},'./RecipeSubmissionPreview':preview,'./RecipeTextAssistant':{default:()=>React.createElement('div',null,'Write it your way')},'./PhotoCropDialog':{default:()=>null},'./useStepReorder':{default:()=>({list:{current:null},motion:null,announcement:'',style(){},start(){},move(){},finish(){},keyboard(){}})},'./lib/stepReorder':load('lib/stepReorder.ts'),cache:{id:'draft',input,page,version:null}}).default
 return renderToStaticMarkup(React.createElement(component,{userId:'user',submission:null,tags:[],onBack(){},onSaved(){}}))
}
for(const page of [0,1,2])test(`wizard page ${page+1} renders with draft/cancel and correct navigation`,()=>{
 const html=render(page)
 assert.ok(html.includes('>Cancel</button>'));assert.ok(html.includes('>Save draft</button>'))
 assert.equal(!/aria-label="Previous page"[^>]*disabled/.test(html),page>0)
 assert.equal(html.includes('aria-label="Next page"'),page<2);assert.equal(html.includes('aria-label="Publish"'),page===2)
 if(page===0){assert.ok(html.indexOf('aria-label="Recipe photo"')<html.indexOf('Recipe name'));assert.ok(html.includes('Retained title'));assert.ok(html.includes('recipe-tag-input'))}
 if(page===1){assert.ok(html.includes('Add ingredient group'));assert.ok(html.includes('Ingredients photo'));assert.ok(html.includes('Servings'))}
 if(page===2){assert.ok(html.includes('Upload multiple step photos'));assert.ok(html.includes('multiple=""'));assert.ok(!html.includes('Finished dish photo'));assert.ok(html.includes('Finish &amp; serve step'));assert.ok(html.includes('Add step'))}
})
test('missing requirements appear beside field labels only after validation and disappear for completed fields',()=>{
 assert.ok(!render(0).includes('data-required-error'))
 const missing=render(0,[0],input=>{input.title=' '})
 assert.equal((missing.match(/data-required-error/g)??[]).length,3)
 assert.ok(missing.includes('Recipe photo * <span class="submission-required-error"'))
 assert.ok(!missing.includes('submission-errors'));assert.ok(!missing.includes('Recipe photo is required.'))
 const complete=render(0,[0],input=>{input.cover_image='photo';input.short_description='Description'})
 assert.ok(!complete.includes('data-required-error'))
 for(const page of [1,2])assert.ok(render(page,[page]).includes('data-required-error'))
})
test('non-required validation errors still display an explanation',()=>{
 const html=render(0,[0],input=>{input.video_url='invalid'})
 assert.ok(html.includes('submission-errors'));assert.ok(html.includes('Enter a valid video link.'))
})
