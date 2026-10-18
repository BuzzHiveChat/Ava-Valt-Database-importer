import test from 'node:test';
import assert from 'node:assert/strict';
import {detectOptOutMarkers} from '../lib/optOutMarkers.mjs';
import {stageMarkerRequests,readOptOuts,promotePendingAvatarMarkers,revokeExclusion} from '../lib/optOut.js';
const id=n=>`avtr_00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const creator='usr_00000000-0000-0000-0000-000000000111';
let store,sha,writes;
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})}
function setup(opts={}){
 store={
  'avatar-index.json':{version:1,avatars:opts.live||[]},
  'avatar-opt-outs.json':{version:1,excludedAvatars:[],excludedCreators:[],pending:opts.pending||[],dismissedRequests:[]}
 };
 sha={'avatar-index.json':'sha-initial','avatar-opt-outs.json':'sha-initial'};writes=[];
 globalThis.fetch=async(url,options={})=>{
  const path=String(url).split('/contents/')[1]?.split('?')[0];
  if(!path)throw Error('Unexpected request '+url);
  if(!(path in store))return response({message:'Not Found'},404);
  if(options.method==='PUT'){
   const body=JSON.parse(options.body);
   if(sha[path]!==body.sha)return response({message:'Conflict'},409);
   store[path]=JSON.parse(Buffer.from(body.content,'base64').toString());
   sha[path]=`sha-${writes.length+1}`;writes.push(path);
   return response({content:{sha:sha[path]}});
  }
  return response({sha:sha[path],content:Buffer.from(JSON.stringify(store[path])).toString('base64')});
 };
}
function avatar(n,description='',extra={}){return {id:id(n),name:`Avatar ${n}`,description,metadataProvider:'PAW',...extra}}

test('literal private/blacklist/unlist and do-not-import markers are detected only in descriptions',()=>{
 for(const [description,marker] of [['BLACKLIST','blacklist'],['unlist','unlist'],['private','private'],['Do not import this avatar','do_not_import'],['please do not list this avatar','do_not_list']])
  assert.equal(detectOptOutMarkers(avatar(1,description)).avatar,marker);
 assert.equal(detectOptOutMarkers(avatar(1,'Open/public avatar',{name:'blacklist',authorName:'private'})).avatar,null);
 assert.equal(detectOptOutMarkers(avatar(1,'This is not private.')).avatar,null);
 assert.equal(detectOptOutMarkers(avatar(1,'hi',{creatorBio:'permanent_unlist'})).creator,'permanent_unlist');
});

test('description markers write Active avatar exclusions; repeat scans do not duplicate; existing live is removed',async()=>{
 setup({live:[avatar(1,'PRIVATE'),avatar(2,'public') ]});
 const result=await stageMarkerRequests([avatar(1,'private'),avatar(2,'public')]);
 assert.equal(result.autoExcluded,1);assert.equal(result.held,1);
 assert.deepEqual(result.allow.map(x=>x.id),[id(2)]);
 assert.equal(store['avatar-opt-outs.json'].pending.length,0);
 assert.equal(store['avatar-opt-outs.json'].excludedAvatars.length,1);
 assert.equal(store['avatar-opt-outs.json'].excludedAvatars[0].proof,'provider-avatar-description-unverified');
 assert.deepEqual(store['avatar-index.json'].avatars.map(x=>x.id),[id(2)]);
 const again=await stageMarkerRequests([avatar(1,'private')]);
 assert.equal(again.autoExcluded,0);
 assert.equal(again.allow.length,0);
 assert.equal(store['avatar-opt-outs.json'].excludedAvatars.length,1);
 assert.equal(writes.filter(path=>path==='avatar-opt-outs.json').length,1);
});

test('creator-bio markers remain pending and cannot globally blacklist a creator',async()=>{
 setup();
 const result=await stageMarkerRequests([avatar(3,'public',{authorId:creator,creatorBio:'permanent_unlist'})]);
 assert.equal(result.autoExcluded,0);assert.equal(result.queued,1);
 assert.equal(store['avatar-opt-outs.json'].excludedCreators.length,0);
 assert.equal(store['avatar-opt-outs.json'].excludedAvatars.length,0);
 assert.equal(store['avatar-opt-outs.json'].pending[0].type,'creator');
});

test('owner action migrates old avatar marker requests without promoting ambiguous creator-bio entries',async()=>{
 setup({pending:[
  {type:'avatar',id:id(1),marker:'blacklist',source:'NSVR'},
  {type:'avatar',id:id(2),marker:'private',source:'PAW'},
  {type:'avatar',id:id(3),marker:'permanent_unlist',source:'VRCWB'},
  {type:'creator',id:creator,marker:'permanent_unlist',source:'PAW'}
 ]});
 const result=await promotePendingAvatarMarkers();
 assert.equal(result.autoExcluded,2);assert.equal(result.pending,2);
 assert.deepEqual(store['avatar-opt-outs.json'].excludedAvatars.map(x=>x.id),[id(1),id(2)]);
 assert.equal(store['avatar-opt-outs.json'].pending.length,2);
 const repeat=await promotePendingAvatarMarkers();assert.equal(repeat.autoExcluded,0);
});

test('owner revocation of auto-block suppresses reblocking during a subsequent scan',async()=>{
 setup();
 await stageMarkerRequests([avatar(4,'private')]);
 await revokeExclusion({type:'avatar',id:id(4)});
 assert.equal(store['avatar-opt-outs.json'].excludedAvatars.length,0);
 assert(store['avatar-opt-outs.json'].dismissedRequests.some(x=>x.id===id(4)&&x.marker==='*'));
 const result=await stageMarkerRequests([avatar(4,'BLACKLIST')]);
 assert.equal(result.autoExcluded,0);assert.deepEqual(result.allow.map(x=>x.id),[id(4)]);
});
