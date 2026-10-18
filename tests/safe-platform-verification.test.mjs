import test from 'node:test';
import assert from 'node:assert/strict';
import {
 safeVerificationConfig,sanitizeAvatarInputs,parseAviSeekPlatforms,verifyAviSeekBatch,
 SafeVerifyError, SAFE_PLATFORM_INTERVAL_SECONDS,SAFE_PLATFORM_SESSION_MAX
} from '../lib/safePlatformVerification.mjs';
const env={SAFE_PLATFORM_VERIFY_ENABLED:'true',UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'secret'};
const id=i=>`avtr_00000000-0000-0000-0000-${String(i).padStart(12,'0')}`;
function testStorage(){
 const cache=new Map(),commands=[];
 const command=async(args)=>{
  commands.push(args);
  const [op,...rest]=args;
  if(op==='MGET')return rest.map(k=>cache.get(k)||null);
  if(op==='GET')return cache.get(rest[0])||null;
  if(op==='SET'){
   const [key,val,...flags]=rest;
   if(flags.includes('NX')&&cache.has(key))return null;
   cache.set(key,val); return 'OK';
  }
  throw Error('Unexpected Redis command: '+op);
 };
 const pipeline=async(commands)=>{for(const [op,key,value] of commands){assert.equal(op,'SET');cache.set(key,value)}};
 return {cache,commands,command,pipeline};
}

test('feature is disabled by default and cannot operate without shared limiter', async()=>{
 assert.equal(safeVerificationConfig({}).enabled,false);
 assert.equal(safeVerificationConfig({SAFE_PLATFORM_VERIFY_ENABLED:'true'}).enabled,false);
 assert.equal(safeVerificationConfig(env).enabled,true);
 assert.equal(SAFE_PLATFORM_SESSION_MAX,50);
 assert.equal(SAFE_PLATFORM_INTERVAL_SECONDS,30);
 let outbound=0;
 await assert.rejects(()=>verifyAviSeekBatch([{id:id(1)}],{env:{},fetchImpl:async()=>{outbound++}}),SafeVerifyError);
 assert.equal(outbound,0);
});

test('sanitizes IDs, deduplicates case insensitive and caps ten',()=>{
 const list=[{id:'invalid'},{id:id(0)},{id:id(0).toUpperCase()},...Array.from({length:20},(_,i)=>({id:id(i+1)}))];
 assert.equal(sanitizeAvatarInputs(list).length,10);
 assert.equal(new Set(sanitizeAvatarInputs(list).map(a=>a.id.toLowerCase())).size,10);
 assert.deepEqual(parseAviSeekPlatforms({platforms:['pc','quest','ios','unsupported']}),['PC','Android','iOS']);
 assert.deepEqual(parseAviSeekPlatforms({performance:{pc:'Good'}}),[]);
});

test('ten avatar IDs use ONE AviSeek request and are cached for subsequent use',async()=>{
 const store=testStorage(),requested=[];
 const inputs=Array.from({length:10},(_,i)=>({id:id(i+1),name:'Avatar'}));
 const fetchImpl=async(url)=>{
  requested.push(new URL(url));
  const ids=new URL(url).searchParams.get('ids').split(',');
  return Response.json({avatars:ids.slice(0,5).map(id=>({id,platforms:['pc','quest','ios']}))});
 };
 const opts={env,...store,fetchImpl};
 const first=await verifyAviSeekBatch(inputs,opts);
 assert.equal(requested.length,1);
 assert.equal(requested[0].pathname,'/api/world/avatars');
 assert.equal(requested[0].searchParams.get('ids').split(',').length,10);
 assert.equal(first.stats.attempted,10);
 assert.equal(first.stats.resolvedByLookup,5);
 assert.deepEqual(first.avatars[0].platforms,['PC','Android','iOS']);
 assert.deepEqual(first.avatars[8].platforms,[]);
 const second=await verifyAviSeekBatch(inputs,opts);
 assert.equal(requested.length,1);
 assert.equal(second.stats.cached,10);
 assert.equal(second.stats.attempted,0);
});

test('global Redis lock stops other uncached requests without contacting provider',async()=>{
 const store=testStorage();let calls=0;
 const fetchImpl=async()=>{calls++;return Response.json({avatars:[]})};
 await verifyAviSeekBatch([{id:id(1)}],{env,...store,fetchImpl});
 await assert.rejects(()=>verifyAviSeekBatch([{id:id(2)}],{env,...store,fetchImpl}),e=>e.status===429&&e.retryAfter===30);
 assert.equal(calls,1);
});

test('AviSeek 429 starts shared cooldown and no repeated external requests',async()=>{
 const store=testStorage();let calls=0;
 const fetchImpl=async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'120'}})};
 await assert.rejects(()=>verifyAviSeekBatch([{id:id(1)}],{env,...store,fetchImpl}),e=>e.status===429&&e.retryAfter===120);
 await assert.rejects(()=>verifyAviSeekBatch([{id:id(2)}],{env,...store,fetchImpl}),e=>e.status===429&&e.retryAfter===120);
 assert.equal(calls,1);
});

test('fail closed when storage cannot supply shared rate limiter',async()=>{
 let calls=0;
 const command=async()=>{throw new SafeVerifyError('Redis unavailable')};
 await assert.rejects(()=>verifyAviSeekBatch([{id:id(1)}],{env,command,fetchImpl:async()=>{calls++}}),SafeVerifyError);
 assert.equal(calls,0);
});
