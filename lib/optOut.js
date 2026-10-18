// Server-only privacy policy. Explicit avatar-description markers auto-exclude
// individual avatar IDs; only Owner-verified evidence can exclude creators.
import {getRepoFile,putRepoFile} from "./githubFile";
import {readDb,removeIdsAndSave} from "./db";
import {detectOptOutMarkers,isAutoAvatarMarker} from "./optOutMarkers.mjs";

const PATH=()=>process.env.AVATAR_OPTOUT_PATH||"avatar-opt-outs.json";
const idKey=v=>String(v||"").trim().toLowerCase();
const AVATAR=/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREATOR=/^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bounded=(v,n=240)=>String(v||"").trim().slice(0,n);
const empty=()=>({version:1,updated:null,excludedAvatars:[],excludedCreators:[],pending:[],dismissedRequests:[]});
export const avatarKey=idKey;
export function creatorIdOf(a){return idKey(a?.authorId||a?.creatorId||a?.author?.id||a?.creator?.id)}
export function policySets(doc){return {avatars:new Set((doc?.excludedAvatars||[]).map(a=>idKey(a.id))),creators:new Set((doc?.excludedCreators||[]).map(a=>idKey(a.id)))};}
export function isExcluded(a,doc){if(!a?.id)return false;const {avatars,creators}=policySets(doc);return avatars.has(idKey(a.id))||creators.has(creatorIdOf(a));}
export function filterExcluded(avatars,doc){const {avatars:ids,creators}=policySets(doc);return (avatars||[]).filter(a=>a?.id&&!ids.has(idKey(a.id))&&!creators.has(creatorIdOf(a)));}
async function readWithSha(){
 try{const file=await getRepoFile(PATH());const j=JSON.parse(file.text||"{}");return {sha:file.sha,doc:{...empty(),...j,excludedAvatars:Array.isArray(j.excludedAvatars)?j.excludedAvatars:[],excludedCreators:Array.isArray(j.excludedCreators)?j.excludedCreators:[],pending:Array.isArray(j.pending)?j.pending:[],dismissedRequests:Array.isArray(j.dismissedRequests)?j.dismissedRequests:[]}};}
 catch(e){if(e.message==="NOT_FOUND")return {sha:null,doc:empty()};throw e}
}
export async function readOptOuts(){return (await readWithSha()).doc;}
async function save(doc,message,expectedSha){const out={...doc,version:1,updated:new Date().toISOString()};await putRepoFile(PATH(),JSON.stringify(out,null,2)+"\n",message,expectedSha===undefined?{}:{expectedSha});return out;}
export {detectOptOutMarkers} from "./optOutMarkers.mjs";
const conflict=e=>/GitHub write HTTP (409|422):/.test(String(e?.message||""));
const autoEntry=(id,marker,source)=>({id,marker,reason:"Avatar description opt-out marker (automatic)",verifiedBy:"Automatic — not owner verified",proof:"provider-avatar-description-unverified",source:bounded(source||"provider",80),autoExcludedAt:new Date().toISOString()});
const requestKey=r=>`${r.type}:${idKey(r.id)}:${r.marker}`;
// Existing pending *avatar-description* reports are upgraded when an Owner
// explicitly runs maintenance. Creator-wide claims remain in the review queue.
export async function promotePendingAvatarMarkers(){
 for(let attempt=0;attempt<4;attempt++){
  const {doc,sha}=await readWithSha();
  const excluded=new Set(doc.excludedAvatars.map(a=>idKey(a.id)));
  const dismissed=new Set(doc.dismissedRequests.map(requestKey));
  const promote=[],rest=[];
  for(const row of doc.pending){
   const id=idKey(row.id),mark=String(row.marker||"").toLowerCase();
   if(row.type!=="avatar"||!AVATAR.test(id)||!isAutoAvatarMarker(mark)||dismissed.has(`avatar:${id}:${mark}`)||dismissed.has(`avatar:${id}:*`)){
    rest.push(row);continue;
   }
   if(!excluded.has(id)){promote.push(autoEntry(id,mark,row.source));excluded.add(id);}
  }
  if(rest.length===doc.pending.length)return {autoExcluded:0,pending:doc.pending.length};
  try{
   await save({...doc,pending:rest,excludedAvatars:[...doc.excludedAvatars,...promote]},`Ava-Valt: auto-exclude ${promote.length} pending avatar markers`,sha);
   let cleanup=null,cleanupError=null;
   if(promote.length){try{cleanup=await applyOptOutCleanup()}catch(e){cleanupError=e.message}}
   return {autoExcluded:promote.length,pending:rest.length,cleanup,cleanupError};
  }catch(e){if(!conflict(e)||attempt===3)throw e}
 }
}
export async function stageMarkerRequests(avatars){
 const source=(avatars||[]).filter(a=>AVATAR.test(String(a?.id||"")));
 if(!source.length)return {held:0,queued:0,autoExcluded:0,allow:[]};
 for(let attempt=0;attempt<4;attempt++){
  const {doc,sha}=await readWithSha();
  const excluded=new Set(doc.excludedAvatars.map(x=>idKey(x.id)));
  const existing=new Set(doc.pending.map(requestKey));
  const dismissed=new Set(doc.dismissedRequests.map(requestKey));
  const pendingAvatarIds=new Set(doc.pending.filter(x=>x.type==="avatar").map(x=>idKey(x.id)));
  const pendingCreatorIds=new Set(doc.pending.filter(x=>x.type==="creator").map(x=>idKey(x.id)));
  const rows=[],automated=[],held=new Set();
  for(const a of source){
   const id=idKey(a.id),match=detectOptOutMarkers(a);
   // A provider-reported marker is enough to exclude this single avatar, not
   // a creator's entire catalog. Unknown author IDs are never inferred.
   if(match.avatar&&isAutoAvatarMarker(match.avatar)){
    const k=`avatar:${id}:${match.avatar}`;
    if(!dismissed.has(k)&&!dismissed.has(`avatar:${id}:*`)){
     held.add(id);
     if(!excluded.has(id)){
      automated.push(autoEntry(id,match.avatar,a.metadataProvider));excluded.add(id);
     }
    }
   }
   if(match.creator){
    const creator=creatorIdOf(a),known=CREATOR.test(creator);
    const m={id:known?creator:id,type:known?"creator":"avatar",marker:"permanent_unlist"};
    const k=requestKey(m);
    if(!dismissed.has(k)){
     held.add(id);
     if(!existing.has(k)){
      rows.push({...m,avatarId:id,creatorId:creator,name:bounded(a.name,140),source:bounded(a.metadataProvider||"provider"),reportedAt:new Date().toISOString()});existing.add(k);
     }
    }
   }
   if(excluded.has(id)||pendingAvatarIds.has(id)||pendingCreatorIds.has(creatorIdOf(a)))held.add(id);
  }
  if(rows.length&&doc.pending.length+rows.length>2000)throw new Error("Opt-out review queue is full; Owner review required before importing further marker-bearing avatars.");
  if(automated.length||rows.length){
   try{await save({...doc,excludedAvatars:[...doc.excludedAvatars,...automated],pending:[...doc.pending,...rows]},`Ava-Valt: automatically exclude ${automated.length} avatar(s), stage ${rows.length} creator review(s)`,sha)}
   catch(e){if(conflict(e)&&attempt<3)continue;throw e}
  }
  let cleanup=null,cleanupError=null;
  if(automated.length){try{cleanup=await applyOptOutCleanup()}catch(e){cleanupError=e.message}}
  return {held:held.size,queued:rows.length,autoExcluded:automated.length,allow:source.filter(a=>!held.has(idKey(a.id))),cleanup,cleanupError};
 }
 throw new Error("Opt-out policy was edited concurrently. Please retry.");
}
// Do not let a creator-wide exclusion be claimed by a display-name match.
export async function approveExclusion({type,id,marker="owner-request",reason="",proof="owner-verified"}={}){
 const kind=type==="creator"?"creator":"avatar",value=idKey(id);
 if(!(kind==="creator"?CREATOR:AVATAR).test(value))throw new Error(`Valid ${kind} ID required.`);
 if(!["owner-verified","official-profile-marker","avatar-description-marker","creator-request-verified"].includes(proof))throw new Error("Choose how ownership or the marker was verified.");
 const field=kind==="creator"?"excludedCreators":"excludedAvatars";
 const entry={id:value,marker:bounded(marker,40),reason:bounded(reason,240),verifiedBy:"Owner",proof,approvedAt:new Date().toISOString()};
 for(let attempt=0;attempt<4;attempt++){
  const {doc,sha}=await readWithSha();
  const rows=[...doc[field].filter(x=>idKey(x.id)!==value),entry];
  const pending=doc.pending.filter(x=>!(x.type===kind&&idKey(x.id)===value));
  try{await save({...doc,[field]:rows,pending},`Ava-Valt: approved ${kind} opt-out ${value}`,sha)}
  catch(e){if(conflict(e)&&attempt<3)continue;throw e}
  // Policy is saved before cleanup. A later cleanup error is safely retryable.
  const cleanup=await applyOptOutCleanup();
  return {ok:true,entry,cleanup};
 }
}
export async function dismissRequest({type,id,marker}={}){
 for(let attempt=0;attempt<4;attempt++){
  const {doc,sha}=await readWithSha();
  const rest=doc.pending.filter(x=>!(x.type===type&&idKey(x.id)===idKey(id)&&x.marker===marker));
  if(rest.length===doc.pending.length)throw new Error("Request not found; refresh the page.");
  const dismissedRequests=[...doc.dismissedRequests.filter(x=>!(x.type===type&&idKey(x.id)===idKey(id)&&x.marker===marker)),{type,id:idKey(id),marker,reviewedAt:new Date().toISOString()}];
  try{await save({...doc,pending:rest,dismissedRequests},`Ava-Valt: reviewed opt-out marker ${bounded(id,70)}`,sha)}
  catch(e){if(conflict(e)&&attempt<3)continue;throw e}
  return {ok:true};
 }
}
const kindOfAuto=a=>a?.proof==="provider-avatar-description-unverified";
export async function revokeExclusion({type,id}={}){
 for(let attempt=0;attempt<4;attempt++){
  const {doc,sha}=await readWithSha();const field=type==="creator"?"excludedCreators":"excludedAvatars";
  const next=doc[field].filter(x=>idKey(x.id)!==idKey(id));
  if(next.length===doc[field].length)throw new Error("Exclusion not found.");
  const removed=doc[field].find(x=>idKey(x.id)===idKey(id));
  const suppressed=kindOfAuto(removed)&&type!=="creator"?
   [...doc.dismissedRequests.filter(x=>!(x.type==="avatar"&&idKey(x.id)===idKey(id)&&x.marker==="*")),{type:"avatar",id:idKey(id),marker:"*",reviewedAt:new Date().toISOString()}]:doc.dismissedRequests;
  try{await save({...doc,[field]:next,dismissedRequests:suppressed},`Ava-Valt: Owner revoked opt-out ${bounded(id,70)}`,sha)}
  catch(e){if(conflict(e)&&attempt<3)continue;throw e}
  return {ok:true,note:"Revocation does not automatically republish or restore deleted avatars."};
 }
}
export async function applyOptOutCleanup(){
 const policy=await readOptOuts();
 const live=await readDb();const doomed=live.avatars.filter(a=>isExcluded(a,policy)).map(a=>a.id);
 let removed=0;
 if(doomed.length){const result=await removeIdsAndSave(doomed,"Ava-Valt: remove active opt-out avatars");removed=result.removed}
 // Exclude from quarantine & pending review. Writes only when they need editing.
 const summaries={liveRemoved:removed,quarantineRemoved:0,reviewRemoved:0};
 const docs=[{path:process.env.UNKNOWN_PLATFORM_QUARANTINE_PATH||"unknown-platform-quarantine.json",name:"quarantineRemoved"},{path:process.env.PLATFORM_NEEDS_REVIEW_PATH||"platform-needs-review.json",name:"reviewRemoved"}];
 for(const f of docs){
  try{const curr=await getRepoFile(f.path);const doc=JSON.parse(curr.text||"{}");const rows=Array.isArray(doc)?doc:(doc.avatars||[]);
   const kept=filterExcluded(rows,policy);const diff=rows.length-kept.length;
   if(diff){const next=Array.isArray(doc)?kept:{...doc,avatars:kept,updated:new Date().toISOString()};await putRepoFile(f.path,JSON.stringify(next,null,2)+"\n",`Ava-Valt: opt-out cleanup ${f.path}`)}
   summaries[f.name]=diff;
  }catch(e){if(e.message!=="NOT_FOUND")throw e}
 }
 return summaries;
}
