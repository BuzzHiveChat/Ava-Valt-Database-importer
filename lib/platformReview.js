import {getRepoFile,putRepoFile} from "./githubFile";
import {mergeAndSave} from "./db";
import {hasKnownPlatform} from "./platforms";
import {readOptOuts,filterExcluded,detectOptOutMarkers,stageMarkerRequests} from "./optOut";

const PATH=()=>process.env.PLATFORM_NEEDS_REVIEW_PATH||"platform-needs-review.json";
const key=id=>String(id||"").trim().toLowerCase();
const allowed=new Set(["PC","Android","iOS"]);

export async function readPlatformReview(){
 try{
  const f=await getRepoFile(PATH());
  const json=JSON.parse(f.text||"{}");
  const doc=Array.isArray(json)?{avatars:json}:json;
  return {version:1,updated:doc.updated||null,avatars:Array.isArray(doc.avatars)?doc.avatars:[],dismissedIds:Array.isArray(doc.dismissedIds)?doc.dismissedIds:[],autoReview:doc.autoReview||{}};
 }catch(e){
  if(e.message==="NOT_FOUND")return {version:1,updated:null,avatars:[],dismissedIds:[],autoReview:{}};
  throw e;
 }
}
async function writeReview(doc,message){
 const next={version:1,updated:new Date().toISOString(),avatars:doc.avatars||[],dismissedIds:doc.dismissedIds||[],autoReview:doc.autoReview||{}};
 await putRepoFile(PATH(),JSON.stringify(next,null,2)+"\n",message);
 return next;
}

// Preserve the failed-lookup avatars BEFORE the quarantine list drops them.
// This is deliberately a separate queue: nothing here is put into the live DB.
export async function moveToPlatformReview(avatars){
 const incoming=filterExcluded((avatars||[]).filter(a=>a?.id&&!hasKnownPlatform(a)),await readOptOuts());
 if(!incoming.length)return {moved:0,total:(await readPlatformReview()).avatars.length,ids:[]};
 const doc=await readPlatformReview();
 const dismissed=new Set(doc.dismissedIds.map(key));
 const records=new Map(doc.avatars.filter(a=>a?.id).map(a=>[key(a.id),a]));
 let moved=0;
 const ids=[];
 for(const a of incoming){
  const k=key(a.id);
  if(dismissed.has(k))continue;
  if(!records.has(k))moved++;
  const previous=records.get(k)||{};
  records.set(k,{...a,...previous,platforms:[],platformMetadataState:"NEEDS_OWNER_REVIEW",reviewReason:"platform-unresolved-after-repair",movedToReviewAt:previous.movedToReviewAt||new Date().toISOString()});
  ids.push(k);
 }
 if(ids.length){
  await writeReview({...doc,avatars:[...records.values()]},`Ava-Valt: move ${ids.length} unresolved platform avatar(s) to owner review`);
 }
 return {moved,total:records.size,ids};
}

export async function listPlatformReview({search="",page=1,pageSize=50}={}){
 const doc=await readPlatformReview();
 const term=String(search||"").trim().toLowerCase();
 let rows=doc.avatars.filter(a=>a?.id);
 if(term)rows=rows.filter(a=>[a.id,a.name,a.author,a.authorName,a.authorId].some(v=>String(v||"").toLowerCase().includes(term)));
 rows.sort((a,b)=>String(a.movedToReviewAt||"").localeCompare(String(b.movedToReviewAt||"")));
 const size=Math.max(1,Math.min(Number(pageSize)||50,100));
 const current=Math.max(1,Number(page)||1);
 return {total:rows.length,page:current,pageSize:size,pages:Math.max(1,Math.ceil(rows.length/size)),avatars:rows.slice((current-1)*size,current*size),autoReview:{...doc.autoReview,enabled:process.env.PLATFORM_REVIEW_AUTO_ENABLED==="true"}};
}

export async function ownerVerifyReviewedAvatar(id,platforms){
 const chosen=[...new Set((Array.isArray(platforms)?platforms:[]).filter(p=>allowed.has(p)))];
 if(!key(id)||!chosen.length)throw new Error("Choose at least one verified platform.");
 const doc=await readPlatformReview();
 const original=doc.avatars.find(a=>key(a?.id)===key(id));
 if(!original)throw new Error("Avatar is no longer in Needs Review. Refresh the page.");
 if(!filterExcluded([original],await readOptOuts()).length)throw new Error("Avatar is excluded by creator opt-out policy.");
 const markers=detectOptOutMarkers(original);
 if(markers.avatar||markers.creator){await stageMarkerRequests([original]);throw new Error("Avatar has an opt-out marker. Review this in Avatar Opt-Outs before adding it.");}
 const {
  quarantineReason,quarantinedAt,lastPlatformRetryAt,nextPlatformRetryAt,
  platformRetryCount,reviewReason,movedToReviewAt,autoReviewLease,autoReviewNextTryAt,autoReviewLastCheckedAt,autoReviewResult,autoReviewSuggestion,autoReviewProvider,autoReviewEvidence,autoReviewUrl,...clean
 }=original;
 // The Owner must explicitly confirm that these platform labels were checked.
 await mergeAndSave([{
  ...clean,platforms:chosen,metadataProvider:"Owner verified",metadataCheckedAt:new Date().toISOString(),
  platformMetadataCheckedAt:new Date().toISOString(),platformMetadataState:"OWNER_VERIFIED"
 }],`Ava-Valt: owner verified reviewed avatar ${original.id}`);
 const fresh=await readPlatformReview();
 const rest=fresh.avatars.filter(a=>key(a?.id)!==key(id));
 if(rest.length!==fresh.avatars.length)await writeReview({...fresh,avatars:rest},`Ava-Valt: restore reviewed ${id} to live database`);
 return {ok:true,id:original.id,platforms:chosen,remaining:rest.length};
}

// Dismissal is persistent for unknown-platform imports, but DOES NOT delete anything
// from the live DB. It can be undone in the future by an Owner if desired.
export async function ownerDismissReviewedAvatar(id){
 if(!key(id))throw new Error("An avatar ID is required.");
 const doc=await readPlatformReview();
 const existing=doc.avatars.find(a=>key(a?.id)===key(id));
 if(!existing)throw new Error("Avatar is no longer in Needs Review. Refresh the page.");
 const remaining=doc.avatars.filter(a=>key(a?.id)!==key(id));
 const dismissedIds=[...new Set([...doc.dismissedIds.map(key),key(id)])];
 await writeReview({...doc,avatars:remaining,dismissedIds},`Ava-Valt: owner dismissed unresolved avatar ${id}`);
 return {ok:true,id:existing.id,remaining:remaining.length};
}
