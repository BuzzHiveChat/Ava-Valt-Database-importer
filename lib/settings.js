
import {getRepoFile, putRepoFile} from "./githubFile";

export const DEFAULT_SETTINGS={
 enabled:false, stopRequested:false, running:false,
 maxAddPerRun:300,
 strictPlatformMode:true,
 searchTerms:["avatar","furry","cute","fox","dog","cat","robot","dragon"],
 providerEnabled:{avtrDB:false,KitsuneDB:true,PAW:true,VRCDB:true,VRCWB:true,NSVR:true},
 lastRun:null,lastAdded:0,lastFound:0,lastError:null,lastHealth:[],lastBreakdown:null,searchTermCursor:0, currentStage:"STOPPED", stageUpdatedAt:null,
 updatedAt:null
};
export async function getSettings(){
 try{
  const f=await getRepoFile(process.env.AUTO_IMPORT_SETTINGS_PATH||"auto-import-settings.json");
  return {...DEFAULT_SETTINGS,...JSON.parse(f.text||"{}")};
 }catch{return {...DEFAULT_SETTINGS}}
}
export async function saveSettings(s,message="Update Ava-Valt importer settings"){
 const next={...DEFAULT_SETTINGS,...s,updatedAt:new Date().toISOString()};
 await putRepoFile(process.env.AUTO_IMPORT_SETTINGS_PATH||"auto-import-settings.json",
   JSON.stringify(next,null,2)+"\n",message);
 return next;
}
