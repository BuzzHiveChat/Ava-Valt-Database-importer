"use client";
import {useEffect,useState} from "react";
export default function AutoImport(){
 const [s,setS]=useState(null),[msg,setMsg]=useState("");
 async function load(){const r=await fetch("/api/settings"); if(r.ok)setS(await r.json())}
 useEffect(()=>{load();const t=setInterval(load,4000);return()=>clearInterval(t)},[]);
 async function save(patch){setMsg("Saving...");const r=await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});const j=await r.json();if(r.ok){setS(j);setMsg("Saved.")}else setMsg(j.error||"Could not save")}
 async function run(){setMsg("Running importer...");const r=await fetch("/api/import/auto",{method:"POST"});const j=await r.json();setMsg(r.ok?`Finished: ${j.added} added • ${j.newFound} new found • ${j.total} total`:j.error);load()}
 if(!s)return <main className="wrap"><h1>Auto Import</h1><p>Loading controls...</p></main>;
 return <main className="wrap">
  <div className="top"><div><div className="eyebrow">AVA-VALT CONTROL CENTRE</div><h1>Auto Import</h1><p className="muted">Control scheduled database discovery without opening Unity.</p></div><a className="button secondary" href="/">Back to importer</a></div>
  <section className="card">
   <div className="row"><div><h2>Automatic adding</h2><p className="muted">{s.stopRequested?"Stop requested. The current import will finish safely, then automatic importing will stop.":s.running?"An import is currently running.":s.enabled?"Scheduled runs are allowed to add new unique avatars.":"Scheduled runs are stopped and will not modify the database."}</p></div>
   <button className={s.enabled?"danger":""} onClick={()=>save({enabled:!s.enabled})}>{(s.enabled||s.running)?"STOP AUTO IMPORT":"START AUTO IMPORT"}</button></div>
   <div className={"status "+(s.enabled?"good":"")}><b>{s.stopRequested?"STOP REQUESTED — FINISHING CURRENT RUN":s.running?"RUNNING":s.enabled?"READY / AUTO ON":"STOPPED"}</b></div>
   <button onClick={run}>RUN ONCE NOW</button>
  </section>
  <section className="grid">
   <div className="card"><h2>Last run</h2><p>{s.lastRun?new Date(s.lastRun).toLocaleString():"Never"}</p><p><b>{s.lastAdded||0}</b> added • <b>{s.lastFound||0}</b> new found{s.lastConflicts?` • ${s.lastConflicts} GitHub conflict${s.lastConflicts===1?"":"s"} safely retried`:""}</p>{s.lastError&&<p className="error">{s.lastError}</p>}</div>
   <div className="card"><h2>Limits</h2><label>Maximum avatars added per run</label><input type="number" min="1" max="1000" value={s.maxAddPerRun} onChange={e=>setS({...s,maxAddPerRun:+e.target.value})}/><button onClick={()=>save({maxAddPerRun:s.maxAddPerRun})}>Save limit</button></div>
  </section>
  <section className="card"><h2>Search terms</h2><p className="muted">Comma separated. Keep these broad so providers can return varied avatars.</p><textarea rows="4" value={s.searchTerms.join(", ")} onChange={e=>setS({...s,searchTerms:e.target.value.split(",").map(x=>x.trim())})}/><button onClick={()=>save({searchTerms:s.searchTerms})}>Save search terms</button></section>
  <section className="card"><h2>Providers</h2><p className="muted">Turn a provider off if it blocks Ava-Valt, is unreliable, or you no longer want to query it.</p>
   {Object.entries(s.providerEnabled).map(([k,v])=><label key={k} style={{display:"block",margin:"10px 0"}}><input type="checkbox" checked={v} onChange={e=>{const p={...s.providerEnabled,[k]:e.target.checked};setS({...s,providerEnabled:p});save({providerEnabled:p})}}/> {k}</label>)}
  </section>
  <section className="card"><h2>Provider health from last run</h2>{!s.lastHealth?.length?<p className="muted">No run data yet.</p>:s.lastHealth.slice(-30).map((h,i)=><p key={i}><b>{h.provider}</b> — {h.state}{h.count?` • ${h.count} results`:""}{h.error?` • ${h.error}`:""} <span className="muted">({h.term})</span></p>)}</section>
  <p>{msg}</p>
 </main>
}