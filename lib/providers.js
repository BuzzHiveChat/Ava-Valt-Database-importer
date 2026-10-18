import {platformSetFromAny} from "./platforms";
import {searchAviSeek} from "./aviseek";

const STANDARD_HEADERS={
  "Accept":"application/json",
   "User-Agent":"VRCX/Ava-Valt-Web-Importer-2.23",
  "Referer":"https://vrcx.app",
  "VRCX-ID":"ava-valt-web-importer"
};

const providers = {
  avtrDB: { url:"https://api.avtrdb.com/v3/avatar/search/vrcx", kind:"vrcx" },
  AvtrZip: { url:"https://vrcx.avtr.zip", kind:"vrcx" },
  CuteDB: { url:"https://avtr.icu/vrcx", kind:"vrcx" },
  PAW: { url:"https://paw-api.amelia.fun/vrcx_search", kind:"vrcx" },
  VRCWB: { url:"https://avatarwbvrcxsearch.worldbalancer.com/vrcx_search", kind:"vrcx" },
  NSVR: { url:"https://vrcavatarsearch.nekosunevr.co.uk/vrcx_search", kind:"vrcx" },
  AviSeek: { kind:"aviseek" }
};

const first=(...x)=>x.find(v=>typeof v==="string"&&v.trim())||"";

