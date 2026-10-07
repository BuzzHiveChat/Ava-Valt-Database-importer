import {getRepoFile,putRepoFile} from "./githubFile";
import {readDb,removeIdsAndSave,mergeAndSave} from "./db";
import {hasKnownPlatform,normalizeAvatarPlatforms} from "./platforms";
import {enrichNewAvatarPlatform,enrichNewAvatarsPlatforms} from "./enrich";

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
export async function repairQuarantinedPlatforms({
 limit=12,
 timeBudgetMs=24000,
 cooldownHours=12,
 force=false,
 concurrency=4
}={}){
 const started=Date.now();
 const q=await readQ(), source=(q.avatars||[]).filter(a=>a?.id);
 if(!source.length)return {checked:0,restored:0,remaining:0,eligible:0,deferred:0,sourceCounts:{},platformCounts:{PC:0,Android:0,iOS:0}};

 const cooldownMs=Math.max(0,Number(cooldownHours)||0)*60*60*1000;
 const now=Date.now();

 // Oldest/never-checked records first. Failed records cool down so one stubborn
 // avatar cannot permanently block the rest of the quarantine.
 const eligible=source.filter(a=>{
   if(force)return true;
   const next=Date.parse(a?.nextPlatformRetryAt||0)||0;
   if(next>now)return false;
   const last=Date.parse(a?.lastPlatformRetryAt||0)||0;
   return !last || now-last>=cooldownMs;
 }).sort((a,b)=>{
   const at=Date.parse(a?.lastPlatformRetryAt||0)||0;
   const bt=Date.parse(b?.lastPlatformRetryAt||0)||0;
   return at-bt;
 });

 const candidates=eligible.slice(0,Math.max(1,Math.min(Number(limit)||12,100)));
 if(!candidates.length)return {
   checked:0,restored:0,remaining:source.length,eligible:0,deferred:source.length,
   sourceCounts:{},platformCounts:{PC:0,Android:0,iOS:0}
 };

 const batch=await enrichNewAvatarsPlatforms(candidates,{
   limit:candidates.length,
   concurrency:Math.max(1,Math.min(Number(concurrency)||4,8)),
   timeBudgetMs:Math.max(3000,Number(timeBudgetMs)||24000)
 });

 const resolved=[], unresolved=[];
 for(const a of batch.avatars||[]){
   if(hasKnownPlatform(a))resolved.push(a);
   else unresolved.push(a);
 }

 // Restore verified records first.
 if(resolved.length){
   const clean=resolved.map(a=>{
     const {
       quarantineReason,quarantinedAt,lastPlatformRetryAt,nextPlatformRetryAt,
       platformRetryCount,...rest
     }=a;
     return {...rest,platformMetadataState:rest.platformMetadataState==="OWNER_VERIFIED"?"OWNER_VERIFIED":"AUTO_RESOLVED"};
   });
   await mergeAndSave(clean,`Ava-Valt: auto restore ${clean.length} platform-resolved quarantined avatar(s)`);
 }

 // Re-read before writing quarantine so avatars added by another request aren't lost.
 const fresh=await readQ();
 const resolvedIds=new Set(resolved.map(a=>a.id));
 const unresolvedById=new Map(unresolved.map(a=>[a.id,a]));
 const checkedIds=new Set((batch.avatars||[]).map(a=>a?.id).filter(Boolean));
 const next=[];

 for(const original of (fresh.avatars||[])){
   if(!original?.id)continue;
   if(resolvedIds.has(original.id))continue;
   if(!checkedIds.has(original.id)){next.push(original);continue}

   const enriched=unresolvedById.get(original.id)||original;
   const retries=Math.max(0,Number(original.platformRetryCount||0))+1;
   // Gentle exponential backoff: cooldown * 1x, 2x, 4x, then max 7 days.
   const multiplier=Math.min(2**Math.min(retries-1,4),16);
   const waitMs=Math.min(Math.max(cooldownMs,60*60*1000)*multiplier,7*24*60*60*1000);
   next.push({
     ...original,
     ...enriched,
     platforms:[],
     platformRetryCount:retries,
     lastPlatformRetryAt:new Date().toISOString(),
     nextPlatformRetryAt:new Date(Date.now()+waitMs).toISOString(),
     platformMetadataState:"UNRESOLVED"
   });
 }

 await writeQ(next,`Ava-Valt: automatic quarantine repair — checked ${batch.stats?.attempted||candidates.length}, restored ${resolved.length}`);

 return {
   checked:batch.stats?.attempted||candidates.length,
   restored:resolved.length,
   remaining:next.length,
   eligible:eligible.length,
   deferred:Math.max(0,source.length-candidates.length),
   sourceCounts:batch.stats?.sourceCounts||{},
   platformCounts:batch.stats?.platformCounts||{PC:0,Android:0,iOS:0},
   timeMs:Date.now()-started,
   timeBudgetReached:!!batch.stats?.timeBudgetReached
 };
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
