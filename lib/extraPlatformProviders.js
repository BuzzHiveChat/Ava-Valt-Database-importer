const UA=process.env.VRCHAT_USER_AGENT||"Ava-Valt/2.12";
const timeout=ms=>AbortSignal.timeout(ms);
const uniq=a=>[...new Set(a)];

function normalize(v){
 const s=String(v||"").toLowerCase(), out=[];
 if(/standalonewindows|windows|\bpc\b|win32|win64/.test(s))out.push("PC");
 if(/android|quest|standalone/.test(s))out.push("Android");
 if(/\bios\b|iphone|ipad/.test(s))out.push("iOS");
 return out;
}
export function platformsFromAny(x){
 if(!x)return [];
 let vals=[];
 for(const k of ["platform","platforms","supportedPlatforms","supported_platforms","compatibility"]){
  const v=x[k]; if(Array.isArray(v))vals.push(...v); else if(v!=null)vals.push(v);
 }
 for(const k of ["unityPackages","unity_packages","packages","versions"]){
  const v=x[k]; if(Array.isArray(v))for(const p of v)vals.push(p?.platform,p?.platformName,p?.targetPlatform);
 }
 if(x.pc===true||x.windows===true)vals.push("PC");
 if(x.android===true||x.quest===true)vals.push("Android");
 if(x.ios===true)vals.push("iOS");
 return uniq(vals.flatMap(normalize));
}
async function getJson(url){
 const r=await fetch(url,{headers:{"User-Agent":UA,"Accept":"application/json"},signal:timeout(10000),cache:"no-store"});
 if(!r.ok)throw new Error(`HTTP ${r.status}`);
 return r.json();
}
function hit(data,id){
 const a=Array.isArray(data)?data:(data?.avatars||data?.results||data?.data||data?.items||[]);
 if(Array.isArray(a))return a.find(x=>x?.id===id||x?.avatarId===id)||null;
 return (data?.id===id||data?.avatarId===id)?data:null;
}
export async function lookupExtraPlatform(id){
 const errors=[];
 // VRCNDb: public index advertises PC / Quest / iOS platform filtering and stores platforms.
 for(const url of [
  `https://db.vrcnext.com/api/avatars/${encodeURIComponent(id)}`,
  `https://db.vrcnext.com/api/avatar/${encodeURIComponent(id)}`,
  `https://db.vrcnext.com/api/search?search=${encodeURIComponent(id)}`
 ]){
  try{
   const rec=hit(await getJson(url),id), platforms=platformsFromAny(rec);
   if(platforms.length)return {platforms,provider:"VRCNDb"};
  }catch(e){errors.push(`VRCNDb: ${e.message}`)}
 }
 // Cute Avatar Search: documented platform codes w=Windows, a=Android, i=iOS.
 for(const url of [
  `https://avtr.icu/search?q=${encodeURIComponent(id)}`,
  `https://avtr.icu/search?search=${encodeURIComponent(id)}`
 ]){
  try{
   const rec=hit(await getJson(url),id);
   let platforms=platformsFromAny(rec);
   const code=String(rec?.platformCode||rec?.platform_code||"").toLowerCase();
   if(code.includes("w"))platforms.push("PC");
   if(code.includes("a"))platforms.push("Android");
   if(code.includes("i"))platforms.push("iOS");
   platforms=uniq(platforms);
   if(platforms.length)return {platforms,provider:"CuteAvatarSearch"};
  }catch(e){errors.push(`CuteAvatarSearch: ${e.message}`)}
 }
 return {platforms:[],provider:null,errors};
}
