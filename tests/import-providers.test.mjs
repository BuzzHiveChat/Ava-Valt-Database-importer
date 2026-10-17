import test from 'node:test';
import assert from 'node:assert/strict';
import {platformSetFromAny} from '../lib/platforms.js';
import {providerNames,searchProviders} from '../lib/providers.js';
import {aviseekRecord,searchAviSeek,lookupAviSeekPlatform} from '../lib/aviseek.js';
const ID='avtr_00000000-0000-0000-0000-000000000002';
const OTHER='avtr_00000000-0000-0000-0000-000000000003';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});

test('strict platform detector accepts positives, but rejects unknown/None and negative labels',()=>{
 assert.deepEqual(platformSetFromAny({platforms:[],platformLabel:'PC + Quest'}),['PC','Android']);
 assert.deepEqual(platformSetFromAny({performance:{android:'None',pc:'Unknown',ios:'Unavailable'}}),[]);
 assert.deepEqual(platformSetFromAny({platforms:'PC, Quest unsupported'}),['PC']);
 assert.deepEqual(platformSetFromAny({platforms:{pc:true,quest:false}}),['PC']);
 assert.deepEqual(platformSetFromAny({platforms:['standalonewindows'],performance:{android:'Good'}}),['PC','Android']);
});

test('retired sources never appear in an active provider list or trigger a request',async()=>{
 const providers=providerNames();
 assert.deepEqual(providers.includes('AviSeek'),true);
 assert.equal(providers.includes('KitsuneDB'),false);
 assert.equal(providers.includes('VRCDB'),false);
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{throw Error('Unexpected network call')};
  const result=await searchProviders({providers:['KitsuneDB','VRCDB']});
  assert.deepEqual(result.avatars,[]);assert.deepEqual(result.health,[]);
 }finally{globalThis.fetch=old}
});

test('IMPORT selecting AviSeek only uses documented world search q and limit and preserves PC/Quest/iOS',async()=>{
 const old=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async url=>{calls.push(String(url));return json({avatars:[{id:ID,name:'Test avatar',platforms:['pc','quest','ios']}],total:1})};
  const result=await searchProviders({query:'dog',mode:'search',limit:5,providers:['AviSeek']});
  assert.equal(calls.length,1);
  assert.match(calls[0],/^https:\/\/aviseek\.vrchatlegends\.com\/api\/world\/search\?/);
  assert.match(calls[0],/q=dog/);assert.match(calls[0],/limit=5/);
  assert.deepEqual(result.avatars[0].platforms,['PC','Android','iOS']);
  assert.equal(result.health[0].provider,'AviSeek');
 }finally{globalThis.fetch=old}
});

test('no enabled providers means no requests, never silently search all',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async()=>{throw Error('Should not make a provider request')};
  const r=await searchProviders({providers:[]});
  assert.equal(r.avatars.length,0);assert.equal(r.health.length,0);
 }finally{globalThis.fetch=old}
});

test('unknown first provider does not mask AviSeek platform evidence for same ID',async()=>{
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async url=>String(url).includes('vrcx.avtr.zip')
   ?json([{id:ID,name:'Example',platforms:[]}])
   :json({avatars:[{id:ID,name:'Example',platforms:['pc','quest']} ]});
  const r=await searchProviders({query:'Example',providers:['AvtrZip','AviSeek'],limit:5});
  assert.equal(r.avatars.length,1);
  assert.deepEqual(r.avatars[0].platforms,['PC','Android']);
  assert.equal(r.avatars[0].metadataProvider,'AviSeek');
 }finally{globalThis.fetch=old}
});

test('exact lookup rejects mismatched IDs and platforms not actually reported',async()=>{
 const r=await lookupAviSeekPlatform({id:ID},{fetchImpl:async()=>json({avatars:[{id:OTHER,platforms:['pc','ios']}]})});
 assert.deepEqual(r.platforms,[]);
 const s=await lookupAviSeekPlatform({id:ID},{fetchImpl:async()=>json({avatars:[{id:ID,platforms:[]}]})});
 assert.deepEqual(s.platforms,[]);
 assert.equal(aviseekRecord({id:ID,platforms:['ios']}).platforms[0],'iOS');
});

test('exact lookup uses the documented multi-ID endpoint without recording page views',async()=>{
 const urls=[];
 const result=await lookupAviSeekPlatform({id:ID},{fetchImpl:async url=>{
  urls.push(String(url));return json({avatars:[{id:ID,platforms:['pc','quest','ios']}]});
 }});
 assert.equal(urls.length,1);
 assert.match(urls[0],/\/api\/world\/avatars\?ids=avtr_/);
 assert.deepEqual(result.platforms,['PC','Android','iOS']);
});

test('AviSeek rate limits remain rate limits; do not bypass them',async()=>{
 const r=await searchAviSeek('cat',{fetchImpl:async()=>json({error:'rate limit'},429)});
 assert.equal(r.state,'rate-limited');
});

test('existing saved settings drop retired providers and enable the replacement',async()=>{
 const {getSettings}=await import('../lib/settings.js');
 const old=globalThis.fetch,token=process.env.GITHUB_TOKEN;
 process.env.GITHUB_TOKEN='test-token';
 try{
  globalThis.fetch=async url=>{
   assert.match(String(url),/api\.github\.com/);
   const saved={providerEnabled:{AvtrZip:true,KitsuneDB:true,VRCDB:true,AviSeek:true},lastHealth:[{provider:'KitsuneDB',state:'working'},{provider:'AviSeek',state:'working'}]};
   return json({content:Buffer.from(JSON.stringify(saved)).toString('base64'),sha:'abc'});
  };
  // The repository context may be absent; default settings still never expose retired entries.
  const r=await getSettings();
  assert.equal('KitsuneDB' in r.providerEnabled,false);
  assert.equal('VRCDB' in r.providerEnabled,false);
  assert.equal(r.providerEnabled.AviSeek,true);
  assert.equal(r.lastHealth.some(x=>/KitsuneDB/i.test(x.provider)),false);
 }finally{globalThis.fetch=old;if(token===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=token;}
});
