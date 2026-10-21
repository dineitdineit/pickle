import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
function load(path, mocks = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', js)(name => mocks[name] ?? require(name), module, module.exports)
  return module.exports
}
const contract = load('supabase/functions/_shared/recipe-assistant.ts')
const submissions = load('src/lib/submissions.ts', { './video': load('src/lib/video.ts') })
const helpers = load('src/lib/recipeAssistant.ts', { './submissions': submissions, '../../supabase/functions/_shared/recipe-assistant': contract })
const { handleRecipeOrganizer } = load('supabase/functions/organize-recipe/handler.ts', { '../_shared/recipe-assistant.ts': contract })
const consent_version = contract.RECIPE_AI_NOTICE_VERSION
const text = { ingredients: '1 egg\n1 tbsp cooking oil\nsalt', steps: 'Add oil to pan\nCrack egg\nServe' }
const result = () => ({ ingredients: [
  { name: 'egg', group: 'Ingredients', amount: '1', unit: 'piece', note: '', source: '1 egg' },
  { name: 'cooking oil', group: 'Ingredients', amount: '1', unit: 'tbsp', note: '', source: '1 tbsp cooking oil' },
  { name: 'salt', group: 'Ingredients', amount: '', unit: '', note: '', source: 'salt' },
], steps: text.steps.split('\n').map(instruction => ({ title: '', instruction, minutes: '', source: instruction })), notes: [] })
const request = (body = { ...text, consent: true, consent_version }, headers = { Authorization: 'Bearer test' }) => new Request('https://example.invalid/organize-recipe', { method: 'POST', headers, body: JSON.stringify(body) })
function setup(overrides = {}) {
  const calls = []
  return { calls, deps: { configured: true, authenticate: async () => true, reserve: async () => { calls.push('quota'); return 'allowed' }, organize: async (input, signal) => { calls.push(input); assert.ok(signal instanceof AbortSignal); return result() }, ...overrides } }
}
test('AI preserves unspecified quantities and maps suggestions into independently editable fields', () => {
  const parsed = contract.validateOrganizedRecipe(result(), text)
  const next = helpers.applyOrganizedRecipe(parsed)
  assert.equal(next.ingredients[2].amount, '')
  assert.equal(next.ingredients[2].unit, '')
  assert.equal(next.ingredients[0].group_key, next.ingredients[2].group_key)
  assert.notEqual(next.ingredients[0].key, next.ingredients[1].key)
  assert.equal(next.steps.at(-1).is_final, true)
  assert.equal(next.steps[0].is_final, false)
  assert.ok(next.steps.every(s => s.step_image === ''))
  next.ingredients[0].name = 'Edited egg'
  assert.equal(parsed.ingredients[0].name, 'egg')
})
test('AI output rejects invented source text, oversized arrays, invalid quantities and empty instructions', () => {
  for (const mutate of [r => r.ingredients[0].source = '2 eggs', r => r.ingredients[0].amount = '1/2', r => r.ingredients[0].amount = 'Infinity', r => r.steps[0].instruction = '', r => r.steps[0].minutes = '1.5', r => r.steps = Array(31).fill(r.steps[0]), r => r.notes = Array(11).fill('note')]) {
    const r = result(); mutate(r); assert.throws(() => contract.validateOrganizedRecipe(r, text))
  }
})
test('AI snapshots invalidate suggestions after raw text, fields or photos change', () => {
  const input = submissions.newRecipeInput(), before = helpers.recipeAssistantSnapshot(input)
  input.ingredient_text = 'egg'; assert.notEqual(helpers.recipeAssistantSnapshot(input), before)
  const second = helpers.recipeAssistantSnapshot(input)
  input.steps[0].step_image = 'existing'; assert.notEqual(helpers.recipeAssistantSnapshot(input), second)
})
test('AI endpoint refuses unauthenticated calls, invalid bodies and missing deliberate consent without a provider call', async () => {
  for (const [req, override, status] of [
    [request(undefined, {}), {}, 401], [request(), { authenticate: async () => false }, 401],
    [request(text), {}, 400], [request({ ...text, consent: true, consent_version: 'old' }), {}, 400], [request({ ...text, ingredients: ' ', consent: true, consent_version }), {}, 400],
    [request({ ...text, steps: 'x'.repeat(20001), consent: true, consent_version }), {}, 400],
    [request({ ...text, extra: 'x'.repeat(128000), consent: true, consent_version }), {}, 400],
  ]) { const { calls, deps } = setup(override); assert.equal((await handleRecipeOrganizer(req, deps)).status, status); assert.deepEqual(calls, []) }
})
test('unconfigured AI returns a usable setup error without consuming quota or forwarding draft text', async () => {
  const { calls, deps } = setup({ configured: false })
  const response = await handleRecipeOrganizer(request(), deps)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error, 'ai_not_configured')
  assert.deepEqual(calls, [])
  assert.match(helpers.recipeAssistantError('ai_not_configured'), /manually/)
})
test('AI rejects restricted accounts and rate-limited requests before invoking the provider', async () => {
  for (const [permission, status] of [['not_allowed', 403], ['rate_limited', 429], ['guardian_ai_consent_required', 403]]) {
    const { calls, deps } = setup({ reserve: async () => permission })
    assert.equal((await handleRecipeOrganizer(request(), deps)).status, status)
    assert.deepEqual(calls, [])
  }
})
test('AI returns validated structured suggestions, never publishing content', async () => {
  const { calls, deps } = setup()
  const response = await handleRecipeOrganizer(request(), deps)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { result: result() })
  assert.deepEqual(calls, ['quota', text])
})
test('provider failures and malformed results expose no sensitive error text', async () => {
  for (const organize of [async () => { throw new Error('sensitive-key-and-recipe') }, async () => ({ instructions: 'bad' })]) {
    const { deps } = setup({ organize })
    const response = await handleRecipeOrganizer(request(), deps)
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'organization_failed' })
  }
})
test('composer renders freeform boxes, explicit AI disclosure and no automatic organization', () => {
  const Component = load('src/RecipeTextAssistant.tsx', { './lib/supabase': { supabase: {} }, './lib/recipeAssistant': helpers, '../supabase/functions/_shared/recipe-assistant': contract }).default
  const input = submissions.newRecipeInput()
  const html = renderToStaticMarkup(React.createElement(Component, { input, disabled: false, onTextChange() {}, onApply() {} }))
  assert.match(html, /Write it your way/)
  assert.equal((html.match(/<textarea/g) ?? []).length, 2)
  assert.match(html, /Vercel AI Gateway/)
  assert.match(html, /Google Vertex AI/)
  assert.match(html, /type="checkbox"/)
  assert.ok(!html.includes('checked=""'))
  assert.match(html, /disabled="">Organize with AI/)
  assert.ok(!html.includes('Use suggestions'))
})

