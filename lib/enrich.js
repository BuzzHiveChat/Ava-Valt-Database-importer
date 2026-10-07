import {platformSetFromAny} from "./platforms";
import {lookupExtraPlatform} from "./extraPlatformProviders";

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
function platforms(x){ return platformSetFromAny(x); }

async function nsvrHtml(id){
 try{
  const u=`https://avtr.nekosunevr.co.uk/avatarlookup?avatarId=${encodeURIComponent(id)}`;
  const r=await fetch(u,{headers:{"Accept":"text/html","User-Agent":"Ava-Valt-Web-Importer/2.5"},cache:"no-store",signal:AbortSignal.timeout(3500)});
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
   const r=await fetch(u,{headers:H,cache:"no-store",signal:AbortSignal.timeout(3500)});
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
export async function repairExistingPlatforms({limit=100,timeBudgetMs=45000}={}){
 const started=Date.now(), db=await readDb(), settings=await getSettings();
 const enabled=Object.entries(settings.providerEnabled||{}).filter(([,v])=>v).map(([k])=>k).filter(k=>endpoints[k]);
 const isUnknown=a=>{
  const p=a?.platforms;
  if(!p)return true;
  const arr=Array.isArray(p)?p:String(p).split(/[•,]/);
  return !arr.length||arr.every(v=>!String(v).trim()||String(v).trim().toLowerCase()==="unknown");
 };
 const unknown=db.avatars.filter(isUnknown);
 const candidates=[...unknown].sort((a,b)=>{
  const at=Date.parse(a?.platformMetadataCheckedAt||a?.metadataCheckedAt||0)||0;
  const bt=Date.parse(b?.platformMetadataCheckedAt||b?.metadataCheckedAt||0)||0;
  return at-bt;
 }).slice(0,Math.min(Math.max(limit,1),500));
 let fixed=0,checked=0; const updated=new Map(db.avatars.map(a=>[a.id,a]));
 // VRChat is the fastest/most authoritative fallback when the server-side auth cookie works.
 // Community providers are attempted only when VRChat does not give platform builds.
 for(const a of candidates){
  if(Date.now()-started>=timeBudgetMs)break;
  checked++;
  let resolved=false;
  try{
   const v=await vrchatAvatar(a.id);
   if(v.ok&&v.platforms?.length){
    updated.set(a.id,{...a,platforms:v.platforms,metadataProvider:"VRChat API",metadataCheckedAt:new Date().toISOString(),platformMetadataCheckedAt:new Date().toISOString()});
    fixed++; resolved=true;
   }
  }catch{}
  if(!resolved && Date.now()-started<timeBudgetMs){
   for(const name of enabled){
    if(Date.now()-started>=timeBudgetMs)break;
    let hit=await lookup(endpoints[name],a.id);
    if(!hit&&name==="NSVR")hit=await nsvrHtml(a.id);
    if(!hit)continue;
    const merged=merge(a,hit,name);
    if(Array.isArray(merged.platforms)&&merged.platforms.length){updated.set(a.id,merged);fixed++;resolved=true;break}
   }
  }
  if(!resolved){
   const cur=updated.get(a.id)||a;
   updated.set(a.id,{...cur,platformMetadataCheckedAt:new Date().toISOString(),platformMetadataState:"UNRESOLVED"});
  }
 }
 if(checked)await replaceAndSave([...updated.values()],`Ava-Valt platform repair: checked ${checked}, fixed ${fixed}`);
 return {checked,fixed,remaining:unknown.length-fixed,total:db.avatars.length,timeBudgetReached:Date.now()-started>=timeBudgetMs};
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
 const extra=await lookupExtraPlatform(avatar.id);
 if(extra.platforms?.length)return {...avatar,platforms:extra.platforms,metadataProvider:extra.provider,metadataCheckedAt:new Date().toISOString()};
 return {...avatar,platforms:[]};
}
