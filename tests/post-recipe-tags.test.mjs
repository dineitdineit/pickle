import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
function load(path,mocks={}) {
 const m={exports:{}}; const js=ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',js)(name=>mocks[name]??require(name),m,m.exports);return m.exports
}
function api(response) {const calls=[];const model=load('lib/postRecipeTags.ts',{'./supabase':{supabase:{async rpc(name,args){calls.push({name,args});return response}}}});return {...model,calls}}
const tag={post_id:'post',recipe_id:'recipe',title:'Fried egg',cover_image:null,author_id:'creator',author_name:'Original cook',author_reacted:false}
test('recipe search is optional, bounded and sends text as an RPC parameter',async()=>{
 const a=api({data:[]});assert.deepEqual(await a.searchPostRecipes(' '),[]);assert.equal(a.calls.length,0)
 await a.searchPostRecipes('x'.repeat(100));assert.equal(a.calls[0].args.p_query.length,80)
 assert.equal(a.calls[0].name,'search_post_recipes');assert.equal(a.calls[0].args.p_offset,0)
 await assert.rejects(()=>api({error:{}}).searchPostRecipes('egg'))
})
test('feed tag loading batches tagged posts and leaves inaccessible links empty',async()=>{
 const a=api({data:[tag]});const rows=await a.attachPostRecipeTags([{id:'post',recipe_id:'recipe'},{id:'blocked',recipe_id:'hidden'},{id:'plain'}])
 assert.deepEqual(a.calls[0].args.p_ids,['post','blocked']);assert.equal(a.calls.length,1)
 assert.equal(rows[0].recipe_tag.title,'Fried egg');assert.equal(rows[1].recipe_tag,null);assert.equal(rows[2].recipe_tag,null)
 const empty=api({});await empty.attachPostRecipeTags([{id:'plain'}]);assert.equal(empty.calls.length,0)
})
test('original cook reaction requires an exact acknowledgement',async()=>{
 const a=api({data:{post_id:'post',reacted:true}});assert.equal(await a.reactToRecipePost('post',true),true)
 for(const response of [{error:{}},{data:{post_id:'other',reacted:true}},{data:{post_id:'post',reacted:false}}])await assert.rejects(()=>api(response).reactToRecipePost('post',true))
})
test('caption picker shows a selected recipe with attribution and a removable tag',()=>{
 const Picker=load('PostRecipePicker.tsx',{'./lib/postRecipeTags':{},'./RecipeImage':{default:'img'},'./lib/recipe':{recipeImageUrl:()=>'/placeholder.svg'}}).default
 const html=renderToStaticMarkup(React.createElement(Picker,{value:{id:'recipe',title:'Fried egg',cover_image:null,author_name:'Original cook'},disabled:false,onChange(){}}))
 assert.match(html,/Made a recipe\?/);assert.match(html,/Fried egg/);assert.match(html,/By Original cook/);assert.match(html,/Remove recipe tag/);assert.match(html,/Change recipe/)
})
test('photo feedback identifies the original recipe and limits reaction controls to its author',()=>{
 const Credit=load('PostRecipeCredit.tsx',{'./lib/postRecipeTags':{},'./RecipeImage':{default:'img'},'./lib/recipe':{recipeImageUrl:()=>'/placeholder.svg'}}).default
 const html=userId=>renderToStaticMarkup(React.createElement(Credit,{tag,userId,onSelectRecipe(){}}))
 assert.match(html('creator'),/Like this photo feedback/);assert.ok(!html('someone-else').includes('Like this photo feedback'))
 assert.match(html(null),/Tagged recipe/);assert.match(html(null),/Fried egg/)
 const liked=renderToStaticMarkup(React.createElement(Credit,{tag:{...tag,author_reacted:true},userId:'poster',onSelectRecipe(){}}));assert.match(liked,/Liked by recipe author/)
})
test('photo feedback notifications have distinct text',()=>{
 const {notificationText}=load('lib/notificationText.ts');assert.equal(notificationText('recipe_photo_post','Fried egg'),'shared a photo after making your recipe, Fried egg.')
})

function extract(path,name,context) {
 const ast=ts.createSourceFile('screen.tsx',readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let source
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)source=n.getText(ast);ts.forEachChild(n,visit)}visit(ast)
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 return new Function(...Object.keys(context),js+`;return ${name}`)(...Object.values(context))
}
test('opening a photo-feedback notification opens its exact post instead of the recipe',()=>{
 const state={};const open=extract('SocialScreen.tsx','openNotice',{userId:null,setOpenedPost:id=>state.post=id,setOpenedPostComment:id=>state.comment=id,window:{scrollTo(){}},onSelectRecipe:()=>state.recipe=true,openCook:()=>state.cook=true})
 open({kind:'recipe_photo_post',post_id:'photo-feedback',post:{id:'photo-feedback'},recipe_id:'recipe',recipe:{title:'Fried egg',is_hidden:false}})
 assert.equal(state.post,'photo-feedback');assert.ok(!state.recipe);assert.ok(!state.cook)
 for(const kind of ['post_comment','post_reply']) {
  open({kind,post_id:'post',post_comment_id:'older-reply',post:{id:'post'}})
  assert.equal(state.post,'post');assert.equal(state.comment,'older-reply')
 }
})
test('author reaction prevents double writes and applies only a confirmed live response',async()=>{
 let finish;const state={},calls=[]
 const context={locked:{current:false},version:{current:1},userId:'creator',tag,reacted:false,setBusy:v=>state.busy=v,setError:v=>state.error=v,setReacted:v=>state.reacted=v,reactToRecipePost:async(...args)=>{calls.push(args);return new Promise(resolve=>finish=resolve)}}
 const react=extract('PostRecipeCredit.tsx','react',context);const pending=react();await react();assert.equal(calls.length,1);assert.deepEqual(calls[0],['post',true]);finish(true);await pending;assert.equal(state.reacted,true);assert.equal(state.busy,false)
 const again=react();context.version.current++;finish(false);await again;assert.equal(state.reacted,true)
})

test('post thumbnails show the tagged recipe title only when a visible tag is supplied',()=>{
 const Tile=load('PostPhotoTile.tsx',{'./RecipeImage':{default:'img'},'./lib/postFeed':{orderedPhotos:p=>p.photos,postAuthorName:()=> 'Cook'}}).default
 const post={id:'post',photos:[{image_path:'photo'}],caption:'Dinner'}
 const render=recipe_tag=>renderToStaticMarkup(React.createElement(Tile,{post:{...post,recipe_tag},onOpen(){}}))
 const tagged=render({...tag,title:'Egg & rice'})
 assert.match(tagged,/post-tile-recipe-tag/);assert.match(tagged,/Egg &amp; rice/);assert.match(tagged,/Tagged recipe:/)
 assert.ok(!render(null).includes('post-tile-recipe-tag'))
})
