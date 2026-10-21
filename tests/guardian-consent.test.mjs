import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const module = { exports: {} }
new Function('exports','module',ts.transpileModule(readFileSync('src/lib/age.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(module.exports,module)
const { requiresGuardian, isEligibleBirthday, checkedAgeStatus, guardianEmailBody } = module.exports
const today = new Date('2026-10-16T12:00:00Z')
test('13th and 14th birthdays determine guardian review without allowing under-13 activation',()=>{
  assert.equal(isEligibleBirthday('2013-10-17',today),false)
  assert.equal(isEligibleBirthday('2013-10-16',today),true)
  assert.equal(requiresGuardian('2013-10-16',today),true)
  assert.equal(requiresGuardian('2012-10-17',today),true)
  assert.equal(requiresGuardian('2012-10-16',today),false)
  assert.equal(requiresGuardian('2013-02-29',today),false)
})
const pending={user_id:'child',eligible:false,minimum_age:13,rule_version:'13-plus-guardian-v1',guardian_required:true,guardian_status:'pending',guardian_request_id:'00000000-0000-0000-0000-000000000001',guardian_policy_version:'2026-10-16.1'}
test('eligibility acknowledgment fails closed on mismatched user, stale rule, forged activation or missing request',()=>{
  assert.equal(checkedAgeStatus(pending,'child').eligible,false)
  assert.equal(checkedAgeStatus({...pending,eligible:true,guardian_status:'approved'},'child').eligible,true)
  for(const patch of [{user_id:'other'},{minimum_age:18},{rule_version:'18-plus-v1'},{eligible:true},{guardian_request_id:null},{guardian_policy_version:''},{guardian_required:false}]) assert.throws(()=>checkedAgeStatus({...pending,...patch},'child'))
  assert.equal(checkedAgeStatus({...pending,guardian_required:false,eligible:true,guardian_status:'not_required',guardian_request_id:null,guardian_policy_version:null},'child').eligible,true)
})
test('guardian consent statement identifies the exact request/policy and asks for an explicit guardian decision',()=>{
  const body=guardianEmailBody(pending.guardian_request_id,pending.guardian_policy_version)
  for(const text of [pending.guardian_request_id,pending.guardian_policy_version,'YES or NO','adult parent or legal guardian','withdrawal','Do not attach government IDs']) assert.ok(body.toLowerCase().includes(text.toLowerCase()),text)
  assert.ok(!body.includes('Date of birth:'))
})

function handler(name, context) {
  const source=readFileSync('src/AdminGuardianRequests.tsx','utf8')
  const ast=ts.createSourceFile('admin.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  let fn
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)fn=node.getText(ast);ts.forEachChild(node,visit)}
  visit(ast); assert.ok(fn)
  return new Function(...Object.keys(context),ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText+`;return ${name}`)(...Object.values(context))
}
function attempt(reply, verified=true) {
  const state={calls:0,refresh:0,error:''}
  const context={selected:{request_id:pending.guardian_request_id},guard:{current:false},generation:{current:1},reference:'consent-case-123',verified,setBusy(){},setError(value){state.error=value},setRefresh(){state.refresh++},supabase:{async rpc(name,args){state.calls++;assert.equal(name,'review_guardian_consent');assert.equal(args.p_verified,verified);assert.equal(args.p_evidence_reference,'consent-case-123');return typeof reply==='function'?reply():reply}}}
  return {state,context,run:handler('review',context)}
}
test('admin approval requires a checked verification and exact request/decision acknowledgment',async()=>{
  const good=attempt({data:{request_id:pending.guardian_request_id,status:'approved'}})
  await good.run('approved'); assert.equal(good.state.refresh,1)
  const unchecked=attempt({data:{}},false); await unchecked.run('approved'); assert.equal(unchecked.state.calls,0)
  for(const data of [null,{request_id:'wrong',status:'approved'},{request_id:pending.guardian_request_id,status:'pending'}]) {
    const bad=attempt({data}); await bad.run('approved'); assert.equal(bad.state.refresh,0);assert.ok(bad.state.error);assert.equal(bad.context.guard.current,false)
  }
})
test('admin duplicate decisions are blocked and unmounted requests ignore late acknowledgments',async()=>{
  let finish
  const trial=attempt(()=>new Promise(resolve=>{finish=resolve}))
  const first=trial.run('approved');await trial.run('approved');assert.equal(trial.state.calls,1)
  trial.context.generation.current++
  finish({data:{request_id:pending.guardian_request_id,status:'approved'}})
  await first;assert.equal(trial.state.refresh,0);assert.equal(trial.state.error,'')
})
