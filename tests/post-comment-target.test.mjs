import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'

function harness(fetcher) {
 const states=[],refs=[],effects=[],callbacks=[];let stateIndex=0,refIndex=0,effectIndex=0,callbackIndex=0;const queue=[]
 const same=(a,b)=>a?.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
 const react={
  useState(initial){const i=stateIndex++;if(!(i in states))states[i]=initial;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value]},
  useRef(initial){const i=refIndex++;return refs[i]??= {current:initial}},
  useCallback(fn,deps){const i=callbackIndex++;if(!callbacks[i]||!same(callbacks[i].deps,deps))callbacks[i]={fn,deps};return callbacks[i].fn},
  useEffect(fn,deps){const i=effectIndex++;if(!effects[i]||!same(effects[i].deps,deps))queue.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()}})},
 }
 const m={exports:{}}
 const js=ts.transpileModule(readFileSync(new URL('../src/usePostCommentTarget.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 const events=new Map(),window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}
 new Function('require','module','exports','window',js)(name=>name==='react'?react:{getPostCommentContext:fetcher},m,m.exports,window)
 return {states,events,render(...args){stateIndex=refIndex=effectIndex=callbackIndex=0;const result=m.exports.default(...args);while(queue.length)queue.shift()();return result},cleanup(){effects.forEach(e=>e.cleanup?.())}}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve))
test('late comment context cannot replace another post or survive unmount',async()=>{
 const pending=[];const h=harness((...args)=>new Promise(resolve=>pending.push({args,resolve})))
 h.render('post-a','comment-a',false);h.render('post-b','comment-b',false)
 pending[0].resolve({root:{id:'a'},target:{id:'a'}});await settle();assert.equal(h.states[0],null)
 pending[1].resolve({root:{id:'b'},target:{id:'b'}});await settle();assert.equal(h.states[0].target.id,'b')
 h.render('post-c','comment-c',false);h.cleanup();pending[2].resolve({target:{id:'c'}});await settle();assert.equal(h.states[0],null)
})
test('safety refresh clears cached conversation data and refetches with visibility checks',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return {root:{id:'root'},target:{id:'target'}}})
 h.render('post','comment',false);await settle();assert.equal(calls,1)
 h.events.get('pickle:safety-refresh')();h.render('post','comment',false);assert.equal(h.states[0],null)
 await settle();assert.equal(calls,2);h.cleanup()
})
