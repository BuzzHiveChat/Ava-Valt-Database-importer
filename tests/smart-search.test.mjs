import test from 'node:test';
import assert from 'node:assert/strict';
import {reportedPlatforms,platformReviewCounts,pendingPlatformChecks,applyPlatformCheckResults,filterAvatarCards} from '../lib/searchPlatformReview.mjs';
import {guardedProviderSearch,normalizeSearchRequest,SearchCooldownError} from '../lib/safeSearchTraffic.mjs';
const id=n=>`avtr_00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const avatars=[{id:id(1),platforms:['PC'],sourceProviders:['PAW']},{id:id(2),platforms:[],sourceProviders:['NSVR']},{id:id(3),platforms:['Android','iOS'],sourceProviders:['AviSeek']}];

test('the smart search never guesses unknown platforms; confirmed filter has an explicit override',()=>{
 assert.deepEqual(reportedPlatforms(avatars[1]),[]);
 assert.deepEqual(platformReviewCounts(avatars),{total:3,verified:2,unknown:1});
 assert.deepEqual(filterAvatarCards(avatars).map(a=>a.id),[id(1),id(3)]);
 assert.equal(filterAvatarCards(avatars,{verifiedOnly:false}).length,3);
 assert.deepEqual(filterAvatarCards(avatars,{platform:'Android'}).map(a=>a.id),[id(3)]);
 assert.deepEqual(filterAvatarCards(avatars,{source:'PAW'}).map(a=>a.id),[id(1)]);
});

test('automatic follow-up prioritizes only unchecked unknown avatars, respecting a maximum',()=>{
 const input=[avatars[0],avatars[1],avatars[1],{id:id(4),platforms:[],safePlatformCheckCompleted:true},{id:id(5),platforms:[]}];
 assert.deepEqual(pendingPlatformChecks(input,50).map(a=>a.id),[id(2),id(5)]);
 assert.deepEqual(pendingPlatformChecks(input,1).map(a=>a.id),[id(2)]);
});

test('exact-ID verification never wipes a known platform, provider evidence or thumbnails',()=>{
 const checked=[{id:id(1),platforms:[],metadataProvider:'AviSeek'},{id:id(2),platforms:['Quest','iOS'],metadataProvider:'AviSeek',platformMetadataCheckedAt:'2026-10-18'}];
 const result=applyPlatformCheckResults(avatars,checked);
 assert.deepEqual(result[0].platforms,['PC']);
 assert.deepEqual(result[0].sourceProviders,['PAW']);
 assert.deepEqual(result[1].platforms,['Android','iOS']);
 assert.equal(result[1].metadataProvider,'AviSeek');
 assert.equal(result[1].safePlatformCheckCompleted,true);
 assert.deepEqual(result[2],avatars[2]);
});

test('search inputs are validated and retired providers are not accepted',()=>{
 assert.deepEqual(normalizeSearchRequest({limit:9999,providers:['PAW','PAW','VRCDB','AviSeek'],mode:'oops',platform:'wrong'},['PAW','AviSeek']),{
  query:'',mode:'search',platform:'All',limit:120,providers:['PAW','AviSeek']
 });
});

test('site-wide Redis search permit blocks duplicate uncached bursts and reuses cache',async()=>{
 const env={UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'secret'};
 const stored=new Map();let calls=0,lock=false;
 const redis=async args=>{
  const [cmd,key,val]=args;
  if(cmd==='GET')return stored.get(key)||null;
  if(cmd==='MGET')return args.slice(1).map(k=>stored.get(k)||null);
  if(cmd==='SET'&&args.includes('NX')){if(lock)return null;lock=true;return 'OK';}
  if(cmd==='SET'){stored.set(key,val);return 'OK';}
  throw new Error(`Unexpected ${cmd}`);
 };
 const search=async()=>{calls++;return {avatars:[avatars[0]],health:[],notes:[]}};
 const options={query:'furry-uniq-test',mode:'search',platform:'All',limit:120,providers:['PAW']};
 const first=await guardedProviderSearch(options,{env,redis,search});
 assert.equal(first.traffic.cache,'fresh');
 const repeat=await guardedProviderSearch(options,{env,redis,search});
 assert.equal(repeat.traffic.cache,'server');
 assert.equal(calls,1);
 await assert.rejects(()=>guardedProviderSearch({...options,query:'other-uniq-test'},{env,redis,search}),SearchCooldownError);
 assert.equal(calls,1);
});

test('search fails closed if shared limiter is unavailable, without touching an avatar API',async()=>{
 let requests=0;
 await assert.rejects(()=>guardedProviderSearch({query:'redis-fail-only',mode:'search',platform:'All',limit:120,providers:['AviSeek']},{
  env:{UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'secret'},
  redis:async()=>{throw Error('Redis offline')},search:async()=>{requests++}
 }),/Shared search limiter unavailable/);
 assert.equal(requests,0);
});


test('a rate-limited provider is paused across later queries instead of retried',async()=>{
 const env={UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'secret'};
 const stored=new Map();let calls=0;
 const redis=async args=>{
  const [cmd,key,val]=args;
  if(cmd==='GET')return stored.get(key)||null;
  if(cmd==='MGET')return args.slice(1).map(k=>stored.get(k)||null);
  if(cmd==='SET'&&args.includes('NX'))return 'OK';
  if(cmd==='SET'){stored.set(key,val);return 'OK';}
 };
 const search=async()=>{calls++;return {avatars:[],health:[{provider:'PAW',state:'rate-limited',count:0}],notes:['PAW rate-limited']}};
 const input=query=>({query,mode:'search',platform:'All',limit:120,providers:['PAW']});
 await guardedProviderSearch(input('rate-test-one'),{env,redis,search});
 const next=await guardedProviderSearch(input('rate-test-two'),{env,redis,search});
 assert.equal(calls,1);
 assert.equal(next.health[0].state,'cooldown');
 assert.match(next.notes.join(' '),/temporarily paused/);
});
