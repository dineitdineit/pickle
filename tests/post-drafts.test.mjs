import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
import {IDBFactory,IDBKeyRange,IDBObjectStore} from 'fake-indexeddb'
globalThis.indexedDB=new IDBFactory()
globalThis.IDBKeyRange=IDBKeyRange
function load(path,mocks={}) {
 const m={exports:{}}
 new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>mocks[name]??{},m,m.exports)
 return m.exports
}
const photos=load('lib/postPhoto.ts')
const drafts=load('lib/postDrafts.ts',{'./postPhoto':photos})
const image=(text)=>new File([text],'photo.webp',{type:'image/webp',lastModified:1234})
function snapshot() {
 const original=image('original sanitized pixels'),cropped=image('cropped sanitized pixels')
 return {id:crypto.randomUUID(),photos:[{id:crypto.randomUUID(),original,file:cropped,edits:{...photos.newPhotoEdits(),filter:'Warm',brightness:20,text:'Dinner',vignette:35}}],caption:'Made this today',recipeTag:{id:crypto.randomUUID(),title:'Ginger rice',cover_image:null,author_name:'Cook'},stage:'caption',selected:0,tab:'Edit',tool:'brightness',publishAttempted:false}
}
async function inspect(action) {
 const request=indexedDB.open('pickle-post-drafts',1)
 const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
 try{return await action(db)}finally{db.close()}
}
async function count(store,owner) {
 return inspect(db=>new Promise((resolve,reject)=>{const tx=db.transaction(store),request=store==='assets'?tx.objectStore(store).index('owner').count(owner):tx.objectStore(store).count(owner);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)}))
}
test('drafts restore file bytes, crop source, edits, caption, tag, stage and stable publish ID',async()=>{
 const owner=crypto.randomUUID(),state=snapshot(),writer=new drafts.PostDraftSession(owner)
 await writer.read();await writer.save(state)
 const loaded=await new drafts.PostDraftSession(owner).read()
 assert.equal(loaded.snapshot.id,state.id);assert.deepEqual(loaded.snapshot.recipeTag,state.recipeTag)
 assert.equal(loaded.snapshot.caption,state.caption);assert.equal(loaded.snapshot.stage,'caption');assert.equal(loaded.snapshot.tab,'Edit')
 assert.deepEqual(loaded.snapshot.photos[0].edits,state.photos[0].edits)
 assert.equal(await loaded.snapshot.photos[0].original.text(),'original sanitized pixels')
 assert.equal(await loaded.snapshot.photos[0].file.text(),'cropped sanitized pixels')
 assert.equal(loaded.snapshot.photos[0].file.name,'photo.webp')
 assert.equal(await new drafts.PostDraftSession(crypto.randomUUID()).read(),null)
})
test('caption and slider autosaves do not rewrite existing photo blobs',async()=>{
 const owner=crypto.randomUUID(),state=snapshot(),writer=new drafts.PostDraftSession(owner)
 await writer.read();await writer.save(state)
 let writes=0;const put=IDBObjectStore.prototype.put
 IDBObjectStore.prototype.put=function(...args){if(this.name==='assets')writes++;return put.apply(this,args)}
 try{await writer.save({...state,caption:'A new caption'});assert.equal(writes,0);assert.equal(await count('assets',owner),2)}finally{IDBObjectStore.prototype.put=put}
})
test('replaced crops and removed photos are reclaimed while originals remain recoverable',async()=>{
 const owner=crypto.randomUUID(),state=snapshot(),writer=new drafts.PostDraftSession(owner)
 const second=image('second photo');state.photos.push({id:crypto.randomUUID(),original:second,file:second,edits:photos.newPhotoEdits()})
 await writer.read();await writer.save(state);assert.equal(await count('assets',owner),3)
 await writer.save({...state,photos:[{...state.photos[0],file:state.photos[0].original}]})
 assert.equal(await count('assets',owner),1)
 const loaded=await new drafts.PostDraftSession(owner).read();assert.equal(await loaded.snapshot.photos[0].file.text(),'original sanitized pixels')
})
test('discard drains pending writes and cannot be undone by a late autosave',async()=>{
 const owner=crypto.randomUUID(),writer=new drafts.PostDraftSession(owner)
 await writer.read();const writing=writer.save(snapshot()),clearing=writer.clear()
 await writing;await clearing;await assert.rejects(()=>writer.save(snapshot()))
 assert.equal(await new drafts.PostDraftSession(owner).read(),null);assert.equal(await count('assets',owner),0)
})
test('another editor cannot overwrite or discard a more recent draft revision',async()=>{
 const owner=crypto.randomUUID(),state=snapshot(),first=new drafts.PostDraftSession(owner)
 await first.read();await first.save(state)
 const second=new drafts.PostDraftSession(owner);await second.read()
 await first.save({...state,caption:'Latest draft'})
 await assert.rejects(()=>second.save({...state,caption:'Stale draft'}),drafts.DraftConflict)
 await assert.rejects(()=>second.clear(),drafts.DraftConflict)
 assert.equal((await new drafts.PostDraftSession(owner).read()).snapshot.caption,'Latest draft')
})
test('a failed blob transaction rolls back both metadata and files',async()=>{
 const owner=crypto.randomUUID(),state=snapshot(),writer=new drafts.PostDraftSession(owner)
 await writer.read();await writer.save(state)
 const put=IDBObjectStore.prototype.put
 IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(this.name==='assets')queueMicrotask(()=>{try{this.transaction.abort()}catch{}});return request}
 try{await assert.rejects(()=>writer.save({...state,caption:'Should roll back',photos:[{...state.photos[0],file:image('new crop')}]}))}finally{IDBObjectStore.prototype.put=put}
 const restored=await new drafts.PostDraftSession(owner).read()
 assert.equal(restored.snapshot.caption,state.caption);assert.equal(await restored.snapshot.photos[0].file.text(),'cropped sanitized pixels');assert.equal(await count('assets',owner),2)
})
test('expiry removes photos and metadata on the next storage open, including other cached accounts',async()=>{
 const owner=crypto.randomUUID(),writer=new drafts.PostDraftSession(owner);await writer.read();await writer.save(snapshot())
 await inspect(db=>new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),request=store.get(owner);request.onsuccess=()=>store.put({...request.result,updatedAt:Date.now()-drafts.POST_DRAFT_TTL-1});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)}))
 await new drafts.PostDraftSession(crypto.randomUUID()).read()
 assert.equal(await count('drafts',owner),0);assert.equal(await count('assets',owner),0)
})
test('account deletion invalidates active writers and clears only that account',async()=>{
 const owner=crypto.randomUUID(),other=crypto.randomUUID(),writer=new drafts.PostDraftSession(owner),otherWriter=new drafts.PostDraftSession(other)
 await writer.read();await otherWriter.read();await writer.save(snapshot());await otherWriter.save(snapshot())
 await drafts.clearAccountPostDrafts(owner)
 await assert.rejects(()=>writer.save(snapshot()));assert.equal(await count('assets',owner),0)
 assert.ok(await otherWriter.read());await assert.rejects(()=>new drafts.PostDraftSession(owner).read())
})
test('empty content is not kept as a phantom draft and attempted Share state survives recovery',async()=>{
 const owner=crypto.randomUUID(),state=snapshot(),writer=new drafts.PostDraftSession(owner)
 await writer.read();await writer.save({...state,publishAttempted:true});assert.equal((await new drafts.PostDraftSession(owner).read()).snapshot.publishAttempted,true)
 await writer.save({...state,stage:'select',photos:[],caption:'',recipeTag:null})
 assert.equal(await new drafts.PostDraftSession(owner).read(),null);assert.equal(await count('assets',owner),0)
})
