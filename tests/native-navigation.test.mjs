import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

function load(file, mocks={}, globals={}) {
  const module={exports:{}}
  const js=ts.transpileModule(readFileSync(new URL(`../src/lib/${file}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('require','module','exports',...Object.keys(globals),js)(name=>{assert.ok(name in mocks,`Missing mock ${name}`);return mocks[name]},module,module.exports,...Object.values(globals))
  return module.exports
}
const links=load('appLinks')
const id='11111111-2222-4333-8444-555555555555'
test('only exact app/domain routes and a single valid content UUID are accepted',()=>{
  for(const url of [`https://getpickleapp.com/?recipe=${id}`,`com.getpickleapp.pickle://open?recipe=${id}`]) assert.deepEqual(links.parseAppLink(url),{kind:'recipe',id})
  assert.deepEqual(links.parseAppLink(`https://getpickleapp.com/?post=${id}`),{kind:'post',id})
  for(const url of ['javascript:alert(1)',`https://getpickleapp.com.evil.test/?recipe=${id}`,`http://getpickleapp.com/?recipe=${id}`,`https://getpickleapp.com/admin?recipe=${id}`,`https://name@getpickleapp.com/?recipe=${id}`,`https://getpickleapp.com:444/?recipe=${id}`,`https://getpickleapp.com/?recipe=${id}&post=${id}`,`https://getpickleapp.com/?recipe=${id}&recipe=${id}`,`https://getpickleapp.com/?recipe=bad`,`https://getpickleapp.com/?recipe=${id}#access_token=bad`]) assert.equal(links.parseAppLink(url),null,url)
})
test('callback parser rejects tokens, duplicate codes and unrelated routes',()=>{
  assert.equal(links.parseAppLink(`${links.NATIVE_RECOVERY}?code=test`).recovery,true)
  for(const url of [`${links.NATIVE_CALLBACK}#access_token=test`,`${links.NATIVE_CALLBACK}?access_token=test`,`${links.NATIVE_CALLBACK}?code=a&code=b`,'com.getpickleapp.pickle://auth/admin?code=a']) assert.equal(links.parseAppLink(url),null)
})
function authHarness({event='SIGNED_IN',fail=false,launch=null}={}) {
  const storage=new Map(),calls=[],listeners=new Set(),native=new Map()
  const session={user:{id:'synthetic-owner'}}
  const auth={
    onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}},
    async getSession(){return {data:{session}}},
    async signInWithOAuth(options){calls.push(['oauth',options]);return {data:{url:'https://accounts.example.test/authorize'},error:null}},
    async exchangeCodeForSession(code,options){calls.push(['exchange',code,options]);if(fail)return {data:{session:null},error:{message:'private-provider-error'}};for(const fn of listeners) fn(event,session);return {data:{session},error:null}},
    async signOut(options){calls.push(['signout',options]);for(const fn of listeners)fn('SIGNED_OUT',null);return {error:null}},
  }
  const api=load('nativeAuth',{'@capacitor/core':{Capacitor:{getPlatform:()=> 'android'}},'@capacitor/app':{App:{async addListener(name,fn){native.set(name,fn);return {remove:async()=>native.delete(name)}},async getLaunchUrl(){return launch?{url:launch}:undefined}}},'@capacitor/browser':{Browser:{async open(options){calls.push(['open',options])},async close(){calls.push(['close'])}}},'./supabase':{supabase:{auth}},'./appLinks':links},{localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}})
  return {api,storage,calls,listeners,native}
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))}
test('native OAuth uses a system browser, PKCE exchange, deduplication and no callback storage',async()=>{
  const h=authHarness();await h.api.signInNative('google')
  assert.equal(h.calls[0][1].options.skipBrowserRedirect,true)
  assert.equal(h.calls[0][1].options.redirectTo,links.NATIVE_CALLBACK)
  await h.api.handleNativeUrl(`${links.NATIVE_CALLBACK}?code=synthetic-code&flow_id=flow`)
  await h.api.handleNativeUrl(`${links.NATIVE_CALLBACK}?code=synthetic-code&flow_id=flow`)
  assert.equal(h.calls.filter(c=>c[0]==='exchange').length,1)
  assert.deepEqual(h.calls.find(c=>c[0]==='exchange')[2],{flowId:'flow'})
  assert.equal(h.api.nativeSnapshot().recovery,false)
  assert.equal(h.storage.size,0);assert.equal(h.listeners.size,0)
})
test('recovery requires a pending in-app request and a verified PASSWORD_RECOVERY exchange',async()=>{
  const h=authHarness({event:'PASSWORD_RECOVERY'})
  await h.api.handleNativeUrl(`${links.NATIVE_RECOVERY}?code=unrequested`)
  assert.equal(h.calls.length,0);assert.match(h.api.nativeSnapshot().notice,/request a new reset/)
  h.api.beginNativeAuth('recovery');await h.api.handleNativeUrl(`${links.NATIVE_RECOVERY}?code=requested`)
  assert.equal(h.api.nativeSnapshot().recovery,true)
  assert.equal([...h.storage.values()].some(value=>value.includes('requested')),false)
  await h.api.finishNativeRecovery(true)
  assert.equal(h.api.nativeSnapshot().recovery,false)
  assert.equal(h.calls.at(-1)[0],'signout');assert.equal(h.storage.size,0)
  const wrong=authHarness();wrong.api.beginNativeAuth('recovery');await wrong.api.handleNativeUrl(`${links.NATIVE_RECOVERY}?code=wrong-purpose`)
  assert.equal(wrong.api.nativeSnapshot().recovery,false);assert.equal(wrong.calls.at(-1)[0],'signout')
})
test('expired, denied, wrong-route and failed callbacks never open password editing',async()=>{
  const expired=authHarness();expired.storage.set('pickle:native-auth-intent',JSON.stringify({kind:'recovery',startedAt:Date.now()-3600001}))
  await expired.api.handleNativeUrl(`${links.NATIVE_RECOVERY}?code=expired`);assert.equal(expired.calls.length,0)
  const denied=authHarness();denied.api.beginNativeAuth('oauth');await denied.api.handleNativeUrl(`${links.NATIVE_CALLBACK}?error=access_denied`)
  assert.match(denied.api.nativeSnapshot().notice,/cancelled/);assert.equal(denied.calls.some(c=>c[0]==='exchange'),false)
  const wrong=authHarness();wrong.api.beginNativeAuth('oauth');await wrong.api.handleNativeUrl(`${links.NATIVE_RECOVERY}?code=bad`);assert.equal(wrong.calls.length,0)
  const failed=authHarness({fail:true});failed.api.beginNativeAuth('oauth');await failed.api.handleNativeUrl(`${links.NATIVE_CALLBACK}?code=bad`)
  assert.match(failed.api.nativeSnapshot().notice,/new reset email/);assert.equal(failed.api.nativeSnapshot().notice.includes('private-provider-error'),false);assert.equal(failed.listeners.size,0)
})
test('cold and warm content intents queue safely and initialization is singleton',async()=>{
  const h=authHarness({launch:`https://getpickleapp.com/?recipe=${id}`})
  h.api.startNativeLinks();h.api.startNativeLinks();await settle()
  assert.equal(h.api.nativeSnapshot().ready,true);assert.equal(h.native.size,1)
  assert.deepEqual(h.api.takeNativeContent(),{kind:'recipe',id});assert.equal(h.api.takeNativeContent(),null)
  h.native.get('appUrlOpen')({url:`com.getpickleapp.pickle://open?post=${id}`});await settle()
  assert.deepEqual(h.api.takeNativeContent(),{kind:'post',id})
})
test('cold recovery callback verifies purpose before showing the password screen',async()=>{
  const h=authHarness({event:'PASSWORD_RECOVERY',launch:`${links.NATIVE_RECOVERY}?code=cold-recovery`})
  h.api.beginNativeAuth('recovery');h.api.startNativeLinks();await settle()
  assert.equal(h.api.nativeSnapshot().ready,true);assert.equal(h.api.nativeSnapshot().recovery,true)
  assert.equal(h.calls.filter(c=>c[0]==='exchange').length,1)
})
test('recovery resume is limited to the same owner and an unexpired marker; completing clears it',async()=>{
  const resumed=authHarness();resumed.storage.set('pickle:native-recovery',JSON.stringify({owner:'synthetic-owner',startedAt:Date.now()}))
  resumed.api.startNativeLinks();await settle();assert.equal(resumed.api.nativeSnapshot().recovery,true)
  await resumed.api.finishNativeRecovery();assert.equal(resumed.storage.has('pickle:native-recovery'),false)
  for(const marker of [{owner:'other-owner',startedAt:Date.now()},{owner:'synthetic-owner',startedAt:Date.now()-3600001}]){
    const h=authHarness();h.storage.set('pickle:native-recovery',JSON.stringify(marker));h.api.startNativeLinks();await settle()
    assert.equal(h.api.nativeSnapshot().recovery,false);assert.equal(h.storage.has('pickle:native-recovery'),false)
  }
})
test('Android Back cancels one modal, respects guards, prioritizes editors, then navigates or minimizes',async()=>{
  let modal=null,buttons=[],minimized=0,clicks=0
  const api=load('nativeNavigation',{'@capacitor/core':{Capacitor:{getPlatform:()=> 'android'}},'@capacitor/app':{App:{async minimizeApp(){minimized++}}},react:{}},{document:{querySelectorAll:selector=>selector.startsWith('dialog')?(modal?[modal]:[]):buttons}})
  let cancelled=0,closed=0,editor=0,fallback=0
  modal={dispatchEvent(event){cancelled++;event.preventDefault();return false},close(){closed++}}
  const remove=api.registerAndroidBack(()=>{editor++;return true},200)
  api.registerAndroidBack(()=>{fallback++;return false},-100)
  api.dispatchAndroidBack();assert.equal(cancelled,1);assert.equal(closed,0);assert.equal(editor,0)
  modal=null;api.dispatchAndroidBack();assert.equal(editor,1);assert.equal(fallback,0)
  remove();buttons=[{getAttribute:()=> 'Back to recipe',disabled:false,closest:()=>null,getClientRects:()=>[{}],click(){clicks++}}]
  api.dispatchAndroidBack();assert.equal(clicks,1);assert.equal(fallback,0)
  buttons=[];api.dispatchAndroidBack();assert.equal(fallback,1);assert.equal(minimized,1)
})
