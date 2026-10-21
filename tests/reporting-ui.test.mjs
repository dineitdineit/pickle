import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {test} from 'node:test'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'
const require=createRequire(import.meta.url)
function load(file,mocks={},context={}) {
 const m={exports:{}}
 new Function('require','module','exports',...Object.keys(context),ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>mocks[name]??(name.endsWith('.css')?{}:require(name)),m,m.exports,...Object.values(context))
 return m.exports
}
test('all report entry points use readable labels and message reporting states its exact disclosure',()=>{
 const reports=load('ReportButton.tsx',{'./lib/supabase':{},'react-dom':{createPortal:node=>node}},{document:{body:{}}})
 for(const [targetType,label] of [['post','post'],['post_comment','post comment'],['message','message']]) {
  const html=renderToStaticMarkup(React.createElement(reports.ReportDialog,{targetType,targetId:'selected',userId:'me',onClose(){},onRequireLogin(){}}))
  assert.match(html,new RegExp('Report '+label));assert.match(html,/Submit report/)
  if(targetType==='message'){assert.match(html,/Only this message and its attached photo/);assert.match(html,/Other messages in this conversation are not included/)}
 }
})
test('admin report history exposes filters for photo posts, post comments and messages',()=>{
 const reports=load('ReportButton.tsx',{'./lib/supabase':{}})
 const Admin=load('AdminContentReports.tsx',{'./lib/supabase':{},'./ReportButton':reports}).default
 const html=renderToStaticMarkup(React.createElement(Admin))
 for(const type of ['post','post_comment','message'])assert.match(html,new RegExp('option value="'+type+'"'))
})
