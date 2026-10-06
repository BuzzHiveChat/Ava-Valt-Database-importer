
import {runAutoImport} from "../../../../lib/autoImport";
export const maxDuration=60;
export async function GET(req){
 if(!process.env.CRON_SECRET || req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)
   return Response.json({error:"Unauthorized"},{status:401});
 try{return Response.json({ok:true,...await runAutoImport()})}
 catch(e){return Response.json({error:e.message},{status:500})}
}
