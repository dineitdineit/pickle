import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import ts from "typescript"

function handler(file, name, context) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast); ts.forEachChild(node,visit) }
  visit(ast); assert.ok(found)
  const js = ts.transpileModule(found,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
  return new Function(...Object.keys(context),`${js}; return ${name};`)(...Object.values(context))
}
function submission(reply, overrides = {}) {
  const state = {success:false,error:"",busy:false,calls:0}
  const context = {
    targetType:"recipe",targetId:"recipe",userId:"me",reason:"spam",details:"  Detail  ",
    guard:{current:false},alive:{current:true},onClose(){},onRequireLogin(){},
    setBusy(value){state.busy=value},setError(value){state.error=value},setSuccess(value){state.success=value},
    supabase:{async rpc(name,args){state.calls++;assert.equal(name,"submit_content_report");assert.equal(args.p_details,"Detail");return typeof reply === "function" ? reply() : reply}},
    ...overrides,
  }
  return {state,context,run:handler("ReportButton.tsx","submit",context)}
}
test("reports require a confirmed ID, target, type and open status",async()=>{
  const result = {data:{id:"report",target_type:"recipe",target_id:"recipe",status:"open"},error:null}
  const good=submission(result);await good.run();assert.equal(good.state.success,true);assert.equal(good.state.busy,false)
  for (const data of [null,{}, {...result.data,target_id:"another"},{...result.data,target_type:"user"},{...result.data,status:"actioned"}]) {
    const attempt=submission({data,error:null});await attempt.run();assert.equal(attempt.state.success,false);assert.ok(attempt.state.error)
  }
})

test("post, post-comment and selected-message reports confirm their exact type and target",async()=>{
 for(const targetType of ['post','post_comment','message']) {
  const good=submission({data:{id:'report',target_type:targetType,target_id:'selected',status:'open'}},{targetType,targetId:'selected'})
  await good.run();assert.equal(good.state.success,true)
  const wrong=submission({data:{id:'report',target_type:targetType,target_id:'another',status:'open'}},{targetType,targetId:'selected'})
  await wrong.run();assert.equal(wrong.state.success,false)
 }
})
test("double submission is blocked and late responses leave a closed dialog unchanged",async()=>{
  let finish
  const attempt=submission(()=>new Promise(resolve=>{finish=resolve}))
  const running=attempt.run();await attempt.run();assert.equal(attempt.state.calls,1)
  attempt.context.alive.current=false
  finish({data:{id:"report",target_type:"recipe",target_id:"recipe",status:"open"},error:null})
  await running;assert.equal(attempt.state.success,false);assert.equal(attempt.context.guard.current,false)
})
test("signed-out and incomplete reports do not write; failed requests release the guard",async()=>{
  for (const overrides of [{userId:null},{reason:""},{guard:{current:true}}]) {
    const attempt=submission({},overrides);await attempt.run();assert.equal(attempt.state.calls,0)
  }
  const attempt=submission(()=>{throw new Error("Network")});await attempt.run();assert.ok(attempt.state.error);assert.equal(attempt.state.busy,false);assert.equal(attempt.context.guard.current,false)
})
test("existing comment reports confirm the RPC result and recover after network failure",async()=>{
  for (const reply of [{data:null,error:null},{data:"report",error:null},new Error("Network")]) {
    let success=false,error="",busy=false
    const context={userId:"me",reportComment:{id:"comment"},reportReason:"spam",reportDetails:"",
      reportGuard:{current:false},closeReport(){},onRequireLogin(){},setReporting(value){busy=value},setReportError(value){error=value},setReportSuccess(value){success=value},
      supabase:{async rpc(){if(reply instanceof Error)throw reply;return reply}},
    }
    await handler("RecipeComments.tsx","submitReport",context)()
    assert.equal(success,reply.data==="report");assert.equal(busy,false);assert.equal(context.reportGuard.current,false)
    if(!success)assert.ok(error)
  }
})
test("public review reads explicitly exclude hidden rows even for an admin session",()=>{
  const source=readFileSync(new URL("../src/lib/reviews.ts",import.meta.url),"utf8")
  assert.match(source,/\.neq\("content", ""\)\s*\.eq\("moderation_status", "active"\)/)
})
