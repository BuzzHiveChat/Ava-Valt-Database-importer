
import {authorized} from "../../../lib/guard";
import {getSettings,saveSettings} from "../../../lib/settings";
export async function GET(){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 return Response.json(await getSettings());
}
export async function POST(req){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 const old=await getSettings(), body=await req.json();
 const clean={...old};
 if(typeof body.enabled==="boolean")clean.enabled=body.enabled;
 if(Number.isFinite(Number(body.maxAddPerRun)))clean.maxAddPerRun=Math.min(Math.max(Number(body.maxAddPerRun),1),1000);
 if(Array.isArray(body.searchTerms))clean.searchTerms=body.searchTerms.map(String).map(x=>x.trim()).filter(Boolean).slice(0,50);
 if(body.providerEnabled&&typeof body.providerEnabled==="object")clean.providerEnabled={...old.providerEnabled,...body.providerEnabled};
 return Response.json(await saveSettings(clean,"Update Ava-Valt importer controls"));
}
