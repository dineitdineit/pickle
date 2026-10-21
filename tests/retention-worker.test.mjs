import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'
function load(path) {const module={exports:{}};new Function('exports','module',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(module.exports,module);return module.exports}
const {processDeletion,maintainBackups}=load('../supabase/functions/retention-worker/worker.ts')
const {confirmedDeletionReceipt}=load('../src/lib/accountData.ts')
const id='10000000-0000-0000-0000-000000000001',uid='20000000-0000-0000-0000-000000000002',lease='30000000-0000-0000-0000-000000000003',fileId='40000000-0000-0000-0000-000000000004'
function client(overrides={}) {
 const calls=[], removed=[];const handlers={claim:{id,user_id:uid,lease},files:[{id:fileId,bucket:'community_recipe_images',path:`${uid}/draft/image.jpg`}],files_ack:true,ready:true,complete:{completed:true,job_id:id},retry:true,...overrides}
 const admin={async rpc(_name,{p_action,p_payload}){calls.push([p_action,p_payload]);const value=handlers[p_action];return {data:typeof value==='function'?await value(p_payload):value,error:null}},storage:{from(bucket){return {async remove(paths){removed.push([bucket,paths]);return {error:null}}}}},auth:{admin:{async getUserById(user){calls.push(['lookup',user]);return {data:{user:{id:uid}},error:null}},async deleteUser(user){calls.push(['delete',user]);return {error:null}}}}}
 return {admin,calls,removed}
}
test('account deletion deletes only server-manifest files and confirms database completion after Auth removal',async()=>{
 const {admin,calls,removed}=client();const result=await processDeletion(admin,id,uid)
 assert.equal(result.completed,true);assert.deepEqual(removed,[['community_recipe_images',[`${uid}/draft/image.jpg`]]]);
 assert(calls.findIndex(([name])=>name==='files_ack')<calls.findIndex(([name])=>name==='delete'))
 assert(calls.findIndex(([name])=>name==='delete')<calls.findIndex(([name])=>name==='complete'))
})
test('storage failure queues a sanitized retry without deleting the Auth account',async()=>{
 const {admin,calls}=client();admin.storage.from=()=>({async remove(){return {error:{message:'private/path/person@example.invalid'}}}})
 const result=await processDeletion(admin,id,uid);assert.equal(result.completed,false);assert.equal(result.queued,true)
 assert(!calls.some(([name])=>name==='delete'||name==='complete'));assert.equal(calls.at(-1)[1].code,'storage_cleanup_failed')
 assert(!JSON.stringify(calls).includes('person@example.invalid'))
})
test('remaining batches defer safely and failed Auth removal never claims completion',async()=>{
 const first=client({ready:false});await processDeletion(first.admin,id,uid);assert(!first.calls.some(([name])=>name==='delete'));assert.equal(first.calls.at(-1)[1].code,'batch_pending')
 const second=client();second.admin.auth.admin.deleteUser=async()=>({error:{status:503}});const result=await processDeletion(second.admin,id,uid)
 assert.equal(result.completed,false);assert(!second.calls.some(([name])=>name==='complete'));assert.equal(second.calls.at(-1)[1].code,'auth_delete_failed')
})
test('an already removed Auth account resumes confirmation, while wrong-account leases are rejected',async()=>{
 const first=client();first.admin.auth.admin.getUserById=async()=>({data:{user:null},error:{status:404}})
 assert.equal((await processDeletion(first.admin,id,uid)).completed,true);assert(!first.calls.some(([name])=>name==='delete'))
 const second=client({claim:{id,user_id:id,lease}});await assert.rejects(processDeletion(second.admin,id,uid),/Invalid job identity/);assert.equal(second.calls.length,1)
})
test('an unconfirmed final RPC remains queued and a lease owned by another worker is not processed',async()=>{
 const first=client({complete:{completed:false,job_id:id}});assert.equal((await processDeletion(first.admin,id,uid)).completed,false)
 const second=client({claim:null});assert.deepEqual(await processDeletion(second.admin,id,uid),{completed:false,queued:true,claimed:false});assert.equal(second.calls.length,1)
})
test('encrypted receipt backups are verified by download/hash and expired files are removed before ledger acknowledgement',async()=>{
 const bytes=Buffer.from('synthetic encrypted receipt bytes'), hash=createHash('sha256').update(bytes).digest('hex');const calls=[];let blob=null
 const admin={async rpc(_name,{p_action}){calls.push(p_action);return {data:p_action==='receipt'?{id,path:`${id}.pgp`,body:bytes.toString('base64'),sha256:hash,expires_at:new Date(Date.now()+60000).toISOString()}:p_action==='expired'?[{job_id:uid,path:`${uid}.pgp`}]:true,error:null}},storage:{from(bucket){assert.equal(bucket,'retention-backups');return {async upload(path,body,options){assert.equal(options.upsert,true);blob=new Blob([body]);calls.push('upload');return {error:null}},async download(){calls.push('download');return {data:blob,error:null}},async remove(paths){calls.push('remove');assert.deepEqual(paths,[`${uid}.pgp`]);return {error:null}}}}}}
 assert.deepEqual(await maintainBackups(admin),{verified:1,expired:1,failures:0});assert(calls.indexOf('download')<calls.indexOf('receipt_ack'));assert(calls.indexOf('remove')<calls.indexOf('expired_ack'))
})
test('corrupt backup reads and failed expiry deletes never mark verification or purge the retry ledger',async()=>{
 const bytes=Buffer.from('encrypted'),calls=[];const admin={async rpc(_name,{p_action}){calls.push(p_action);return {data:p_action==='receipt'?{id,path:`${id}.pgp`,body:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),expires_at:new Date(Date.now()+60000).toISOString()}:p_action==='expired'?[{job_id:uid,path:`${uid}.pgp`}]:true,error:null}},storage:{from(){return {async upload(){return {error:null}},async download(){return {data:new Blob(['corrupt']),error:null}},async remove(){return {error:{message:'failed'}}}}}}}
 assert.deepEqual(await maintainBackups(admin),{verified:0,expired:0,failures:2});assert(!calls.includes('receipt_ack'));assert(!calls.includes('expired_ack'))
})
test('client distinguishes a confirmed queued deletion from completed deletion and rejects wrong accounts',()=>{
 assert.deepEqual(confirmedDeletionReceipt({accepted:true,ok:false,completed:false,user_id:uid,job_id:id},uid),{id,completed:false})
 assert.deepEqual(confirmedDeletionReceipt({ok:true,completed:true,user_id:uid,job_id:id},uid),{id,completed:true})
 for(const row of [{accepted:true,user_id:uid,job_id:id},{ok:true,completed:false,user_id:uid,job_id:id},{ok:true,completed:true,user_id:id,job_id:id}])assert.throws(()=>confirmedDeletionReceipt(row,uid))
})
