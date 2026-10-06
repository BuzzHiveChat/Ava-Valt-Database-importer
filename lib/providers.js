
const STANDARD_HEADERS={
  "Accept":"application/json",
  "User-Agent":"Ava-Valt-Web-Importer/2.0 (+Ava-Valt; server-side importer)"
};

const providers = {
  avtrDB: { url:"https://api.avtrdb.com/v3/avatar/search/vrcx", kind:"vrcx" },
  KitsuneDB: { url:"https://avtr.fumikoecho.net/api/integrations/avatars/vrcx", kind:"vrcx" },
  PAW: { url:"https://paw-api.amelia.fun/vrcx_search", kind:"vrcx" },
  VRCDB: { url:"https://vrcx.vrcdb.com/avatars/Avatar/VRCX", kind:"vrcx" },
  VRCWB: { url:"https://avatar.worldbalancer.com/vrcx_search.php", kind:"vrcx" },
  NSVR: { url:"https://avtr.nekosunevr.co.uk/vrcx_search", kind:"vrcx" }
};

const first=(...x)=>x.find(v=>typeof v==="string"&&v.trim())||"";
function normalize(x){
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
   platforms:Array.isArray(x.platforms||x.compatibility)?(x.platforms||x.compatibility).map(String).join(" • "):"",
   performancePc:first(x.performance?.pc,x.performance?.pc_rating,x.performance?.pcRating,x.performance?.standalonewindows),
   performanceAndroid:first(x.performance?.android,x.performance?.android_rating,x.performance?.androidRating,x.performance?.quest,x.performance?.questRating),
   performanceIos:first(x.performance?.ios,x.performance?.ios_rating,x.performance?.iosRating),
   tags:Array.isArray(x.tags)?x.tags.join(" • "):"",
   createdAt:first(x.created_at,x.createdAt),
   updatedAt:first(x.updated_at,x.updatedAt),
   version:Number(x.version||0)
 };
}
function asList(j){
 if(Array.isArray(j)) return j;
 for(const k of ["items","avatars","results","data","docs"]) if(Array.isArray(j?.[k])) return j[k];
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
 try { r=await fetch(u,{headers:STANDARD_HEADERS,cache:"no-store",signal:AbortSignal.timeout(15000)}); }
 catch(e){ return {name,state:"unavailable",count:0,error:`network: ${e.message}`}; }
 const body=await r.text();
 if(!r.ok) return {name,state:classify(r.status,body),count:0,error:`HTTP ${r.status}`};
 let data; try{data=JSON.parse(body)}catch{return {name,state:"unavailable",count:0,error:"invalid JSON"}}
 const avatars=asList(data).map(normalize).filter(Boolean);
 return {name,state:"working",count:avatars.length,avatars};
}
export async function searchProviders({query="",mode="search",limit=120,providers:chosen=[]}={}){
 const names=chosen.length?chosen:Object.keys(providers);
 const merged=new Map(), health=[];
 // Latest/random are provider-independent concepts; use broad legal search terms and randomize locally.
 const searchText=mode==="search"&&query.trim()?query.trim():"avatar";
 for(const name of names){
   const def=providers[name]; if(!def)continue;
   const r=await one(name,def,{query:searchText,limit});
   health.push({provider:name,state:r.state,count:r.count,error:r.error||""});
   if(r.state!=="working") continue;
   for(const a of r.avatars){ if(!merged.has(a.id)) merged.set(a.id,a); }
 }
 let avatars=[...merged.values()];
 if(mode==="random") avatars.sort(()=>Math.random()-.5);
 if(mode==="latest") avatars.sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));
 return {avatars:avatars.slice(0,limit),health,notes:health.map(h=>`${h.provider}: ${h.state==="working"?h.count:h.state+(h.error?` (${h.error})`:"")}`)};
}
export function providerNames(){return Object.keys(providers)}
