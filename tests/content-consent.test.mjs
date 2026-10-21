import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {test} from 'node:test'
import ts from 'typescript'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const require=createRequire(import.meta.url)
const policy={user_id:'me',version:'2026-10-14',accepted:false,terms:[{title:'Terms',body:'Terms text'}],content_policy:[{title:'Safety',body:'Safety text'}]}
function load(rpc,extras={}) {
 const source=readFileSync(new URL('../src/ContentConsent.tsx',import.meta.url),'utf8'),module={exports:{}}
 const sdk={rpc,auth:{onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}}}
 new Function('require','module','exports','document',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>name === "./RecipeImage" ? {default:"img"} : name.endsWith('.css')?{}:name==='./lib/supabase'?{supabase:sdk}:name==='react-dom/client'?{createRoot:extras.createRoot??(()=>{throw Error('Unexpected dialog')})}:require(name),module,module.exports,extras.document??{})
 return module.exports
}
test('agreement requires both choices and a confirmed account and policy version',async()=>{
 let calls=0
 const api=load(async(name,args)=>{calls++;assert.equal(name,'accept_content_policy');assert.deepEqual(args,{p_version:policy.version,p_terms_accepted:true,p_content_accepted:true});return {data:{...policy,accepted:true},error:null}})
 await assert.rejects(api.acceptContentPolicy(policy,true,false));assert.equal(calls,0)
 await api.acceptContentPolicy(policy,true,true);assert.equal(calls,1)
 for(const data of [{...policy,user_id:'other',accepted:true},{...policy,version:'new',accepted:true},policy,null]) {
  await assert.rejects(load(async()=>({data,error:null})).acceptContentPolicy(policy,true,true))
 }
 await assert.rejects(load(async()=>({data:null,error:{code:'40001'}})).acceptContentPolicy(policy,true,true),/policy has changed/)
})
test('accepted accounts recheck the server each time and never inherit another account agreement',async()=>{
 let calls=0
 const api=load(async()=>{calls++;return {data:{...policy,accepted:true},error:null}})
 assert.equal(await api.requireContentConsent('me'),true);assert.equal(await api.requireContentConsent('me'),true);assert.equal(calls,2)
 await assert.rejects(api.requireContentConsent('other'))
})
test('concurrent registration requests share one dialog and cancellation resolves without agreement',async()=>{
 let calls=0,rendered,removed=0
 const api=load(async()=>{calls++;return {data:policy,error:null}},{document:{activeElement:{focus(){}},createElement(){return {remove(){removed++}}},body:{appendChild(){}}},createRoot(){return {render(element){rendered=element},unmount(){}}}})
 const first=api.requireContentConsent('me'),second=api.requireContentConsent('me')
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.ok(rendered)
 rendered.props.onDone(false)
 assert.equal(await first,false);assert.equal(await second,false);assert.equal(removed,1)
})
test('dialog displays both complete documents with unchecked choices and a disabled continue action',()=>{
 const api=load(async()=>({}))
 const html=renderToStaticMarkup(React.createElement(api.ContentConsentDialog,{policy,onDone(){}}))
 assert.match(html,/Terms text/);assert.match(html,/Safety text/);assert.match(html,/Policy version: 2026-10-14/)
 assert.equal((html.match(/type="checkbox"/g)??[]).length,2);assert.ok(!html.includes(' checked='))
 assert.match(html,/<button type="submit" disabled="">Agree and continue/)
})

test('declining comment and reply consent preserves text and releases the write guard',async()=>{
 const source=readFileSync(new URL('../src/RecipeComments.tsx',import.meta.url),'utf8')
 const ast=ts.createSourceFile('comments.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let fn
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='postComment')fn=node.getText(ast);ts.forEachChild(node,visit)}
 visit(ast)
 for(const parent of [null,'parent']) {
  const state={},context={userId:'me',text:'Keep comment',replyText:'Keep reply',posting:false,commentMutation:{current:false},setPosting(v){state.posting=v},setMessage(){},requireContentConsent:async()=>false,supabase:{from(){throw Error('Unexpected write')}},onRequireLogin(){},setText(){throw Error('Lost comment')},setReplyText(){throw Error('Lost reply')},setReplyingToId(){},recipeId:'recipe',loadComments(){}}
  const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
  await new Function(...Object.keys(context),`${js};return postComment`)(...Object.values(context))(parent)
  assert.equal(context.commentMutation.current,false);assert.equal(state.posting,false)
 }
})
