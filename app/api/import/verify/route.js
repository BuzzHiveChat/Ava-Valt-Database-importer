import {requireRole} from '../../../../lib/guard';
import {safeVerificationConfig,verifyAviSeekBatch,SafeVerifyError} from '../../../../lib/safePlatformVerification.mjs';

export const maxDuration = 30;
export async function GET(){
 const access = await requireRole('owner');
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 return Response.json(safeVerificationConfig());
}
export async function POST(req){
 const access = await requireRole('owner');
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 try {
  const body = await req.json();
  const data = await verifyAviSeekBatch(body?.avatars);
  return Response.json(data, {headers:{'Cache-Control':'no-store'}});
 } catch(err){
  const status = err instanceof SafeVerifyError ? err.status : 500;
  const headers = {'Cache-Control':'no-store'};
  if(err?.retryAfter)headers['Retry-After']=String(err.retryAfter);
  return Response.json({error:err?.message||'Platform check stopped.'},{status,headers});
 }
}
