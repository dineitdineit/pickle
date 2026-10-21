import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
function load(file,mocks={}) {
 const module={exports:{}}
 const js=ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 new Function('require','module','exports',js)(name=>mocks[name]??{},module,module.exports)
 return module.exports
}
test('seen receipt is recipient-scoped, deduplicated, limited to unread IDs, and validates acknowledgments',async()=>{
 const {markSeenNotificationsRead}=load('lib/notificationRead.ts')
 for(const reply of [{data:[{id:'seen',read_at:'now'}]},{data:[]},{data:[{id:'offscreen',read_at:'now'}]},{data:null},{error:{message:'offline'}}]) {
  const filters=[]
  const query={update(){return query},eq(...args){filters.push(args);return query},in(...args){filters.push(args);return query},is(...args){filters.push(args);return query},select:async()=>reply}
  const run=()=>markSeenNotificationsRead({from:table=>{assert.equal(table,'user_notifications');return query}},'recipient',['seen','seen'])
  if(reply.data && !reply.data.some(row=>row.id==='offscreen'))assert.deepEqual(await run(),reply.data.map(row=>row.id))
  else await assert.rejects(run)
  assert.deepEqual(filters,[['recipient_id','recipient'],['id',['seen']],['read_at',null]])
 }
 assert.deepEqual(await markSeenNotificationsRead({},'recipient',[]),[])
})
async function seenTrial({failure=false,hidden=false}={}) {
 const saved={window:globalThis.window,document:globalThis.document,IntersectionObserver:globalThis.IntersectionObserver,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout}
 const effects=[],refs=[],timers=new Map(),events=new Map(),visibilityEvents=new Map(),writes=[],notifications=[]
 let nextTimer=0,observer
 const rows=['seen','offscreen','quick','already'].map(id=>({getAttribute:()=>id}))
 globalThis.window={addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key),dispatchEvent:event=>notifications.push(event.type)}
 globalThis.document={visibilityState:hidden?'hidden':'visible',addEventListener:(key,fn)=>visibilityEvents.set(key,fn),removeEventListener:key=>visibilityEvents.delete(key)}
 globalThis.setTimeout=fn=>{timers.set(++nextTimer,fn);return nextTimer}; globalThis.clearTimeout=id=>timers.delete(id)
 globalThis.IntersectionObserver=class{constructor(fn){this.emit=fn;observer=this}observe(){}disconnect(){}}
 try {
  const hook=load('useSeenNotifications.ts',{'react':{useRef(value){const ref={current:value};refs.push(ref);return ref},useEffect:fn=>effects.push(fn)},'./lib/supabase':{supabase:{}},'./lib/notificationRead':{async markSeenNotificationsRead(_client,recipient,ids){writes.push({recipient,ids});if(failure)throw Error('offline');return ids}}}).default
  const root=hook('recipient',true,rows.map((row,index)=>({id:row.getAttribute(),read_at:index===3?'earlier':null})),true)
  root.current={querySelectorAll:()=>rows}
  const leave=effects[0](),disconnect=effects[1]()
  observer.emit(rows.map((target,index)=>({target,isIntersecting:true,intersectionRatio:index===1?.1:.75})))
  observer.emit([{target:rows[2],isIntersecting:false,intersectionRatio:0}])
  for(const fn of [...timers.values()])fn()
  assert.equal(writes.length,0,'no receipt until leaving')
  disconnect();assert.equal(writes.length,0,'list refresh is not a page exit')
  leave();await Promise.resolve();await Promise.resolve()
  assert.deepEqual(writes,hidden?[]:[{recipient:'recipient',ids:['seen']}])
  assert.deepEqual(notifications,hidden||failure?[]:['pickle:notifications-changed'])
 }finally{Object.assign(globalThis,saved)}
}
test('viewed notifications are read only on exit; offscreen, already-read and quickly scrolled items are excluded',()=>seenTrial())
test('background pages do not mark notifications as seen',()=>seenTrial({hidden:true}))
test('failed read updates never emit a success or clear the unread badge',()=>seenTrial({failure:true}))

test('notification preferences preserve defaults and require exact account-matched confirmation',async()=>{
 const api=load('lib/notificationPreferences.ts')
 const defaults=api.defaultNotificationPreferences
 assert.deepEqual(api.checkedPreferences({user_id:'me',...defaults},'me'),defaults)
 assert.throws(()=>api.checkedPreferences({user_id:'other',...defaults},'me'))
 assert.throws(()=>api.checkedPreferences({user_id:'me',...defaults,replies:null},'me'))
 const calls=[];let response={data:null}
 const query={select(){return query},eq(...args){calls.push(args);return query},maybeSingle:async()=>response,upsert(payload){calls.push(payload);return query},single:async()=>response}
 const client={from(table){assert.equal(table,'notification_preferences');return query}}
 assert.deepEqual(await api.loadNotificationPreferences(client,'me'),defaults)
 assert.deepEqual(calls.shift(),['user_id','me'])
 response={data:{user_id:'me',...defaults,enabled:false}}
 assert.equal((await api.saveNotificationPreferences(client,'me',{...defaults,enabled:false})).enabled,false)
 assert.equal(calls[0].user_id,'me')
 await assert.rejects(()=>api.saveNotificationPreferences(client,'me',defaults),/not confirmed/)
})
test('compact notification times handle minute, hour and day boundaries',()=>{
 const {notificationTimeLabel}=load('lib/notificationText.ts');const now=Date.parse('2026-10-16T12:00:00Z')
 assert.equal(notificationTimeLabel('invalid',now),'')
 assert.equal(notificationTimeLabel('2026-10-16T12:00:00Z',now),'now')
 assert.equal(notificationTimeLabel('2026-10-16T11:55:00Z',now),'5m')
 assert.equal(notificationTimeLabel('2026-10-16T10:00:00Z',now),'2h')
 assert.equal(notificationTimeLabel('2026-10-14T12:00:00Z',now),'2d')
})
test('post conversation alerts describe comments and replies without a recipe title',()=>{
 const {notificationText}=load('lib/notificationText.ts')
 assert.equal(notificationText('post_comment','Ignored'),'commented on your post.')
 assert.equal(notificationText('post_reply'),'replied to your comment on a post.')
})
