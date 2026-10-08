import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
const source=readFileSync(new URL('../src/lib/submissions.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const module={exports:{}}
const videoModule={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync(new URL('../src/lib/video.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(videoModule,videoModule.exports)
new Function('require','module','exports',js)(() => videoModule.exports,module,module.exports)
const {newRecipeInput,recipeSubmissionPayload,restoreRecipeInput,validateRecipeInput,assignStepPhotos,newStep}=module.exports
function complete(){const i=newRecipeInput();i.title='  Soup  ';i.description='A simple soup.';i.servings='2';i.cover_image='community:user/draft/cover.jpg';i.difficulty='Easy';i.total_time_minutes='20';i.ingredients[0].name='Water';i.ingredients[0].amount='500';i.ingredients[0].unit='ml';i.steps[0].instruction='Boil.';return i}
test('incomplete recipes save as drafts but cannot publish',()=>{const i=newRecipeInput();assert.deepEqual(validateRecipeInput(i,false),[]);assert.equal(validateRecipeInput(i,true).length,10)})
test('complete recipe publishes without optional ingredients/step photos or nutrition',()=>{assert.deepEqual(validateRecipeInput(complete(),true),[]);const p=recipeSubmissionPayload(complete());assert.equal(p.title,'Soup');assert.equal(p.servings,2);assert.equal(p.ingredients[0].amount,500);assert.equal(p.ingredients_image,'');assert.equal(p.steps[0].step_image,'');assert.equal(p.steps[0].step_time_minutes,null);assert.equal(p.nutrition,null);assert.equal(p.ingredients[0].key,undefined)})
test('enabled nutrition requires all four values and permits zero',()=>{const i=complete();i.nutrition={calories:'0',protein_g:'',carbs_g:'',fat_g:'',is_estimated:true};assert.equal(validateRecipeInput(i,true).length,3);i.nutrition.protein_g=i.nutrition.carbs_g=i.nutrition.fat_g='0';assert.deepEqual(validateRecipeInput(i,true),[]);assert.equal(recipeSubmissionPayload(i).nutrition.fat_g,0)})
test('invalid quantities and fractional cooking times cannot save',()=>{const i=complete();i.total_time_minutes='1.5';i.ingredients[0].amount='-1';i.servings='0';assert.equal(validateRecipeInput(i,false).length,3)})
test('server drafts restore numeric values to editable strings',()=>{const i=complete();i.ingredients[0].amount='0.5';const p=recipeSubmissionPayload(i);const restored=restoreRecipeInput(p);assert.equal(restored.total_time_minutes,'20');assert.equal(restored.servings,'2');assert.equal(restored.ingredients[0].amount,'0.5');assert.deepEqual(validateRecipeInput(restored,true),[])})
const screen=readFileSync(new URL('../src/RecipeUploadScreen.tsx',import.meta.url),'utf8')
function saveAction(context){const ast=ts.createSourceFile('upload.tsx',screen,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='save')fn=n.getText(ast);ts.forEachChild(n,visit)}visit(ast);const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;return new Function(...Object.keys(context),`${js};return save`)(...Object.values(context))}
function saveSetup(response){const state={},calls=[];const context={guard:{current:false},editable:true,input:complete(),initial:{id:'draft'},version:'version',cacheKey:'cache',tagText:'',userId:'user',window:{scrollTo(){}},validateRecipeInput,recipeSubmissionPayload,errorPanel:{current:null},requestAnimationFrame(fn){fn()},localStorage:{removeItem(){}},console:{error(){}},supabase:{async rpc(name,args){calls.push({name,args});return response}},onSaved(id){state.saved=id},...Object.fromEntries(['Errors','Message','Busy','Version','PublishedId','Preview'].map(n=>[`set${n}`,v=>{state[n]=v}]))};return {state,calls,context}}
test('publish confirms a persisted recipe id and sends optimistic draft version',async()=>{const {state,calls,context}=saveSetup({data:{id:'draft',status:'published',recipe_id:'recipe',updated_at:'new'},error:null});await saveAction(context)(true);assert.equal(state.PublishedId,'recipe');assert.equal(state.Message,'업로드 되었습니다.');assert.equal(state.saved,undefined);assert.equal(calls[0].args.p_submit,true);assert.equal(calls[0].args.p_expected_updated_at,'version');assert.equal(state.Version,'new')})
test('failed saves or missing published ids keep the form without success',async()=>{for(const response of [{data:null,error:{code:'40001'}},{data:{id:'draft',status:'published'},error:null}]){const {state,context}=saveSetup(response);await saveAction(context)(true);assert.equal(state.saved,undefined);assert.equal(state.Errors.length,1);assert.equal(context.guard.current,false)}})
test('busy or invalid publish attempts do not send a write',async()=>{for(const busy of [true,false]){const {calls,context}=saveSetup({});context.guard.current=busy;if(!busy)context.input=newRecipeInput();await saveAction(context)(true);assert.equal(calls.length,0)}})

test('new publishing requirements reject blank and whitespace-only fields but allow drafts',()=>{for(const field of ['cover_image','description','servings']){const i=complete();i[field]='  ';assert.equal(validateRecipeInput(i,true).length,1);assert.deepEqual(validateRecipeInput(i,false),[])}for(const field of ['amount','unit']){const i=complete();i.ingredients[0][field]='  ';assert.equal(validateRecipeInput(i,true).length,1);assert.deepEqual(validateRecipeInput(i,false),[])}})

test('bulk photos fill empty steps without overwriting existing photos and append new steps',()=>{const steps=[{...newStep(),instruction:'Keep this',step_image:'existing'},newStep()];const next=assignStepPhotos(steps,['one','two']);assert.equal(next[0].step_image,'existing');assert.equal(next[0].instruction,'Keep this');assert.equal(next[1].step_image,'one');assert.equal(next[2].step_image,'two');assert.equal(steps.length,2);assert.equal(steps[1].step_image,'')})
test('bulk photos enforce the 30-step limit without changing original steps',()=>{const steps=Array.from({length:30},()=>({...newStep(),step_image:'existing'}));assert.throws(()=>assignStepPhotos(steps,['extra']));assert.equal(steps.length,30)})
test('legacy ingredients restore into stable groups and drafts preserve group membership',()=>{const i=complete();i.ingredients=[{...i.ingredients[0],group_name:'Main'},{...i.ingredients[0],group_name:'Main'},{...i.ingredients[0],group_name:'Sauce'}];const restored=restoreRecipeInput(i);assert.equal(restored.ingredients[0].group_key,restored.ingredients[1].group_key);assert.notEqual(restored.ingredients[1].group_key,restored.ingredients[2].group_key);const again=restoreRecipeInput(recipeSubmissionPayload(restored));assert.equal(again.ingredients[0].group_key,restored.ingredients[0].group_key)})
test('custom tags and finished photo persist through draft conversion',()=>{const i=complete();i.tag_names=[' Soup ','Soup'];i.finished_image='community:user/draft/finished.jpg';const p=recipeSubmissionPayload(i);assert.deepEqual(p.tag_names,['Soup']);assert.equal(restoreRecipeInput(p).finished_image,i.finished_image);i.tag_names=['x'.repeat(41)];assert.ok(validateRecipeInput(i,true).some(e=>e.includes('tags')))})
test('save draft stays on the editor with updated version instead of navigating away',async()=>{const {state,context}=saveSetup({data:{id:'draft',status:'draft',updated_at:'next'},error:null});await saveAction(context)(false);assert.equal(state.Version,'next');assert.equal(state.PublishedId,undefined);assert.equal(state.saved,undefined);assert.ok(state.Message.startsWith('Draft saved'))})

function navigationSetup(input, page) {
  const state = { page }, ast = ts.createSourceFile('upload.tsx', screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let fn
  function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === 'goTo') fn = n.getText(ast); ts.forEachChild(n, visit) }
  visit(ast)
  const context = { input, page, editable: true, guard: { current: false }, busy: false, uploading: null, tagText: '', validateRecipeInput, setErrors(v) { state.errors = v }, setMessage() {}, setPreview() {}, setPage(v) { state.page = v }, window: { scrollTo() {} }, requestAnimationFrame(fn) { fn() }, errorPanel: { current: { focus() { state.focused = true } } }, pageHeading: { current: null } }
  const js = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  return { state, goTo: new Function(...Object.keys(context), `${js};return goTo`)(...Object.values(context)) }
}
test('wizard validates only the relevant page fields', () => {
  const input = newRecipeInput()
  input.title = 'Soup'; input.description = 'Boil water'; input.cover_image = 'photo'
  assert.deepEqual(validateRecipeInput(input, true, 0), [])
  assert.ok(validateRecipeInput(input, true, 1).length > 0)
  assert.ok(validateRecipeInput(input, true, 2).length > 0)
})
test('wizard blocks forward movement and direct stage jumps when earlier required fields are missing', () => {
  for (const target of [1, 2]) {
    const { state, goTo } = navigationSetup(newRecipeInput(), 0)
    goTo(target); assert.equal(state.page, 0); assert.ok(state.errors.length > 0); assert.equal(state.focused, true)
  }
  const input = complete(); input.ingredients[0].unit = ' '
  const { state, goTo } = navigationSetup(input, 1)
  goTo(2); assert.equal(state.page, 1); assert.ok(state.errors.some(e => e.includes('unit')))
})
test('wizard allows backwards navigation with incomplete fields and forwards after page completion', () => {
  const back = navigationSetup(newRecipeInput(), 1)
  back.goTo(0); assert.equal(back.state.page, 0); assert.deepEqual(back.state.errors, [])
  const input = complete(); input.steps[0].instruction = ''
  const next = navigationSetup(input, 1)
  next.goTo(2); assert.equal(next.state.page, 2)
})

test('video links are optional, persist in drafts and reject unsafe schemes', () => {
  const input = complete()
  assert.deepEqual(validateRecipeInput(input, true), [])
  input.video_url = ' https://youtu.be/abcdefghijk '
  assert.deepEqual(validateRecipeInput(input, true), [])
  assert.equal(restoreRecipeInput(recipeSubmissionPayload(input)).video_url, 'https://youtu.be/abcdefghijk')
  for (const url of ['javascript:alert(1)', 'http://example.com/video.mp4', 'https://user:pass@example.com/video.mp4', 'not a url']) {
    input.video_url = url; assert.ok(validateRecipeInput(input, true, 0).some(e => e.includes('video')))
  }
})
test('video sources use trusted provider embeds and preserve direct file URLs', () => {
  const {videoSource} = videoModule.exports
  for (const url of ['https://youtu.be/abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/shorts/abcdefghijk']) assert.equal(videoSource(url).url,'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&playsinline=1')
  assert.equal(videoSource('https://vimeo.com/123456').kind, 'embed')
  assert.equal(videoSource('https://example.com/recipe.mp4?token=abc').kind, 'file')
  assert.equal(videoSource('https://youtube.com.evil.com/watch?v=abcdefghijk').kind, 'external')
  assert.equal(videoSource('javascript:alert(1)'), null)
})
