
const UA={"User-Agent":"Ava-Valt-Web-Importer/1.0","Accept":"application/json"};
const endpoints={
  KitsuneDB:"https://avtr.fumikoecho.net/api/integrations/avatars/vrcx",
  PAW:"https://paw-api.amelia.fun/vrcx_search",
  VRCDB:"https://vrcx.vrcdb.com/avatars/Avatar/VRCX",
  VRCWB:"https://avatar.worldbalancer.com/vrcx_search.php",
  NSVR:"https://avtr.nekosunevr.co.uk/vrcx_search"
};
const first=(...x)=>x.find(v=>typeof v==="string"&&v.trim())||"";
function normalize(x){
 const a=x?.author||x?.user||{};
 const id=first(x?.id,x?.avatarId,x?.avatar_id,x?.vrcId,x?.vrc_id);
 if(!id.startsWith("avtr_")) return null;
 const platforms=(x.platforms||x.compatibility||[]).map(String);
 return {id,name:first(x.name,x.displayName,x.display_name,x.avatarName,x.avatar_name,"Unknown Avatar"),
 author:first(x.authorName,x.author_name,x.username,x.userName,a.name,a.username,a.displayName,a.display_name,a.authorName,a.author_name,"Unknown"),
 authorId:first(x.authorId,x.author_id,x.userId,x.user_id,a.id,a.vrc_id,a.userId,a.user_id,a.authorId,a.author_id),
 description:first(x.description,x.desc),imageUrl:first(x.imageUrl,x.image_url,x.image),thumbnailImageUrl:first(x.thumbnailImageUrl,x.thumbnail_image_url,x.thumbnail,x.thumbnailUrl,x.thumbnail_url),
 releaseStatus:first(x.releaseStatus,x.release_status,x.status,"public"),searchable:true,platforms:platforms.join(" • "),performancePc:first(x.performance?.pc,x.performance?.pc_rating,x.performance?.pcRating,x.performance?.standalonewindows),
 performanceAndroid:first(x.performance?.android,x.performance?.android_rating,x.performance?.androidRating,x.performance?.quest,x.performance?.questRating),
 performanceIos:first(x.performance?.ios,x.performance?.ios_rating,x.performance?.iosRating),tags:Array.isArray(x.tags)?x.tags.join(" • "):"",createdAt:first(x.created_at,x.createdAt),updatedAt:first(x.updated_at,x.updatedAt),version:Number(x.version||0)};
}
function list(j){ if(Array.isArray(j))return j; for(const k of ["items","avatars","results","data","docs"])if(Array.isArray(j?.[k]))return j[k]; return j&&typeof j==="object"?[j]:[]; }
export async function searchProviders({query="",mode="search",limit=60,providers=[]}){
 const chosen=providers.length?providers:Object.keys(endpoints); const out=new Map(), notes=[];
 for(const p of chosen){ try{
   const endpoint=endpoints[p]; if(!endpoint)continue; const q=(mode==="search"&&query.trim())?query.trim():"avatar";
   let u=p==="VRCDB"?`${endpoint}?search=${encodeURIComponent(q)}`:`${endpoint}?search=${encodeURIComponent(q)}&n=${Math.min(limit,60)}&page=1`;
   const r=await fetch(u,{headers:UA,cache:"no-store"}); if(!r.ok)throw new Error(`HTTP ${r.status}`);
   const arr=list(await r.json()); let n=0; for(const x of arr){const a=normalize(x);if(a&&!out.has(a.id)){out.set(a.id,a);n++;}if(out.size>=limit)break;} notes.push(`${p}: ${n}`);
 }catch(e){notes.push(`${p}: unavailable (${e.message})`)} }
 return {avatars:[...out.values()].slice(0,limit),notes};
}
