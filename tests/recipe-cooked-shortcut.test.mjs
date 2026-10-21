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
const draftMocks={'./usePostDraft':{default:()=>({mode:'editing',openGallery:false,status:'empty',memoryOnly:false})},'./lib/postDrafts':{hasPostDraftContent:()=>false}}
const recipe={id:'recipe-one',title:'Egg fried rice',cover_image:null,author_name:''}
test('I cooked this renders without a feed or result count and opens the exact viewed recipe',()=>{
 const Shortcut=load('RecipeCookedShortcut.tsx').default
 const opened=[];const tree=Shortcut({recipe,onCreate:value=>opened.push(value)})
 assert.match(renderToStaticMarkup(tree),/I cooked this/)
 tree.props.onClick();assert.deepEqual(opened,[recipe])
})
test('recipe shortcut preselects the composer tag through photo selection and caption review',()=>{
 for(const stage of ['select','caption']) {
  let index=0,seen
  const react={...React,useState(initial){return React.useState(index++===0?stage:initial)}}
  const Composer=load('PostComposer.tsx',{...draftMocks,
   react,'./BackIcon':{default:()=>null},'./PostRecipePicker':{default:props=>{seen=props;return React.createElement('div',null,props.value?.title??'No recipe')}},
   './PhotoCropDialog':{default:()=>null},'./ContentConsent':{},'./lib/imagePrivacy':{},'./lib/postPhoto':{},'./lib/photoPosts':{},'./lib/supabase':{},
  }).default
  const html=renderToStaticMarkup(React.createElement(Composer,{userId:'viewer',initialRecipe:recipe,onClose(){},onShared(){}}))
  assert.match(html,/Egg fried rice/)
  if(stage==='caption')assert.deepEqual(seen.value,recipe)
  else assert.match(html,/Tagged recipe:/)
 }
})
test('generic composer has no inherited recipe and tag review still allows removal',()=>{
 let index=0,seen
 const react={...React,useState(initial){return React.useState(index++===0?'caption':initial)}}
 const Composer=load('PostComposer.tsx',{...draftMocks,
  react,'./BackIcon':{default:()=>null},'./PostRecipePicker':{default:props=>{seen=props;return null}},
  './PhotoCropDialog':{default:()=>null},'./ContentConsent':{},'./lib/imagePrivacy':{},'./lib/postPhoto':{},'./lib/photoPosts':{},'./lib/supabase':{},
 }).default
 renderToStaticMarkup(React.createElement(Composer,{userId:'viewer',onClose(){},onShared(){}}))
 assert.equal(seen.value,null);assert.equal(typeof seen.onChange,'function')
})
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
function handler(name,loggedIn) {
 let source
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)source=node.getText(ast);ts.forEachChild(node,visit)}visit(ast)
 const state={pendingRecipePost:{current:recipe},authUser:loggedIn?{id:'viewer'}:null,composerRecipe:recipe}
 const context={pendingRecipePost:state.pendingRecipePost,authUser:state.authUser,setComposerRecipe:value=>state.composerRecipe=value,setCreateOpen(){},setComposingPost:value=>state.open=value,navigate:value=>state.navigation=value,window:{scrollTo(){}}}
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 return {state,run:new Function(...Object.keys(context),`${js};return ${name}`)(...Object.values(context))}
}
test('authenticated shortcut seeds the tag; guest shortcut retains it for sign-in',()=>{
 const signedIn=handler('openRecipePostComposer',true);signedIn.run(recipe)
 assert.equal(signedIn.state.open,true);assert.deepEqual(signedIn.state.composerRecipe,recipe)
 const guest=handler('openRecipePostComposer',false);guest.run(recipe)
 assert.equal(guest.state.navigation,4);assert.equal(guest.state.open,undefined);assert.deepEqual(guest.state.pendingRecipePost.current,recipe)
})
test('generic post entry clears the prior recipe shortcut intent',()=>{
 const h=handler('openPostComposer',true);h.run()
 assert.equal(h.state.pendingRecipePost.current,null);assert.equal(h.state.composerRecipe,null);assert.equal(h.state.open,true)
})
