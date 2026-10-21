import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))}
function harness({savedOwner=null,offline=false,delayRegistration=false}={}) {
 const storage=new Map(),events=new Map(),calls=[]
 const device={id:crypto.randomUUID(),secret:'a'.repeat(64)}
 storage.set('pickle:push:installation',JSON.stringify(device))
 if(savedOwner)storage.set('pickle:push:owner',savedOwner)
 const plugin={
  async addListener(name,fn){events.set(name,fn);return {remove:async()=>events.delete(name)}},
  async createChannel(){calls.push('channel')},
  async checkPermissions(){calls.push('check');return {receive:'prompt'}},
  async requestPermissions(){calls.push('request');return {receive:'granted'}},
  async register(){calls.push('register');if(!delayRegistration)events.get('registration')?.({value:'synthetic-device-token'})},
  async unregister(){calls.push('unregister')},
  async removeAllDeliveredNotifications(){calls.push('clear')},
 }
 const db={async rpc(name,args){calls.push({name,args});return offline?{data:null,error:{code:'NETWORK'}}:{data:true,error:null}}}
 const storageMock={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
 const m={exports:{}}
 const js=ts.transpileModule(readFileSync(new URL('../src/lib/androidPush.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports','localStorage','window',js)(name=>name==='@capacitor/core'?{Capacitor:{getPlatform:()=> 'android'}}:name==='@capacitor/push-notifications'?{PushNotifications:plugin}:{supabase:db},m,m.exports,storageMock,{dispatchEvent(){}})
 return {api:m.exports,plugin,storage,events,calls,device}
}
test('Android startup never requests permission before an explicit enable action',async()=>{
 const h=harness();h.api.syncAndroidPushUser(crypto.randomUUID());await settle()
 assert.equal(h.calls.includes('request'),false);assert.equal(h.calls.includes('register'),false)
})
test('explicit enable binds only this account and stores no device token',async()=>{
 const h=harness(),owner=crypto.randomUUID();h.api.syncAndroidPushUser(owner);await settle()
 await h.api.enableAndroidPush(owner)
 assert.equal(h.api.pushStatus(),'enabled');assert.equal(h.storage.get('pickle:push:owner'),owner)
 assert.equal(h.calls.filter(v=>typeof v==='object'&&v.name==='register_push_device').length,1)
 assert.equal([...h.storage.values()].some(v=>v.includes('synthetic-device-token')),false)
})
test('late registration cannot bind a device after logout',async()=>{
 const h=harness({delayRegistration:true}),owner=crypto.randomUUID()
 h.api.syncAndroidPushUser(owner);await settle()
 const pending=h.api.enableAndroidPush(owner);await settle()
 h.api.syncAndroidPushUser(null)
 h.events.get('registration')({value:'late-synthetic-token'});await pending;await settle()
 assert.equal(h.calls.filter(v=>typeof v==='object'&&v.name==='register_push_device').length,0)
 assert.equal(h.calls.includes('unregister'),true);assert.equal(h.storage.has('pickle:push:owner'),false)
})
test('turning off invalidates native token even when server unlink is offline',async()=>{
 const h=harness({offline:true})
 await h.api.disableAndroidPush()
 assert.equal(h.calls.includes('unregister'),true);assert.equal(h.calls.includes('clear'),true)
 assert.equal(h.api.pushStatus(),'error')
})
test('notification taps cannot cross installations or accounts',async()=>{
 const h=harness(),owner=crypto.randomUUID();h.api.syncAndroidPushUser(owner);await settle()
 const data={recipient:owner,installation:crypto.randomUUID(),kind:'message',target:'10'}
 h.events.get('pushNotificationActionPerformed')({notification:{data}})
 assert.equal(h.api.takePushTarget(owner),null)
 data.installation=h.device.id
 h.events.get('pushNotificationActionPerformed')({notification:{data}})
 assert.equal(h.api.takePushTarget(crypto.randomUUID()),null)
 assert.deepEqual(h.api.takePushTarget(owner),data)
 assert.equal(h.api.takePushTarget(owner),null)
})
