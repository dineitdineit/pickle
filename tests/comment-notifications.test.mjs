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
test('comment and reply notices have distinct copy, without needing a comment-body snapshot',()=>{
 const {notificationText}=load('lib/notificationText.ts')
 assert.equal(notificationText('recipe_comment','Soup'),'commented on your recipe, Soup.')
 assert.equal(notificationText('comment_reply','Soup'),'replied to your comment on Soup.')
 assert.equal(notificationText('comment_reply',null),'replied to your comment.')
 assert.equal(notificationText('follow'),'started following you.')
 assert.equal(notificationText('new_recipe','Soup'),'published Soup.')
})
test('single-notification read acknowledgement is scoped and requires server confirmation',async()=>{
 const {markNotificationRead}=load('lib/notificationRead.ts')
 for(const response of [{data:[{id:'notice',read_at:'now'}]},{data:[]},{error:{}},{data:[{id:'other',read_at:'now'}]}]) {
  const filters=[]
  const query={update(){return query},eq(...args){filters.push(args);return query},select:async()=>response}
  const task=markNotificationRead({from:()=>query},'recipient','notice')
  if(response.data?.[0]?.id==='notice')assert.equal(await task,'now')
  else await assert.rejects(()=>task)
  assert.deepEqual(filters,[['recipient_id','recipient'],['id','notice']])
 }
})
test('realtime notifications subscribe to the recipient and tear down timers and channels',()=>{
 const effects=[];let subscribed=false,removed=false,callback,intervalCleared=false
 const oldWindow=globalThis.window,oldDocument=globalThis.document
 const events=[];globalThis.window={setInterval(){return 42},clearInterval(id){intervalCleared=id===42},addEventListener(name){events.push(name)},removeEventListener(){}}
 globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}}
 try {
  const channel={on(kind,filter,handler){assert.equal(kind,'postgres_changes');assert.ok(['INSERT','UPDATE'].includes(filter.event));assert.equal(filter.filter,'recipient_id=eq.recipient');callback=handler;return channel},subscribe(){subscribed=true;return channel}}
  const api=load('useNotificationRefresh.ts',{'react':{useRef:v=>({current:v}),useEffect:fn=>effects.push(fn)},'./lib/supabase':{supabase:{channel:()=>channel,removeChannel(value){removed=value===channel}}}})
  api.default('recipient',()=>{});effects[0]();const cleanup=effects[1]()
  assert.ok(subscribed);assert.equal(typeof callback,'function');assert.ok(events.includes('focus'))
  cleanup();assert.ok(removed);assert.ok(intervalCleared)
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument}
})

test('opening a comment notice routes to its exact comment while acknowledging only that notice',async()=>{
 const source=readFileSync(new URL('../src/SocialScreen.tsx',import.meta.url),'utf8')
 const ast=ts.createSourceFile('social.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='openNotice')fn=node.getText(ast);ts.forEachChild(node,visit)}visit(ast)
 const opened=[],acks=[]
 const context={userId:'me',generation:{current:1},supabase:{},markNotificationRead:async(client,recipient,id)=>{acks.push([recipient,id]);return 'now'},setNotices(){},window:{dispatchEvent(){}},Event,onSelectRecipe:(...args)=>opened.push(args),openCook(){throw new Error('Opened profile instead of comment')}}
 const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 const run=new Function(...Object.keys(context),js+';return openNotice')(...Object.values(context))
 run({id:'notice',kind:'comment_reply',recipe_id:'recipe',comment_id:'comment',recipe:{title:'Soup',is_hidden:false},read_at:null})
 await Promise.resolve()
 assert.deepEqual(opened,[['recipe','comment']]);assert.deepEqual(acks,[['me','notice']])
})
