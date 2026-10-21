import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(file) {
  const module = { exports: {} }
  const js = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('exports','module',js)(module.exports,module)
  return module.exports
}
const { isEligibleBirthday }=load('../src/lib/age.ts')
test('13+ eligibility uses complete dates, birthday boundary and rejects invalid/future dates',()=>{
 const now=new Date('2026-10-15T12:00:00Z')
 assert.equal(isEligibleBirthday('2013-10-15',now),true)
 assert.equal(isEligibleBirthday('2013-10-16',now),false)
 for(const value of ['','2008-02-30','2008-13-01','2027-01-01','18','1890-01-01']) assert.equal(isEligibleBirthday(value,now),false,value)
 assert.equal(isEligibleBirthday('2012-02-29',new Date('2025-02-28T12:00:00Z')),false)
 assert.equal(isEligibleBirthday('2012-02-29',new Date('2025-03-01T12:00:00Z')),true)
})
test('recipe and avatar cleanup walks nested/paged folders and never another account',async()=>{
 const { removeAccountFolder }=load('../supabase/functions/delete-account/storage-folder.ts')
 const uid='00000000-0000-0000-0000-000000000001'
 const files=new Set(Array.from({length:205},(_,i)=>`${uid}/draft/photo${i}.jpg`))
 files.add('other/private.jpg')
 const removed=[]
 const bucket={async list(prefix){const names=new Map(); for(const path of files){if(!path.startsWith(prefix+'/'))continue; const tail=path.slice(prefix.length+1), part=tail.split('/')[0]; names.set(part,{name:part,id:tail.includes('/')?null:part})}return {data:[...names.values()].slice(0,100),error:null}},async remove(paths){for(const path of paths){removed.push(path);files.delete(path)}return {error:null}}}
 await removeAccountFolder({storage:{from(name){assert.equal(name,'community_recipe_images');return bucket}}},'community_recipe_images',uid)
 assert.equal(removed.length,205);assert.deepEqual([...files],['other/private.jpg'])
 await assert.rejects(removeAccountFolder({storage:{from(){throw Error('Unscoped request')}}},'avatars','../other'),/Invalid account scope/)
})
test('failed file cleanup reports failure and leaves data available for an explicit retry',async()=>{
 const { removeAccountFolder }=load('../supabase/functions/delete-account/storage-folder.ts')
 const uid='00000000-0000-0000-0000-000000000001'; let fail=true, exists=true
 const bucket={async list(){return {data:exists?[{name:'image.jpg',id:'image'}]:[],error:null}},async remove(){if(fail)return {error:{message:'failure'}};exists=false;return {error:null}}}
 const client={storage:{from:()=>bucket}}
 await assert.rejects(removeAccountFolder(client,'avatars',uid),/Could not remove/)
 assert.equal(exists,true);fail=false;await removeAccountFolder(client,'avatars',uid);assert.equal(exists,false)
})
