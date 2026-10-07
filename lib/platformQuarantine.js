import {getRepoFile,putRepoFile} from "./githubFile";
import {readDb,removeIdsAndSave,mergeAndSave} from "./db";
import {hasKnownPlatform,normalizeAvatarPlatforms} from "./platforms";
import {enrichNewAvatarPlatform} from "./enrich";

const PATH=()=>process.env.UNKNOWN_PLATFORM_QUARANTINE_PATH||"unknown-platform-quarantine.json";

async function readQ(){
 try{
  const f=await getRepoFile(PATH());
  const j=JSON.parse(f.text||"{}");
  return Array.isArray(j)?{avatars:j}:j;
 }catch(e){
  if(e.message==="NOT_FOUND")return {version:1,updated:null,avatars:[]};
  throw e;
 }
}
async function writeQ(avatars,message){
 const root={version:1,updated:new Date().toISOString(),avatars};
 await putRepoFile(PATH(),JSON.stringify(root,null,2)+"\n",message);
 return root;
}
export async function quarantineRecords(records,{reason="platform-unresolved"}={}){
 const incoming=(records||[]).filter(a=>a?.id&&!hasKnownPlatform(a));
 if(!incoming.length)return {quarantined:0,total:(await readQ()).avatars?.length||0};
 const q=await readQ();
 const map=new Map((q.avatars||[]).filter(a=>a?.id).map(a=>[a.id,a]));
 let added=0;
 for(const a of incoming){
  if(!map.has(a.id))added++;
  map.set(a.id,{...a,quarantineReason:reason,quarantinedAt:new Date().toISOString()});
 }
 await writeQ([...map.values()],`Ava-Valt: quarantine ${added} unresolved platform avatar(s)`);
 return {quarantined:added,total:map.size};
}
export async function quarantineUnknownFromLiveDb(){
 const db=await readDb();
 const unknown=db.avatars.filter(a=>!hasKnownPlatform(a));
 if(!unknown.length)return {moved:0,total:db.avatars.length,quarantined:(await readQ()).avatars?.length||0};
 // Save a copy first. Only after preservation succeeds do we remove those exact IDs from live DB.
 const q=await quarantineRecords(unknown,{reason:"live-db-unknown-platform"});
 const r=await removeIdsAndSave(unknown.map(a=>a.id),`Ava-Valt strict platform mode: move ${unknown.length} Unknown record(s) to quarantine`);
 return {moved:r.removed,total:r.total,quarantined:q.total};
}
export async function repairQuarantinedPlatforms({limit=5,timeBudgetMs=12000}={}){
 const started=Date.now(),q=await readQ(), source=q.avatars||[];
 if(!source.length)return {checked:0,restored:0,remaining:0};
 const keep=[],restored=[];
 let checked=0;
 for(let i=0;i<source.length;i++){
  const a=source[i];
  if(checked>=limit||Date.now()-started>=timeBudgetMs){keep.push(...source.slice(i));break}
  checked++;
  let enriched=a;
  try{enriched=normalizeAvatarPlatforms(await enrichNewAvatarPlatform(a))}catch{}
  if(hasKnownPlatform(enriched)){
   const {quarantineReason,quarantinedAt,...clean}=enriched;
   restored.push(clean);
  }else keep.push({...a,lastPlatformRetryAt:new Date().toISOString()});
 }
 if(restored.length)await mergeAndSave(restored,`Ava-Valt: restore ${restored.length} platform-resolved quarantined avatar(s)`);
 await writeQ(keep,`Ava-Valt: platform quarantine retry — restored ${restored.length}`);
 return {checked,restored:restored.length,remaining:keep.length};
}
export async function quarantineStats(){
 const q=await readQ(); return {quarantined:(q.avatars||[]).length};
}
