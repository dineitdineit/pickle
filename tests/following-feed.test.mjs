import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {test} from 'node:test'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'
const require=createRequire(import.meta.url)
function load(file,mocks={}) {
 const m={exports:{}}
 new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>mocks[name]??(name.endsWith('.css')?{}:require(name)),m,m.exports)
 return m.exports
}
const row=(n,kind='recipe')=>({id:String(n),kind,posted_at:'2026-10-20T12:34:56.123456+00:00',author_id:'cook',author_name:'Cook',payload:{id:String(n),title:'Rice',photos:[]}})
test('Following fetch is bounded, preserves cursor precision and enriches only post tags',async()=>{
 let args,tagged
 const model=load('lib/followingFeed.ts',{'./supabase':{supabase:{rpc:async(name,params)=>{assert.equal(name,'following_feed');args=params;return {data:Array.from({length:13},(_,i)=>row(i,i===1?'post':'recipe'))}}}},'./postRecipeTags':{attachPostRecipeTags:async rows=>{tagged=rows;return rows.map(p=>({...p,recipe_tag:{recipe_id:'original'}}))}}})
 const cursor=row(50,'post'),page=await model.loadFollowingPage(cursor)
 assert.equal(args.p_before,cursor.posted_at);assert.equal(args.p_before_kind,'post');assert.equal(args.p_before_id,'50');assert.equal(args.p_limit,12)
 assert.equal(page.rows.length,12);assert.equal(page.hasMore,true);assert.equal(page.cursor.id,'11');assert.equal(tagged.length,1);assert.equal(page.rows[1].payload.recipe_tag.recipe_id,'original')
})
test('Following merges dedupe by content kind plus id, including duplicates within a page',()=>{
 const model=load('lib/followingFeed.ts',{'./supabase':{},'./postRecipeTags':{}})
 assert.deepEqual(model.mergeFollowing([row(1)],[row(1),row(1,'post'),row(2),row(2)]).map(r=>r.kind+r.id),['recipe1','post1','recipe2'])
})
test('failed or malformed feed requests cannot appear as an empty successful feed',async()=>{
 for(const response of [{error:{message:'Offline'}},{data:[{...row(1),payload:null}]},{data:[{...row(1),kind:'unknown'}]}]) {
  const model=load('lib/followingFeed.ts',{'./supabase':{supabase:{rpc:async()=>response}},'./postRecipeTags':{}})
  await assert.rejects(model.loadFollowingPage(),/Could not/)
 }
})
test('Home tabs identify the selected feed, and guest/empty screens give useful navigation',()=>{
 const {HomeFeedTabs,default:Feed}=load('FollowingFeed.tsx',{'./RecipeSummaryCard':{},'./PhotoPostCard':{},'./lib/followingFeed':{}})
 const selected=[];const tabs=HomeFeedTabs({value:'following',onChange:v=>selected.push(v)})
 const html=renderToStaticMarkup(tabs);assert.match(html,/aria-current="page">Following/)
 tabs.props.children[0].props.onClick();assert.deepEqual(selected,['discover'])
 assert.match(renderToStaticMarkup(React.createElement(Feed,{userId:null,onSelectRecipe(){},onOpenAuthor(){},onRequireLogin(){},onDiscover(){}})),/Sign in to see/)
})
test('retention percentages never invent success for an empty cohort',()=>{
 const {retentionPercent}=load('AdminUsageRetention.tsx',{'./lib/supabase':{}})
 assert.equal(retentionPercent(0,0),'—');assert.equal(retentionPercent(0,5),'0.0%');assert.equal(retentionPercent(1,3),'33.3%')
})
test('a populated Following feed keeps recipe and post actions connected to their existing screens',()=>{
 let index=0,recipeProps,postProps
 const react={...React,useState(initial){const i=index++;return React.useState(i===1?[row(1),row(2,'post')]:i===2?false:initial)}}
 const Feed=load('FollowingFeed.tsx',{react,'./RecipeSummaryCard':{default:props=>{recipeProps=props;return React.createElement('div',null,'Recipe preview')}},'./PhotoPostCard':{default:props=>{postProps=props;return React.createElement('div',null,'Photo post')}},'./lib/followingFeed':{}}).default
 const opened=[],authors=[]
 const html=renderToStaticMarkup(React.createElement(Feed,{userId:'viewer',onSelectRecipe:id=>opened.push(id),onOpenAuthor:id=>authors.push(id),onRequireLogin(){},onDiscover(){}}))
 assert.match(html,/Recipe preview/);assert.match(html,/Photo post/);assert.doesNotMatch(html,/No updates yet/)
 recipeProps.onSelect(recipeProps.recipe.id);postProps.onSelectRecipe('tagged-recipe');postProps.onOpenAuthor('cook')
 assert.deepEqual(opened,['1','tagged-recipe']);assert.deepEqual(authors,['cook']);assert.equal(postProps.userId,'viewer')
})
