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
 const [manualProviders,setManualProviders]=useState(null);
 const providerOptions=autoState?.providerEnabled||{};
 const enabledProviders=Object.keys(providerOptions).filter(name=>providerOptions[name]);
 const selectedProviders=manualProviders===null?enabledProviders:manualProviders.filter(name=>providerOptions[name]);
 const [stats,setStats]=useState(null),[q,setQ]=useState(""),[platformFilter,setPlatformFilter]=useState("All"),[mode,setMode]=useState("latest"),[results,setResults]=useState([]),[selected,setSelected]=useState({}),[status,setStatus]=useState("Ready.");
 const [resultLimit,setResultLimit]=useState(500),[pageIndex,setPageIndex]=useState(0),[searchSummary,setSearchSummary]=useState(null),[sourceFilter,setSourceFilter]=useState("All");
 const load=async()=>{const r=await fetch("/api/db"); if(r.status===401){location="/login";return} const j=await r.json();setStats(j)};
 useEffect(()=>{load()},[]);
 async function search(){
   if(!selectedProviders.length){setStatus("Select at least one enabled IMPORT provider first.");return;}
   setStatus(`Searching ${selectedProviders.join(", ")}...`);
   try{
    const r=await fetch("/api/import/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q,mode,limit:resultLimit,platform:platformFilter,providers:selectedProviders})});
    const j=await r.json();
    if(!r.ok){setStatus(j.error||`Search failed (HTTP ${r.status})`);return;}
    setResults(j.avatars||[]);setSelected({});setPageIndex(0);setSearchSummary(j);
    setStatus(`${j.avatars.length} shown${j.totalUnique>j.avatars.length?` of ${j.totalUnique} unique matches`:""} • ${(j.notes||[]).join(" • ")}`);
   }catch(e){setStatus(`Provider search failed: ${e.message}`);}
  }
 function platformLabels(a){const raw=Array.isArray(a?.platforms)?a.platforms:String(a?.platforms||"").split(/[•,]/);const out=[];for(const v of raw){const p=String(v).toLowerCase();if((p==="pc"||p.includes("windows"))&&!out.includes("PC"))out.push("PC");else if((p.includes("android")||p.includes("quest"))&&!out.includes("Android"))out.push("Android");else if(p.includes("ios")&&!out.includes("iOS"))out.push("iOS")}return out}
 async function verifySelected(){
  const avatars=results.filter(a=>selected[a.id]&&!platformLabels(a).length).slice(0,10);
  if(!avatars.length){setStatus("All selected avatars already show platform labels, or none are selected.");return;}
  setStatus(`Checking the exact avatar IDs for ${avatars.length} unknown-platform avatar(s)…`);
  try{
   const r=await fetch("/api/import/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({avatars})});
   const j=await r.json();if(!r.ok){setStatus(j.error||"Platform lookup failed.");return;}
   const updates=new Map((j.avatars||[]).map(a=>[a.id,a]));
   setResults(old=>old.map(a=>updates.has(a.id)?{...a,...updates.get(a.id),sourceProviders:a.sourceProviders}:a));
   setStatus(`Checked ${j.stats?.attempted||0} unknown-platform avatar(s) • ${j.stats?.resolvedByLookup||0} resolved • ${j.stats?.unresolved||0} still unknown. Unknown means the external sources could not confirm a platform.`);
  }catch(e){setStatus(`Could not verify platforms: ${e.message}`);}
 }
 async function add(){const avatars=results.filter(a=>selected[a.id]);if(!avatars.length)return setStatus("Select at least one avatar.");setStatus("Checking platforms and updating GitHub...");const r=await fetch("/api/import/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({avatars})});const j=await r.json();setStatus(r.ok?`Added ${j.added}; updated ${j.updated}; ${j.excludedOrHeld||0} excluded/held for privacy; ${j.quarantined||0} unresolved moved to quarantine; database now ${j.total}.`:j.error);if(r.ok)load()}
 async function autoImport(){
    if(autoState?.running){setStatus("An import is already running.");return}
    setStatus("Starting importer — status will update above while it works...");
    setAutoState(s=>s?{...s,running:true}:s);
    try{
      const r=await fetch("/api/import/auto",{method:"POST"});
      const j=await r.json();
      if(r.ok){
        const b=j.breakdown||{};
        setStatus(`AUTO IMPORT FINISHED: ${j.added||0} added • ${j.newFound||0} new candidates • ${b.resolvedByLookup||0} platform(s) resolved by lookup • ${b.quarantined||0} quarantined • ${j.total||0} live total${j.conflicts?` • ${j.conflicts} GitHub conflict(s) safely retried`:""}.`);
      }else setStatus(j.error);
      if(r.ok)load();
    }catch(e){setStatus("The browser lost the import request. Check importer status; the server may still be finishing it.")}
    finally{loadAutoState()}
  }
  async function remove(){const id=prompt("Avatar ID to remove (avtr_...)");if(!id)return;const r=await fetch("/api/db/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});const j=await r.json();setStatus(r.ok?`Removed ${id}. Database now ${j.total}.`:j.error);if(r.ok)load()}
 const PAGE_SIZE=36;
 const visibleResults=results.filter(a=>(platformFilter==="All"||platformLabels(a).includes(platformFilter))&&(sourceFilter==="All"||(a.sourceProviders||[a.metadataProvider]).includes(sourceFilter)));
 const pageCount=Math.max(1,Math.ceil(visibleResults.length/PAGE_SIZE));
 const safePage=Math.min(pageIndex,pageCount-1);
 const pageResults=visibleResults.slice(safePage*PAGE_SIZE,(safePage+1)*PAGE_SIZE);
 return <main><h1>Ava-Valt Admin</h1><p><a href="/creator-opt-out">Creator privacy / opt-out information</a></p><div className="muted">Manage the live avatar database without opening Unity. {me&&<>Signed in as <b>{me.isOwner?"OWNER":"HIGH STAFF"}</b>.</>}</div>
 <div className="card"><h2>✨ Quick Import — Discord submissions</h2><p>Paste avatar IDs, fetch their names, manually choose platforms, then save reviewed avatars to GitHub.</p><a className="button secondary" href="/quick-import">OPEN QUICK IMPORT →</a></div>
 <div className="card"><div className={"status "+(autoState?.enabled?"good":"")}><b>{autoState?.stopRequested?"STOP REQUESTED":autoState?.running?`AUTO IMPORT RUNNING — ${autoState?.currentStage||"WORKING"}`:autoState?.enabled?"AUTO IMPORT ON — WAITING FOR NEXT RUN":"AUTO IMPORT OFF"}</b></div><div className="row"><b>{stats?stats.count.toLocaleString():"…"} avatars online</b><span className="muted">Updated: {stats?.updated||"…"}</span><button onClick={load}>Refresh</button>{autoState?.running
 ? (me?.isOwner?<button className="danger" onClick={requestAutoStop} disabled={autoState?.stopRequested}>{autoState?.stopRequested?"STOP REQUESTED — FINISHING":"STOP AFTER THIS RUN"}</button>:null)
 : <button onClick={autoImport}>RUN AUTO IMPORT NOW</button>}
 <a className="button secondary" href="/auto-import">{me?.isOwner?"AUTO IMPORT SETTINGS":"IMPORT STATUS"}</a>{me?.isOwner&&<a className="button secondary" href="/quarantine">PLATFORM QUARANTINE</a>}{me?.isOwner&&<a className="button secondary" href="/platform-review">PLATFORM NEEDS REVIEW</a>}{me?.isOwner&&<a className="button secondary" href="/opt-outs">AVATAR OPT-OUTS</a>}{me?.isOwner&&<button className="danger" onClick={remove}>Remove by ID</button>}</div></div>
 <div className="card">
  <h2>IMPORT providers</h2>
  <p className="muted">Choose which avatar databases to search. AviSeek includes explicit PC, Quest/Android and iOS metadata. Disabled providers can be enabled in <a href="/auto-import">Auto Import Settings</a>. Selection here affects this manual search only.</p>
  <div className="row" style={{marginBottom:10}}>
   <button type="button" className="secondary" onClick={()=>setManualProviders(enabledProviders)}>SELECT ALL ENABLED</button>
   <button type="button" className="secondary" disabled={!providerOptions.AviSeek} onClick={()=>setManualProviders(["AviSeek"])}>AVISEEK ONLY</button>
  </div>
  <div className="providerChooser">
   {Object.entries(providerOptions).map(([name,enabled])=><label key={name} className="providerOption" style={{opacity:enabled?1:.55}}>
    <input type="checkbox" disabled={!enabled} checked={enabled&&selectedProviders.includes(name)} onChange={e=>setManualProviders(e.target.checked?[...selectedProviders,name]:selectedProviders.filter(p=>p!==name))}/>
    <span><strong>{name}</strong>{name==="AviSeek"&&<small>PC · Quest / Android · iOS</small>}{!enabled&&<small>Disabled in settings</small>}</span>
   </label>)}
  </div>
  </div>
 <div className="card"><h2>More avatar platform websites</h2>
  <p className="muted">Browse PC, Quest / Android and iOS evidence on these public websites. AviSeek is also integrated above; VRCNDb is a manual lookup link (not an unverified background API).</p>
  <div className="row"><a className="button secondary" href="https://aviseek.vrchatlegends.com/" target="_blank" rel="noreferrer">OPEN AVISEEK ↗</a>
  <a className="button secondary" href="https://db.vrcnext.com/" target="_blank" rel="noreferrer">OPEN VRCNDB ↗</a>
  <a className="button secondary" href="https://vrcavatarsearch.nekosunevr.co.uk/" target="_blank" rel="noreferrer">OPEN NEKOSUNEVR ↗</a></div>
  <p className="muted">AviSeek catalog data provided by <a target="_blank" rel="noreferrer" href="https://aviseek.vrchatlegends.com/">AviSeek / VRChat Legends</a>. Only reported build platforms are imported; missing platforms are not guessed.</p>
 </div>
 <div className="card"><div className="row"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="latest">Latest</option><option value="random">Random</option><option value="search">Search</option></select><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Avatar name, author, or avtr_ ID"/><select aria-label="Show avatars for platform" value={platformFilter} onChange={e=>{setPlatformFilter(e.target.value);setPageIndex(0)}}><option value="All">All platforms</option><option value="PC">PC</option><option value="Android">Quest / Android</option><option value="iOS">iOS</option></select><select aria-label="Maximum search results" value={resultLimit} onChange={e=>setResultLimit(Number(e.target.value))}><option value={120}>Up to 120</option><option value={500}>Up to 500</option><option value={1000}>Up to 1000</option></select><button onClick={search}>RUN SEARCH</button><button onClick={verifySelected}>CHECK SELECTED PLATFORMS</button><button onClick={add}>ADD SELECTED TO GITHUB</button></div><p className="muted">{status}</p><p className="muted" style={{fontSize:12}}>Platform filter affects provider searches. Click RUN SEARCH again after changing it to load matching avatars from AviSeek.</p></div>
 <div className="row resultTools"><select aria-label="Filter fetched cards by source" value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value);setPageIndex(0)}}><option value="All">All sources</option>{selectedProviders.map(name=><option key={name} value={name}>{name} only</option>)}</select><span className="muted">Showing {visibleResults.length?`${safePage*PAGE_SIZE+1}–${Math.min((safePage+1)*PAGE_SIZE,visibleResults.length)}`:"0"} of {visibleResults.length} loaded avatars{searchSummary?.truncated?` (${searchSummary.totalUnique} matching IDs in fetched batches; increase the search limit for more)`:""} • {Object.values(selected).filter(Boolean).length} selected</span>
 <button type="button" className="secondary" disabled={!pageResults.length} onClick={()=>setSelected(s=>({...s,...Object.fromEntries(pageResults.map(a=>[a.id,true]))}))}>SELECT THIS PAGE</button>
 <button type="button" className="secondary" onClick={()=>setSelected({})}>CLEAR SELECTION</button></div>
 <div className="grid">{pageResults.map(a=><article className="avatar" key={a.id}>
  <label className="avatarCheck" title={`Select ${a.name}`}><input type="checkbox" aria-label={`Select ${a.name}`} checked={!!selected[a.id]} onChange={e=>setSelected({...selected,[a.id]:e.target.checked})}/></label>
  <div className="avatarTop">{a.thumbnailImageUrl||a.imageUrl?<img src={a.thumbnailImageUrl||a.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<div className="avatarPlaceholder">?</div>}
   <div className="avatarIdentity"><strong>{a.name}</strong><span className="muted">{a.author}</span></div>
  </div>
  <small className="avatarId" title={a.id}>{a.id}</small>
  <div className="avatarSource">Found in: {(a.sourceProviders?.length?a.sourceProviders:[a.metadataProvider||"Unknown"]).join(" · ")}</div>
  <div className="avatarPlatforms">{platformLabels(a).length?platformLabels(a).map(p=><span className="pill" key={p}>{p}</span>):<span className="unknownPlatform">Platforms unknown — verified before adding</span>}</div>
 </article>)}</div>
 {pageCount>1&&<nav className="pageNav" aria-label="Avatar search pages"><button type="button" disabled={pageIndex===0} onClick={()=>setPageIndex(p=>Math.max(0,p-1))}>← Previous</button><span>Page {safePage+1} of {pageCount}</span><button type="button" disabled={pageIndex>=pageCount-1} onClick={()=>setPageIndex(p=>Math.min(pageCount-1,p+1))}>Next →</button></nav>}
 </main>
}