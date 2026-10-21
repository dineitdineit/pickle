import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {createRequire} from "node:module"
import {test} from "node:test"
import ts from "typescript"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"
const require=createRequire(import.meta.url)
function handler(file,name,context) {
 const source=readFileSync(new URL(`../src/${file}`,import.meta.url),"utf8")
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let fn
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)fn=node.getText(ast);ts.forEachChild(node,visit)}
 visit(ast);assert.ok(fn)
 const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 return new Function(...Object.keys(context),`${js};return ${name}`)(...Object.values(context))
}
function blockAttempt(reply,blocked=false) {
 const state={changed:null,error:"",calls:0,events:0}
 const context={targetId:"other",userId:"me",blocked,guard:{current:false},alive:{current:true},onRequireLogin(){},
  setBusy(){},onBusy(){},setError(value){state.error=value},onChanged(value){state.changed=value},setConfirm(){},setOpen(){},trigger:{current:{focus(){}}},
  window:{dispatchEvent(){state.events++}},Event,
  supabase:{async rpc(name,args){state.calls++;assert.equal(name,"set_user_block");assert.deepEqual(args,{p_user_id:"other",p_blocked:!blocked});return typeof reply==="function"?reply():reply}}
 }
 return {state,context,run:handler("UserActionsMenu.tsx","changeBlock",context)}
}
test("profile blocking applies only a confirmed target and contact restriction",async()=>{
 const attempt=blockAttempt({data:{user_id:"other",blocked:true,can_contact:false},error:null})
 await attempt.run();assert.equal(attempt.state.changed.blocked,true);assert.equal(attempt.state.events,1)
 for(const data of [null,{user_id:"wrong",blocked:true,can_contact:false},{user_id:"other",blocked:false,can_contact:false},{user_id:"other",blocked:true,can_contact:true}]) {
  const attempt=blockAttempt({data,error:null});await attempt.run();assert.equal(attempt.state.changed,null);assert.ok(attempt.state.error);assert.equal(attempt.context.guard.current,false)
 }
})
test("unblocking keeps a reverse block restriction and errors do not claim success",async()=>{
 const attempt=blockAttempt({data:{user_id:"other",blocked:false,can_contact:false},error:null},true)
 await attempt.run();assert.equal(attempt.state.changed.can_contact,false)
 const failure=blockAttempt(()=>{throw new Error("Network")});await failure.run();assert.equal(failure.state.changed,null);assert.ok(failure.state.error)
})
test("double block clicks send one write and closed profile ignores late results",async()=>{
 let finish
 const attempt=blockAttempt(()=>new Promise(resolve=>{finish=resolve}))
 const first=attempt.run();await attempt.run();assert.equal(attempt.state.calls,1)
 attempt.context.alive.current=false;finish({data:{user_id:"other",blocked:true,can_contact:false},error:null})
 await first;assert.equal(attempt.state.changed,null);assert.equal(attempt.state.events,0)
})
test("blocked-list unblock removes only the confirmed row",async()=>{
 for(const good of [true,false]) {
  let rows=[{blocked_id:"a"},{blocked_id:"b"}],error="",events=0
  const context={guard:{current:false},generation:{current:1},setBusy(){},setError(value){error=value},setRows(fn){rows=fn(rows)},window:{dispatchEvent(){events++}},Event,
   supabase:{async rpc(){return {data:{user_id:good?"a":"wrong",blocked:false},error:null}}}}
  await handler("BlockedUsersScreen.tsx","unblock",context)("a")
  assert.deepEqual(rows.map(row=>row.blocked_id),good?["b"]:["a","b"]);assert.equal(events,good?1:0);assert.equal(Boolean(error),!good)
 }
})
function moduleOf(file,mocks={}) {
 const module={exports:{}},source=readFileSync(new URL(`../src/${file}`,import.meta.url),"utf8")
 new Function("require","module","exports",ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>name.endsWith(".css")?{}:name === "./RecipeImage" ? {default:"img"} : name === "./lib/imagePrivacy" ? {privateImage: async file => file} : mocks[name]??require(name),module,module.exports)
 return module.exports.default
}
test("profile options show Block and red Report with separate speech-bubble icons",()=>{
 const Icon=moduleOf("UserSafetyIcon.tsx")
 let index=0
 const mockReact={...React,useState(initial){return React.useState(index++===0?true:initial)}}
 const Menu=moduleOf("UserActionsMenu.tsx",{"react":mockReact,"./ReportButton":{ReportDialog:()=>null},"./UserSafetyIcon":{default:Icon},"./lib/supabase":{supabase:{}}})
 const html=renderToStaticMarkup(React.createElement(Menu,{targetId:"other",userId:"me",name:"Jamie",blocked:false,disabled:false,onBusy(){},onChanged(){},onRequireLogin(){}}))
 assert.match(html,/aria-label="User options"/);assert.match(html,/role="menu"/);assert.match(html,/>Block<\/button>/);assert.match(html,/>Report<\/button>/);assert.match(html,/class="user-actions-report"/)
 assert.match(html,/M3 3l18 18/);assert.match(html,/M11 7v5/)
})
