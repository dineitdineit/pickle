import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { test } from "node:test"
import ts from "typescript"
const require=createRequire(import.meta.url)
const source=readFileSync(new URL("../supabase/functions/moderation-email-worker/worker.ts",import.meta.url),"utf8")
const module={exports:{}}
new Function("exports","module",ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module.exports,module)
const handleWorker=module.exports.handleWorker
const secret="x".repeat(48)
const job={id:"job",lease_token:"lease",to_email:"fixture@example.invalid",sender:"admin@getpickleapp.com",subject:"Notice",body:"Your comment was hidden."}
function setup(options={}) {
  const calls=[],emails=[]
  const deps={
    secret,apiKey:"test-key",sender:job.sender,
    async rpc(name,args){calls.push({name,args});return name==="claim_moderation_emails" ? {data:[job],error:null} : {data:true,error:null}},
    async fetch(url,options){emails.push({url,options});return Response.json({id:"provider-id"})},
    ...options,
  }
  return {deps,calls,emails,run(headers={"X-Moderation-Worker-Secret":secret},method="POST"){return handleWorker(new Request("https://example.invalid",{method,headers}),deps)}}
}
test("email worker rejects untrusted requests before reading the queue",async()=>{
  for(const headers of [{},{"X-Moderation-Worker-Secret":"wrong"}]) {
    const test=setup();assert.equal((await test.run(headers)).status,401);assert.equal(test.calls.length,0);assert.equal(test.emails.length,0)
  }
  const test=setup();assert.equal((await test.run({},"GET")).status,405);assert.equal(test.calls.length,0)
})
test("missing provider or worker configuration preserves queued retries",async()=>{
  for(const options of [{secret:null},{apiKey:null},{sender:null}]) {
    const test=setup(options);assert.equal((await test.run()).status,503);assert.equal(test.calls.length,0);assert.equal(test.emails.length,0)
  }
})
test("emails use persisted recipient, content and a stable provider idempotency key",async()=>{
  const test=setup();const result=await test.run()
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{accepted:1,retry:0,failed:0,unconfirmed:0})
  assert.equal(test.emails[0].url,"https://api.resend.com/emails")
  const options=test.emails[0].options
  assert.equal(options.headers["Idempotency-Key"],"pickle/moderation/job")
  assert.deepEqual(JSON.parse(options.body),{from:job.sender,to:[job.to_email],subject:job.subject,text:job.body,reply_to:job.sender})
  assert.deepEqual(test.calls[1].args,{p_id:"job",p_lease:"lease",p_outcome:"sent",p_provider_id:"provider-id",p_error:null})
})
test("temporary provider failure retries; permanent failures are recorded without response bodies",async()=>{
  for(const [status,outcome] of [[429,"retry"],[503,"retry"],[400,"failed"],[403,"failed"]]) {
    const test=setup({fetch:async()=>Response.json({message:job.to_email},{status})})
    await test.run()
    assert.equal(test.calls[1].args.p_outcome,outcome)
    assert.equal(test.calls[1].args.p_error,`provider_http_${status}`)
    assert.ok(!JSON.stringify(test.calls).includes(job.to_email))
  }
})
test("network uncertainty and missing acceptance IDs remain retryable",async()=>{
  for(const fetch of [async()=>{throw new Error("Timeout")},async()=>Response.json({})]) {
    const test=setup({fetch});await test.run();assert.equal(test.calls[1].args.p_outcome,"retry")
  }
})
test("unconfirmed queue acknowledgement does not claim delivery succeeded",async()=>{
  const test=setup({async rpc(name){return name==="claim_moderation_emails"?{data:[job],error:null}:{data:false,error:null}}})
  const result=await test.run();assert.equal(result.status,503)
  assert.deepEqual(await result.json(),{accepted:0,retry:0,failed:0,unconfirmed:1})
})
test("moderation notices render without a profile actor or follow action",async()=>{
  const React=require("react"),{renderToStaticMarkup}=require("react-dom/server")
  const source=readFileSync(new URL("../src/ModerationNotice.tsx",import.meta.url),"utf8"),module={exports:{}}
  new Function("require","exports","module",ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText)(require,module.exports,module)
  const html=renderToStaticMarkup(React.createElement(module.exports.default,{unread:true,createdAt:"2026-10-13T00:00:00Z",details:{type:"review",action:"hide",title:"Soup",reason:"Spam",message:'Your review on "Soup" was hidden after a moderation review.'}}))
  assert.match(html,/Moderation notice/);assert.match(html,/Your review/);assert.match(html,/Reason: Spam/);assert.match(html,/is-unread/)
  assert.ok(!html.includes("Follow"));assert.ok(!html.includes("<button"))
})
