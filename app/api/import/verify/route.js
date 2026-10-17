import {authorized} from "../../../../lib/guard";
import {enrichNewAvatarsPlatforms} from "../../../../lib/enrich";

// Preview platform lookups without saving anything to GitHub or to the DB.
// Bounded deliberately so a single staff click cannot flood community APIs.
export const maxDuration=40;
export async function POST(req){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{
  const body=await req.json();
  const input=Array.isArray(body.avatars)?body.avatars:[];
  const valid=[];const seen=new Set();
  for(const a of input){
   const id=String(a?.id||"");
   if(!/^avtr_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||seen.has(id))continue;
   seen.add(id);valid.push({id,name:String(a?.name||"").slice(0,200),author:String(a?.author||"").slice(0,200),platforms:Array.isArray(a.platforms)?a.platforms:[],metadataProvider:String(a?.metadataProvider||"").slice(0,80)});
   if(valid.length>=10)break;
  }
  if(!valid.length)return Response.json({error:"Select up to 10 valid avatar IDs first."},{status:400});
  const checked=await enrichNewAvatarsPlatforms(valid,{limit:10,concurrency:4,timeBudgetMs:16000});
  return Response.json({avatars:checked.avatars,stats:checked.stats});
 }catch(e){return Response.json({error:e?.message||"Platform lookup failed"},{status:500});}
}
