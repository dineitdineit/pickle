import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
const module={exports:{}}
new Function('exports',ts.transpileModule(readFileSync('src/lib/inboxSearch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(module.exports)
const {queryInbox,inboxSearchFilter}=module.exports
test('inbox search filters both cook names and usernames before pagination, with stable recency ordering',()=>{
 const calls=[];const builder={or(value){calls.push(['or',value]);return builder},order(...args){calls.push(['order',...args]);return builder},range(...args){calls.push(['range',...args]);return builder}}
 const client={rpc(name){calls.push(['rpc',name]);return builder}}
 queryInbox(client,' @Jamie ',50)
 assert.deepEqual(calls,[['rpc','get_message_inbox'],['or','display_name.ilike."%Jamie%",username.ilike."%Jamie%"'],['order','latest_id',{ascending:false}],['range',0,50]])
 calls.length=0;queryInbox(client,' ',100);assert.deepEqual(calls,[['rpc','get_message_inbox'],['order','latest_id',{ascending:false}],['range',0,100]])
})
test('inbox search quotes filter punctuation, escapes LIKE operators and bounds its input',()=>{
 assert.equal(inboxSearchFilter(''),null)
 function patterns(query) {
   const filter=inboxSearchFilter(query)
   const parts=[...filter.matchAll(/(display_name|username)\.ilike\.("(?:\\.|[^"\\])*")/g)]
   assert.deepEqual(parts.map(part=>part[1]),['display_name','username'])
   return parts.map(part=>JSON.parse(part[2]))
 }
 assert.deepEqual(patterns('a_b%'),[String.raw`%a\_b\%%`,String.raw`%a\_b\%%`])
 assert.deepEqual(patterns('a",peer_id.not.is.null'),[String.raw`%a",peer\_id.not.is.null%`,String.raw`%a",peer\_id.not.is.null%`])
 assert.equal(patterns('x'.repeat(500))[0].length,82)
 assert.deepEqual(patterns('@요리'),['%요리%','%요리%'])
})

function screenHandler(name,context) {
 const ast=ts.createSourceFile('screen.tsx',readFileSync('src/MessagesScreen.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let fn
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)fn=node.getText(ast);ts.forEachChild(node,visit)}
 visit(ast);assert.ok(fn)
 return new Function(...Object.keys(context),ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText+`;return ${name}`)(...Object.values(context))
}
test('search ignores responses for an older term without replacing results or clearing the new loading state',async()=>{
 for(const stale of [true,false]) {
  let finish
  const state={rows:null,more:null,loading:true,error:''},latest={current:'Jamie'}
  const context={confirmedSendRevision:{current:0},ignore:false,inFlight:false,queued:false,loadedPeer:{current:null},peerId:null,scroll:{current:null},supabase:{},inboxSearch:'Jamie',inboxSearchValue:latest,limit:50,
   queryInbox:()=>new Promise(resolve=>{finish=resolve}),setInbox(value){state.rows=value},setHasMore(value){state.more=value},setLoading(value){state.loading=value},setError(value){state.error=value}}
  const promise=screenHandler('load',context)()
  if(stale)latest.current='Lucy'
  finish({data:Array.from({length:51},(_,id)=>({id}))})
  await promise
  assert.equal(state.rows?.length??null,stale?null:50);assert.equal(state.loading,stale);assert.equal(state.more,stale?null:true)
 }
})
test('editing or clearing inbox search resets pagination and invalidates the previous query immediately',()=>{
 const state={},ref={current:'old'}
 const run=screenHandler('changeInboxSearch',{inboxSearchValue:ref,setInboxSearch(value){state.query=value},setLimit(value){state.limit=value},setLoading(value){state.loading=value},setHasMore(value){state.more=value}})
 for(const query of ['Lucy','']) {run(query);assert.equal(ref.current,query);assert.deepEqual(state,{query,limit:50,loading:true,more:false})}
})

test('server refresh removes a moderated latest message rather than merging its cached body back in',async()=>{
 const rows=[{id:2,sender_id:'peer',recipient_id:'me',body:'Still visible',read_at:'read'}]
 const state={rows:[...rows,{id:3,body:'Now moderated'}]}
 const context={confirmedSendRevision:{current:0},ignore:false,inFlight:false,queued:false,loadedPeer:{current:'peer'},peerId:'peer',scroll:{current:null},userId:'me',limit:50,
  document:{visibilityState:'visible'},requestAnimationFrame(){},setMessages(next){state.rows=typeof next==='function'?next(state.rows):next},setHasMore(){},setCanContact(){},setPeer(){},setError(){},setLoading(){},
  conversationQuery:async()=>({data:rows}),supabase:{async rpc(name){return {data:name==='get_recipe_author'?{id:'peer'}:{user_id:'peer',can_contact:true}}}}}
 await screenHandler('load',context)();assert.deepEqual(state.rows,rows)
})
