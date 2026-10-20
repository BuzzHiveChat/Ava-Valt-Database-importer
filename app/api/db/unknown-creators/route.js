import {ownerAuthorized} from "../../../../lib/guard";
import {previewUnknownCreatorDeletion,deleteUnknownCreatorsFromPreview} from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;
const noStore = {"Cache-Control":"no-store"};

export async function GET(){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403,headers:noStore});
 try{return Response.json({ok:true,...await previewUnknownCreatorDeletion()},{headers:noStore});}
 catch(e){return Response.json({error:e.message},{status:500,headers:noStore});}
}

export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403,headers:noStore});
 // A destructive action must be initiated by the website itself.
 if(req.headers.get("origin")!==new URL(req.url).origin){
  return Response.json({error:"Cross-site deletion requests are not permitted"},{status:403,headers:noStore});
 }
 try{
  const body=await req.json().catch(()=>({}));
  if(body.confirm!=="DELETE UNKNOWN")return Response.json({error:"Deletion confirmation required"},{status:400,headers:noStore});
  const result=await deleteUnknownCreatorsFromPreview(body.sha);
  return Response.json({ok:true,...result},{headers:noStore});
 }catch(e){
  const status=e.code==="STALE_PREVIEW"?409:e.code==="INVALID_PREVIEW"?400:500;
  return Response.json({error:e.message},{status,headers:noStore});
 }
}
