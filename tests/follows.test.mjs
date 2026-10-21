import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
const source=readFileSync(new URL('../src/SocialScreen.tsx',import.meta.url),'utf8')
const ast=ts.createSourceFile('social.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const functions=new Map()
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(ast));ts.forEachChild(node,visit)}
visit(ast)
function setup(response, followed=false){
  const cook={id:'other',display_name:'Other cook'},state={following:new Set(followed?['other']:[]),cooks:[cook]},calls=[]
  const context={userId:'me',guard:{current:false},generation:{current:1},following:state.following,mode:'following',selected:null,cookName:c=>c.display_name,onRequireLogin(){state.login=true},setBusy(v){state.busy=v},setMessage(v){state.message=v},setFollowing(fn){state.following=fn(state.following)},setCooks(fn){state.cooks=fn(state.cooks)},supabase:{async rpc(name,args){calls.push({name,args});return response}}}
  return {state,context,calls,cook,run(){const js=ts.transpileModule(functions.get('changeFollow'),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;return new Function(...Object.keys(context),`${js};return changeFollow`)(...Object.values(context))(cook)}}
}
test('follow confirms server state before changing the list',async()=>{
  const h=setup({data:{user_id:'other',following:true}});await h.run();assert.equal(h.calls[0].name,'set_user_follow');assert.deepEqual(h.calls[0].args,{p_user_id:'other',p_following:true});assert.ok(h.state.following.has('other'));assert.equal(h.state.message,'')
})
test('unfollow removes only the confirmed user from Following',async()=>{
  const h=setup({data:{user_id:'other',following:false}},true);h.state.cooks.push({id:'keep'});await h.run();assert.equal(h.state.following.has('other'),false);assert.deepEqual(h.state.cooks,[{id:'keep'}])
})
test('failed or unconfirmed follow responses preserve the prior state',async()=>{
  for(const response of [{error:{code:'42501'}},{data:{user_id:'wrong',following:false}},{data:{user_id:'other',following:true}}]){
    const h=setup(response,true);await h.run();assert.ok(h.state.following.has('other'));assert.equal(h.state.cooks.length,1);assert.match(h.state.message,/Could not/);assert.equal(h.state.busy,null)
  }
})
test('signed-out, self and duplicate follow attempts send no write',async()=>{
  const guest=setup({});guest.context.userId=null;await guest.run();assert.equal(guest.state.login,true);assert.equal(guest.calls.length,0)
  const self=setup({});self.context.userId='other';await self.run();assert.equal(self.calls.length,0)
  const busy=setup({});busy.context.guard.current=true;await busy.run();assert.equal(busy.calls.length,0)
})
test('a late follow response cannot mutate a newly opened page',async()=>{
  const h=setup({});h.context.supabase.rpc=async()=>{h.context.generation.current++;return {data:{user_id:'other',following:true}}};await h.run();assert.equal(h.state.following.has('other'),false);assert.equal(h.state.message,'')
})
