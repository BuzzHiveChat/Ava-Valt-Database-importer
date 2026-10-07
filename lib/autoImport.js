import {repairExistingPlatforms} from "./enrich";
import {enrichNewAvatarPlatform} from "./enrich";
import {quarantineUnknownFromLiveDb,repairQuarantinedPlatforms,quarantineRecords} from "./platformQuarantine";
import {hasKnownPlatform,normalizeAvatarPlatforms} from "./platforms";

import {readDb,mergeAndSave} from "./db";
import {searchProviders} from "./providers";
import {getSettings,saveSettings} from "./settings";

export async function runAutoImport({force=false}={}){

 let settings=await getSettings();
 if(settings.running) return {skipped:true,reason:"An import is already running",settings};
 if(!settings.enabled&&!force) return {skipped:true,reason:"Auto Import is stopped",settings};

 // V2.14: fast, bounded preflight. It runs only after we know this import is allowed.
 // A slow/unavailable metadata source must never hold the importer hostage.
 let preImportPlatformCheck={checked:0,fixed:0,remaining:null,error:null};
 settings=await saveSettings({...settings,running:true,currentStage:"CHECKING UNKNOWN PLATFORMS",stageUpdatedAt:new Date().toISOString(),lastError:null},"Ava-Valt importer preflight");
 try {
   const rr=await repairExistingPlatforms({
     limit:Number(process.env.PRE_IMPORT_PLATFORM_REPAIR_LIMIT||10),
     timeBudgetMs:Number(process.env.PRE_IMPORT_PLATFORM_REPAIR_BUDGET_MS||18000)
   });
   preImportPlatformCheck={checked:Number(rr?.checked||0),fixed:Number(rr?.fixed||0),remaining:rr?.remaining??null,error:null};
 } catch(e) { preImportPlatformCheck.error=e?.message||String(e); }
 let strictCleanup={moved:0,quarantined:0,error:null},quarantineRepair={checked:0,restored:0,remaining:0,error:null};
 if(settings.strictPlatformMode!==false){
   try{strictCleanup=await quarantineUnknownFromLiveDb()}catch(e){strictCleanup={moved:0,quarantined:0,error:e?.message||String(e)}}
   try{quarantineRepair=await repairQuarantinedPlatforms({
     limit:Number(process.env.QUARANTINE_PLATFORM_REPAIR_LIMIT||5),
     timeBudgetMs:Number(process.env.QUARANTINE_PLATFORM_REPAIR_BUDGET_MS||10000)
   })}catch(e){quarantineRepair={checked:0,restored:0,remaining:0,error:e?.message||String(e)}}
 }
 settings=await getSettings();
 if(settings.stopRequested){
   const final=await saveSettings({...settings,enabled:false,stopRequested:false,running:false,currentStage:"STOPPED"},"Ava-Valt importer stopped during preflight");
   return {skipped:true,reason:"Stopped during platform preflight",preImportPlatformCheck,settings:final};
 }

 const started=new Date().toISOString();
 settings=await saveSettings({...settings,running:true,stopRequested:false,currentStage:"IMPORTING NEW AVATARS",stageUpdatedAt:new Date().toISOString(),lastError:null},"Ava-Valt importer started");
 try{
  const initial=await readDb(), known=new Set(initial.avatars.map(a=>a.id));
  const cap=Math.min(Math.max(Number(settings.maxAddPerRun||300),1),1000);
  const chosen=Object.entries(settings.providerEnabled||{}).filter(([,v])=>v).map(([k])=>k);
  const merged=new Map(), health=[];
  for(const term of settings.searchTerms||["avatar"]){
   const r=await searchProviders({query:term,mode:"search",limit:250,providers:chosen});
   health.push(...r.health.map(h=>({...h,term})));
   for(const a of r.avatars)if(!known.has(a.id)&&!merged.has(a.id))merged.set(a.id,a);
   if(merged.size>=cap)break;
  }
  const discovered=[...merged.values()].slice(0,cap).map(normalizeAvatarPlatforms);
  const liveAdditions=[],unresolved=[];
  for(const a of discovered){
    if(hasKnownPlatform(a))liveAdditions.push(a);else unresolved.push(a);
  }
  // Strict mode never puts an Unknown-platform avatar into avatar-index.json.
  // Preserve it in quarantine instead, where later runs can retry VRChat/providers.
  if(settings.strictPlatformMode!==false&&unresolved.length){
    await quarantineRecords(unresolved,{reason:"new-import-platform-unresolved"});
  }
  // If strict mode is deliberately disabled, keep old behaviour.
  if(settings.strictPlatformMode===false)liveAdditions.push(...unresolved);

  const saved=liveAdditions.length
    ? await mergeAndSave(liveAdditions,`Ava-Valt auto importer: +up to ${liveAdditions.length} platform-verified avatars`)
    : {added:0,total:(await readDb()).avatars.length,conflicts:0};

  // Re-read because the user may have pressed Stop while this run was active.
  const latestSettings=await getSettings();
  const shouldStop=!!latestSettings.stopRequested;
  // A completed scheduled run is NOT the same thing as disabling Auto Import.
  // Scheduled runs stay armed until the user explicitly presses Stop.
  const keepEnabled=force ? !!latestSettings.enabled : !shouldStop;
  const final=await saveSettings({
    ...latestSettings,
    enabled:shouldStop?false:keepEnabled,
    stopRequested:false,
    running:false,
    lastRun:started,
    lastAdded:saved.added,
    lastFound:merged.size,
    lastConflicts:saved.conflicts,
    lastError:null,
    lastHealth:health,
    currentStage:shouldStop?"STOPPED":"WAITING FOR NEXT RUN",stageUpdatedAt:new Date().toISOString()
  },shouldStop?"Ava-Valt importer stopped after current run":"Record Ava-Valt importer run");
  return {skipped:false,preImportPlatformCheck,strictCleanup,quarantineRepair,newFound:merged.size,platformVerifiedFound:liveAdditions.length,quarantinedNew:unresolved.length,added:saved.added,total:saved.total,conflicts:saved.conflicts,stopped:shouldStop,settings:final};
 }catch(e){
  const latest=await getSettings().catch(()=>settings);
  await saveSettings({...latest,enabled:latest.stopRequested?false:(force?latest.enabled:true),stopRequested:false,running:false,lastRun:started,lastAdded:0,lastError:e.message,currentStage:"ERROR",stageUpdatedAt:new Date().toISOString()},"Record Ava-Valt importer error").catch(()=>{});
  throw e;
 }
}
