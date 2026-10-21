import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {createRequire} from "node:module"
import {test} from "node:test"
import ts from "typescript"
const require=createRequire(import.meta.url)
function photos(supabase={}){
 const module={exports:{}},source=readFileSync(new URL("../src/lib/chatPhotos.ts",import.meta.url),"utf8")
 new Function("require","module","exports",ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>name==="./imagePrivacy"?{privateImage:async file=>file}:{supabase},module,module.exports)
 return module.exports
}
test("chat photos accept only bounded JPEG, PNG and WebP files",()=>{
 const api=photos()
 assert.equal(api.validateChatPhoto({type:"image/jpeg",size:100}),"jpg")
 for(const file of [{type:"image/svg+xml",size:100},{type:"image/png",size:0},{type:"image/webp",size:5*1024*1024+1}])assert.throws(()=>api.validateChatPhoto(file))
})
test("emoji insertion replaces the selected text and preserves its Unicode cursor position",()=>{
 const api=photos()
 assert.deepEqual(api.insertEmoji("Hello world","😊",6,11),{text:"Hello 😊",position:8})
 assert.deepEqual(api.insertEmoji("Soup","❤️",4,4),{text:"Soup❤️",position:6})
 assert.equal(api.insertEmoji("a".repeat(3000),"😊",3000,3000),null)
})
test("uncertain photo uploads verify the existing object before retrying delivery",async()=>{
 const calls=[]
 const bucket={async upload(path,file,args){calls.push({path,args});return {error:{message:"Response lost"}}},async createSignedUrl(){return {data:{signedUrl:"https://example.invalid/signed"},error:null}}}
 const path=await photos({storage:{from:()=>bucket}}).uploadChatPhoto({type:"image/png",size:100},"sender","recipient","client")
 assert.equal(path,"sender/recipient/client.png");assert.equal(calls[0].args.upsert,false)
 bucket.createSignedUrl=async()=>({error:{message:"Not found"},data:null})
 await assert.rejects(()=>photos({storage:{from:()=>bucket}}).uploadChatPhoto({type:"image/png",size:100},"sender","recipient","client"))
})
test("photo delivery requires a confirmed sender, recipient, body, client ID and exact image path",async()=>{
 const good={id:1,sender_id:"sender",recipient_id:"recipient",client_id:"client",body:"",image_path:"path"}
 for(const field of ["sender_id","recipient_id","client_id","body","image_path"]){
  const api=photos({rpc:async()=>({data:{...good,[field]:"wrong"},error:null})})
  await assert.rejects(()=>api.sendPhotoMessage("recipient","","client","sender","path"))
 }
 assert.equal((await photos({rpc:async()=>({data:good,error:null})}).sendPhotoMessage("recipient","","client","sender","path")).id,1)
})
test("photo-only composer sends and retries with the same uploaded path and idempotency key",async()=>{
 const source=readFileSync(new URL("../src/MessagesScreen.tsx",import.meta.url),"utf8"),ast=ts.createSourceFile("messages.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let fn
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==="submitMessage")fn=node.getText(ast);ts.forEachChild(node,visit)}visit(ast)
 let uploadCount=0,sendCount=0,photoCleared=false,fail=true
 const pending={current:null}
 const context={confirmedSendRevision:{current:0},requireContentConsent:async()=>true,peerId:"peer",peer:{id:"peer"},userId:"me",draft:"",photo:{key:"photo",file:{}},guard:{current:false},pending,generation:{current:1},
  crypto:{randomUUID:()=>"client"},setBusy(){},setSendError(){},setMessages(){},setDraft(){},setPhoto(){photoCleared=true},requestAnimationFrame(){},scroll:{current:null},refreshChat:{current(){}},
  uploadChatPhoto:async()=>{uploadCount++;return "path"},
  sendPhotoMessage:async(peer,body,client,user,path)=>{sendCount++;assert.equal(client,"client");assert.equal(path,"path");if(fail)throw new Error("Unknown delivery");return {id:1}},
 }
 const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 const run=new Function(...Object.keys(context),`${js};return submitMessage`)(...Object.values(context))
 await run();assert.equal(photoCleared,false);fail=false;await run()
 assert.equal(uploadCount,1);assert.equal(sendCount,2);assert.equal(photoCleared,true);assert.equal(pending.current,null)
})
test("chat photo cleanup scopes delivered images to the deleted account and uses the Storage API",async()=>{
 const source=readFileSync(new URL("../supabase/functions/delete-account/chat-images.ts",import.meta.url),"utf8"),module={exports:{}}
 new Function("exports","module",ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(module.exports,module)
 const removed=[],filters=[]
 const query={select(){return query},or(value){filters.push(value);return query},not(){return query},order(){return query},async range(){return {data:[{image_path:"me/peer/photo.jpg"}],error:null}}}
 const admin={from:()=>query,storage:{from:()=>({async remove(paths){removed.push(...paths);return {error:null}},async list(){return {data:[],error:null}}})}}
 await module.exports.removeChatImages(admin,"me")
 assert.deepEqual(filters,["sender_id.eq.me,recipient_id.eq.me"]);assert.deepEqual(removed,["me/peer/photo.jpg"])
})
