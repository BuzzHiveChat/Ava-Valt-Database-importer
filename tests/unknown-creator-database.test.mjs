import test from 'node:test';
import assert from 'node:assert/strict';
import {previewUnknownCreatorDeletion,deleteUnknownCreatorsFromPreview}
 from '../lib/db.js';
const id = n => `avtr_00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const sha = n => String(n).repeat(40);
function mockGithub(avatars,{conflict=false,rootArray=false}={}){
 const originalFetch=globalThis.fetch;
 const state={sha:sha(1), root:rootArray?avatars:{version:3,otherMetadata:{keep:true},avatars}, writes:0};
 globalThis.fetch=async (url,options={})=>{
  const method=options.method||'GET';
  assert.match(String(url),/api\.github\.com\/repos\/.*\/contents\//);
  if(method==='GET')return new Response(JSON.stringify({sha:state.sha,content:Buffer.from(JSON.stringify(state.root)).toString('base64')}),{status:200});
  if(method==='PUT'){
   state.writes++;
   const body=JSON.parse(options.body);
   assert.equal(body.sha,state.sha);
   if(conflict)return new Response('{}',{status:409});
   state.root=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
   state.sha=sha(2);
   return new Response(JSON.stringify({commit:{sha:sha(3)}}),{status:200});
  }
  throw new Error('Unexpected method');
 };
 return {state,restore:()=>{globalThis.fetch=originalFetch}};
}
test('owner preview reads database, does not write; confirmed delete preserves wrapper/known creators/platforms',async()=>{
 const a={id:id(1),name:'Unknown author',author:'Unknown',platforms:['PC']};
 const b={id:id(2),name:'Known author',author:'Alex',platforms:['Unknown']};
 const c={id:id(3),name:'Unknown author 2',author:'unknown',platforms:['iOS']};
 const github=mockGithub([a,b,c]);
 try{
  const p=await previewUnknownCreatorDeletion();
  assert.equal(p.found,2);assert.equal(p.scanned,3);assert.equal(github.state.writes,0);
  const result=await deleteUnknownCreatorsFromPreview(p.sha);
  assert.equal(result.removed,2);assert.equal(result.total,1);
  assert.deepEqual(github.state.root,{version:3,otherMetadata:{keep:true},avatars:[b]});
  assert.equal(github.state.writes,1);
 }finally{github.restore();}
});
test('stale preview aborts without any GitHub writes',async()=>{
 const github=mockGithub([{id:id(1),author:'Unknown'}]);
 try{
  const p=await previewUnknownCreatorDeletion();github.state.sha=sha(4);
  await assert.rejects(deleteUnknownCreatorsFromPreview(p.sha),e=>e.code==='STALE_PREVIEW');
  assert.equal(github.state.writes,0);
 }finally{github.restore();}
});
test('GitHub concurrent write conflict aborts without retrying the destructive operation',async()=>{
 const github=mockGithub([{id:id(1),author:'Unknown'}],{conflict:true,rootArray:true});
 try{
  const p=await previewUnknownCreatorDeletion();
  await assert.rejects(deleteUnknownCreatorsFromPreview(p.sha),e=>e.code==='STALE_PREVIEW');
  assert.equal(github.state.writes,1);
  assert.equal(github.state.root.length,1);
 }finally{github.restore();}
});
test('no matches creates no extra commit, rejects invalid or missing preview',async()=>{
 const github=mockGithub([{id:id(1),author:'A',platforms:[]}]);
 try{
  await assert.rejects(deleteUnknownCreatorsFromPreview('invalid'),e=>e.code==='INVALID_PREVIEW');
  const p=await previewUnknownCreatorDeletion();assert.equal(p.found,0);
  const result=await deleteUnknownCreatorsFromPreview(p.sha);
  assert.equal(result.removed,0);assert.equal(github.state.writes,0);
 }finally{github.restore();}
});
