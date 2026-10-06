
import {authorized} from "../../../../lib/guard";
import {removeUnknownPlatformAvatars} from "../../../../lib/db";
export async function POST(req){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{
  const b=await req.json().catch(()=>({}));
  if(b.confirm!=="REMOVE_UNKNOWN")return Response.json({error:"Confirmation required"},{status:400});
  return Response.json({ok:true,...await removeUnknownPlatformAvatars()});
 }catch(e){return Response.json({error:e.message},{status:500})}
}
