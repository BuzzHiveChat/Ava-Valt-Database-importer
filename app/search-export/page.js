"use client";
import {useState,useEffect} from "react";
export default function SearchExport(){
 const [state,setState]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function request(action){
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/db/search-export",action?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action}),cache:"no-store"}:{cache:"no-store"});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Request failed");setState(j);return j;
  }catch(e){setError(e.message);return null}
  finally{setBusy(false)}
 }
 useEffect(()=>{request(null)},[]);
 return <main style={{maxWidth:840,margin:"40px auto",padding:24}}>
  <h1>Ava-Valt Search Index Export (Beta)</h1>
  <p>This is an OWNER-ONLY opt-in publisher. It does NOT replace or delete your live avatar-index.json. It creates 256 searchable GitHub Pages JSON files for the updated VRChat world.</p>
  <p><strong>Keep your old world/database active until all 256 files are published and Unity is tested.</strong> If the importer or quarantine repair edits the live database while exporting, this tool stops; start a fresh export.</p>
  <p>Searches need at least two letters and match words in names, author names or tags. Some features (global Show All, full-database favourites/recent browsing, description-only discovery) aren't implemented in this beta.</p>
  <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"22px 0"}}>
   <button disabled={busy} onClick={()=>request("start")}>Start / restart export</button>
   <button disabled={busy||!state?.active} onClick={()=>request("next")}>Publish next 6 files</button>
   <button disabled={busy} onClick={()=>request(null)}>Refresh status</button>
  </div>
  <p>Status: <strong>{state?.stage||"Loading..."}</strong></p>
  <p>Progress: {state?.next??0} / {state?.total??256} files. Source avatar count: {state?.sourceCount??"—"}</p>
  {state?.error&&<p style={{color:"#eb8c8c"}}>{state.error}</p>}
  {error&&<p style={{color:"#eb8c8c"}}>{error}</p>}
  {state?.stage==="COMPLETE"&&<p>Files published! Wait for GitHub Pages to serve all files, then configure the Unity search URLs and test in Build &amp; Test.</p>}
  <p style={{fontSize:13,opacity:.75}}>Do not run two exports at the same time. For a large database, the search index may exceed GitHub Pages limits; this exporter checks individual file size before publishing.</p>
  <a href="/auto-import">Back to Auto Import</a>
 </main>;
}
