
import {readDb,replaceAndSave} from "./db";
import {getSettings} from "./settings";
import {vrchatAvatar} from "./vrchat";

const endpoints={
 KitsuneDB:"https://avtr.fumikoecho.net/api/integrations/avatars/vrcx",
 PAW:"https://paw-api.amelia.fun/vrcx_search",
 VRCDB:"https://vrcx.vrcdb.com/avatars/Avatar/VRCX",
 VRCWB:"https://avatar.worldbalancer.com/vrcx_search.php",
 NSVR:"https://avtr.nekosunevr.co.uk/vrcx_search"
};
const H={"Accept":"application/json","User-Agent":"VRCX/Ava-Valt-Web-Importer-2.5","Referer":"https://vrcx.app","VRCX-ID":"ava-valt-web-importer"};
const list=j=>Array.isArray(j)?j:(Array.isArray(j?.avatars)?j.avatars:Array.isArray(j?.results)?j.results:Array.isArray(j?.data)?j.data:[]);
function platforms(x){
 const out=new Set(), add=v=>{
  if(!v)return;if(Array.isArray(v))return v.forEach(add);
  if(typeof v==="object"){for(const [k,val]of Object.entries(v))if(val)add(k);return}
  const z=String(v).toLowerCase();
  if(/windows|standalonewindows|pc|win/.test(z))out.add("PC");
  if(/android|quest|standalone/.test(z))out.add("Android");
  if(/ios|iphone|ipad/.test(z))out.add("iOS");
 };
 add(x.platforms);add(x.platform);add(x.compatibility);add(x.supportedPlatforms);add(x.supported_platforms);
 add(x.unityPackages);add(x.unity_packages);add(x.packages);add(x.versions);
 if(x.pc===true||x.hasPc===true||x.has_pc===true)out.add("PC");
 if(x.android===true||x.quest===true||x.hasAndroid===true||x.has_android===true)out.add("Android");
 if(x.ios===true||x.hasIos===true||x.has_ios===true)out.add("iOS");
 return [...out];
}

async function nsvrHtml(id){
 try{
  const u=`https://avtr.nekosunevr.co.uk/avatarlookup?avatarId=${encodeURIComponent(id)}`;
  const r=await fetch(u,{headers:{"Accept":"text/html","User-Agent":"Ava-Valt-Web-Importer/2.5"},cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!r.ok)return null; const html=await r.text();
  const m=html.match(/Platform:\s*([^<\n]+)/i);
  if(!m)return null;
  const vals=m[1].split(",").map(x=>x.trim()).filter(Boolean);
  return {id,platforms:vals};
 }catch{return null}
}

async function lookup(base,id){
 for(const [key,val] of [["avatarId",id],["search",id]]){
  try{
   const u=new URL(base);u.searchParams.set(key,val);u.searchParams.set("n","20");
   const r=await fetch(u,{headers:H,cache:"no-store",signal:AbortSignal.timeout(12000)});
   if(!r.ok)continue;const j=await r.json();
   const hit=list(j).find(a=>(a.id||a.avatarId||a.avatar_id)===id);
   if(hit)return hit;
  }catch{}
 }
 return null;
}
function merge(old,x,provider){
 const ps=platforms(x);
 const out={...old};
 if(ps.length)out.platforms=ps;
 const fields=[["name","name"],["authorId","authorId"],["authorName","authorName"],["description","description"],["imageUrl","imageUrl"],["thumbnailImageUrl","thumbnailImageUrl"],["releaseStatus","releaseStatus"],["created_at","created_at"],["updated_at","updated_at"]];
 for(const [dst,src] of fields)if((out[dst]==null||out[dst]===""||out[dst]==="Unknown")&&x[src])out[dst]=x[src];
 out.metadataProvider=provider;out.metadataCheckedAt=new Date().toISOString();
 return out;
}
export async function repairExistingPlatforms({limit=100}={}){
 const db=await readDb(), settings=await getSettings();
 const enabled=Object.entries(settings.providerEnabled||{}).filter(([,v])=>v).map(([k])=>k).filter(k=>endpoints[k]);
 const isUnknown=a=>{
 const p=a?.platforms;
 if(!p)return true;
 const arr=Array.isArray(p)?p:String(p).split(/[•,]/);
 return !arr.length||arr.every(v=>!String(v).trim()||String(v).trim().toLowerCase()==="unknown");
};
 const candidates=db.avatars.filter(isUnknown).slice(0,Math.min(Math.max(limit,1),500));
 let fixed=0,checked=0; const updated=new Map(db.avatars.map(a=>[a.id,a]));
 for(const a of candidates){
  checked++;
  for(const name of enabled){
   let hit=await lookup(endpoints[name],a.id);
   if(!hit&&name==="NSVR")hit=await nsvrHtml(a.id);
   if(!hit)continue;
   const merged=merge(a,hit,name);
   if(Array.isArray(merged.platforms)&&merged.platforms.length){updated.set(a.id,merged);fixed++;break}
  }
  if(!Array.isArray(updated.get(a.id)?.platforms)||!updated.get(a.id).platforms.length){
   const v=await vrchatAvatar(a.id);
   if(v.ok&&v.platforms?.length){updated.set(a.id,{...a,platforms:v.platforms,metadataProvider:"VRChat API",metadataCheckedAt:new Date().toISOString()});fixed++}
  }
 }
 if(fixed)await replaceAndSave([...updated.values()],`Ava-Valt metadata repair: fixed ${fixed} avatar platform records`);
 return {checked,fixed,remaining:db.avatars.filter(isUnknown).length-fixed,total:db.avatars.length};
}

export async function enrichNewAvatarPlatform(avatar){
 if(!avatar?.id)return avatar;
 const existing=platforms(avatar);
 if(existing.length)return {...avatar,platforms:existing};
 const settings=await getSettings();
 const enabled=Object.entries(settings.providerEnabled||{}).filter(([,v])=>v).map(([k])=>k).filter(k=>endpoints[k]);
 for(const name of enabled){
  let hit=await lookup(endpoints[name],avatar.id);
  if(!hit&&name==="NSVR")hit=await nsvrHtml(avatar.id);
  if(!hit)continue;
  const merged=merge(avatar,hit,name);
  if(Array.isArray(merged.platforms)&&merged.platforms.length)return merged;
 }
 const v=await vrchatAvatar(avatar.id);
 if(v.ok&&v.platforms?.length)return {...avatar,platforms:v.platforms,metadataProvider:"VRChat API",metadataCheckedAt:new Date().toISOString()};
 return {...avatar,platforms:[]};
}
