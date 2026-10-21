import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'

function load(path,mocks={}) {
 const module={exports:{}}
 const js=ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 new Function('require','module','exports',js)(name=>mocks[name]??{},module,module.exports)
 return module.exports
}
const pixels=load('lib/postPhoto.ts')
function edit(values,changes={},width=1,height=1){ const data=new Uint8ClampedArray(values);pixels.editPhotoPixels(data,width,height,{...pixels.newPhotoEdits(),...changes});return [...data] }

test('original preserves pixels and alpha; warm, cool, monochrome and saturation bake into RGB',()=>{
 assert.deepEqual(edit([140,80,40,77]),[140,80,40,77])
 const warm=edit([140,80,40,77],{filter:'Warm'}),cool=edit([140,80,40,77],{filter:'Cool'})
 assert.ok(warm[0]>140&&warm[2]<40&&cool[0]<140&&cool[2]>40)
 const mono=edit([140,80,40,77],{filter:'Mono'})
 assert.equal(mono[0],mono[1]);assert.equal(mono[1],mono[2]);assert.equal(mono[3],77)
 assert.deepEqual(edit([140,80,40,77],{saturation:-100}),mono)
 assert.notDeepEqual(edit([140,80,40,77],{filter:'Vivid'}),edit([140,80,40,77]))
 assert.notDeepEqual(edit([140,80,40,77],{filter:'Vintage'}),edit([140,80,40,77]))
})
test('brightness, contrast, tone, temperature and vignette operate on their intended regions',()=>{
 assert.ok(edit([100,100,100,255],{brightness:50})[0]>100)
 assert.ok(edit([60,60,60,255],{contrast:50})[0]<60)
 assert.ok(edit([220,220,220,255],{highlights:30})[0]-220 > edit([30,30,30,255],{highlights:30})[0]-30)
 assert.ok(edit([30,30,30,255],{shadows:30})[0]-30 > edit([220,220,220,255],{shadows:30})[0]-220)
 assert.ok(edit([100,100,100,255],{temperature:80})[0]>100)
 const solid=Array.from({length:25},()=>[100,100,100,80]).flat(),v=edit(solid,{vignette:100},5,5)
 assert.ok(v[0]<v[12*4]);assert.equal(v[12*4],100);assert.equal(v[3],80)
})
test('sharpness enhances edges without altering flat pixels or alpha',()=>{
 assert.deepEqual(edit([100,100,100,90],{sharpness:100}),[100,100,100,90])
 const v=edit([100,100,100,90,150,150,150,90,100,100,100,90],{sharpness:100},3,1)
 assert.ok(v[4]>150);assert.ok(v[0]<100);assert.equal(v[7],90)
})
test('renderer rotates dimensions, covers tilted corners, bakes text and closes bitmap even on failure',async()=>{
 const oldBitmap=globalThis.createImageBitmap,oldDocument=globalThis.document
 let closed=0,rotation,scale,drawn=0,text=0,fail=false
 const ctx={fillRect(){},save(){},translate(){},rotate(v){rotation=v},scale(x,y){scale=[x,y]},drawImage(){drawn++},restore(){},getImageData(){if(fail)throw Error('decode failure');return{data:new Uint8ClampedArray(8*4)}},putImageData(){},measureText(s){return{width:s.length*4}},strokeText(){text++},fillText(){text++}}
 globalThis.createImageBitmap=async()=>({width:400,height:200,close(){closed++}})
 globalThis.document={createElement(){return{width:0,height:0,getContext(){return ctx}}}}
 try{
  const result=await pixels.renderPostPhoto({}, {...pixels.newPhotoEdits(),rotation:90,tilt:8,text:'Dinner'},100)
  assert.equal(result.width,50);assert.equal(result.height,100);assert.ok(scale[0]>1);assert.ok(rotation>Math.PI/2);assert.equal(drawn,1);assert.ok(text>=2);assert.equal(closed,1)
  fail=true;await assert.rejects(()=>pixels.renderPostPhoto({},pixels.newPhotoEdits()),/decode failure/);assert.equal(closed,2)
 }finally{globalThis.createImageBitmap=oldBitmap;globalThis.document=oldDocument}
})

