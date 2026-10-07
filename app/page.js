"use client";
import {useEffect,useState} from "react";
export default function Home(){
  const [autoState,setAutoState]=useState(null); const [me,setMe]=useState(null);
  async function loadAutoState(){
    try{const r=await fetch("/api/settings",{cache:"no-store"});if(r.ok)setAutoState(await r.json())}catch{}
  }
  useEffect(()=>{loadAutoState();fetch("/api/me",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setMe).catch(()=>{});const t=setInterval(loadAutoState,3000);return()=>clearInterval(t)},[]);
  async function requestAutoStop(){
    setStatus("Requesting stop...");
    const r=await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:false})});
    const j=await r.json(); if(r.ok){setAutoState(j);setStatus(j.running?"Stop requested — current run will finish safely.":"Automatic importing stopped.")}else setStatus(j.error||"Could not stop importer");
  }
  async function toggleAuto(){
    const target=!(autoState?.enabled);
    const r=await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:target})});
    const j=await r.json(); if(r.ok){setAutoState(j);setStatus(target?"Automatic importing enabled.":"Automatic importing stopped.")}else setStatus(j.error||"Could not update importer");
  }
 const [stats,setStats]=useState(null),[q,setQ]=useState(""),[mode,setMode]=useState("latest"),[results,setResults]=useState([]),[selected,setSelected]=useState({}),[status,setStatus]=useState("Ready.");
 const load=async()=>{const r=await fetch("/api/db"); if(r.status===401){location="/login";return} const j=await r.json();setStats(j)};
 useEffect(()=>{load()},[]);
 async function search(){setStatus("Searching providers...");const r=await fetch("/api/import/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q,mode,limit:120})});const j=await r.json();if(!r.ok){setStatus(j.error);return}setResults(j.avatars);setStatus(`${j.avatars.length} unique results • ${j.notes.join(" • ")}`)}
 async function add(){const avatars=results.filter(a=>selected[a.id]);if(!avatars.length)return setStatus("Select at least one avatar.");setStatus("Updating GitHub...");const r=await fetch("/api/import/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({avatars})});const j=await r.json();setStatus(r.ok?`Added ${j.added}; updated ${j.updated}; database now ${j.total}.`:j.error);if(r.ok)load()}
 async function autoImport(){
    if(autoState?.running){setStatus("An import is already running.");return}
    setStatus("Starting importer — status will update above while it works...");
    setAutoState(s=>s?{...s,running:true}:s);
    try{
      const r=await fetch("/api/import/auto",{method:"POST"});
      const j=await r.json();
      setStatus(r.ok?`AUTO IMPORT FINISHED: ${j.added||0} added • ${j.newFound||0} new found • ${j.total||0} total${j.conflicts?` • ${j.conflicts} GitHub conflict(s) safely retried`:""}.`:j.error);
      if(r.ok)load();
    }catch(e){setStatus("The browser lost the import request. Check importer status; the server may still be finishing it.")}
    finally{loadAutoState()}
  }
  async function remove(){const id=prompt("Avatar ID to remove (avtr_...)");if(!id)return;const r=await fetch("/api/db/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});const j=await r.json();setStatus(r.ok?`Removed ${id}. Database now ${j.total}.`:j.error);if(r.ok)load()}
 return <main><h1>Ava-Valt Admin</h1><div className="muted">Manage the live avatar database without opening Unity. {me&&<>Signed in as <b>{me.isOwner?"OWNER":"HIGH STAFF"}</b>.</>}</div>
 <div className="card"><div className={"status "+(autoState?.enabled?"good":"")}><b>{autoState?.stopRequested?"STOP REQUESTED":autoState?.running?`AUTO IMPORT RUNNING — ${autoState?.currentStage||"WORKING"}`:autoState?.enabled?"AUTO IMPORT ON — WAITING FOR NEXT RUN":"AUTO IMPORT OFF"}</b></div><div className="row"><b>{stats?stats.count.toLocaleString():"…"} avatars online</b><span className="muted">Updated: {stats?.updated||"…"}</span><button onClick={load}>Refresh</button>{autoState?.running
 ? (me?.isOwner?<button className="danger" onClick={requestAutoStop} disabled={autoState?.stopRequested}>{autoState?.stopRequested?"STOP REQUESTED — FINISHING":"STOP AFTER THIS RUN"}</button>:null)
 : <button onClick={autoImport}>RUN AUTO IMPORT NOW</button>}
 <a className="button secondary" href="/auto-import">{me?.isOwner?"AUTO IMPORT SETTINGS":"IMPORT STATUS"}</a>{me?.isOwner&&<button className="danger" onClick={remove}>Remove by ID</button>}</div></div>
 <div className="card"><div className="row"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="latest">Latest</option><option value="random">Random</option><option value="search">Search</option></select><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Avatar name, author, or avtr_ ID"/><button onClick={search}>RUN</button><button onClick={add}>ADD SELECTED TO GITHUB</button></div><p className="muted">{status}</p></div>
 <div className="grid">{results.map(a=><div className="avatar" key={a.id}><input type="checkbox" checked={!!selected[a.id]} onChange={e=>setSelected({...selected,[a.id]:e.target.checked})}/>{a.thumbnailImageUrl||a.imageUrl?<img src={a.thumbnailImageUrl||a.imageUrl}/>:null}<b>{a.name}</b><div className="muted">{a.author}</div><small>{a.id}</small><div style={{clear:"both"}}/></div>)}</div></main>
}