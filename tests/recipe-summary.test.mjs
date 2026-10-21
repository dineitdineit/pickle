import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RecipeSummaryCard } from './helpers/recipe-summary.mjs'
function render(tagNames) {
 return renderToStaticMarkup(React.createElement(RecipeSummaryCard,{recipe:{id:'r',title:'Soup',cover_image:null,short_description:'Simple soup',view_count:5,like_count:2,tagNames},onSelect(){}}))
}
test('recipe summary shows up to three unique tags beneath its description',()=>{
 const html=render(['Vegetarian','Chicken','Lunch','Chicken','  ','Beef'])
 assert.equal((html.match(/class="recipe-summary-tag"/g)??[]).length,3)
 for(const name of ['Beef','Chicken','Lunch']) assert.ok(html.includes(`>${name}</span>`))
 assert.ok(!html.includes('>Vegetarian</span>'))
 assert.ok(html.indexOf('Simple soup')<html.indexOf('Recipe tags'))
})
test('recipes without assigned tags render no tag row',()=>{
 for(const tags of [undefined,[],['  ']]) assert.ok(!render(tags).includes('recipe-summary-tags'))
})
