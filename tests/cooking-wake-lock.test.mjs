import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
function harness({native=false,request,plugin}={}) {
 const state={status:''},events=new Map();let cleanup
 const react={useState:()=>['',value=>state.status=value],useEffect:fn=>{cleanup=fn()}}
 const document={visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}
 const m={exports:{}}
 const js=ts.transpileModule(readFileSync(new URL('../src/useCookingWakeLock.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 new Function('require','module','exports','navigator','document',js)(name=>name==='react'?react:{Capacitor:{getPlatform:()=>native?'android':'web'},registerPlugin:()=>plugin},m,m.exports,{wakeLock:request?{request}:undefined},document)
 return {state,events,document,start(enabled=true){m.exports.default(enabled)},stop(){cleanup?.()}}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve))
test('native wake commands are serialized so late enable cannot survive closing cooking mode',async()=>{
 const calls=[];let finish
 const h=harness({native:true,plugin:{setKeepAwake({enabled}){calls.push(enabled);return enabled?new Promise(resolve=>finish=resolve):Promise.resolve()}}})
 h.start();await settle();assert.deepEqual(calls,[true]);h.stop();finish();await settle();assert.deepEqual(calls,[true,false]);assert.equal(h.events.size,0)
})
test('a browser wake request that resolves after unmount is released without a false success',async()=>{
 let finish,released=0
 const h=harness({request:()=>new Promise(resolve=>finish=resolve)})
 h.start();h.stop();finish({release:async()=>released++});await settle()
 assert.equal(released,1);assert.equal(h.state.status,'');assert.equal(h.events.size,0)
})
test('unsupported browsers disclose ordinary screen timeout instead of claiming to stay awake',async()=>{
 const h=harness();h.start();await settle();assert.match(h.state.status,/normal screen timeout/);h.stop()
})
