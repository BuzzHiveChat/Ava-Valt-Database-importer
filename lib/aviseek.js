import {platformSetFromAny} from "./platforms";

// Keyless public world catalog: https://aviseek.vrchatlegends.com/docs/reference
// Documented routes: /api/world/search and /api/world/avatars?ids=avtr_...
// Honor service limits, HTTP 429, unlisting, and at least 60s caching.
const BASE="https://aviseek.vrchatlegends.com";
const CACHE_MS=60_000;
const CACHE_LIMIT=200;
const cache=new Map();
export const aviseekAvatarPage=id=>`${BASE}/avatar/${encodeURIComponent(id)}`;
const validId=id=>/^avtr_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(id||""));

export function aviseekRecord(x){
 if(!x||typeof x!=="object"||!validId(x.id||x.avatarId))return null;
 const a=x.author&&typeof x.author==="object"?x.author:{};
 const first=(...values)=>values.find(v=>typeof v==="string"&&v.trim())||"";
 return {
  id:first(x.id,x.avatarId),name:first(x.name,x.displayName,"Unknown Avatar"),
  author:first(x.authorName,x.author_name,a.displayName,a.name,x.author,"Unknown"),
  authorId:first(x.authorId,a.id),description:first(x.description),
  imageUrl:first(x.imageUrl,x.image_url),
  thumbnailImageUrl:first(x.thumbnailImageUrl,x.thumbnail_image_url,x.thumbnailUrl,x.imageUrl),
  releaseStatus:first(x.releaseStatus,"public"),searchable:true,
  platforms:platformSetFromAny(x),
  performancePc:first(x.performance?.pc,x.performancePc),
  performanceAndroid:first(x.performance?.quest,x.performance?.android,x.performanceAndroid),
  performanceIos:first(x.performance?.ios,x.performanceIos),
  tags:Array.isArray(x.tags)?x.tags.filter(t=>typeof t==="string").join(" • "):"",
  createdAt:first(x.addedAt,x.createdAt,x.created_at),updatedAt:first(x.updatedAt,x.updated_at),
  metadataProvider:"AviSeek",metadataEvidence:"public catalog platform fields"
 };
}

async function getPublicJson(url,{fetchImpl=fetch,timeoutMs=5000}={}){
 const key=String(url);
 const stored=cache.get(key);
 if(fetchImpl===fetch&&stored&&Date.now()-stored.at<CACHE_MS)return stored.value;
 let response;
 try{response=await fetchImpl(key,{headers:{Accept:"application/json","User-Agent":"Ava-Valt/3.0 (public avatar catalog)"},cache:"no-store",signal:AbortSignal.timeout(timeoutMs)});}
 catch(e){return {state:"unavailable",status:0,error:`network: ${e.message}`};}
 if(!response.ok)return {state:response.status===429?"rate-limited":[401,403].includes(response.status)?"blocked":"unavailable",status:response.status,error:`HTTP ${response.status}`};
 let data;
 try{data=await response.json()}catch{return {state:"unavailable",status:response.status,error:"invalid JSON"};}
 const result={state:"working",status:response.status,data};
 if(fetchImpl===fetch){if(cache.size>=CACHE_LIMIT)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),value:result});}
 return result;
}

export async function searchAviSeek(query,{limit=500,mode="search",platform="All",fetchImpl=fetch,timeoutMs=7000}={}){
 const q=String(query||"").trim().slice(0,120);
 const cap=Math.max(1,Math.min(1000,Number(limit)||500));
 const found=[],seen=new Set();
 const mappedPlatform={PC:"pc",Android:"quest",iOS:"ios"}[platform];
 // Exact ID lookup also works when an avatar's name is not indexed as a term.
 if(validId(q)){
  const endpoint=new URL("/api/world/avatars",BASE);endpoint.searchParams.set("ids",q);
  const r=await getPublicJson(endpoint,{fetchImpl,timeoutMs});
  if(r.state!=="working")return {name:"AviSeek",state:r.state,count:0,error:r.error};
  const list=Array.isArray(r.data?.avatars)?r.data.avatars:Array.isArray(r.data)?r.data:[];
  const avatars=list.filter(a=>String(a?.id||"").toLowerCase()===q.toLowerCase()).map(aviseekRecord).filter(Boolean);
  return {name:"AviSeek",state:"working",count:avatars.length,avatars};
 }
 let offset=0,partialError="";
 // /world/search and /world/list have offset/nextOffset and max 500 rows.
 // /world/random is one request by design.
 for(let page=0;page<Math.ceil(cap/500);page++){
  const url=new URL(mode==="random"?"/api/world/random":mode==="latest"||!q?"/api/world/list":"/api/world/search",BASE);
  if(q&&mode==="search")url.searchParams.set("q",q);
  if(mode==="latest")url.searchParams.set("sort","recent");
  if(mappedPlatform)url.searchParams.set("platform",mappedPlatform);
  url.searchParams.set("limit",String(Math.min(500,cap-found.length)));
  if(mode!=="random")url.searchParams.set("offset",String(offset));
  const result=await getPublicJson(url,{fetchImpl,timeoutMs});
  if(result.state!=="working"){
   if(found.length){partialError=`Further pages unavailable: ${result.error||result.state}`;break;}
   return {name:"AviSeek",state:result.state,count:0,error:result.error};
  }
  const j=result.data;
  const raw=Array.isArray(j?.avatars)?j.avatars:Array.isArray(j?.data?.avatars)?j.data.avatars:Array.isArray(j?.data)?j.data:Array.isArray(j)?j:[];
  for(const item of raw){const avatar=aviseekRecord(item);if(avatar&&!seen.has(avatar.id)){found.push(avatar);seen.add(avatar.id)}}
  if(mode==="random"||!raw.length||found.length>=cap)break;
  const next=Number(j?.nextOffset ?? j?.data?.nextOffset);
  if(!Number.isFinite(next)||next<=offset)break;
  offset=next;
 }
 return {name:"AviSeek",state:"working",count:found.length,avatars:found,error:partialError};
}

export async function lookupAviSeekPlatform(avatar,{fetchImpl=fetch,timeoutMs=4000}={}){
 const id=String(avatar?.id||"");
 const url=validId(id)?aviseekAvatarPage(id):null;
 if(!url)return {platforms:[],provider:null,status:0,reason:"Invalid avatar ID"};
 // This is the provider's documented read-only multi-ID lookup, not a fuzzy
 // search and not /world/avatar/{id}, which would count a page view.
 const endpoint=new URL("/api/world/avatars",BASE);
 endpoint.searchParams.set("ids",id);
 const result=await getPublicJson(endpoint,{fetchImpl,timeoutMs});
 if(result.state!=="working")return {platforms:[],provider:null,url,status:result.status,reason:result.error||result.state};
 const list=Array.isArray(result.data?.avatars)?result.data.avatars:Array.isArray(result.data)?result.data:[];
 const exact=list.find(a=>String(a?.id||"").toLowerCase()===id.toLowerCase());
 const platforms=platformSetFromAny(exact);
 return {platforms,provider:platforms.length?"AviSeek":null,url,status:200,
  evidence:platforms.length?"exact avatar ID in public catalog":"no exact matching platform data",
  reason:exact?null:"Avatar ID not in public catalog"};
}
