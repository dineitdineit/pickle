import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require=createRequire(import.meta.url)
function action(file,name,context) {
 const source=readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let fn
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)fn=node.getText(ast);ts.forEachChild(node,visit)}
 visit(ast);assert.ok(fn)
 return new Function(...Object.keys(context),`${ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText};return ${name}`)(...Object.values(context))
}
test('admin operations show success only after the exact server state is confirmed',async()=>{
 for(const confirmed of [true,false]) {
  const state={},context={guard:{current:false},alive:{current:true},setBusy(v){state.busy=v},setError(v){state.error=v},setMessage(v){state.message=v},load:async()=>{state.loaded=true},supabase:{rpc:async()=>({data:{id:confirmed?'expected':'wrong',state:'confirmed'},error:null})}}
  await action('AdminModerationOperations.tsx','run',context)('approve_moderation_decision',{},data=>data.id==='expected'&&data.state==='confirmed')
  assert.equal(Boolean(state.loaded),confirmed);assert.equal(Boolean(state.message),confirmed);assert.equal(Boolean(state.error),!confirmed);assert.equal(context.guard.current,false)
 }
})
test('duplicate admin actions send one write and late replies cannot update a closed panel',async()=>{
 let finish,calls=0,message=''
 const context={guard:{current:false},alive:{current:true},setBusy(){},setError(){},setMessage(v){message=v},load:async()=>{throw Error('Late update')},supabase:{rpc(){calls++;return new Promise(resolve=>finish=resolve)}}}
 const run=action('AdminModerationOperations.tsx','run',context),first=run('action',{},()=>true)
 await run('action',{},()=>true);assert.equal(calls,1)
 context.alive.current=false;finish({data:{},error:null});await first;assert.equal(message,'')
})
test('appeals preserve text and reject mismatched or unconfirmed account decisions',async()=>{
 for(const confirmed of [true,false]) {
  const state={},explanation='Please review the complete context of this incident.'
  const context={explanations:{decision:explanation},guard:{current:false},generation:{current:1},setBusy(){},setError(v){state.error=v},setMessage(v){state.message=v},load:async()=>{state.loaded=true},supabase:{rpc:async()=>({data:{id:'appeal',decision_id:confirmed?'decision':'other',explanation},error:null})}}
  await action('AccountStatusScreen.tsx','appeal',context)({id:'decision'})
  assert.equal(Boolean(state.loaded),confirmed);assert.equal(Boolean(state.message),confirmed);assert.equal(Boolean(state.error),!confirmed);assert.equal(context.explanations.decision,explanation)
 }
})
test('short or duplicate appeal requests do not submit',async()=>{
 for(const busy of [true,false]) {
  const context={guard:{current:busy},explanations:{decision:busy?'This explanation is long enough to submit.':'Too short'},supabase:{rpc(){throw Error('Unexpected write')}}}
  await action('AccountStatusScreen.tsx','appeal',context)({id:'decision'})
 }
})
test('account status displays duration, public reasons and a usable appeal while suspended',()=>{
 const source=readFileSync(new URL('../src/AccountStatusScreen.tsx',import.meta.url),'utf8'),module={exports:{}}
 const data={user_id:'me',restrictions:[{id:'restriction',kind:'suspend_7',ends_at:'2026-10-22T10:00:00Z'}],decisions:[{id:'decision',case_id:'case',target_type:'recipe',outcome:'hide',clause:'harassment',public_reason:'Public reason only.',sanction:'suspend_7',state:'confirmed',notified_at:'2026-10-15T10:00:00Z',can_appeal:true,appeal:null}]}
 let index=0
 const mockReact={...React,useState(initial){return React.useState(index++===0?data:initial)}}
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>name==='react'?mockReact:name === "./RecipeImage" ? {default:"img"} : name.endsWith('.css')?{}:name==='./lib/supabase'?{supabase:{}}:name==='./BackIcon'?{default:()=>React.createElement('svg')}:require(name),module,module.exports)
 const html=renderToStaticMarkup(React.createElement(module.exports.default,{userId:'me',onBack(){}}))
 assert.match(html,/Account status/);assert.match(html,/suspend 7/);assert.match(html,/Public reason only/);assert.match(html,/Ends:/);assert.match(html,/Submit appeal/);assert.match(html,/14 days/)
 assert.ok(!html.includes('internal_note'))
})
