import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

function load(path, require, globals = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
  const module = { exports: {} }
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', ...Object.keys(globals), js)(require, module, module.exports, ...Object.values(globals))
  return module.exports
}
const helpers = load('lib/stepReorder.ts', () => {})

test('moving steps preserves all text, images and stable keys without mutating the original draft', () => {
  const steps = [{key:'a',instruction:'First',step_image:'photo-a'},{key:'b',instruction:'Second'},{key:'c',instruction:'Third'}]
  const reordered = helpers.reorderSteps(steps, 0, 2)
  assert.deepEqual(reordered.map(step => step.key), ['b','c','a'])
  assert.equal(reordered[2], steps[0]);assert.deepEqual(steps.map(step=>step.key), ['a','b','c'])
  assert.deepEqual(helpers.reorderSteps(reordered, 2, 0), steps)
  assert.equal(helpers.reorderSteps(steps, 0, 0), steps)
})
test('drop targets handle unequal card heights and movement across multiple steps', () => {
  const centers = [100, 450, 900]
  assert.equal(helpers.stepDropIndex(centers, 0, 360), 1)
  assert.equal(helpers.stepDropIndex(centers, 0, 850), 2)
  assert.equal(helpers.stepDropIndex(centers, 2, -850), 0)
  assert.equal(helpers.stepDropIndex(centers, 1, 0), 1)
})

function setup(disabled=false) {
  const calls=[],states=[];let hold
  const react={useRef:value=>({current:value}),useEffect:fn=>{fn()},useState:initial=>[initial,value=>states.push(value)]}
  const hook=load('useStepReorder.ts',name=>name==='react'?react:helpers,{window:{scrollY:0,innerHeight:800,scrollBy(){}},setTimeout(fn){hold=fn;return 1},clearTimeout(){hold=null},requestAnimationFrame(){return 1},cancelAnimationFrame(){}}).default
  const result=hook((from,to)=>calls.push([from,to]),disabled)
  result.list.current={querySelectorAll:()=>[0,1,2].map(index=>({getBoundingClientRect:()=>({top:index*224,height:200})}))}
  const event=y=>({button:0,pointerId:1,clientY:y,currentTarget:{setPointerCapture(){}},preventDefault(){}})
  return {result,calls,states,event,hold:()=>hold?.()}
}
test('a short tap never reorders; holding then dragging commits the new position', () => {
  const tap=setup();tap.result.start(tap.event(100),0);tap.result.finish(tap.event(100),true);tap.hold();assert.deepEqual(tap.calls,[])
  const drag=setup();drag.result.start(drag.event(100),0);drag.hold();drag.result.move(drag.event(600));drag.result.finish(drag.event(600),true)
  assert.deepEqual(drag.calls,[[0,2]])
})
test('cancelled gestures and disabled controls never reorder steps', () => {
  const cancelled=setup();cancelled.result.start(cancelled.event(100),0);cancelled.hold();cancelled.result.move(cancelled.event(600));cancelled.result.finish(cancelled.event(600),false);assert.deepEqual(cancelled.calls,[])
  const disabled=setup(true);disabled.result.start(disabled.event(100),0);disabled.hold();disabled.result.move(disabled.event(600));disabled.result.finish(disabled.event(600),true);assert.deepEqual(disabled.calls,[])
})
