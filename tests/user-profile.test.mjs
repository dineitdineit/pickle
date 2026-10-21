import { RecipeSummaryCard } from "./helpers/recipe-summary.mjs"
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../src/UserProfileScreen.tsx', import.meta.url), 'utf8')
const author = { id: 'cook', username: 'jamie', display_name: 'Jamie', avatar_url: 'https://example.com/avatar.png', bio: 'Home cooking', post_count: 12, follower_count: 8, following_count: 4, following: true, notifications_enabled: true }
function render(userId = 'me', profile = author, popular = [], busy = null, blockState = null, contentTab = 'recipes') {
  let index = 0
  const mockReact = { ...React, useState(initial) { const slot = index++; return React.useState(slot === 0 ? profile : slot === 1 ? [{id:'recipe',title:'Soup',cover_image:null,view_count:321}] : slot === 2 ? false : slot === 9 ? popular : slot === 5 ? busy : slot === 13 && blockState ? blockState : slot === 14 ? contentTab : initial) } }
  const module = {exports:{}}
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
  new Function('require','module','exports',js)(name => name === 'react' ? mockReact : name.endsWith('.css') ? {} : name === './UserActionsMenu' ? {default: () => React.createElement('button', {'aria-label':'User options'})} : name === './ReportButton' ? {default: props => React.createElement('button', {'aria-label':`Report ${props.targetType}`})} : name === './RecipeSummaryCard' ? {default:RecipeSummaryCard} : name === './ViewIcon' ? {default:()=>React.createElement('svg')} : name === './BackIcon' ? {default:() => React.createElement('svg')} : name === './lib/supabase' ? {supabase:{}} : name === './useUnreadMessages' ? {default:()=>0} : name === './MessagesScreen' ? {default:()=>null} : name === './ProfilePostsGrid' ? {default:()=>React.createElement('div',null,'Photo posts grid')} : name === './PhotoPostsScreen' ? {default:()=>null} : name === './SearchScreen' ? {default:()=>null} : name === './lib/profileRecipes' ? {} : name === './lib/recipe' ? {recipeImageUrl:s=>s} : (name === "./RecipeImage" ? {default:"img"} : require(name)),module,module.exports)
  return renderToStaticMarkup(React.createElement(module.exports.default,{authorId:'cook',userId,onBack(){},onRequireLogin(){},onSelectRecipe(){},onOpenMenu(){},onOpenCommunity(){},onOpenMyRecipes(){}}))
}
test('public profile renders counts, bio, recipe tiles, follow state and an active message action',()=>{
  const html=render()
  assert.match(html,/@jamie/)
  assert.match(html,/<h1>Jamie<\/h1>/)
  assert.ok(html.indexOf("Search Jamie&#x27;s recipes") < html.indexOf('Turn off new recipe alerts from Jamie'))
  for (const label of ['Posts','Followers','Following','Home cooking','View Soup']) assert.ok(html.includes(label))
  assert.match(html,/<strong>12<\/strong>/)
  assert.match(html,/<strong>8<\/strong>/)
  assert.match(html,/<strong>4<\/strong>/)
  assert.match(html,/>Message<\/button>/); assert.ok(!html.includes("Messaging is coming soon"))
  assert.match(html,/Turn off new recipe alerts from Jamie/)
  assert.match(html,/aria-pressed="true"/)
  assert.ok(!html.includes('Profile menu'))
})

test('restricted profiles keep identity and safety menu but hide content and contact controls',()=>{
 for (const blocked of [true,false]) {
  const html=render('me',author,[{id:'popular',title:'Roast chicken',cover_image:null,short_description:'Private description',view_count:1,like_count:1}],null,{user_id:'cook',blocked,can_contact:false})
  assert.match(html,/@jamie/);assert.match(html,/>Jamie</);assert.match(html,/User options/)
  for(const text of ['Home cooking','Posts','Followers','Following','Featured Recipes','All recipes','View Soup','Roast chicken','>Message<','>Unfollow<']) assert.ok(!html.includes(text),text)
  assert.match(html,blocked?/You have blocked this user/:/This profile is unavailable/)
  assert.match(html,/aria-label="Search Jamie[^>]*hidden=""/)
 }
})
test('own profile has the legacy menu and My recipes, with no self-follow or message action',()=>{
  const html=render('cook')
  assert.match(html,/aria-label="Profile menu"/)
  assert.match(html,/My recipes/)
  assert.match(html,/aria-label="Notifications"/)
  assert.ok(!html.includes('>Message<'))
  assert.ok(!html.includes('>Follow<'))
})
test('unfollowed profiles cannot enable recipe alerts before following',()=>{
  const html=render('me',{...author,following:false,notifications_enabled:false})
  assert.match(html,/disabled="" aria-label="Turn on new recipe alerts from Jamie"/)
  assert.match(html,/>Follow<\/button>/)
})

test('most viewed cards precede the grid and show views, likes and a short description',()=>{
  const html=render('me',author,[{id:'popular',title:'Roast chicken',cover_image:'https://example.com/chicken.jpg',short_description:'Crispy and easy',view_count:1250,like_count:42}])
  assert.match(html,/Featured Recipes/)
  assert.match(html,/1,250 views/); assert.match(html,/42 likes/); assert.match(html,/class="user-profile-view-count"/); assert.match(html,/aria-label="321 views"/)
  assert.match(html,/Crispy and easy/)
  assert.match(html,/aria-label="View Roast chicken"/)
  assert.ok(html.indexOf('Featured Recipes') < html.indexOf('All recipes'))
  assert.ok(!render().includes('Featured Recipes'))
})





test('saving recipe notifications leaves the Unfollow label and appearance enabled',()=>{
 const html=render('me',author,[],'notifications')
 assert.match(html,/<button type="button" class="" aria-disabled="true">Unfollow<\/button>/)
 assert.ok(!html.includes('Saving…'))
 const following=render('me',author,[],'follow');assert.match(following,/Saving…/)
})
test('profile bell keeps its enabled appearance while notifications are saving',()=>{
 const html=render('me',author,[],'notifications')
 const bell=html.match(/<button[^>]*aria-label="Turn off new recipe alerts from Jamie"[^>]*>/)[0]
 assert.ok(!bell.includes(' disabled='));assert.match(bell,/aria-disabled="true"/);assert.match(bell,/aria-pressed="true"/)
})





test('profile content switches to the photo grid without mixing featured or recipe tiles',()=>{
 const recipes=render();assert.match(recipes,/Profile content/);assert.match(recipes,/>Recipes<\/button>/);assert.match(recipes,/>Posts<\/button>/)
 const posts=render('me',author,[{id:'popular',title:'Soup',cover_image:null,view_count:1,like_count:1}],null,null,'posts');assert.match(posts,/Photo posts grid/);assert.ok(!posts.includes('Featured Recipes'));assert.ok(!posts.includes('All recipes'));assert.ok(!posts.includes('View Soup'))
})