function uploader(responses={}) {
 const calls=[],uploads=[],bucket={async upload(path,file,options){uploads.push({path,file,options});return responses.upload??{data:{path}}},async createSignedUrl(){return responses.exists??{error:{message:'not found'}}}}
 const client={storage:{from(name){assert.equal(name,'community_recipe_images');return bucket}},async rpc(name,args){calls.push({name,args});if(name==='ensure_post_draft')return responses.draft??{data:{id:'post',status:'draft'}};if(name==='publish_photo_post'||name==='publish_recipe_photo_post')return responses.publish??{data:{id:'post',status:'published'}};return{data:true}}}
 const api=load('lib/photoPosts.ts',{'./supabase':{supabase:client},'./postPhoto':{async exportPostPhoto(file,edits){assert.ok(edits);return file}}})
 return{...api,calls,uploads}
}
function photos(){return ['first','second'].map(id=>({id,file:new File([id],id+'.webp',{type:'image/webp'}),edits:pixels.newPhotoEdits()}))}
test('sharing uploads normalized immutable photos in order and requires published acknowledgement',async()=>{
 const u=uploader(),status=[]
 assert.equal(await u.sharePhotoPost('owner','post',' Dinner ',photos(),v=>status.push(v)),'post')
 assert.equal(u.uploads.length,2);assert.equal(u.uploads[0].options.upsert,false)
 assert.match(u.uploads[0].path,/^owner\/post\/first-[a-f0-9]{64}\.webp$/)
 const publish=u.calls.find(v=>v.name==='publish_photo_post')
 assert.deepEqual(publish.args.p_photos,u.uploads.map(v=>'community:'+v.path));assert.equal(status.at(-1),'Sharing your post…')
 for(const invalid of [{data:null},{data:{id:'other',status:'published'}},{error:{message:'offline'}}]){
  const failed=uploader({publish:invalid});await assert.rejects(()=>failed.sharePhotoPost('owner','post','',photos(),()=>{}));assert.ok(!failed.calls.some(v=>v.name==='discard_recipe_uploads'))
 }
})
test('upload failures stop publish; lost upload/publish responses retry safely without duplicating posts',async()=>{
 const failed=uploader({upload:{error:{}}});await assert.rejects(()=>failed.sharePhotoPost('owner','post','',photos(),()=>{}),/upload failed/);assert.ok(!failed.calls.some(v=>v.name==='publish_photo_post'))
 const already=uploader({draft:{data:{id:'post',status:'published'}}});assert.equal(await already.sharePhotoPost('owner','post','',photos(),()=>{}),'post');assert.equal(already.uploads.length,0)
 const retry=uploader({upload:{error:{}},exists:{data:{signedUrl:'confirmed'}}});await retry.sharePhotoPost('owner','post','',photos(),()=>{});assert.equal(retry.uploads.length,2)
})
test('invalid counts, caption and mismatched draft acknowledgements never publish',async()=>{
 for(const list of [[],Array(11).fill(photos()[0])]){const u=uploader();await assert.rejects(()=>u.sharePhotoPost('owner','post','',list,()=>{}));assert.equal(u.calls.length,0)}
 const u=uploader();await assert.rejects(()=>u.sharePhotoPost('owner','post','x'.repeat(2201),photos(),()=>{}));assert.equal(u.calls.length,0)
 const wrong=uploader({draft:{data:{id:'other',status:'draft'}}});await assert.rejects(()=>wrong.sharePhotoPost('owner','post','',photos(),()=>{}));assert.equal(wrong.uploads.length,0)
})

test('tagged sharing sends the selected recipe through the atomic tagged publish RPC',async()=>{const u=uploader();await u.sharePhotoPost('owner','post','Made this',photos(),()=>{},'recipe');const publish=u.calls.find(c=>c.name==='publish_recipe_photo_post');assert.equal(publish.args.p_recipe,'recipe');assert.equal(publish.args.p_caption,'Made this');assert.equal(publish.args.p_photos.length,2)})
