import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
function load(path,imports={}) {
 const m={exports:{}}
 new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>imports[name]??{},m,m.exports)
 return m.exports
}
const fcm=load('supabase/functions/android-push-worker/fcm.ts')
const {handlePushWorker}=load('supabase/functions/android-push-worker/worker.ts',{'./fcm.ts':fcm})
const target={recipient:crypto.randomUUID(),installation:crypto.randomUUID(),kind:'activity',target:crypto.randomUUID()}
test('push routes accept only typed account-scoped IDs, never arbitrary URLs',()=>{
 const {checkedPushTarget}=load('src/lib/androidPush.ts',{'@capacitor/core':{Capacitor:{getPlatform:()=> 'web'}}})
 assert.deepEqual(checkedPushTarget(target),target)
 assert.equal(checkedPushTarget({...target,target:'https://example.invalid'}),null)
 assert.equal(checkedPushTarget({...target,kind:'message',target:'1 or 1=1'}),null)
 assert.equal(checkedPushTarget({...target,recipient:'other'}),null)
 assert.deepEqual(checkedPushTarget({...target,kind:'message',target:'42'}),{...target,kind:'message',target:'42'})
})
test('lock-screen payloads contain generic text and routing IDs only',()=>{
 const result=fcm.payload({...target,token:'synthetic-device-token',tag:'job'})
 assert.equal(result.message.notification.body,'You have new activity in Pickle.')
 assert.equal(result.message.android.notification.visibility,'PRIVATE')
 assert.equal(result.message.android.ttl,'300s')
 assert.deepEqual(Object.keys(result.message.data).sort(),['installation','kind','recipient','target'])
 assert.equal(fcm.payload({...target,kind:'message'}).message.notification.body,'You have a new message.')
})
test('FCM unregistered tokens are removed; transient failures retry',()=>{
 assert.equal(fcm.responseOutcome(404,{error:{details:[{errorCode:'UNREGISTERED'}]}}),'invalid_token')
 for(const code of [401,408,429,500,503]) assert.equal(fcm.responseOutcome(code,{}),'retry')
 assert.equal(fcm.responseOutcome(400,{}),'failed')
 assert.equal(fcm.responseOutcome(200,{}),'sent')
})
const secret='a'.repeat(64)
const request=()=>new Request('https://example.invalid',{method:'POST',headers:{'X-Push-Worker-Secret':secret}})
async function fixture() {
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])
 const der=Buffer.from(await crypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64')
 return {project_id:'test-project',client_email:'sender@test-project.iam.gserviceaccount.com',private_key:`-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`}
}
test('signed assertions use only the fixed Google endpoint and messaging scope',async()=>{
 const jwt=await fcm.assertion(await fixture(),1700000000000)
 const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url'))
 assert.equal(claims.aud,'https://oauth2.googleapis.com/token')
 assert.equal(claims.scope,'https://www.googleapis.com/auth/firebase.messaging')
 assert.equal(claims.exp-claims.iat,3600)
})
test('unauthorized callers cannot inspect config or claim jobs',async()=>{
 let calls=0
 const result=await handlePushWorker(new Request('https://example.invalid',{method:'POST'}),{rpc:()=>{calls++;throw Error()},fetch:()=>{throw Error()}})
 assert.equal(result.status,401);assert.equal(calls,0)
})
test('disabled worker verifies credentials but sends no notifications or claims',async()=>{
 const calls=[],urls=[]
 const result=await handlePushWorker(request(),{credential:JSON.stringify(await fixture()),enabled:false,
  rpc:async(name,args)=>{calls.push(args.p_action);return {data:true,error:null}},
  fetch:async url=>{urls.push(url);return Response.json({access_token:'test-access-token'})}})
 assert.deepEqual(await result.json(),{configured:true,enabled:false,sent:0})
 assert.deepEqual(calls,['verify_secret','status']);assert.deepEqual(urls,['https://oauth2.googleapis.com/token'])
})
test('mismatched project and invalid private keys never contact a provider',async()=>{
 for(const options of [{credential:JSON.stringify(await fixture()),expectedProject:'different-project'},{credential:'{}'}]) {
  let requests=0;const calls=[]
  const result=await handlePushWorker(request(),{...options,enabled:false,rpc:async(name,args)=>{calls.push(args);return {data:true,error:null}},fetch:async()=>{requests++;throw Error()}})
  assert.equal(result.status,503);assert.equal(requests,0);assert.equal(calls.at(-1).p_payload.ready,false)
 }
})
test('delivery rechecks the leased target and acknowledges unavailable content as skipped',async()=>{
 const actions=[];let claimed=false
 const result=await handlePushWorker(request(),{credential:JSON.stringify(await fixture()),enabled:true,
  rpc:async(name,args)=>{actions.push(args);return {data: args.p_action==='claim'?(claimed?null:(claimed=true,{id:'job',lease:'lease'})):args.p_action==='prepare'?null:true,error:null}},
  fetch:async url=>{assert.equal(url,'https://oauth2.googleapis.com/token');return Response.json({access_token:'test'})}})
 assert.equal(result.status,200);assert.equal((await result.json()).skipped,1)
 assert.equal(actions.find(a=>a.p_action==='ack').p_payload.outcome,'skipped')
})
