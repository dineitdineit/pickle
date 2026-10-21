import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require=createRequire(import.meta.url)
const source=readFileSync(new URL('../src/RecipeAuthorCard.tsx',import.meta.url),'utf8')
const ast=ts.createSourceFile('author.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const functions=new Map()
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(ast));ts.forEachChild(node,visit)}
visit(ast)
function handler(name,response,overrides={}) {
  const state={author:{id:'cook',following:true,notifications_enabled:false,follower_count:3}},calls=[]
  const context={userId:'me',authorId:'cook',author:state.author,guard:{current:false},generation:{current:1},loading:false,onRequireLogin(){state.login=true},setBusy(v){state.busy=v},setMessage(v){state.message=v},setAuthor(fn){state.author=fn(state.author)},supabase:{async rpc(name,args){calls.push({name,args});return response}},...overrides}
  const js=ts.transpileModule(functions.get(name),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
  return {state,calls,run:new Function(...Object.keys(context),`${js};return ${name}`)(...Object.values(context))}
}
test('author unfollow disables recipe alerts and updates follower count only after confirmation',async()=>{
  const h=handler('changeFollow',{data:{user_id:'cook',following:false}});await h.run();assert.equal(h.state.author.following,false);assert.equal(h.state.author.notifications_enabled,false);assert.equal(h.state.author.follower_count,2)
})
test('author recipe alert button persists a confirmed preference and preserves failures',async()=>{
  for(const success of [true,false]){
    const h=handler('changeNotifications',success?{data:{user_id:'cook',notifications_enabled:true}}:{error:{code:'42501'}});await h.run();assert.equal(h.state.author.notifications_enabled,success);assert.equal(h.calls[0].name,'set_author_recipe_notifications');assert.equal(h.calls[0].args.p_enabled,true);if(!success)assert.match(h.state.message,/Could not/)
  }
})
test('recipe alerts require a followed author and an authenticated user',async()=>{
  const guest=handler('changeNotifications',{}, {userId:null});await guest.run();assert.equal(guest.state.login,true);assert.equal(guest.calls.length,0)
  const unFollowed=handler('changeNotifications',{}, {author:{following:false}});await unFollowed.run();assert.equal(unFollowed.calls.length,0)
  const own=handler('changeFollow',{}, {userId:'cook'});await own.run();assert.equal(own.calls.length,0)
})
function render(author,userId='me',busy=null) {
  let index=0
  const mockReact={...React,useState(initial){const value=index++;return React.useState(value===0?author:value===1?false:value===4?busy:initial)}}
  const module={exports:{}}
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
  new Function('require','module','exports',js)(name=>name==='react'?mockReact:name === "./RecipeImage" ? {default:"img"} : name.endsWith('.css')?{}:name==='./lib/supabase'?{supabase:{}}:require(name),module,module.exports)
  return renderToStaticMarkup(React.createElement(module.exports.default,{authorId:'cook',userId,onOpenAuthor(){},onRequireLogin(){}}))
}
test('author card shows avatar, name, followers, follow and notification state',()=>{
  const html=render({id:'cook',display_name:'Jamie',avatar_url:'https://example.com/avatar.png',follower_count:3,following:true,notifications_enabled:true})
  assert.match(html,/avatar\.png/);assert.match(html,/Jamie/);assert.match(html,/3 followers/);assert.match(html,/Unfollow/);assert.match(html,/Turn off new recipe alerts from Jamie/);assert.match(html,/aria-pressed="true"/)
  const own=render({id:'cook',display_name:'Jamie',follower_count:1},'cook');assert.match(own,/1 follower/);assert.ok(!own.includes('Your recipe'));assert.match(own,/class="recipe-author-follow" disabled=""/);assert.match(own,/class="recipe-author-bell" disabled=""/)
})

test('author card notification saves do not dim the Unfollow button',()=>{
 const html=render({id:'cook',display_name:'Jamie',follower_count:3,following:true,notifications_enabled:true},'me','notifications')
 assert.match(html,/<button[^>]*class="recipe-author-follow is-following"[^>]*aria-disabled="true"[^>]*>Unfollow<\/button>/)
 const follow=html.match(/<button[^>]*class="recipe-author-follow is-following"[^>]*>/)[0]
 assert.ok(!follow.includes(' disabled='))
})

test('author bell saves do not toggle native disabled opacity',()=>{
 const html=render({id:'cook',display_name:'Jamie',follower_count:3,following:true,notifications_enabled:true},'me','notifications')
 const bell=html.match(/<button[^>]*class="recipe-author-bell is-enabled"[^>]*>/)[0]
 assert.ok(!bell.includes(' disabled='));assert.match(bell,/aria-disabled="true"/);assert.match(bell,/aria-pressed="true"/)
})