function platformSet(x){ return platformSetFromAny(x); }
function normalize(x,metadataProvider){
 if(!x||typeof x!=="object"||Array.isArray(x))return null;
 const a=x?.author||x?.user||{};
 const id=first(x?.id,x?.avatarId,x?.avatar_id,x?.vrcId,x?.vrc_id);
 if(!id.startsWith("avtr_")) return null;
 return {
   id,
   name:first(x.name,x.displayName,x.display_name,x.avatarName,x.avatar_name,"Unknown Avatar"),
   author:first(x.authorName,x.author_name,x.username,x.userName,a.name,a.username,a.displayName,a.display_name,a.authorName,a.author_name,"Unknown"),
   authorId:first(x.authorId,x.author_id,x.userId,x.user_id,a.id,a.vrc_id,a.userId,a.user_id,a.authorId,a.author_id),
   description:first(x.description,x.desc),
   imageUrl:first(x.imageUrl,x.image_url,x.image),
   thumbnailImageUrl:first(x.thumbnailImageUrl,x.thumbnail_image_url,x.thumbnail,x.thumbnailUrl,x.thumbnail_url),
   releaseStatus:first(x.releaseStatus,x.release_status,x.status,"public"),
   searchable:true,
   platforms:platformSet(x),
   performancePc:first(x.performance?.pc,x.performance?.pc_rating,x.performance?.pcRating,x.performance?.standalonewindows),
   performanceAndroid:first(x.performance?.android,x.performance?.android_rating,x.performance?.androidRating,x.performance?.quest,x.performance?.questRating),
   performanceIos:first(x.performance?.ios,x.performance?.ios_rating,x.performance?.iosRating),
   tags:Array.isArray(x.tags)?x.tags.join(" • "):"",
   createdAt:first(x.created_at,x.createdAt),
   updatedAt:first(x.updated_at,x.updatedAt),
   version:Number(x.version||0),
   metadataProvider:metadataProvider||null
 };
}
function asList(j){
 if(Array.isArray(j)) return j;
 for(const k of ["items","avatars","results","data","docs"]) {
  if(Array.isArray(j?.[k])) return j[k];
  if(j?.[k]&&typeof j[k]==="object") {
   for(const nested of ["items","avatars","results","docs"])if(Array.isArray(j[k][nested]))return j[k][nested];
  }
 }
 return [];
}
function classify(status,body=""){
 const s=String(body).toLowerCase();
 if(status===401||status===403||s.includes("banned")||s.includes("blocked")) return "blocked";
 if(status===429) return "rate-limited";
 return "unavailable";
}
async function one(name,def,{query,limit}){
 const q=(query||"avatar").trim()||"avatar";
 const u=new URL(def.url);
 u.searchParams.set("search",q);
 u.searchParams.set("n",String(Math.min(Math.max(Number(limit)||100,1),5000)));
 let r;
 try { r=await fetch(u,{headers:STANDARD_HEADERS,cache:"no-store",signal:AbortSignal.timeout(5000)}); }
 catch(e){ return {name,state:"unavailable",count:0,error:`network: ${e.message}`}; }
 let body;
 try{body=await r.text()}catch(e){return {name,state:"unavailable",count:0,error:`network: ${e.message}`}}
 if(!r.ok) return {name,state:classify(r.status,body),count:0,error:`HTTP ${r.status}`};
 let data; try{data=JSON.parse(body)}catch{return {name,state:"unavailable",count:0,error:body.trimStart().startsWith("<")?"non-JSON response (website HTML instead of API data)":"invalid JSON"}}
 const avatars=asList(data).map(x=>normalize(x,name)).filter(Boolean);
 return {name,state:"working",count:avatars.length,avatars};
}
// Search a sensible amount per provider, then merge fairly. A provider count is
// not the number of cards returned to the UI; show both separately.
export async function searchProviders({query="",mode="search",limit=500,providers:chosen=null,platform="All"}={}){
 const cap=Math.max(1,Math.min(1000,Number(limit)||500));
 const names=Array.isArray(chosen)?[...new Set(chosen.filter(name=>Object.hasOwn(providers,name)))]:Object.keys(providers);
 const queryText=mode==="search"&&String(query||"").trim()?String(query).trim():"avatar";
 const results=await Promise.all(names.map(async name=>{
  const def=providers[name];
  if(def.kind==="aviseek")return searchAviSeek(mode==="search"?String(query||"").trim():"",{limit:cap,mode,platform});
  return one(name,def,{query:queryText,limit:cap});
 }));
 const health=results.filter(Boolean).map(r=>({provider:r.name,state:r.state,count:r.count,error:r.error||""}));
 const lists=results.map(r=>r?.state==="working"?r.avatars:[]);
 const merged=new Map();
 const maxLength=Math.max(0,...lists.map(list=>list.length));
 for(let i=0;i<maxLength;i++)for(let j=0;j<lists.length;j++){
  const a=lists[j][i];if(!a)continue;
  const name=results[j].name;
  const old=merged.get(a.id);
  if(!old){merged.set(a.id,{...a,sourceProviders:[name]});continue;}
  const sourceProviders=[...new Set([...(old.sourceProviders||[]),name])];
  const platforms=['PC','Android','iOS'].filter(p=>old.platforms.includes(p)||a.platforms.includes(p));
  const previous=old.platforms.length;
  // Enrichment comes only from matching avatar IDs; never guess compatibility.
  merged.set(a.id,{
   ...old,
   author:old.author==="Unknown"&&a.author!=="Unknown"?a.author:old.author,
   imageUrl:old.imageUrl||a.imageUrl,
   thumbnailImageUrl:old.thumbnailImageUrl||a.thumbnailImageUrl,
   description:old.description||a.description,
   platforms,
   metadataProvider:platforms.length>previous?a.metadataProvider:old.metadataProvider,
   sourceProviders
  });
 }
 let avatars=[...merged.values()];
 if(mode==="random"){
  // Fisher-Yates avoids the biased comparator random sort.
  for(let i=avatars.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[avatars[i],avatars[j]]=[avatars[j],avatars[i]];}
 }
 if(mode==="latest")avatars.sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")));
 // Client filters by platform AFTER optional ID verification; do not drop unknown IDs here.
 const totalUnique=avatars.length;
 return {
  avatars:avatars.slice(0,cap),totalUnique,shown:Math.min(avatars.length,cap),truncated:totalUnique>cap,
  health,notes:health.map(h=>`${h.provider}: ${h.state==="working"?h.count:h.state+(h.error?` (${h.error})`:"")}`)
 };
}
export function providerNames(){return Object.keys(providers)}
