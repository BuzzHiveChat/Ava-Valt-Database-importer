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


export async function listQuarantined({search="",page=1,pageSize=50}={}){
 const q=await readQ();
 const term=String(search||"").trim().toLowerCase();
 let rows=(q.avatars||[]).filter(a=>a?.id);
 if(term)rows=rows.filter(a=>[
   a.id,a.name,a.author,a.authorName,a.authorId
 ].some(v=>String(v||"").toLowerCase().includes(term)));
 rows.sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)));
 const size=Math.max(1,Math.min(Number(pageSize)||50,100));
 const current=Math.max(1,Number(page)||1);
 const start=(current-1)*size;
 return {
   total:rows.length,page:current,pageSize:size,
   pages:Math.max(1,Math.ceil(rows.length/size)),
   avatars:rows.slice(start,start+size)
 };
}

function cleanManualPlatforms(platforms){
 const allowed=new Set(["PC","Android","iOS"]);
 return [...new Set((platforms||[]).filter(x=>allowed.has(x)))];
}

export async function ownerVerifyQuarantinedAvatar(id,platforms){
 const chosen=cleanManualPlatforms(platforms);
 if(!id||!chosen.length)throw new Error("Choose at least one platform.");
 const q=await readQ();
 const current=(q.avatars||[]).find(a=>a?.id===id);
 if(!current)throw new Error("That avatar is not in platform quarantine.");

 const {quarantineReason,quarantinedAt,lastPlatformRetryAt,platformMetadataState,...base}=current;
 const verified={
   ...base,
   platforms:chosen,
   metadataProvider:"Owner verified from VRChat website",
   metadataCheckedAt:new Date().toISOString(),
   platformMetadataCheckedAt:new Date().toISOString(),
   platformMetadataState:"OWNER_VERIFIED"
 };

 // Write to the live DB first. If quarantine cleanup fails afterwards, the record
 // remains safely duplicated rather than being lost.
 await mergeAndSave([verified],`Ava-Valt: owner verified ${id} for ${chosen.join(" / ")}`);

 const fresh=await readQ();
 const remaining=(fresh.avatars||[]).filter(a=>a?.id!==id);
 await writeQ(remaining,`Ava-Valt: remove owner-verified ${id} from platform quarantine`);
 return {ok:true,id,platforms:chosen,remaining:remaining.length};
}

export async function ownerVerifyQuarantinedBatch(items){
 const results=[];
 for(const item of (items||[]).slice(0,50)){
   try{
     results.push(await ownerVerifyQuarantinedAvatar(item?.id,item?.platforms));
   }catch(e){
     results.push({ok:false,id:item?.id||null,error:e?.message||String(e)});
   }
 }
 return {
   processed:results.length,
   succeeded:results.filter(x=>x.ok).length,
   failed:results.filter(x=>!x.ok).length,
   results
 };
}
