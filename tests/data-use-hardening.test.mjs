import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
function load(file,mocks={}) {
 const module={exports:{}}
 const js=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',js)(name=>mocks[name]??{},module,module.exports)
 return module.exports
}

test('pixel-only image encoding drops source bytes, preserves orientation and closes decoder',async()=>{
 const old={document:globalThis.document,createImageBitmap:globalThis.createImageBitmap}
 let closed=0,drawn=0,orientation
 globalThis.createImageBitmap=async(file,options)=>{orientation=options.imageOrientation;return {width:4000,height:2000,close(){closed++}}}
 globalThis.document={createElement(){return {getContext(){return {drawImage(){drawn++}}},toBlob(callback){callback(new Blob(['new-pixel-image'],{type:'image/webp'}))}}}}
 try {
  const {privateImage}=load('src/lib/imagePrivacy.ts')
  const original=new File(['EXIF-GPS-secret'], 'original.jpg',{type:'image/jpeg'})
  const result=await privateImage(original)
  assert.notEqual(result,original);assert.equal(await result.text(),'new-pixel-image')
  assert.equal(result.type,'image/webp');assert.equal(result.name,'photo.webp')
  assert.equal(orientation,'from-image');assert.equal(drawn,1);assert.equal(closed,1)
  await assert.rejects(()=>privateImage(new File(['svg'],'x.svg',{type:'image/svg+xml'})))
  globalThis.document={createElement(){return {getContext(){return null}}}}
  await assert.rejects(()=>privateImage(original));assert.equal(closed,2)
 }finally{Object.assign(globalThis,old)}
})

test('private recipe URLs require a successful short-lived policy-checked response',async()=>{
 let fail=false;const calls=[]
 const api=load('src/lib/recipe.ts',{'./supabase':{supabase:{storage:{from(bucket){return {async createSignedUrl(path,seconds){calls.push({bucket,path,seconds});return fail?{error:{}}:{data:{signedUrl:'https://signed.invalid/photo'}}}}}}}}})
 assert.equal(api.recipeImageUrl('community:owner/draft/photo.webp'),'community:owner/draft/photo.webp')
 assert.equal(await api.resolveRecipeImageUrl('community:owner/draft/photo.webp'),'https://signed.invalid/photo')
 assert.deepEqual(calls,[{bucket:'community_recipe_images',path:'owner/draft/photo.webp',seconds:300}])
 fail=true;await assert.rejects(()=>api.resolveRecipeImageUrl('community:owner/draft/photo.webp'))
})

test('recent searches persist for the same account but never cross logout or account changes',()=>{
 const previous=globalThis.localStorage;const values=new Map()
 globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
 try {
  const api=load('src/recentSearches.ts')
  api.syncSearchOwner('first');api.addRecentSearch('Chicken')
  api.syncSearchOwner('first');assert.deepEqual(api.getRecentSearches(),['Chicken'])
  api.syncSearchOwner('second');assert.deepEqual(api.getRecentSearches(),[])
  api.addRecentSearch('Soup');api.syncSearchOwner(null,true);assert.deepEqual(api.getRecentSearches(),[])
 }finally{globalThis.localStorage=previous}
})

test('asset worker retries Storage errors and never acknowledges an unsuccessful removal',async()=>{
 const {cleanRecipeAssets}=load('supabase/functions/recipe-asset-worker/worker.ts')
 const job={path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/draft/photo.webp',lease:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}
 for(const failure of ['storage','ack',null]) {
  let claimed=false;const actions=[],removed=[]
  const admin={rpc:async(name,args)=>{actions.push(args.p_action);if(args.p_action==='claim'){if(claimed)return {data:null};claimed=true;return {data:job}};return {data:args.p_action==='ack'?failure!=='ack':true}},storage:{from(bucket){assert.equal(bucket,'community_recipe_images');return {async remove(paths){removed.push(paths);return {error:failure==='storage'?{}:null}}}}}}
  const result=await cleanRecipeAssets(admin)
  assert.deepEqual(removed,[[job.path]])
  assert.equal(result.removed,failure?0:1);assert.equal(result.retry,failure?1:0)
  if(failure==='storage')assert.ok(!actions.includes('ack'))
  if(failure)assert.ok(actions.includes('retry'))
 }
})

test('a late signed-image request cannot restore private media after sign-out',async()=>{
 const previous=globalThis.window;let effect,auth;const states=[],requests=[]
 globalThis.window={setInterval(){return 1},clearInterval(){}}
 const api=load('src/RecipeImage.tsx',{
  'react':{useState:()=>[null,value=>states.push(value)],useEffect:fn=>{effect=fn}},
  'react/jsx-runtime':{jsx:(_,props)=>props},
  './lib/recipe':{resolveRecipeImageUrl:()=>new Promise(resolve=>requests.push(resolve))},
  './lib/supabase':{supabase:{auth:{onAuthStateChange(fn){auth=fn;return {data:{subscription:{unsubscribe(){}}}}}}}},
 })
 let cleanup
 try {
  api.default({src:'community:owner/draft/photo.webp'});cleanup=effect()
  auth('INITIAL_SESSION',{user:{id:'owner'}})
  auth('SIGNED_OUT',null)
  requests[0]('https://stale.invalid/private');await Promise.resolve();await Promise.resolve()
  assert.equal(states.at(-1),null)
  await new Promise(resolve=>setTimeout(resolve,5))
  requests[1]('https://new.invalid/public');await Promise.resolve()
  assert.equal(states.at(-1).url,'https://new.invalid/public')
  const before=requests.length;auth('SIGNED_IN',null);await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(requests.length,before)
 } finally {cleanup?.();globalThis.window=previous}
})
