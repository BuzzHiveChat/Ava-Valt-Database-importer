
const owner=()=>process.env.GITHUB_OWNER||"BuzzHiveChat";
const repo=()=>process.env.GITHUB_REPO||"Ava-Valt-Database";
const branch=()=>process.env.GITHUB_BRANCH||"main";
const path=()=>process.env.GITHUB_DATABASE_PATH||"avatar-index.json";
const headers=()=>({"Accept":"application/vnd.github+json","Authorization":`Bearer ${process.env.GITHUB_TOKEN}`,"X-GitHub-Api-Version":"2022-11-28","User-Agent":"Ava-Valt-Web-Admin"});

export async function readDb(){
  const raw=`https://raw.githubusercontent.com/${encodeURIComponent(owner())}/${encodeURIComponent(repo())}/${encodeURIComponent(branch())}/${path().split("/").map(encodeURIComponent).join("/")}?t=${Date.now()}`;
  const r=await fetch(raw,{cache:"no-store"});
  if(!r.ok) throw new Error(`Database download failed: HTTP ${r.status} ${await r.text()}`);
  const db=await r.json(); if(!Array.isArray(db.avatars)) db.avatars=[]; return db;
}
async function meta(){
  const u=`https://api.github.com/repos/${owner()}/${repo()}/contents/${path().split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch())}`;
  const r=await fetch(u,{headers:headers(),cache:"no-store"}); if(!r.ok) throw new Error(`GitHub metadata failed: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}
export async function saveDb(db,message){
  if(!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is missing.");
  const m=await meta(); db.updated=new Date().toISOString(); db.version=db.version||2;
  const body={message:message||"Update Ava-Valt avatar database",content:Buffer.from(JSON.stringify(db,null,2)).toString("base64"),sha:m.sha,branch:branch()};
  const u=`https://api.github.com/repos/${owner()}/${repo()}/contents/${path().split("/").map(encodeURIComponent).join("/")}`;
  const r=await fetch(u,{method:"PUT",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`GitHub upload failed: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}
