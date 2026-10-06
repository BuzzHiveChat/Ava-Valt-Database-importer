
import {authorized} from "../../../../lib/guard";
import {repairExistingPlatforms} from "../../../../lib/enrich";
export const maxDuration=300;
export async function POST(){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 const started=Date.now(); let fixed=0,checked=0,remaining=null,batches=0;
 try{
  // One click attempts as many 50-avatar batches as safely fit in this invocation.
  while(Date.now()-started<240000 && batches<28){
   const r=await repairExistingPlatforms({limit:50});
   fixed+=r.fixed;checked+=r.checked;remaining=r.remaining;batches++;
   if(remaining<=0||r.checked===0)break;
   // If a whole batch yielded nothing, stop this invocation so we don't repeatedly
   // hit the same unresolvable records.
   if(r.fixed===0)break;
  }
  return Response.json({ok:true,fixed,checked,remaining,batches,complete:remaining===0,
    continueNeeded:remaining>0,
    note:remaining>0&&fixed===0?"Some remaining avatars could not be identified by the enabled providers.":""
  });
 }catch(e){return Response.json({error:e.message,fixed,checked,remaining,batches},{status:500})}
}
