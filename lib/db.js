
const OWNER=()=>process.env.GITHUB_OWNER||"BuzzHiveChat";
const REPO=()=>process.env.GITHUB_REPO||"Ava-Valt-Database";
const BRANCH=()=>process.env.GITHUB_BRANCH||"main";
const PATH=()=>process.env.GITHUB_DATABASE_PATH||"avatar-index.json";
const headers=()=>({
 "Accept":"application/vnd.github+json",
 "Authorization":`Bearer ${process.env.GITHUB_TOKEN}`,
 "X-GitHub-Api-Version":"2022-11-28",
 "User-Agent":"Ava-Valt-Web-Admin/2.2"
});

async function metadata(){
 const r=await fetch(`https://api.github.com/repos/${OWNER()}/${REPO()}/contents/${encodeURIComponent(PATH())}?ref=${encodeURIComponent(BRANCH())}`,{headers:headers(),cache:"no-store"});
 if(!r.ok)throw new Error(`GitHub metadata failed: HTTP ${r.status} ${(await r.text()).slice(0,500)}`);
 return r.json();
}
export async function readDb(){
 const m=await metadata();
 let text="";
 if(m.content) text=Buffer.from(m.content.replace(/\n/g,""),"base64").toString("utf8");
 else {
  const raw=await fetch(m.download_url,{cache:"no-store"});
  if(!raw.ok)throw new Error(`Database download failed: HTTP ${raw.status}`);
  text=await raw.text();
 }
 const parsed=JSON.parse(text);
 const avatars=Array.isArray(parsed)?parsed:(Array.isArray(parsed.avatars)?parsed.avatars:[]);
 return {root:parsed,avatars,sha:m.sha};
}
function withAvatars(root,avatars){
 if(Array.isArray(root)) return avatars;
 return {...root,avatars};
}
async function put(root,sha,message){
 const body={message,content:Buffer.from(JSON.stringify(root,null,2)+"\n").toString("base64"),branch:BRANCH(),sha};
 const r=await fetch(`https://api.github.com/repos/${OWNER()}/${REPO()}/contents/${encodeURIComponent(PATH())}`,{
  method:"PUT",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify(body)
 });
 if(r.status===409)return {conflict:true};
 if(!r.ok)throw new Error(`GitHub upload failed: HTTP ${r.status} ${(await r.text()).slice(0,700)}`);
 return {conflict:false,result:await r.json()};
}

// Safe merge-save. Always refreshes GitHub immediately before writing.
// On a race, it re-fetches, merges by avatar ID, and retries.
export async function mergeAndSave(additions,message,maxRetries=4){
 const incoming=new Map((additions||[]).filter(a=>a?.id).map(a=>[a.id,a]));
 for(let attempt=1;attempt<=maxRetries;attempt++){
  const latest=await readDb();
  const map=new Map(latest.avatars.filter(a=>a?.id).map(a=>[a.id,a]));
  let actuallyAdded=0;
  for(const [id,a] of incoming) if(!map.has(id)){map.set(id,a);actuallyAdded++}
  if(!actuallyAdded)return {added:0,total:map.size,conflicts:attempt-1};
  const out=withAvatars(latest.root,[...map.values()]);
  const wr=await put(out,latest.sha,message);
  if(!wr.conflict)return {added:actuallyAdded,total:map.size,conflicts:attempt-1};
 }
 throw new Error("GitHub database changed repeatedly while saving. No data was overwritten; please run again.");
}

// Compatibility for manual DB operations. For importer additions prefer mergeAndSave.
export async function saveDb(db,message="Update Ava-Valt database"){
 const additions=db.avatars||[];
 return mergeAndSave(additions,message);
}

export async function replaceAndSave(avatars,message,maxRetries=4,{preserveMissing=true}={}){
 const desired=new Map((avatars||[]).filter(a=>a?.id).map(a=>[a.id,a]));
 for(let attempt=1;attempt<=maxRetries;attempt++){
  const latest=await readDb();
  // Preserve any avatars added concurrently that aren't in the repair snapshot.
  if(preserveMissing)for(const a of latest.avatars)if(a?.id&&!desired.has(a.id))desired.set(a.id,a);
  const out=withAvatars(latest.root,[...desired.values()]);
  const wr=await put(out,latest.sha,message);
  if(!wr.conflict)return {total:desired.size,conflicts:attempt-1};
 }
 throw new Error("GitHub changed repeatedly while saving metadata repair; no newer data was overwritten.");
}

export async function removeUnknownPlatformAvatars(message="Ava-Valt: remove avatars with unknown platform"){
 const latest=await readDb();
 const isUnknown=a=>{
  const p=a?.platforms;
  if(!p)return true;
  const arr=Array.isArray(p)?p:String(p).split(/[•,]/);
  return !arr.length||arr.every(v=>!String(v).trim()||String(v).trim().toLowerCase()==="unknown");
 };
 const removed=latest.avatars.filter(isUnknown);
 const keep=latest.avatars.filter(a=>!isUnknown(a));
 if(!removed.length)return {removed:0,total:keep.length};
 const r=await replaceAndSave(keep,message,4,{preserveMissing:false});
 return {removed:removed.length,total:r.total};
}
