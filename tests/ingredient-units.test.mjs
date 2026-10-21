import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
const module={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync(new URL('../src/lib/ingredientUnits.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports)
const {convertIngredientQuantity:convert,formatIngredientQuantity:format}=module.exports
test('grams and pounds convert both ways without rounding the underlying quantities',()=>{
  assert.equal(convert(453.59237,'g','US').amount,1);assert.equal(convert(1,'lb','Metric').amount,453.59237)
  assert.equal(format(500,'g','US'),'1.1 lb');assert.equal(format(.01,'g','US'),'0 oz')
})
test('volume uses the requested 200 ml cup, 15 ml tablespoon and 5 ml teaspoon',()=>{
  assert.equal(format(5,'ml','US'),'1 tsp');assert.equal(format(15,'ml','US'),'1 tbsp');assert.equal(format(200,'ml','US'),'1 cup');assert.equal(format(400,'ml','US'),'2 cup')
  assert.equal(format(2,'tbsp','Metric'),'30 ml');assert.equal(format(2,'tsp','Metric'),'10 ml');assert.equal(format(.5,'cup','Metric'),'100 ml')
})
test('freeform units and missing quantities stay unchanged in either system',()=>{
  for(const system of ['US','Metric'])for(const unit of ['cloves','pinch','to taste','g drained','pieces']){assert.deepEqual(convert(2,unit,system),{amount:2,unit,converted:false});assert.equal(format(2,unit,system),`2 ${unit}`)}
  assert.equal(format(null,'g','US'),'g');assert.equal(format(.5,'pinch','US'),'0.5 pinch');assert.equal(format(0,'ml','US'),'0 tsp')
})
test('repeated unit switches always derive from the original amount',()=>{
  const source={amount:250,unit:'ml'};assert.equal(format(source.amount,source.unit,'US'),'1.3 cup');assert.equal(format(source.amount,source.unit,'Metric'),'250 ml');assert.equal(format(source.amount,source.unit,'US'),'1.3 cup');assert.deepEqual(source,{amount:250,unit:'ml'})
  assert.equal(format(15,' ML ','US'),'1 tbsp');assert.equal(format(1,'tablespoons','Metric'),'15 ml')
})
test('both converted and original quantities round to at most one decimal',()=>{
  assert.equal(format(1,'lb','Metric'),'453.6 g');assert.equal(format(1.25,'lb','US'),'1.3 lb');assert.equal(format(1.24,'lb','US'),'1.2 lb');assert.equal(format(4.25,'g','Metric'),'4.3 g');assert.equal(format(.33,'pinch','Metric'),'0.3 pinch');assert.equal(format(2,'cloves','US'),'2 cloves')
})
test('weights below 450 grams use ounces, and 450 grams or more use pounds',()=>{
  assert.equal(format(100,'g','US'),'3.5 oz');assert.equal(convert(449.99,'g','US').unit,'oz');assert.equal(convert(450,'g','US').unit,'lb');assert.equal(format(450,'g','US'),'1 lb');assert.equal(format(1,'oz','Metric'),'28.3 g');assert.equal(format(2,'ounces','Metric'),'56.7 g');assert.equal(format(100,'g','Metric'),'100 g')
})
