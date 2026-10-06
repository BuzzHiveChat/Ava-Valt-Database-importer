import {authorized} from "../../../../lib/guard";
import {vrchatStatus} from "../../../../lib/vrchat";
export const dynamic="force-dynamic"; export const revalidate=0;
export async function GET(){if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});return Response.json(await vrchatStatus(),{headers:{"Cache-Control":"no-store"}})}
