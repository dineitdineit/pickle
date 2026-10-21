import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const runtime=await import('react/jsx-runtime')
function load(path,mocks={}) {
 const m={exports:{}}
 const js=ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',js)(name=>name==='react'?React:name==='react/jsx-runtime'?runtime:mocks[name]??{},m,m.exports)
 return m.exports
}
const model=load('lib/postFeed.ts')
const post={id:'post',author_id:'cook',caption:'Made it',published_at:'2026-10-16T12:00:00Z',photos:[{id:'photo',image_path:'photo.webp',position:0}],author:{display_name:'Jamie'},recipe_id:'recipe',recipe_tag:{recipe_id:'recipe',title:'Fried egg'}}
function section(state,open=()=>{}) {
 const Tile=load('PostPhotoTile.tsx',{'./RecipeImage':{default:'img'},'./lib/postFeed':model}).default
 const Section=load('RecipeTaggedPosts.tsx',{'./PostPhotoTile':{default:Tile},'./usePhotoPosts':{default:options=>{assert.equal(options.recipeId,'recipe');assert.equal(options.pageSize,6);return {rows:[],loading:false,error:'',hasMore:false,reload(){},...state}}}}).default
 return {Section,props:{recipeId:'recipe',userId:'viewer',onOpen:open}}
}
test('empty and initially loading recipe photo sections render no heading, placeholder or spacing wrapper',()=>{
 for(const state of [{rows:[],loading:false},{rows:[],loading:true}]) {
  const {Section,props}=section(state)
  assert.equal(renderToStaticMarkup(React.createElement(Section,props)),'')
 }
})
test('recipe photo feedback uses the existing post tiles and only offers See all when more posts exist',()=>{
 for(const hasMore of [true,false]){
  const {Section,props}=section({rows:[post],hasMore})
  const html=renderToStaticMarkup(React.createElement(Section,props))
  assert.match(html,/Made this recipe/);assert.match(html,/photo.webp/);assert.match(html,/Jamie/)
  assert.equal(html.includes('See all'),hasMore)
 }
})
test('photo tile opens its exact post and See all opens the recipe-scoped feed',()=>{
 const opened=[];const {Section,props}=section({rows:[post],hasMore:true},id=>opened.push(id))
 const tree=Section(props)
 const [header,grid]=tree.props.children
 header.props.children[1].props.onClick()
 const tile=grid.props.children[0]
 tile.props.onOpen(tile.props.post.id)
 assert.deepEqual(opened,[undefined,'post'])
})
test('a failed first load has a compact retry rather than pretending the recipe has no posts',()=>{
 const {Section,props}=section({error:'Offline'})
 const html=renderToStaticMarkup(React.createElement(Section,props))
 assert.match(html,/role="alert"/);assert.match(html,/Retry/);assert.ok(!html.includes('<h2'))
})
test('recipe post queries apply recipe identity together with publication/visibility filters and pagination',()=>{
 const calls=[],q={};for(const method of ['select','eq','order','limit','or'])q[method]=(...args)=>{calls.push([method,...args]);return q}
 model.postFeedQuery({recipeId:'recipe',limit:6},{from:()=>q})
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='recipe_id'&&c[2]==='recipe'))
 assert.ok(calls.some(c=>c[1]==='status'&&c[2]==='published'))
 assert.ok(calls.some(c=>c[1]==='is_hidden'&&c[2]===false))
 assert.deepEqual(calls.at(-1),['limit',7])
})
test('recipe photo section is placed after comments and before More recipes',()=>{
 const source=readFileSync(new URL('../src/RecipeDetailScreen.tsx',import.meta.url),'utf8')
 const comments=source.lastIndexOf('<RecipeComments'),photos=source.lastIndexOf('<RecipeTaggedPosts'),more=source.lastIndexOf('More recipes')
 assert.ok(comments>0&&comments<photos&&photos<more)
 assert.match(source,/hidden=\{!!taggedPostView\}/)
})
