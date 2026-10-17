import {ownerAuthorized} from "../../../../lib/guard";
import {lookupAviSeekPlatform} from "../../../../lib/aviseek";
export const dynamic="force-dynamic";
export const maxDuration=30;
export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{
  const {id,name=""}=await req.json();
  if(!/^avtr_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(id||"")))return Response.json({error:"Enter a valid avtr_ ID"},{status:400});
  return Response.json({ok:true,...await lookupAviSeekPlatform({id,name})},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:e.message},{status:500});}
}
