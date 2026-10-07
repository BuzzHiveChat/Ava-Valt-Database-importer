"use client";
import {useState,useEffect,useRef} from "react";

// Each request publishes ONE existing safe six-file batch. Never send them concurrently:
// progress.json and the GitHub repo branch are shared between requests.
export default function SearchExport(){
 const [state,setState]=useState(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [autoPublishing,setAutoPublishing]=useState(false);
 const [automatedBatches,setAutomatedBatches]=useState(0);
 const continueRef=useRef(false);
 const mountedRef=useRef(true);

 async function request(action){
  if(mountedRef.current){setBusy(true);setError("");}
  try{
   const r=await fetch("/api/db/search-export",action?{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action}),cache:"no-store"
   }:{cache:"no-store"});
   let j;
   try{j=await r.json();}catch(_){throw new Error(`Server returned an invalid response (HTTP ${r.status}). Refresh status before continuing.`);}
   if(!r.ok)throw new Error(j.error||`Request failed (HTTP ${r.status})`);
   if(mountedRef.current)setState(j);
   return j;
  }catch(e){
   if(mountedRef.current)setError(`${e?.message||e} Auto-publishing has paused. Refresh status before resuming if a request was interrupted.`);
   return null;
  }finally{
   if(mountedRef.current)setBusy(false);
  }
 }

 async function publishAll(){
  if(continueRef.current||busy||!state?.active)return;
  continueRef.current=true;
  setAutoPublishing(true);
  setAutomatedBatches(0);
  let count=0;
  try{
   while(continueRef.current){
    // Sequential only. The server checks the source database SHA at every batch.
    const result=await request("next");
    if(!result)break;
    count++;
    if(mountedRef.current)setAutomatedBatches(count);
    if(!result.active||result.stage==="COMPLETE"||result.stage==="SOURCE CHANGED"||result.stage==="OVERSIZED BUCKET")break;
    if(!Number.isFinite(result.next)||result.next>=result.total)break;
    // Yield to the UI, without starting a second GitHub write.
    await new Promise(resolve=>setTimeout(resolve,150));
   }
  }finally{
   continueRef.current=false;
   if(mountedRef.current)setAutoPublishing(false);
  }
 }

 function pause(){
  continueRef.current=false;
  setAutoPublishing(false);
 }

 useEffect(()=>{
  mountedRef.current=true;
  request(null);
  return ()=>{continueRef.current=false;mountedRef.current=false;};
 },[]);

 const next=state?.next??0;
 const total=state?.total??256;
 const percentage=total>0?Math.min(100,Math.round(next/total*100)):0;
 return <main style={{maxWidth:840,margin:"40px auto",padding:24}}>
  <h1>Ava-Valt Search Index Export (Beta)</h1>
  <p>This is an OWNER-ONLY opt-in publisher. It does NOT replace or delete your live avatar-index.json. It creates 256 searchable GitHub Pages JSON files for the updated VRChat world.</p>
  <p><strong>Keep your old world/database active until all 256 files are published and Unity is tested.</strong> If the importer or quarantine repair edits the live database while exporting, this tool stops; start a fresh export.</p>
  <p>Searches need at least two letters and match words in names, author names or tags. Some features (global Show All, full-database favourites/recent browsing, description-only discovery) aren't implemented in this beta.</p>
  <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"22px 0"}}>
   <button disabled={busy||autoPublishing} onClick={()=>request("start")}>Start / restart export</button>
   <button disabled={busy||autoPublishing||!state?.active} onClick={()=>request("next")}>Publish next 6 files</button>
   {!autoPublishing?<button disabled={busy||!state?.active} onClick={publishAll} style={{background:"#28a46e",color:"white"}}>Auto publish remaining files</button>:
    <button onClick={pause} style={{background:"#b44b67",color:"white"}}>Pause after current batch</button>}
   <button disabled={busy||autoPublishing} onClick={()=>request(null)}>Refresh status</button>
  </div>
  <p>Status: <strong>{state?.stage||"Loading..."}</strong>{autoPublishing?" • Auto-publishing...":null}</p>
  <p>Progress: <strong>{next} / {total}</strong> files ({percentage}%). Source avatar count: {state?.sourceCount??"—"}</p>
  <div role="progressbar" aria-label="GitHub search files published" aria-valuenow={next} aria-valuemin={0} aria-valuemax={total} style={{height:12,background:"#3a314a",borderRadius:9,overflow:"hidden",margin:"10px 0"}}>
   <div style={{background:"#8958ca",width:`${percentage}%`,height:"100%",transition:"width .25s"}}/>
  </div>
  {autoPublishing&&<p style={{fontSize:14}}>Automatically publishing one six-file batch at a time. {automatedBatches} batch{automatedBatches===1?"":"es"} completed since you pressed Auto Publish. Keep this tab open.</p>}
  {state?.error&&<p style={{color:"#eb8c8c"}}>{state.error}</p>}
  {error&&<p style={{color:"#eb8c8c"}}>{error}</p>}
  {state?.stage==="COMPLETE"&&<p>Files published! Wait for GitHub Pages to serve all files, then configure the Unity search URLs and test in Build &amp; Test.</p>}
  <p style={{fontSize:13,opacity:.75}}>Auto Publish resumes from your saved GitHub progress and uses sequential batches to avoid write conflicts. <strong>Keep this tab open</strong>; if you close it, the current request may finish, but subsequent batches will stop. Return and click Auto Publish again to resume. Pause waits for the in-flight batch. Do not run two exports in different tabs. Pause importer and quarantine repairs until publishing finishes.</p>
  <p style={{fontSize:13,opacity:.75}}>For a large database, search files may exceed GitHub Pages limits; the exporter checks individual file size before publishing. Upload speed still depends on GitHub and Vercel.</p>
  <a href="/auto-import">Back to Auto Import</a>
 </main>;
}
