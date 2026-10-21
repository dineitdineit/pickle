import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const runtime=await import('react/jsx-runtime')
function load(path,mocks={}) {
 const module={exports:{}}
 const js=ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports','window',js)(name=>name==='react'?mocks.react??React:name==='react/jsx-runtime'?runtime:mocks[name]??{},module,module.exports,{addEventListener(){},removeEventListener(){}})
 return module.exports
}
const model=load('lib/postFeed.ts')
const post=(id,changes={})=>({id,author_id:'cook',caption:'Dinner tonight',published_at:'2026-10-16T12:00:00.123456+00:00',is_hidden:false,author:{display_name:'Jamie',username:'jamie',avatar_url:null},photos:[{id:'second',image_path:'community:b.webp',position:1},{id:'first',image_path:'community:a.webp',position:0}],...changes})
test('home feed is bounded and excludes drafts/hidden rows; profiles and direct links remain scoped',()=>{
 const calls=[],query={};for(const method of ['select','eq','order','limit','or'])query[method]=(...args)=>{calls.push([method,...args]);return query}
 const client={from(name){assert.equal(name,'photo_posts');return query}}
 model.postFeedQuery({limit:4},client)
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='status'&&c[2]==='published'));assert.ok(calls.some(c=>c[1]==='is_hidden'&&c[2]===false));assert.deepEqual(calls.filter(c=>c[0]==='order').map(c=>c[1]),['published_at','id']);assert.deepEqual(calls.at(-1),['limit',5])
 calls.length=0;model.postFeedQuery({authorId:'cook',limit:18},client);assert.ok(calls.some(c=>c[1]==='author_id'&&c[2]==='cook'));assert.deepEqual(calls.at(-1),['limit',19])
 calls.length=0;model.postFeedQuery({postId:'target'},client);assert.ok(calls.some(c=>c[1]==='id'&&c[2]==='target'));assert.ok(!calls.some(c=>c[1]==='is_hidden'));assert.deepEqual(calls.at(-1),['limit',1])
})
test('pagination preserves PostgreSQL microseconds and uses an ID tie breaker',()=>{
 const calls=[],q={};for(const method of ['select','eq','order','limit','or'])q[method]=(...args)=>{calls.push([method,...args]);return q}
 const client={from:()=>q},before={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',published_at:'2026-10-16T12:00:00.123456+00:00'}
 model.postFeedQuery({before},client)
 const filter=calls.find(c=>c[0]==='or')[1];assert.match(filter,/123456/);assert.match(filter,/id\.lt\.aaaaaaaa/)
 assert.throws(()=>model.postFeedQuery({before:{...before,id:'malformed,or(id.eq.any)'}},client));assert.throws(()=>model.postFeedQuery({before:{...before,published_at:'2026-10-16,or(id.eq.any)'}},client))
})
test('photo order is deterministic without mutating stored data; page merge avoids duplicate cards',()=>{
 const row=post('one');assert.deepEqual(model.orderedPhotos(row).map(p=>p.id),['first','second']);assert.equal(row.photos[0].id,'second')
 assert.deepEqual(model.mergePostPage([row],[row,post('two')]).map(p=>p.id),['one','two'])
 assert.equal(model.initialPhotoPostId('?post=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');assert.equal(model.initialPhotoPostId('?post=not-a-uuid'),null)
})
function hookHarness(query) {
 const states=[],refs=[],effects=[];let si=0,ri=0,ei=0
 const react={useState(initial){const i=si++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial})},useEffect(fn,deps){const i=ei++,previous=effects[i];if(!previous||deps.some((v,j)=>!Object.is(v,previous.deps[j])))effects[i]={fn,deps,cleanup:previous?.cleanup,pending:true};}}
 const api=load('usePhotoPosts.ts',{react,'./lib/postFeed':{...model,postFeedQuery:query},'./lib/postRecipeTags':{attachPostRecipeTags:async rows=>rows}})
 return{render(options){si=ri=ei=0;return api.default({viewerId:'me',pageSize:2,...options})},flush(){for(const e of effects)if(e.pending){e.cleanup?.();e.cleanup=e.fn();e.pending=false}},cleanup(){for(const e of effects)e.cleanup?.()},states}
}
const settle=async()=>{await Promise.resolve();await Promise.resolve()}
test('load more keeps earlier cards, prevents duplicate clicks and preserves rows on failure',async()=>{
 const calls=[];let next
 const h=hookHarness(options=>{calls.push(options);return calls.length===1?Promise.resolve({data:[post('a'),post('b'),post('c')]}):new Promise(resolve=>{next=resolve})})
 h.render();h.flush();await settle();let feed=h.render();assert.equal(feed.rows.length,2);assert.ok(feed.hasMore)
 const task=feed.loadMore();await feed.loadMore();assert.equal(calls.length,2);assert.equal(calls[1].before.id,'b')
 next({error:{message:'offline'}});await task;feed=h.render();assert.deepEqual(feed.rows.map(p=>p.id),['a','b']);assert.ok(feed.error);assert.equal(feed.loading,false)
 const retry=feed.loadMore();next({data:[post('b'),post('c')]});await retry;feed=h.render();assert.deepEqual(feed.rows.map(p=>p.id),['a','b','c']);assert.equal(feed.hasMore,false);h.cleanup()
})
test('late profile/account responses cannot replace the current feed or expose previous scope rows',async()=>{
 const resolvers=[];const h=hookHarness(()=>new Promise(resolve=>resolvers.push(resolve)))
 h.render({authorId:'first'});h.flush();h.render({authorId:'second',viewerId:'other'});h.flush()
 resolvers[1]({data:[post('second')]});await settle();assert.equal(h.render({authorId:'second',viewerId:'other'}).rows[0].id,'second')
 resolvers[0]({data:[post('first')]});await settle();assert.equal(h.render({authorId:'second',viewerId:'other'}).rows[0].id,'second')
 assert.equal(h.render({authorId:'first',viewerId:'other'}).rows.length,0);h.cleanup()
})

