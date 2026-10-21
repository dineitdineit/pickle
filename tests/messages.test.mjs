import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require=createRequire(import.meta.url)
const timeModule={exports:{}}
new Function('exports',ts.transpileModule(readFileSync(new URL('../src/lib/timeAgo.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(timeModule.exports)
const {timeAgo}=timeModule.exports
const screen=readFileSync(new URL('../src/MessagesScreen.tsx',import.meta.url),'utf8')
const ast=ts.createSourceFile('messages.tsx',screen,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let handler
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='submitMessage')handler=node.getText(ast);ts.forEachChild(node,visit)}visit(ast)
function setup(){
 const state={draft:' Hello ',messages:[]},calls=[]
 const context={confirmedSendRevision:{current:0},requireContentConsent:async()=>true,photo:null,setPhoto(){},peerId:'peer',peer:{id:'peer'},guard:{current:false},draft:state.draft,pending:{current:null},generation:{current:1},userId:'me',crypto:{randomUUID:()=> 'client-one'},scroll:{current:null},requestAnimationFrame(){},refreshChat:{current(){}},setBusy(v){state.busy=v},setSendError(v){state.error=v},setDraft(v){state.draft=v},setMessages(fn){state.messages=fn(state.messages)},async sendMessage(peer,body,client,sender){calls.push({peer,body,client,sender});if(state.fail)throw new Error('offline');return {id:10,body}}}
 const js=ts.transpileModule(handler,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 return {state,calls,context,run(){return new Function(...Object.keys(context),`${js};return submitMessage`)(...Object.values(context))()}}
}
test('confirmed send adds a single message and clears the draft',async()=>{
 const h=setup();await h.run();assert.equal(h.state.messages.length,1);assert.equal(h.state.draft,'');assert.equal(h.context.pending.current,null);assert.equal(h.calls[0].body,'Hello')
})
test('uncertain delivery preserves the text and retries with the same idempotency key',async()=>{
 const h=setup();h.state.fail=true;await h.run();assert.equal(h.state.draft,' Hello ');assert.equal(h.state.messages.length,0);assert.match(h.state.error,/retry/);h.state.fail=false;await h.run();assert.equal(h.calls[0].client,h.calls[1].client);assert.equal(h.state.messages.length,1)
})
test('duplicate clicks and late responses cannot send or mutate a new conversation',async()=>{
 const busy=setup();busy.context.guard.current=true;await busy.run();assert.equal(busy.calls.length,0)
 const h=setup();h.context.sendMessage=async()=>{h.context.generation.current++;return {id:1}};await h.run();assert.equal(h.state.messages.length,0);assert.equal(h.state.draft,' Hello ')
})
const lib=readFileSync(new URL('../src/lib/messages.ts',import.meta.url),'utf8')
function library(supabase){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(lib,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(()=>({supabase}),module,module.exports);return module.exports}
test('delivery is confirmed only for the exact sender, recipient, text and client id',async()=>{
 const data={id:1,sender_id:'me',recipient_id:'peer',body:'Hello',client_id:'token'}
 for(const field of ['sender_id','recipient_id','body','client_id']){
  const api=library({async rpc(){return {data:{...data,[field]:'wrong'}}}});await assert.rejects(api.sendMessage('peer','Hello','token','me'))
 }
 const api=library({async rpc(){return {data}}});assert.equal((await api.sendMessage('peer',' Hello ','token','me')).id,1);await assert.rejects(api.sendMessage('me','Hello','token','me'));await assert.rejects(api.sendMessage('peer',' ','token','me'))
})
test('conversation reads constrain both parties and request one extra row for pagination',()=>{
 const calls=[];const builder=new Proxy({}, {get(_,method){return(...args)=>{calls.push([method,...args]);return builder}}})
 library({from:()=>builder}).conversationQuery('me','peer',50)
 assert.deepEqual(calls.filter(c=>c[0]==='in'),[['in','sender_id',['me','peer']],['in','recipient_id',['me','peer']]])
 assert.deepEqual(calls.at(-1),['limit',51])
})
function render(chat){
 let index=0
 const peer={id:'peer',display_name:'Jamie',username:'jamie'}
 const values={0:chat?'peer':null,1:chat?peer:null,2:[{...peer,peer_id:'peer',latest_body:'Hello',latest_at:'2026-10-13T03:00:00Z',unread_count:2}],3:[{id:1,sender_id:'me',body:'My message',created_at:'2026-10-13T03:00:00Z',read_at:'2026-10-13T03:01:00Z'},{id:2,sender_id:'peer',body:'Reply',created_at:'2026-10-13T03:02:00Z',read_at:null}],6:false}
 const mockReact={...React,useState(initial){const slot=index++;return React.useState(slot in values?values[slot]:initial)}}
 const mocks={'./lib/inboxSearch':{},'./lib/timeAgo':{timeAgo},'./ContentConsent':{requireContentConsent:async()=>true},'react':mockReact,'./BackIcon':{default:()=>null},'./lib/supabase':{supabase:{}},'./lib/messages':{},'./MessagePhoto':{default:()=>null},'./lib/chatPhotos':{}}
 const module={exports:{}}
 new Function('require','module','exports',ts.transpileModule(screen,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>name === "./RecipeImage" ? {default:"img"} : name.endsWith('.css')?{}:name === "./RecipeImage" ? {default:"img"} : name === "./lib/imagePrivacy" ? {privateImage: async file => file} : (name==='./ReportButton'?{ReportDialog:()=>null}:mocks[name])??require(name),module,module.exports)
 return renderToStaticMarkup(React.createElement(module.exports.default,{userId:'me',onBack(){}}))
}
test('inbox identifies unread conversations without numeric badges and keeps previews beside relative times',()=>{
 const inbox=render(false);assert.match(inbox,/role="search"/);assert.match(inbox,/Search conversations by name or username/);assert.match(inbox,/messages-inbox-entry is-unread/);assert.ok(!inbox.includes('2 unread messages'));assert.ok(!inbox.includes('class="messages-unread"'));assert.match(inbox,/Jamie/);assert.match(inbox,/Hello/);assert.match(inbox,/<time dateTime="2026-10-13T03:00:00Z"[^>]*>[^<]+ ago<\/time>/)
 const chat=render(true);assert.match(chat,/My message/);assert.match(chat,/Reply/);assert.match(chat,/Read/);assert.match(chat,/<input type="text" aria-label="Message" enterKeyHint="send"/);assert.ok(!chat.includes("<textarea"));assert.ok(!chat.includes('type="submit"'))
})

test('relative inbox dates use natural singular/plural units and handle invalid or future dates',()=>{
 const now=Date.parse('2026-10-16T12:00:00Z')
 for(const [seconds,expected] of [[0,'Just now'],[59,'Just now'],[60,'1 minute ago'],[180,'3 minutes ago'],[3600,'1 hour ago'],[86400,'1 day ago'],[259200,'3 days ago'],[604800,'1 week ago'],[2592000,'1 month ago'],[31536000,'1 year ago']]) assert.equal(timeAgo(new Date(now-seconds*1000).toISOString(),now),expected)
 assert.equal(timeAgo('invalid',now),'');assert.equal(timeAgo(new Date(now+60000).toISOString(),now),'Just now')
})

test('Enter sends once while IME composition Enter only commits text',()=>{
 let fn
 function find(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='handleMessageKeyDown')fn=node.getText(ast);ts.forEachChild(node,find)}find(ast)
 const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 for(const [key,composing,isComposing,keyCode,expected] of [['Enter',false,false,13,1],['Enter',true,false,13,0],['Enter',false,true,13,0],['Enter',false,false,229,0],['a',false,false,65,0]]){
  let calls=0,prevented=false
  const run=new Function('composing','submitMessage',`${js};return handleMessageKeyDown`)({current:composing},()=>{calls++})
  run({key,nativeEvent:{isComposing,keyCode},preventDefault(){prevented=true}})
  assert.equal(calls,expected);assert.equal(prevented,key==='Enter')
 }
})

test('all message entry paths suppress the app bottom navigation',()=>{
 const css=readFileSync(new URL('../src/messages.css',import.meta.url),'utf8')
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 assert.match(css,/body:has\(\.messages-screen\) \.app-bottom-nav\s*\{\s*display:\s*none/)
 assert.match(app,/className="app-bottom-nav /)
 assert.ok(!app.slice(app.indexOf('if (showMessages)'),app.indexOf('if (editingRecipeId)')).includes('{NavBar}'))
})
