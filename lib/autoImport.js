
import {readDb,saveDb} from "./db";
import {searchProviders} from "./providers";
import {getSettings,saveSettings} from "./settings";

export async function runAutoImport({force=false}={}){
 const settings=await getSettings();
 if(!settings.enabled&&!force) return {skipped:true,reason:"Auto Import is stopped",settings};
 const started=new Date().toISOString();
 try{
  const db=await readDb(), known=new Set(db.avatars.map(a=>a.id));
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
  if(additions.length){db.avatars.push(...additions);await saveDb(db,`Ava-Valt auto importer: +${additions.length} new avatars`)}
  const next=await saveSettings({...settings,lastRun:started,lastAdded:additions.length,lastFound:merged.size,lastError:null,lastHealth:health},"Record Ava-Valt importer run");
  return {skipped:false,newFound:merged.size,added:additions.length,total:db.avatars.length,settings:next};
 }catch(e){
  await saveSettings({...settings,lastRun:started,lastAdded:0,lastError:e.message},"Record Ava-Valt importer error").catch(()=>{});
  throw e;
 }
}
