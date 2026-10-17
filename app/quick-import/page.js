"use client";
import {useState} from "react";
const ID=/avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const choices=["PC","Android","iOS"];
export default function QuickImport(){
 const [input,setInput]=useState("");const [items,setItems]=useState([]);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("Paste IDs from Discord. Only exact ID matches are accepted from lookup providers.");
 const [saveState,setSaveState]=useState({kind:"idle",text:"No save attempted yet."});
 async function lookup(){
  const ids=[...new Set((input.match(ID)||[]).map(x=>x.toLowerCase()))];
  if(!ids.length)return setMessage("Paste at least one valid avtr_ ID.");
  if(ids.length>20)return setMessage("Look up 20 IDs at a time, please.");
  setBusy(true);setMessage("Looking up names… this may take a little while.");
  try{
   const r=await fetch("/api/quick-import/lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids})});
   if(r.status===401){location.href="/login";return;}
   const data=await r.json();if(!r.ok)throw Error(data.error||"Lookup failed");
   setItems(data.entries.map(entry=>({...entry,name:entry.avatar?.name&&entry.avatar.name!=="Unknown Avatar"?entry.avatar.name:"",author:entry.avatar?.author&&entry.avatar.author!=="Unknown"?entry.avatar.author:"",platforms:[],selected:!entry.existing})));
   setMessage(`Checked ${data.entries.length} ID(s). Choose platforms and fill in any names the providers couldn't retrieve.`);
  }catch(e){setMessage(e.message)}finally{setBusy(false)}
 }
 function update(id,patch){setItems(old=>old.map(a=>a.id===id?{...a,...patch}:a))}
 async function save(){
  const selected=items.filter(a=>a.selected&&!a.existing);
  if(!selected.length){setSaveState({kind:"error",text:"Select at least one new avatar to import."});return;}
  if(selected.some(a=>!a.name.trim()||!a.platforms.length)){setSaveState({kind:"error",text:"Every selected avatar needs a name and at least one platform."});return;}
  if(!window.confirm(`Import ${selected.length} reviewed avatar(s) into the live GitHub database?`))return;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),75000);
  setBusy(true);
  setSaveState({kind:"saving",text:`Sending ${selected.length} avatar(s) to the server. Waiting for GitHub to confirm the save…`});
  try{
   const avatars=selected.map(a=>({id:a.id,name:a.name.trim(),author:a.author.trim()||"Unknown",authorId:a.avatar?.authorId||"",description:a.avatar?.description||"",imageUrl:a.avatar?.imageUrl||"",thumbnailImageUrl:a.avatar?.thumbnailImageUrl||"",platforms:a.platforms}));
   const response=await fetch("/api/quick-import/save",{method:"POST",headers:{"Content-Type":"application/json","Cache-Control":"no-store"},cache:"no-store",credentials:"same-origin",signal:controller.signal,body:JSON.stringify({avatars})});
   const raw=await response.text();
   let data;
   try{data=JSON.parse(raw)}catch{throw Error(`Server returned HTTP ${response.status}, but not valid JSON. ${raw.slice(0,250)||"Empty response"}`)}
   if(response.status===401){setSaveState({kind:"error",text:"Your admin login expired. Please sign in again before retrying. No successful save was confirmed."});return;}
   if(!response.ok)throw Error(`HTTP ${response.status}: ${data.error||data.details||"Save failed"}${data.stage?` (stage: ${data.stage})`:""}${data.missingIds?.length?` Missing IDs: ${data.missingIds.join(", ")}`:""}`);
   const saved=new Set((data.verifiedIds||[]).map(id=>id.toLowerCase()));
   const existingIds=new Set((data.existingIds||[]).map(id=>id.toLowerCase()));
   setItems(old=>old.map(a=>saved.has(a.id)||existingIds.has(a.id)?{...a,existing:true,selected:false}:a));
   const destination=`${data.destination||"GitHub database"} / ${data.branch||"main"} / ${data.path||"avatar-index.json"}`;
   const confirmed=Number(data.added||0);
   const held=Number(data.excludedOrHeld||0);
   const text=`${confirmed} newly added. ${saved.size} confirmed saved in GitHub. ${data.duplicates||0} already existed; ${held} held/excluded. Destination: ${destination}.`;
   setSaveState({kind:confirmed>0?"success":"warning",text:confirmed>0?text:`No new avatars were written. ${text} Check whether the ID already exists or is held for privacy review.`});
   setMessage(text);
  }catch(e){setSaveState({kind:"error",text:e.name==="AbortError"?"Save timed out after 75 seconds. GitHub may or may not have committed the avatar; check avatar-index.json before retrying.":`Database save failed: ${e.message}`});}
  finally{clearTimeout(timeout);setBusy(false)}
 }

 return <main style={{maxWidth:1100,margin:"30px auto",padding:"0 18px"}}>
  <p><a href="/">← Back to Ava-Valt Admin</a></p><h1>✨ Quick Import</h1>
  <p className="muted">Paste Discord avatar IDs → fetch names automatically when providers can find them → choose the platform yourself → review → save to GitHub.</p>
  <div className="card"><h2>1. Paste avatar IDs</h2><textarea rows={5} value={input} onChange={e=>setInput(e.target.value)} placeholder="avtr_... (one per line, or paste entire Discord messages)"/><div className="row"><button disabled={busy} onClick={lookup}>{busy?"Please wait…":"FETCH AVATAR NAMES"}</button><span className="muted">Maximum 20 per lookup</span></div></div>
  <div className="card" style={{border:saveState.kind==="error"?"2px solid #ff7285":saveState.kind==="success"?"2px solid #67d6a1":"2px solid #8051c8",padding:18,marginBottom:18}} role="status" aria-live="polite">
   <h2 style={{marginTop:0}}>GitHub save status: {saveState.kind==="saving"?"Saving…":saveState.kind==="success"?"Saved":saveState.kind==="error"?"Error":saveState.kind==="warning"?"No new records":"Not started"}</h2>
   <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{saveState.text}</p>
   {saveState.kind==="saving"&&<p>Keep this page open while GitHub processes the update.</p>}
  </div>
  <div className="card"><h2>2. Review and choose platform</h2><p aria-live="polite">{message}</p>
   {items.map(a=><div key={a.id} style={{borderTop:"1px solid #5555",padding:"16px 0",display:"flex",gap:18,alignItems:"flex-start",flexWrap:"wrap"}}>
    {a.avatar?.thumbnailImageUrl||a.avatar?.imageUrl?<img src={a.avatar.thumbnailImageUrl||a.avatar.imageUrl} alt="Avatar thumbnail" style={{height:90,width:90,objectFit:"cover",borderRadius:10}}/>:null}
    <div style={{flex:"1 1 300px"}}><label><input type="checkbox" disabled={a.existing} checked={a.selected} onChange={e=>update(a.id,{selected:e.target.checked})}/> {a.existing?"Already in database — skipped":"Include in import"}</label><div><small>{a.id}</small></div>
     <div><label>Avatar name <input aria-label={`Avatar name for ${a.id}`} value={a.name} disabled={a.existing} onChange={e=>update(a.id,{name:e.target.value})} placeholder="Enter name if lookup failed"/></label></div>
     <div><label>Creator <input aria-label={`Creator for ${a.id}`} value={a.author} disabled={a.existing} onChange={e=>update(a.id,{author:e.target.value})} placeholder="Unknown"/></label></div>
     <div style={{marginTop:8}}><b>Platforms (choose manually):</b> {choices.map(p=><label key={p} style={{display:"inline-block",marginRight:15}}><input type="checkbox" disabled={a.existing} checked={a.platforms.includes(p)} onChange={e=>update(a.id,{platforms:e.target.checked?[...a.platforms,p]:a.platforms.filter(x=>x!==p)})}/> {p}</label>)}</div>
     <small className="muted">Source: {a.source||"No exact provider match — enter name manually"}</small>
    </div></div>)}
   {!!items.length&&<button disabled={busy} onClick={save}>{busy?"SAVING TO GITHUB…":"SAVE REVIEWED AVATARS TO GITHUB"}</button>}
  </div>
 </main>
}
