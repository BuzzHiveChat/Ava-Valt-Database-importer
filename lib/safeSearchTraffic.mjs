import {createHash} from 'node:crypto';
import {searchProviders} from './providers.js';
import {upstashCommand,SafeVerifyError} from './safePlatformVerification.mjs';

// Uses global storage whenever available. Without Redis this falls back to an
// instance-local cooldown; Vercel may have multiple instances. Never claim a
// local cache is a site-wide guarantee.
export const SEARCH_CACHE_SECONDS=75;
export const SEARCH_COOLDOWN_SECONDS=12;
const PREFIX='avavalt:admin-search:v1';
const localCache=new Map();
const inflight=new Map();
const localProviderPauses=new Map();
let lastLocalSearch=0;
export class SearchCooldownError extends Error {
  constructor(message,seconds=SEARCH_COOLDOWN_SECONDS){super(message);this.status=429;this.retryAfter=seconds;}
}
function keyFor(options) {
  return createHash('sha256').update(JSON.stringify(options)).digest('hex').slice(0,32);
}
function redisAvailable(env){return !!(env.UPSTASH_REDIS_REST_URL&&env.UPSTASH_REDIS_REST_TOKEN);}
export function normalizeSearchRequest(body,allowedProviders){
  const names=[...new Set((Array.isArray(body?.providers)?body.providers:allowedProviders).filter(x=>allowedProviders.includes(x)))];
  return {query:String(body?.query||'').trim().slice(0,120),mode:['latest','random','search'].includes(body?.mode)?body.mode:'search',
    platform:['All','PC','Android','iOS'].includes(body?.platform)?body.platform:'All',
    limit:[120,500,1000].includes(Number(body?.limit))?Number(body.limit):120, providers:names};
}
export async function guardedProviderSearch(options,{env=process.env,search=searchProviders,redis=upstashCommand,now=()=>Date.now()}={}) {
  const key=keyFor(options),cacheKey=`${PREFIX}:result:${key}`;
  const local=localCache.get(key);
  if(local&&local.expires>now())return {...local.result,traffic:{cache:'server',shared:redisAvailable(env)}};
  if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
    if(redisAvailable(env)){
      let cached;
      try{cached=await redis(['GET',cacheKey],{env});}
      catch(e){throw new SafeVerifyError('Shared search limiter unavailable. Search paused rather than risk extra API traffic.',503);}
      if(cached){try{const result=JSON.parse(cached);return {...result,traffic:{cache:'shared',shared:true}};}catch{}}
      const permit=await redis(['SET',`${PREFIX}:global-slot`,'1','NX','EX',String(SEARCH_COOLDOWN_SECONDS)],{env});
      if(permit!=='OK')throw new SearchCooldownError('Another staff search just called the avatar APIs. Please wait about 12 seconds, then retry.');
    } else {
      if(now()-lastLocalSearch<SEARCH_COOLDOWN_SECONDS*1000)
        throw new SearchCooldownError('Search cooldown: please wait a few seconds before another different search.');
      lastLocalSearch=now();
    }
    // Provider circuit breaker: a source returning 429, blocked, or a bad
    // response must not be hammered by later searches with different queries.
    const holds=options.providers.map(name=>`${PREFIX}:hold:${name}`);
    let pauseData;
    if(redisAvailable(env)) {
      try {pauseData=await redis(['MGET',...holds],{env});}
      catch {throw new SafeVerifyError('Could not read shared provider cooldowns. No provider requests were sent.',503);}
      if(!Array.isArray(pauseData)||pauseData.length!==holds.length) throw new SafeVerifyError('Provider cooldown store unavailable.',503);
    } else pauseData=options.providers.map(name=>Number(localProviderPauses.get(name)||0)>now()?'paused':null);
    const skipped=options.providers.filter((_,i)=>Boolean(pauseData[i]));
    const active=options.providers.filter((_,i)=>!pauseData[i]);
    const raw=active.length ? await search({...options,providers:active}) : {avatars:[],totalUnique:0,shown:0,truncated:false,health:[],notes:[]};
    const report=(raw.health||[]);
    for(const provider of report){
      const seconds=provider.state==='rate-limited'?300:provider.state==='blocked'?600:provider.state==='unavailable'?75:0;
      if(!seconds) continue;
      if(redisAvailable(env)) {
        try{await redis(['SET',`${PREFIX}:hold:${provider.provider}`,'1','EX',String(seconds)],{env});}catch{/* next search's Redis reads remain fail-closed */}
      } else localProviderPauses.set(provider.provider,now()+seconds*1000);
    }
    const result={...raw,health:[...report,...skipped.map(name=>({provider:name,state:'cooldown',count:0,error:'Temporarily paused to protect its API'}))],
      notes:[...(raw.notes||[]),...skipped.map(name=>`${name}: temporarily paused after earlier errors or rate limits`)]};
    localCache.set(key,{result,expires:now()+SEARCH_CACHE_SECONDS*1000});
    if(localCache.size>20)localCache.delete(localCache.keys().next().value);
    if(redisAvailable(env)){
      try{await redis(['SET',cacheKey,JSON.stringify(result),'EX',String(SEARCH_CACHE_SECONDS)],{env});}catch{/* no cache is safer than retrying a failed provider request */}
    }
    return {...result,traffic:{cache:'fresh',shared:redisAvailable(env)}};
  })();
  inflight.set(key,work);
  try{return await work;}finally{inflight.delete(key)}
}
