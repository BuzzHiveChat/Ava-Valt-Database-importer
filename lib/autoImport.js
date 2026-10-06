
import {readDb,mergeAndSave} from "./db";
import {searchProviders} from "./providers";
import {getSettings,saveSettings} from "./settings";

export async function runAutoImport({force=false}={}){
 let settings=await getSettings();
 if(settings.running) return {skipped:true,reason:"An import is already running",settings};
 if(!settings.enabled&&!force) return {skipped:true,reason:"Auto Import is stopped",settings};

 const started=new Date().toISOString();
 settings=await saveSettings({...settings,running:true,stopRequested:false,lastError:null},"Ava-Valt importer started");
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
  const additions=[...merged.values()].slice(0,cap);

  // This is intentionally atomic-ish: a stop request does not interrupt this save.
  const saved=additions.length
    ? await mergeAndSave(additions,`Ava-Valt auto importer: +up to ${additions.length} new avatars`)
    : {added:0,total:initial.avatars.length,conflicts:0};

  // Re-read because the user may have pressed Stop while this run was active.
  const latestSettings=await getSettings();
  const shouldStop=!!latestSettings.stopRequested;
  const final=await saveSettings({
    ...latestSettings,
    enabled:shouldStop?false:latestSettings.enabled,
    stopRequested:false,
    running:false,
    lastRun:started,
    lastAdded:saved.added,
    lastFound:merged.size,
    lastConflicts:saved.conflicts,
    lastError:null,
    lastHealth:health
  },shouldStop?"Ava-Valt importer stopped after current run":"Record Ava-Valt importer run");
  return {skipped:false,newFound:merged.size,added:saved.added,total:saved.total,conflicts:saved.conflicts,stopped:shouldStop,settings:final};
 }catch(e){
  const latest=await getSettings().catch(()=>settings);
  await saveSettings({...latest,enabled:latest.stopRequested?false:latest.enabled,stopRequested:false,running:false,lastRun:started,lastAdded:0,lastError:e.message},"Record Ava-Valt importer error").catch(()=>{});
  throw e;
 }
}
