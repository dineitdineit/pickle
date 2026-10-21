import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const runtime=await import('react/jsx-runtime')
function load(path,mocks={},source) {
 const m={exports:{}}
 const js=ts.transpileModule(source??readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',js)(name=>name==='react'?React:name==='react/jsx-runtime'?runtime:mocks[name]??(name==='./ReportButton'?{default:()=>null}:{}),m,m.exports)
 return m.exports
}
function extract(path,name,context) {
 const ast=ts.createSourceFile('screen.tsx',readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let target
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)target=node.getText(ast);ts.forEachChild(node,visit)}visit(ast)
 assert.ok(target,`Missing function ${name}`)
 const js=ts.transpileModule(target,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 return new Function('require','exports',...Object.keys(context),js+`;return ${name}`)(()=>runtime,{},...Object.values(context))
}
function api(response){const calls=[];return {...load('lib/postComments.ts',{'./supabase':{supabase:{async rpc(name,args){calls.push({name,args});return response}}}}),calls}}
const Badge=load('RecipeAuthorBadge.tsx').default
const comment={id:'comment',user_id:'author',parent_id:null,content:'Made this today!',created_at:'2026-10-16T12:00:00Z',display_name:'Jamie',username:'jamie',avatar_url:null,is_recipe_author:true,reply_count:0,is_deleted:false}

test('post comment pages use a bounded lookahead and keep root/reply requests separate',async()=>{
 const a=api({data:Array.from({length:21},(_,i)=>({...comment,id:`c${i}`}))})
 const page=await a.listPostComments('post',null,0)
 assert.equal(page.rows.length,20);assert.equal(page.more,true)
 await a.listPostComments('post','root',20)
 assert.deepEqual(a.calls[1],{name:'list_post_comments',args:{p_post:'post',p_parent:'root',p_offset:20}})
 await assert.rejects(()=>api({error:{}}).listPostComments('post',null,0))
})
test('comment writes require an exact server acknowledgement and cannot choose author or badge',async()=>{
 const a=api({data:'id'});await a.addPostComment('id','post',' hello ','root')
 assert.deepEqual(a.calls[0],{name:'add_post_comment',args:{p_id:'id',p_post:'post',p_content:'hello',p_parent:'root'}})
 for(const response of [{data:'wrong'},{error:{code:'42501'}},{error:{code:'54000'}}]) await assert.rejects(()=>api(response).addPostComment('id','post','hello',null))
 await api({data:'id'}).deletePostComment('id')
 await assert.rejects(()=>api({data:'wrong'}).deletePostComment('id'))
})
test('notification context finds an older reply and root and rejects missing or cross-thread targets',async()=>{
 const root={...comment,id:'root'},reply={...comment,id:'older',parent_id:'root'}
 const a=api({data:[reply,root]});const result=await a.getPostCommentContext('post','older')
 assert.equal(result.root.id,'root');assert.equal(result.target.id,'older')
 assert.deepEqual(a.calls[0],{name:'get_post_comment_context',args:{p_post:'post',p_comment:'older'}})
 for(const response of [{data:[]},{data:[reply]},{data:[root,{...reply,is_deleted:true}]},{error:{}}]) await assert.rejects(()=>api(response).getPostCommentContext('post','older'))
})
test('post comments and replies display a role badge only for actual recipe-author rows',()=>{
 const Body=extract('PostComments.tsx','CommentBody',{ReportButton:()=>null,RecipeAuthorBadge:Badge,timeAgo:()=> 'Just now'})
 for(const parent_id of [null,'root']) {
  const render=is_recipe_author=>renderToStaticMarkup(React.createElement(Body,{comment:{...comment,parent_id,is_recipe_author},userId:'reader',onDelete(){}}))
  assert.match(render(true),/Recipe author/);assert.ok(!render(false).includes('Recipe author'))
 }
 const deleted=renderToStaticMarkup(React.createElement(Body,{comment:{...comment,is_deleted:true},userId:'author',onDelete(){}}))
 assert.match(deleted,/Comment deleted/);assert.ok(!deleted.includes('Recipe author'));assert.ok(!deleted.includes('Jamie'));assert.ok(!deleted.includes('Made this'))
})
test('recipe comments and replies compare account IDs, including identical display names',()=>{
 const renderComment=extract('RecipeComments.tsx','renderComment',{
  profiles:new Map([['author',{display_name:'Jamie'}],['other',{display_name:'Jamie'}]]),
  recipeAuthorId:'author',userId:'reader',likedCommentIds:new Set(),repliesByParent:new Map(),likeCounts:new Map(),menuCommentId:null,editingCommentId:null,replyingToId:null,
  ReportButton:()=>null,RecipeAuthorBadge:Badge,timeAgo:()=> 'Now',
 })
 for(const reply of [false,true]) {
  assert.match(renderToStaticMarkup(renderComment(comment,reply)),/Recipe author/)
  assert.ok(!renderToStaticMarkup(renderComment({...comment,user_id:'other'},reply)).includes('Recipe author'))
 }
 const detail=readFileSync(new URL('../src/RecipeDetailScreen.tsx',import.meta.url),'utf8')
 assert.match(detail,/<RecipeComments\s+recipeAuthorId=\{recipe.author_id\}/)
})
test('post comment retry reuses its request ID and suppresses overlapping submissions',async()=>{
 let attempts=0;const ids=[],state={text:'hello'}
 const context={userId:'user',text:'hello',replyTo:null,postId:'post',mutation:{current:false},alive:{current:true},attempt:{current:null},
  setBusy(){},setError(value){state.error=value},setText(value){state.text=value},setReplyTo(){},setRevisions(){},
  requireContentConsent:async()=>true,comments:{async load(){}},
  crypto:{randomUUID:()=> 'request-id'},async addPostComment(id){ids.push(id);if(++attempts===1)throw new Error('Offline')},
 }
 const send=extract('PostComments.tsx','send',context)
 await Promise.all([send(),send()]);assert.equal(ids.length,1);assert.equal(state.text,'hello')
 await send();assert.deepEqual(ids,['request-id','request-id']);assert.equal(state.text,'')
})
test('unmounting during policy confirmation prevents a late comment submission',async()=>{
 let called=false
 const context={userId:'user',text:'hello',mutation:{current:false},alive:{current:true},setBusy(){},setError(){},
  async requireContentConsent(){context.alive.current=false;return true},async addPostComment(){called=true},
 }
 await extract('PostComments.tsx','send',context)();assert.equal(called,false)
})
test('reply submission preserves an older loaded root instead of resetting the root pagination',async()=>{
 const seen=[]
 const context={userId:'user',text:'reply',replyTo:{id:'older-root'},postId:'post',mutation:{current:false},alive:{current:true},attempt:{current:null},
  setBusy(){},setError(){},setText(){},setReplyTo(){},setRevisions(fn){assert.deepEqual(fn({}),{'older-root':1})},
  requireContentConsent:async()=>true,crypto:{randomUUID:()=> 'id'},async addPostComment(){},
  comments:{acknowledgeReply(id){seen.push(id)},async load(){throw new Error('Root pagination was reset')}},
 }
 await extract('PostComments.tsx','send',context)();assert.deepEqual(seen,['older-root'])
})
test('confirmed root deletion replaces only that root locally and retains the current threads',async()=>{
 const seen=[]
 const context={deleting:{id:'root',parent_id:null},replyTo:null,mutation:{current:false},alive:{current:true},
  setBusy(){},setError(){},setDeleting(){},async deletePostComment(id){seen.push('delete:'+id)},
  comments:{acknowledgeDeletion(id){seen.push('placeholder:'+id)},async load(){throw new Error('Unexpected thread reset')}},
 }
 await extract('PostComments.tsx','remove',context)();assert.deepEqual(seen,['delete:root','placeholder:root'])
})
test('collapsed post comments render compactly and do not issue feed-wide comment requests',()=>{
 const Component=load('PostComments.tsx',{'./RecipeAuthorBadge':{default:Badge},'./usePostCommentTarget':{default:()=>({context:null,error:'',loading:false})}}).default
 const html=renderToStaticMarkup(React.createElement(Component,{postId:'post',userId:'user'}))
 assert.match(html,/aria-expanded="false"/);assert.match(html,/>Comments</);assert.ok(!html.includes('textarea'))
})
test('an alert opens and highlights an older reply even before ordinary comment pages contain it',()=>{
 const root={...comment,id:'older-root'},target={...comment,id:'older-reply',parent_id:'older-root',content:'A reply from another page'}
 const Component=load('PostComments.tsx',{'./RecipeAuthorBadge':{default:Badge},'./lib/timeAgo':{timeAgo:()=> 'Just now'},'./usePostCommentTarget':{default:()=>({context:{root,target},error:'',loading:false})}}).default
 const html=renderToStaticMarkup(React.createElement(Component,{postId:'post',userId:'user',initialCommentId:'older-reply'}))
 assert.match(html,/aria-expanded="true"/);assert.match(html,/id="post-comment-older-reply"/);assert.match(html,/is-notification-target/);assert.match(html,/A reply from another page/)
 assert.equal((html.match(/id="post-comment-older-reply"/g)??[]).length,1)
 assert.ok(!html.includes('Start the conversation'))
})