test('recipe-scoped feeds ignore late responses from another recipe and suppress inaccessible tags',async()=>{
 const pending=[];const h=hookHarness(options=>new Promise(resolve=>pending.push({options,resolve})))
 h.render({recipeId:'first'});h.flush();h.render({recipeId:'second'});h.flush()
 assert.equal(pending[1].options.recipeId,'second')
 pending[1].resolve({data:[post('visible',{recipe_tag:{recipe_id:'second'}}),post('no-tag'),post('other',{recipe_tag:{recipe_id:'first'}})]})
 await settle();assert.deepEqual(h.render({recipeId:'second'}).rows.map(p=>p.id),['visible'])
 pending[0].resolve({data:[post('stale',{recipe_tag:{recipe_id:'first'}})]});await settle()
 assert.deepEqual(h.render({recipeId:'second'}).rows.map(p=>p.id),['visible']);h.cleanup()
})
test('empty, failed and successful home sections provide distinct usable paths',()=>{
 const tile=load('PostPhotoTile.tsx',{'./lib/postFeed':model,'./RecipeImage':{default:'img'}}).default
 const Home=load('HomePostsSection.tsx',{'./PostPhotoTile':{default:tile}}).default
 const props={posts:[],loading:false,error:'',onRetry(){},onOpen(){},onSeeAll(){},onCreate(){}}
 const empty=renderToStaticMarkup(React.createElement(Home,props));assert.match(empty,/From kitchens/);assert.match(empty,/Share a photo/);assert.match(empty,/See all/)
 const failed=renderToStaticMarkup(React.createElement(Home,{...props,error:'Offline'}));assert.match(failed,/role="alert"/);assert.match(failed,/Try again/)
 const success=renderToStaticMarkup(React.createElement(Home,{...props,posts:[post('a')]}));assert.ok(success.indexOf('community:a.webp')<success.indexOf('Jamie</span>'));assert.match(success,/2 photos/);assert.ok(!success.includes('Share a photo'))
})
test('a single photo stays uncluttered; multiple photos provide arrows, dots and photo position',()=>{
 const Carousel=load('PostPhotoCarousel.tsx',{'./RecipeImage':{default:'img'}}).default
 const multiple=renderToStaticMarkup(React.createElement(Carousel,{photos:model.orderedPhotos(post('one'))}));assert.match(multiple,/Next photo/);assert.match(multiple,/Previous photo/);assert.match(multiple,/Show photo 2/);assert.match(multiple,/aria-current="true"/)
 const single=renderToStaticMarkup(React.createElement(Carousel,{photos:[post('one').photos[0]]}));assert.ok(!single.includes('Next photo'));assert.ok(!single.includes('Choose a photo'))
})
test('post sharing uses a dedicated link, honours cancellation and offers clipboard/manual fallback',async()=>{
 const api=load('lib/share.ts');assert.equal(api.photoPostShareUrl('post id'),'https://getpickleapp.com/?post=post+id')
 let payload,copied
 assert.equal(await api.sharePhotoPostLink('post','Jamie',{share:async value=>{payload=value}}),'shared');assert.equal(payload.url,'https://getpickleapp.com/?post=post');assert.match(payload.title,/Jamie/)
 const abort=new Error('cancel');abort.name='AbortError';assert.equal(await api.sharePhotoPostLink('post','Jamie',{share:async()=>{throw abort},clipboard:{writeText:async()=>{throw Error('must not copy')}}}),'cancelled')
 assert.equal(await api.sharePhotoPostLink('post','Jamie',{clipboard:{writeText:async value=>{copied=value}}}),'copied');assert.equal(copied,'https://getpickleapp.com/?post=post')
 assert.equal(await api.sharePhotoPostLink('post','Jamie',{}),'manual')
})

