import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
function load(path){const m={exports:{}};const js=ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('module','exports',js)(m,m.exports);return m.exports}
const c=load('lib/cooking.ts'),units=load('lib/ingredientUnits.ts')
const ingredients=[{id:'egg',amount:2,unit:'pieces',ingredients:{name:'Egg'}},{id:'oil',amount:15,unit:'ml',ingredients:{name:'Oil'}}]
const steps=[{id:'heat',step_number:1,instruction:'Heat oil',step_time_minutes:1},{id:'fry',step_number:2,instruction:'Fry eggs',step_time_minutes:3}]
const signature=c.cookingSignature(ingredients,steps,2)
test('serving adjustments derive from original quantities and keep vague or missing quantities intact',()=>{
 assert.equal(c.scaledIngredientAmount(2,'cloves',2,3),3)
 assert.equal(c.scaledIngredientAmount(null,'salt',2,4),null)
 assert.equal(c.scaledIngredientAmount(1,'to taste',2,4),1)
 assert.equal(c.scaledIngredientAmount(1,'as needed',2,4),1)
 for(const original of [null,0,-1,Infinity])assert.equal(c.scaledIngredientAmount(2,'pieces',original,4),2)
 assert.equal(units.formatIngredientQuantity(c.scaledIngredientAmount(15,'ml',2,4),'ml','US'),'2 tbsp')
 assert.equal(units.formatIngredientQuantity(c.scaledIngredientAmount(15,'ml',2,4),'ml','Metric'),'30 ml')
 assert.equal(ingredients[1].amount,15)
})
test('resume restores independent ingredient/step checkoffs and sanitizes stale or duplicated IDs',()=>{
 const stored={...c.freshCookingProgress(signature,steps,2),ingredients:['egg','egg','other'],steps:['fry','fry','removed'],activeStep:'fry',servings:4,units:'Metric'}
 const result=c.restoreCookingProgress(stored,signature,ingredients,steps,2)
 assert.deepEqual(result.ingredients,['egg']);assert.deepEqual(result.steps,['fry']);assert.equal(result.activeStep,'fry');assert.equal(result.servings,4);assert.equal(result.units,'Metric')
 assert.deepEqual(c.toggleCookingId(result.steps,'fry'),[])
 assert.deepEqual(c.toggleCookingId(result.steps,'heat'),['fry','heat'])
})
test('a changed recipe, expired/future state or malformed storage starts a clean session',()=>{
 const stored={...c.freshCookingProgress(signature,steps,2),steps:['heat']}
 for(const input of [null,{},'bad',{...stored,version:2},{...stored,updatedAt:Date.now()-c.COOKING_TTL-1},{...stored,updatedAt:Date.now()+120000}])assert.deepEqual(c.restoreCookingProgress(input,signature,ingredients,steps,2).steps,[])
 const next=c.cookingSignature(ingredients,[{...steps[0],instruction:'Updated instruction'},steps[1]],2)
 assert.notEqual(signature,next)
 assert.deepEqual(c.restoreCookingProgress(stored,next,ingredients,steps,2).steps,[])
 assert.notEqual(c.cookingKey('recipe','alice'),c.cookingKey('recipe','bob'))
 assert.notEqual(c.cookingKey('recipe',null),c.cookingKey('recipe','alice'))
})
test('timers use deadlines rather than interval counts and preserve pauses and concurrent steps',()=>{
 const one=c.startCookingTimer(1,1000),two=c.startCookingTimer(3,1000)
 assert.equal(c.timerRemaining(one,0),60000)
 assert.equal(c.timerRemaining(one,31000),30000)
 assert.equal(c.timerRemaining(one,61000),0)
 assert.equal(c.timerRemaining(two,61000),120000)
 const paused=c.pauseCookingTimer(two,61000)
 assert.equal(c.timerRemaining(paused,900000),120000)
 const resumed={...paused,endsAt:900000+paused.remainingMs}
 assert.equal(c.timerRemaining(resumed,960000),60000)
 assert.equal(c.timerLabel(999),'0:01');assert.equal(c.timerLabel(3600000),'1:00:00')
 for(const value of [0,-1,NaN,Infinity,1441,.001])assert.throws(()=>c.startCookingTimer(value,0))
})
test('timer restoration accepts elapsed deadlines and rejects invalid, oversized or orphan timers',()=>{
 const now=100000,stored={...c.freshCookingProgress(signature,steps,2),updatedAt:now,timers:{heat:{remainingMs:60000,endsAt:50000},fry:{remainingMs:Infinity,endsAt:null},orphan:{remainingMs:5,endsAt:null}}}
 const result=c.restoreCookingProgress(stored,signature,ingredients,steps,2,now)
 assert.deepEqual(Object.keys(result.timers),['heat']);assert.equal(c.timerRemaining(result.timers.heat,now),0)
 assert.equal(c.restoreCookingProgress({...stored,servings:1001},signature,ingredients,steps,2,now).servings,2)
})
test('account deletion clears this account cooking cache without touching other accounts',()=>{
 const keys=new Map([['pickle:cooking:alice:recipe','x'],['pickle:cooking:bob:recipe','x'],['pickle:recipe-draft:alice','x'],['unrelated','x']])
 const before=globalThis.localStorage
 globalThis.localStorage={get length(){return keys.size},key:i=>[...keys.keys()][i],removeItem:key=>keys.delete(key)}
 try {load('lib/accountData.ts').clearDeletedAccountCache('alice');assert.ok(!keys.has('pickle:cooking:alice:recipe'));assert.ok(keys.has('pickle:cooking:bob:recipe'));assert.ok(keys.has('unrelated'))} finally {globalThis.localStorage=before}
})
