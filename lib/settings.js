
import {getRepoFile, putRepoFile} from "./githubFile";
import {providerNames} from "./providers";

export const DEFAULT_SETTINGS={
 enabled:false, stopRequested:false, running:false,
 maxAddPerRun:300,
 strictPlatformMode:true,
 autoQuarantineRepair:true,
 quarantineRepairBatch:12,
 quarantineRetryCooldownHours:12,
 searchTerms:["avatar","furry","cute","fox","dog","cat","robot","dragon"],
 providerEnabled:{avtrDB:false,AvtrZip:true,CuteDB:true,PAW:true,VRCWB:true,NSVR:true,AviSeek:true},
 lastRun:null,lastAdded:0,lastFound:0,lastError:null,lastHealth:[],lastBreakdown:null,searchTermCursor:0,
 lastQuarantineRepair:null,lastQuarantineChecked:0,lastQuarantineRestored:0,lastQuarantineMovedToReview:0,lastQuarantineRemaining:null,lastQuarantineError:null,
 currentStage:"STOPPED", stageUpdatedAt:null,
 updatedAt:null
};
// Also discard obsolete names from persisted GitHub settings after deployment.
// Never query disabled avtrDB: it is explicitly off in this installation.
function cleanProviders(saved={}){
 const allowed=new Set(providerNames());
 return Object.fromEntries(Object.entries({...DEFAULT_SETTINGS.providerEnabled,...saved})
  .filter(([name])=>allowed.has(name))
  .map(([name,on])=>[name,name==="avtrDB"?false:!!on]));
}
function stripLegacyHistory(saved={}){
 const forbidden=/kitsunedb|vrcdb/i;
 const lastHealth=(Array.isArray(saved.lastHealth)?saved.lastHealth:[]).filter(h=>!forbidden.test(String(h?.provider||"")));
 const b=saved.lastBreakdown;
 const counts=b?.sourceCounts?Object.fromEntries(Object.entries(b.sourceCounts).filter(([k])=>!forbidden.test(k))):null;
 return {...saved,lastHealth,lastBreakdown:b&&counts?{...b,sourceCounts:counts}:b};
}
export async function getSettings(){
 try{
  const f=await getRepoFile(process.env.AUTO_IMPORT_SETTINGS_PATH||"auto-import-settings.json");
  const saved=stripLegacyHistory(JSON.parse(f.text||"{}"));
  return {...DEFAULT_SETTINGS,...saved,providerEnabled:cleanProviders(saved.providerEnabled||{})};
 }catch{return {...DEFAULT_SETTINGS,providerEnabled:cleanProviders()}}
}
export async function saveSettings(s,message="Update Ava-Valt importer settings"){
 const next={...DEFAULT_SETTINGS,...stripLegacyHistory(s),providerEnabled:cleanProviders(s.providerEnabled||{}),updatedAt:new Date().toISOString()};
 await putRepoFile(process.env.AUTO_IMPORT_SETTINGS_PATH||"auto-import-settings.json",
   JSON.stringify(next,null,2)+"\n",message);
 return next;
}