const cardSource=readFileSync(new URL('../src/PhotoPostCard.tsx',import.meta.url),'utf8')
const cardAst=ts.createSourceFile('card.tsx',cardSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let removeSource
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='remove')removeSource=node.getText(cardAst);ts.forEachChild(node,visit)}
visit(cardAst)
function deleteHarness(response,userId='owner'){
 const state={},calls=[]
 const context={guard:{current:false},alive:{current:true},userId,post:{id:'post',author_id:'owner'},setBusy(value){state.busy=value},setError(value){state.error=value},onDeleted(){state.deleted=true},onClose(){state.closed=true},supabase:{async rpc(name,args){calls.push({name,args});return typeof response==='function'?response():response}}}
 const js=ts.transpileModule(removeSource,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 return{state,calls,context,remove:new Function(...Object.keys(context),js+';return remove')(...Object.values(context))}
}
test('post deletion requires an exact server acknowledgement; failures and abandoned requests do not remove a card',async()=>{
 const good=deleteHarness({data:{id:'post',deleted:true}});await good.remove();assert.equal(good.calls[0].name,'delete_photo_post');assert.equal(good.state.deleted,true);assert.equal(good.state.closed,true)
 for(const result of [{error:{}},{data:{id:'other',deleted:true}},{data:{id:'post',deleted:false}}]){const h=deleteHarness(result);await h.remove();assert.ok(!h.state.deleted);assert.ok(h.state.error)}
 let resolve;const late=deleteHarness(()=>new Promise(r=>resolve=r));const pending=late.remove();await late.remove();assert.equal(late.calls.length,1);late.context.alive.current=false;resolve({data:{id:'post',deleted:true}});await pending;assert.ok(!late.state.deleted)
 const foreign=deleteHarness({},'someone-else');await foreign.remove();assert.equal(foreign.calls.length,0)
})
test('post options hide destructive actions for visitors and require a separate confirmation screen',()=>{
 function render(userId,confirming=false){let slot=0;const react={...React,useState(initial){const i=slot++;return React.useState(i===0?true:i===6?confirming:initial)}};const Card=load('PhotoPostCard.tsx',{react,'./PostComments':{default:()=>null},'./PostPhotoCarousel':{default:()=>null},'./lib/postFeed':model,'./lib/share':{photoPostShareUrl:()=>'',sharePhotoPostLink:async()=> 'copied'}}).default;return renderToStaticMarkup(React.createElement(Card,{post:post('one'),userId,onDeleted(){}}))}
 const visitor=render('someone-else');assert.ok(!visitor.includes('Delete post'));assert.match(visitor,/Copy link/);assert.match(visitor,/Report post/)
 const owner=render('cook');assert.match(owner,/Delete post/);assert.ok(!owner.includes('Keep post'));assert.ok(!owner.includes('Report post'))
 const confirm=render('cook',true);assert.match(confirm,/Delete this post\?/);assert.match(confirm,/Keep post/);assert.match(confirm,/cannot be undone/)
})
