import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
const settle=()=>new Promise(resolve=>setImmediate(resolve))
const row=(id='one',cook_state='want_to_cook')=>({id,title:id,saved_at:'2026-01-01T00:00:00Z',cook_state})
const page=(rows,hasMore=false)=>({rows,hasMore,cursor:rows.length?{id:rows.at(-1).id,saved_at:rows.at(-1).saved_at}:null})
function harness(model) {
 const states=[],refs=[],effects=[],queue=[],timers=new Map(),events=new Map();let si=0,ri=0,ei=0,tid=0,args,result
 const same=(a,b)=>a?.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
 const react={useState(initial){const i=si++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef(initial){const i=ri++;return refs[i]??={current:initial}},useEffect(fn,deps){const i=ei++;if(!effects[i]||!same(effects[i].deps,deps))queue.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()}})}}
 const target={visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}
 const m={exports:{}}
 new Function('require','module','exports','window','document','setTimeout','clearTimeout',ts.transpileModule(readFileSync(new URL('../src/useSavedRecipes.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='react'?react:model,m,m.exports,target,target,fn=>{timers.set(++tid,fn);return tid},id=>timers.delete(id))
 return {events,render(...next){args=next.length?next:args;si=ri=ei=0;result=m.exports.default(...args);while(queue.length)queue.shift()();return result},timers(){for(const [id,fn]of [...timers]){timers.delete(id);fn()}},cleanup(){effects.forEach(e=>e.cleanup?.())}}
}
test('late saved results cannot replace a newer search or survive unmount',async()=>{
 const pending=[];const h=harness({loadSavedPage:()=>new Promise(resolve=>pending.push(resolve))})
 h.render('me','one','all');h.timers();h.render('me','two','all');h.timers()
 pending[0](page([row('wrong')]));await settle();assert.deepEqual(h.render().rows,[])
 pending[1](page([row('two')]));await settle();assert.equal(h.render().rows[0].id,'two')
 h.render('me','three','all');h.timers();h.cleanup();pending[2](page([row('late')]));await settle()
 assert.deepEqual(h.render().rows,[])
})
test('load-more failure preserves visible saves and retries the same cursor',async()=>{
 const cursors=[];let calls=0
 const h=harness({async loadSavedPage(q,f,cursor){cursors.push(cursor);calls++;if(calls===2)throw Error('Offline');return calls===1?page([row()],true):page([row(),row('two')])}})
 h.render('me','','all');h.timers();await settle()
 await h.render().loadMore();assert.equal(h.render().rows.length,1);assert.match(h.render().pageError,/retry/)
 await h.render().loadMore();assert.deepEqual(h.render().rows.map(r=>r.id),['one','two']);assert.deepEqual(cursors[1],cursors[2])
})
test('state writes are guarded, confirmed before display and reversible on failure',async()=>{
 let confirm,calls=0
 const h=harness({loadSavedPage:async()=>page([row()]),changeSavedState:()=>{calls++;return new Promise(resolve=>confirm=resolve)}})
 h.render('me','','all');h.timers();await settle()
 const state=h.render(),writing=state.change('one','cooked');void state.change('one','cooked')
 assert.equal(calls,1);assert.equal(h.render().rows[0].cook_state,'want_to_cook');assert.equal(h.render().pending.has('one'),true)
 confirm('cooked');await writing;assert.equal(h.render().rows[0].cook_state,'cooked');assert.equal(h.render().pending.size,0)
 const failed=harness({loadSavedPage:async()=>page([row()]),changeSavedState:async()=>{throw Error('Not confirmed')}})
 failed.render('me','','all');failed.timers();await settle();await failed.render().change('one','cooked')
 assert.equal(failed.render().rows[0].cook_state,'want_to_cook');assert.match(failed.render().changeError,/Not confirmed/)
})
test('state changes remove a row from its old filter, and unsave removes only the confirmed recipe',async()=>{
 const h=harness({loadSavedPage:async()=>page([row(),row('two')]),changeSavedState:async()=> 'cooked',unsaveRecipe:async()=>{}})
 h.render('me','','want_to_cook');h.timers();await settle();await h.render().change('one','cooked')
 assert.deepEqual(h.render().rows.map(r=>r.id),['two'])
 await h.render().change('two',null);assert.deepEqual(h.render().rows,[])
})
test('a mutation finishing after a filter reload triggers a fresh server read',async()=>{
 let confirm,cooked=false,calls=0
 const h=harness({loadSavedPage:async()=>{calls++;return page(cooked?[row('one','cooked')]:[])},changeSavedState:()=>new Promise(resolve=>confirm=()=>{cooked=true;resolve('cooked')})})
 h.render('me','','all');h.timers();await settle();const change=h.render().change('one','cooked')
 h.render('me','','cooked');h.timers();await settle();assert.deepEqual(h.render().rows,[])
 confirm();await change;h.render();h.timers();await settle();assert.equal(h.render().rows[0].cook_state,'cooked');assert.equal(calls,3)
})
