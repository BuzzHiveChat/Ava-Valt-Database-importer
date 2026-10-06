
import {readDb,saveDb} from "./db";
import {searchProviders} from "./providers";

const DEFAULT_TERMS=["avatar","fox","cat","dog","furry","cute","robot","dragon"];
export async function runAutoImport(){
 const db=await readDb();
 const known=new Set(db.avatars.map(a=>a.id));
 const terms=(process.env.AUTO_IMPORT_TERMS||DEFAULT_TERMS.join(",")).split(",").map(x=>x.trim()).filter(Boolean);
 const cap=Math.min(Math.max(Number(process.env.AUTO_IMPORT_MAX_ADD||"300"),1),1000);
 const merged=new Map(), health=[];
 for(const term of terms){
   const r=await searchProviders({query:term,mode:"search",limit:250});
   for(const h of r.health) health.push({...h,term});
   for(const a of r.avatars) if(!known.has(a.id)&&!merged.has(a.id)) merged.set(a.id,a);
   if(merged.size>=cap) break;
 }
 const additions=[...merged.values()].slice(0,cap);
 if(additions.length){
   db.avatars.push(...additions);
   await saveDb(db,`Ava-Valt auto importer: +${additions.length} new avatars`);
 }
 return {scannedTerms:terms,newFound:merged.size,added:additions.length,total:db.avatars.length,health};
}
