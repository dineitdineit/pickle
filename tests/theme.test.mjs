import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'

function harness({blocked=false,platform='android',nativeFailure=false}={}) {
  const storage=new Map(),calls=[],element={dataset:{},style:{}}
  const core={Capacitor:{getPlatform:()=>platform},registerPlugin:()=>({setTheme(options){calls.push(options);return nativeFailure?Promise.reject(Error('bridge unavailable')):Promise.resolve()}})}
  const cache={getItem(key){if(blocked)throw Error('storage blocked');return storage.get(key)??null},setItem(key,value){if(blocked)throw Error('storage blocked');storage.set(key,value)}}
  const module={exports:{}}
  const code=ts.transpileModule(readFileSync(new URL('../src/lib/theme.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('require','module','exports','localStorage','document',code)(()=>core,module,module.exports,cache,{documentElement:element})
  return {...module.exports,storage,calls,element}
}
test('theme uses only the selected account preference and persists a startup default',()=>{
  const h=harness();h.applyTheme('Dark','owner')
  assert.equal(h.readTheme('owner'),'Dark');assert.equal(h.readTheme(),'Dark')
  h.storage.set('pickle:settings:other',JSON.stringify({theme:'Light'}))
  assert.equal(h.readTheme('other'),'Light');assert.equal(h.readTheme('owner'),'Dark')
  assert.equal(h.element.dataset.theme,'dark');assert.equal(h.element.style.colorScheme,'dark')
  assert.deepEqual(h.calls,[{dark:true}])
})
test('unavailable storage or native appearance bridge does not break theme controls',async()=>{
  const h=harness({blocked:true,nativeFailure:true})
  assert.equal(h.readTheme('owner'),'Light');assert.doesNotThrow(()=>h.applyTheme('Dark','owner'))
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(h.element.dataset.theme,'dark');assert.equal(h.element.style.colorScheme,'dark')
})
test('web theme changes do not call a native plugin and invalid cache falls back safely',()=>{
  const h=harness({platform:'web'});h.storage.set('pickle:settings:owner','invalid-json')
  assert.equal(h.readTheme('owner'),'Light');h.applyTheme('Light','owner');assert.equal(h.calls.length,0)
  assert.equal(h.element.dataset.theme,'light');assert.equal(h.element.style.colorScheme,'light')
})
