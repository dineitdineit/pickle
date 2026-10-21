import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require=createRequire(import.meta.url)
const source=readFileSync(new URL('../../src/RecipeSummaryCard.tsx',import.meta.url),'utf8')
const module={exports:{}}
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
new Function('require','module','exports',js)(name=>name === "./RecipeImage" ? {default:"img"} : name.endsWith('.css')?{}:name==='./lib/recipe'?{recipeImageUrl:path=>path||'/recipe-placeholder.svg'}:name==='./RecipeVideo'?{VideoBadge:()=>null}:require(name),module,module.exports)
export const RecipeSummaryCard=module.exports.default