function clientAction(transport) {
  const input = submissions.newRecipeInput()
  input.ingredient_text = text.ingredients; input.step_text = text.steps
  const state = {}, calls = []
  const context = { input, disabled: false, aiConsent: true, RECIPE_AI_NOTICE_VERSION: consent_version, request: { current: null }, current: { current: input },
    ...helpers,
    setLoading(v) { state.loading = v }, setError(v) { state.error = v }, setSuggestion(v) { state.suggestion = v },
    supabase: { functions: { async invoke(name, args) { calls.push({ name, args }); return transport(context) } } },
  }
  const source = ts.createSourceFile('assistant.tsx', readFileSync(new URL('../src/RecipeTextAssistant.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let fn
  function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === 'organize') fn = n.getText(source); ts.forEachChild(n, visit) }
  visit(source)
  const js = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return { context, state, calls, organize: new Function(...Object.keys(context), `${js};return organize`)(...Object.values(context)) }
}
test('client shows AI suggestions without changing the existing fields or publishing', async () => {
  const { context, state, calls, organize } = clientAction(() => ({ data: { result: result() }, error: null }))
  const before = JSON.stringify(context.input)
  await organize()
  assert.deepEqual(state.suggestion.result, result())
  assert.equal(JSON.stringify(context.input), before)
  assert.equal(state.loading, false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'organize-recipe')
  assert.deepEqual(calls[0].args.body, { ...text, consent: true, consent_version })
})
test('client keeps draft fields and provides manual entry guidance when AI is unconfigured', async () => {
  const { context, state, organize } = clientAction(() => ({ data: null, error: { context: { json: async () => ({ error: 'ai_not_configured' }) } } }))
  const before = JSON.stringify(context.input)
  await organize()
  assert.equal(JSON.stringify(context.input), before)
  assert.equal(state.suggestion, null)
  assert.match(state.error, /manually/)
  assert.equal(context.request.current, null)
})
test('client discards late AI results after text changes or a cancelled request', async () => {
  for (const mutate of [ctx => { ctx.current.current = { ...ctx.input, ingredient_text: 'changed' } }, ctx => ctx.request.current.abort()]) {
    const { state, organize } = clientAction(ctx => { mutate(ctx); return { data: { result: result() }, error: null } })
    await organize()
    assert.equal(state.suggestion, null)
  }
})
test('client prevents duplicate AI requests while one is pending', async () => {
  let finish
  const { organize, calls } = clientAction(() => new Promise(resolve => { finish = resolve }))
  const pending = organize()
  await organize()
  assert.equal(calls.length, 1)
  finish({ data: { result: result() }, error: null })
  await pending
})

test('chosen model and provider routing match the displayed disclosure',()=>{assert.equal(contract.RECIPE_AI_MODEL,'google/gemini-2.5-flash-lite');assert.deepEqual(contract.RECIPE_AI_PROVIDER_OPTIONS.gateway.only,['vertex']);assert.equal(contract.RECIPE_AI_PROVIDER_OPTIONS.gateway.disallowPromptTraining,true);assert.equal(contract.RECIPE_AI_PROVIDER_OPTIONS.gateway.zeroDataRetention,undefined)})

test('client requires a separate AI choice before making a request',async()=>{const {organize,calls,context}=clientAction(()=>({}));context.aiConsent=false;const source=ts.createSourceFile('assistant.tsx',readFileSync(new URL('../src/RecipeTextAssistant.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='organize')fn=n.getText(source);ts.forEachChild(n,visit)}visit(source);const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;await new Function(...Object.keys(context),`${js};return organize`)(...Object.values(context))();assert.equal(calls.length,0)})
