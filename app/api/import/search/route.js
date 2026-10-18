import {authorized} from "../../../../lib/guard";
import {normalizeSearchRequest,guardedProviderSearch} from "../../../../lib/safeSearchTraffic.mjs";
import {getSettings} from "../../../../lib/settings";

export async function POST(req){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{
  const body=await req.json();
  const settings=await getSettings();
  const enabled=Object.keys(settings.providerEnabled||{}).filter(name=>settings.providerEnabled[name]);
  const requested=Array.isArray(body.providers)?body.providers:enabled;
  const allowed=requested.filter(name=>enabled.includes(name));
  if(!allowed.length)return Response.json({avatars:[],health:[],notes:["No enabled IMPORT providers selected."]});
  const input=normalizeSearchRequest({...body,providers:allowed},enabled);
  const response=await guardedProviderSearch(input);
  return Response.json(response,{headers:{'Cache-Control':'no-store'}});
 }catch(e){
   const code=e?.status||500;
   return Response.json({error:e.message||'Search unavailable. Please retry later.',retryAfter:e.retryAfter||null},{status:code,headers:{'Cache-Control':'no-store',...(e.retryAfter?{'Retry-After':String(e.retryAfter)}:{})}});
 }
}
