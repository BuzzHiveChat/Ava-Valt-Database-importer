import {authorized} from "../../../../lib/guard";
import {readDb,mergeAndSave} from "../../../../lib/db";
import {readOptOuts,filterExcluded,stageMarkerRequests} from "../../../../lib/optOut";
import {reportCommittedImport} from "../../../../website-integration/report-import.mjs";

const ID=/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORMS=["PC","Android","iOS"];
export const maxDuration=60;
export async function POST(req){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{
  const {avatars=[]}=await req.json();
  if(!Array.isArray(avatars)||!avatars.length||avatars.length>50)return Response.json({error:"Submit 1–50 reviewed avatars."},{status:400});
  const seen=new Set();
  const clean=[];
  for(const entry of avatars){
   const id=String(entry?.id||"").toLowerCase();
   const name=String(entry?.name||"").trim();
   const platforms=entry?.platforms;
   if(!ID.test(id)||seen.has(id)||!name||name.length>160||name.toLowerCase()==="unknown avatar"||!Array.isArray(platforms)||!platforms.length||platforms.some(p=>!PLATFORMS.includes(p))){
    return Response.json({error:"Each avatar requires a unique valid ID, a real name, and at least one manually selected platform."},{status:400});
   }
   seen.add(id);
   clean.push({id,name,author:String(entry.author||"Unknown").slice(0,160),authorId:String(entry.authorId||"").slice(0,100),description:String(entry.description||"").slice(0,2000),imageUrl:String(entry.imageUrl||"").slice(0,1024),thumbnailImageUrl:String(entry.thumbnailImageUrl||"").slice(0,1024),releaseStatus:"public",searchable:true,platforms:[...new Set(platforms)],performancePc:"",performanceAndroid:"",performanceIos:"",tags:"",createdAt:"",updatedAt:"",version:0,metadataProvider:"Quick Import (manual platform)"});
  }
  const existing=new Set((await readDb()).avatars.filter(a=>a?.id).map(a=>a.id.toLowerCase()));
  const newOnly=clean.filter(a=>!existing.has(a.id));
  const eligible=filterExcluded(newOnly,await readOptOuts());
  const markerReview=await stageMarkerRequests(eligible);
  const allowed=markerReview.allow;
  const result=allowed.length?await mergeAndSave(allowed,`Ava-Valt Quick Import: +${allowed.length} manually reviewed avatar(s)`):{added:0};
  // GitHub's successful PUT response is authoritative for the committed IDs.
  // A subsequent raw-file/contents read can temporarily return stale data.
  const committedIds=(result.committedIds||[]).map(id=>String(id).toLowerCase());
  const committedSet=new Set(committedIds);
  let readback=null;
  let verificationWarning=null;
  try { readback=await readDb(); }
  catch(e){verificationWarning=`Post-save read unavailable: ${e.message}`;}
  const persisted=new Set((readback?.avatars||[]).filter(a=>a?.id).map(a=>String(a.id).toLowerCase()));
  const readbackVerifiedIds=allowed.filter(a=>persisted.has(a.id)).map(a=>a.id);
  const existingIds=clean.filter(a=>existing.has(a.id)).map(a=>a.id);
  const heldIds=newOnly.filter(a=>!allowed.some(x=>x.id===a.id)).map(a=>a.id);
  // An ID is confirmed by either the successful GitHub commit or a fresh read.
  // Never claim success for IDs missing from both.
  const confirmedIds=allowed.filter(a=>committedSet.has(a.id)||persisted.has(a.id)).map(a=>a.id);
  const missingIds=allowed.filter(a=>!committedSet.has(a.id)&&!persisted.has(a.id)).map(a=>a.id);
  if(committedIds.length&&readbackVerifiedIds.length<committedIds.length){
   verificationWarning=verificationWarning||"GitHub accepted the commit, but the immediate database read has not caught up yet.";
  }
  if(result.added>0)await reportCommittedImport("manual").catch(e=>console.warn("Import notification failed:",e.message));
  return Response.json({
   added:result.added, verifiedIds:confirmedIds, readbackVerifiedIds, committedIds, commitSha:result.commitSha||null,
   missingIds, existingIds, heldIds, verificationWarning,
   duplicates:existingIds.length,excludedOrHeld:heldIds.length,total:readback?.avatars?.length??result.total??0,
   destination:`${process.env.GITHUB_OWNER||"BuzzHiveChat"}/${process.env.GITHUB_REPO||"Ava-Valt-Database"}`,
   branch:process.env.GITHUB_BRANCH||"main",path:process.env.GITHUB_DATABASE_PATH||"avatar-index.json",
   verified:missingIds.length===0 && !verificationWarning,
   commitConfirmed:committedIds.length>0
  },{status:missingIds.length?502:200});
 }catch(e){console.error("[quick-import/save] GitHub save failed:",e);return Response.json({error:e?.message||"Unexpected server failure",stage:"GitHub save or verification"},{status:500});}
}
