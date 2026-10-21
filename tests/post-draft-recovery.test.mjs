import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'

const settle=()=>new Promise(resolve=>setImmediate(resolve))
const snapshot={id:'stable-post',photos:[{id:'photo'}],caption:'Keep this',recipeTag:{id:'recipe'},stage:'caption',selected:0,tab:'Edit',tool:'brightness',publishAttempted:false}
function harness({saved=null,failRead=false,failSave=false,shared=false}={}) {
 const states=[],refs=[],effects=[],queue=[],timers=new Map(),events=new Map(),native=new Map(),writes=[],restored=[],published=[]
 let si=0,ri=0,ei=0,tid=0,args,result,cleared=0,checks=0,stopped=0
 const same=(a,b)=>a?.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
 const react={useState(initial){const i=si++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef(initial){const i=ri++;return refs[i]??={current:initial}},useEffect(fn,deps){const i=ei++;if(!effects[i]||!same(effects[i].deps,deps))queue.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()}})}}
 class Session {
  async read(){if(failRead)throw Error('Storage blocked');return saved}
  async save(value){if(failSave)throw Error('Storage full');writes.push(value)}
  async clear(){cleared++}
  stop(){stopped++}
 }
 const target={visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}
 const mocks={react,'./lib/nativeNavigation':{useAndroidBack(){}},'./lib/postDrafts':{PostDraftSession:Session,hasPostDraftContent:s=>s.photos.length||s.caption||s.recipeTag},'@capacitor/core':{Capacitor:{getPlatform:()=> 'android'}},'@capacitor/app':{App:{async addListener(name,fn){native.set(name,fn);return {async remove(){native.delete(name)}}}}}}
 const m={exports:{}}
 new Function('require','module','exports','window','document','setTimeout','clearTimeout',ts.transpileModule(readFileSync(new URL('../src/usePostDraft.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>mocks[name],m,m.exports,target,target,fn=>{timers.set(++tid,fn);return tid},id=>timers.delete(id))
 args={userId:'owner',snapshot,restore:s=>restored.push(s),checkShared:async()=>{checks++;return shared},onShared:id=>published.push(id),onBack(){}}
 return {writes,restored,published,events,native,target,get cleared(){return cleared},get checks(){return checks},get stopped(){return stopped},setFailSave(value){failSave=value},render(changes){args={...args,...changes};si=ri=ei=0;result=m.exports.default(args);while(queue.length)queue.shift()();return result},timers(){for(const [id,fn]of [...timers]){timers.delete(id);fn()}},cleanup(){effects.forEach(e=>e.cleanup?.())}}
}

test('existing drafts are offered without overwriting or opening gallery; resume restores all state',async()=>{
 const h=harness({saved:{snapshot,updatedAt:Date.now()}})
 h.render();await settle();let state=h.render();assert.equal(state.mode,'offer');h.timers();assert.equal(h.writes.length,0);assert.equal(state.openGallery,false)
 await state.resume();state=h.render();assert.equal(state.mode,'editing');assert.deepEqual(h.restored,[snapshot]);assert.equal(state.openGallery,false)
 h.timers();await settle();assert.equal(h.render().status,'saved');assert.equal(h.writes.at(-1),snapshot)
})
test('debounced saves and background/pause/unmount use the most recent edits',async()=>{
 const h=harness();h.render();await settle();assert.equal(h.render().openGallery,true)
 const edited={...snapshot,caption:'Latest edit'};h.render({snapshot:edited});h.timers();await settle();assert.equal(h.writes.at(-1),edited)
 const last={...edited,caption:'Before interruption'};h.render({snapshot:last});h.target.visibilityState='hidden';h.events.get('visibilitychange')();await settle();assert.equal(h.writes.at(-1),last)
 h.native.get('pause')();await settle();assert.equal(h.writes.at(-1),last)
 h.cleanup();await settle();assert.equal(h.writes.at(-1),last);assert.equal(h.stopped,1);assert.equal(h.events.size,0);assert.equal(h.native.size,0)
})
test('failed storage never reports saved; retry can preserve it, and memory fallback does not clear an inaccessible draft',async()=>{
 const h=harness({failSave:true});h.render();await settle();h.render();h.timers();await settle();assert.equal(h.render().status,'error');assert.match(h.render().error,/full/)
 await assert.rejects(h.render().flush(),/full/);h.setFailSave(false);await h.render().flush();assert.equal(h.render().status,'saved')
 const unavailable=harness({failRead:true});unavailable.render();await settle();assert.equal(unavailable.render().mode,'storage-error')
 unavailable.render().continueWithoutSaving();assert.equal(unavailable.render().memoryOnly,true);await unavailable.render().flush();await unavailable.render().discard();assert.equal(unavailable.cleared,0);assert.equal(unavailable.writes.length,0)
})
test('an interrupted successful Share is confirmed and removed without publishing twice',async()=>{
 const h=harness({saved:{snapshot:{...snapshot,publishAttempted:true},updatedAt:Date.now()},shared:true})
 h.render();await settle();await h.render().resume();assert.equal(h.checks,1);assert.equal(h.cleared,1);assert.deepEqual(h.published,[snapshot.id]);assert.equal(h.restored.length,0);assert.equal(h.render().mode,'closed')
})
test('an uncompleted Share resumes with the same post id, and explicit discard prevents cleanup from saving again',async()=>{
 const h=harness({saved:{snapshot:{...snapshot,publishAttempted:true},updatedAt:Date.now()}})
 h.render();await settle();await h.render().resume();h.render();assert.equal(h.checks,1);assert.equal(h.restored[0].id,snapshot.id);assert.equal(h.restored[0].publishAttempted,false)
 await h.render().discard();h.cleanup();await settle();assert.equal(h.cleared,1);assert.equal(h.writes.length,0)
})
