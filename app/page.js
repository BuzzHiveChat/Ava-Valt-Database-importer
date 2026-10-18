"use client";
import {useEffect,useRef,useState} from "react";
import {runSelectedPlatformChecks} from "../lib/manualPlatformChecks.mjs";
import {reportedPlatforms,platformReviewCounts,pendingPlatformChecks,knownPlatformAvatars,applyPlatformCheckResults,filterAvatarCards} from "../lib/searchPlatformReview.mjs";
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
 const [checkingPlatforms,setCheckingPlatforms]=useState(false),[checkProgress,setCheckProgress]=useState(null);
 const [searching,setSearching]=useState(false),[verifiedOnly,setVerifiedOnly]=useState(true),[autoVerifyMissing,setAutoVerifyMissing]=useState(true);
 const [safeVerifyConfig,setSafeVerifyConfig]=useState(null);
 useEffect(()=>{fetch("/api/import/verify",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setSafeVerifyConfig).catch(()=>{})},[]);
 const stopPlatformChecks=useRef(false),platformChecksRunning=useRef(false),searchRunning=useRef(false);
 const load=async()=>{const r=await fetch("/api/db"); if(r.status===401){location="/login";return} const j=await r.json();setStats(j)};
 useEffect(()=>{load()},[]);
 function platformLabels(a){return reportedPlatforms(a)}
 const selectedUnknown=pendingPlatformChecks(results.filter(a=>selected[a.id]),results.length||1);
 const allUnknown=pendingPlatformChecks(results,results.length||1);
 const allKnown=knownPlatformAvatars(results);
 const counts=platformReviewCounts(results);
 const safeChecksReady=Boolean(safeVerifyConfig?.enabled&&me?.isOwner);
 const safeChecksReason=!me?.isOwner?"Only the owner may run extra lookups.":safeVerifyConfig?.reason||"Enable SAFE_PLATFORM_VERIFY_ENABLED and shared Redis on Vercel to turn on cautious platform lookups.";

 async function checkPlatforms(avatars,{automatic=false}={}){
  if(platformChecksRunning.current)return;
  if(!safeChecksReady){setStatus(`Platform lookups have not started. ${safeChecksReason}`);return;}
  const max=safeVerifyConfig.maxSelection||50;
  const candidates=pendingPlatformChecks(avatars,max);
  if(!candidates.length){if(!automatic)setStatus("No unchecked avatars selected. Select unknown avatars first.");return;}
  platformChecksRunning.current=true;
  stopPlatformChecks.current=false;
  setCheckingPlatforms(true);
  setCheckProgress({processed:0,total:candidates.length,attempted:0,resolved:0,unresolved:0,deferred:0,batchesFinished:0,batchCount:Math.ceil(candidates.length/10)});
  setStatus(`${automatic?"Search complete. Auto-checking":"Checking"} ${candidates.length} unknown avatars safely with AviSeek, 10 IDs per request and ${Math.round(safeVerifyConfig.intervalMs/1000)}s between batches. Use STOP CHECKING to cancel.`);
  try{
   const done=await runSelectedPlatformChecks({
    avatars:candidates,delayMs:safeVerifyConfig.intervalMs,
    shouldStop:()=>stopPlatformChecks.current,
    requestBatch:async batch=>{
      const r=await fetch("/api/import/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({avatars:batch})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||`Platform lookup failed (HTTP ${r.status})`);
      return j;
    },
    onBatch:(response,progress)=>{
      setResults(old=>applyPlatformCheckResults(old,response.avatars));
      setCheckProgress(progress);
      setStatus(`Checking platforms: ${progress.processed}/${progress.total} checked • ${progress.resolved} confirmed • ${progress.unresolved} unconfirmed. No missing platforms are guessed.`);
    }
   });
   setCheckProgress(done);
   if(done.error)setStatus(`Platform checks paused after ${done.processed}/${done.total}: ${done.error}. Existing search results are still available.`);
   else if(done.stopped)setStatus(`Stopped platform checks after ${done.processed}/${done.total}. Your confirmed results have been kept.`);
   else setStatus(`Finished ${done.processed} platform checks: ${done.resolved} with confirmed platforms and ${done.unresolved} still without evidence. ${Math.max(0,pendingPlatformChecks(avatars,avatars.length).length-candidates.length)} more may be checked later.`);
  }catch(e){setStatus(`Platform checks paused safely: ${e.message}`);}
  finally{platformChecksRunning.current=false;stopPlatformChecks.current=false;setCheckingPlatforms(false);}
 }
 async function verifySelected(){await checkPlatforms(selectedUnknown);}

 async function search(){
   if(searchRunning.current||platformChecksRunning.current)return;
   if(!selectedProviders.length){setStatus("Select at least one enabled IMPORT provider first.");return;}
   searchRunning.current=true;setSearching(true);setCheckProgress(null);
   setStatus(`Searching ${selectedProviders.join(", ")} for avatars and platform evidence…`);
   try{
    const r=await fetch("/api/import/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q,mode,limit:resultLimit,platform:platformFilter,providers:selectedProviders})});
    const j=await r.json();
    if(!r.ok){setStatus(`${j.error||`Search failed (HTTP ${r.status})`}${j.retryAfter?` Try again in ${j.retryAfter}s.`:""}`);return;}
    const found=j.avatars||[];
    const snapshot=platformReviewCounts(found);
    setResults(found);setSelected({});setPageIndex(0);setSearchSummary(j);
    const summary=`Found ${found.length} avatars • ${snapshot.verified} confirmed platforms • ${snapshot.unknown} missing platform data.`;
    if(!snapshot.unknown){setStatus(`${summary} All loaded results have platform evidence.`);return;}
    if(!autoVerifyMissing){setStatus(`${summary} Automatic follow-up checks are off. You can enable them above.`);return;}
    if(!safeChecksReady){setStatus(`${summary} Only confirmed platforms are shown by default. Automatic follow-up checks are unavailable until the owner's shared API limiter is configured. You can still show unconfirmed avatars.`);return;}
    await checkPlatforms(found,{automatic:true});
   }catch(e){setStatus(`Provider search failed: ${e.message}`);}
   finally{searchRunning.current=false;setSearching(false);}
 }
 async function add(){if(platformChecksRunning.current){setStatus("Wait for platform checking to finish before adding avatars.");return;}const avatars=results.filter(a=>selected[a.id]);if(!avatars.length)return setStatus("Select at least one avatar.");setStatus("Checking platforms and updating GitHub...");const r=await fetch("/api/import/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({avatars})});const j=await r.json();setStatus(r.ok?`Added ${j.added}; updated ${j.updated}; ${j.excludedOrHeld||0} excluded/held for privacy; ${j.quarantined||0} unresolved moved to quarantine; database now ${j.total}.`:j.error);if(r.ok)load()}
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
 const visibleResults=filterAvatarCards(results,{platform:platformFilter,source:sourceFilter,verifiedOnly});
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
 <div className="card searchCard"><div className="searchCardHeading"><div><h2>🔎 Smart Avatar Search</h2><p className="muted">Search avatar sources once, combine matching platform evidence, and optionally double-check unknown IDs at a safe pace.</p></div><span className="searchSafety">API-friendly search</span></div>
 <div className="searchControls"><select value={mode} aria-label="Search mode" disabled={searching||checkingPlatforms} onChange={e=>setMode(e.target.value)}><option value="latest">Latest</option><option value="random">Random</option><option value="search">Search</option></select><input value={q} disabled={searching||checkingPlatforms} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")search()}} placeholder="Search avatar name, creator or avtr_ ID"/><select aria-label="Show avatars for platform" value={platformFilter} disabled={searching||checkingPlatforms} onChange={e=>{setPlatformFilter(e.target.value);setPageIndex(0)}}><option value="All">All platforms</option><option value="PC">PC</option><option value="Android">Quest / Android</option><option value="iOS">iOS</option></select><select aria-label="Maximum search results" value={resultLimit} disabled={searching||checkingPlatforms} onChange={e=>setResultLimit(Number(e.target.value))}><option value={120}>Up to 120</option><option value={500}>Up to 500</option><option value={1000}>Up to 1000</option></select><button type="button" className="runSearchBtn" disabled={searching||checkingPlatforms} onClick={search}>{searching?"SEARCHING & CHECKING…":"⌕ SEARCH AVATARS"}</button></div>
 <div className="searchOptions"><label className="searchToggle"><input type="checkbox" checked={verifiedOnly} onChange={e=>{setVerifiedOnly(e.target.checked);setPageIndex(0)}}/><span><strong>Show confirmed platforms only</strong><small>Hide avatars missing evidence. Uncheck to review every match.</small></span></label><label className="searchToggle"><input type="checkbox" checked={autoVerifyMissing} disabled={searching||checkingPlatforms} onChange={e=>setAutoVerifyMissing(e.target.checked)}/><span><strong>Auto-check missing platforms</strong><small>{safeChecksReady?"Uses capped AviSeek batches, shared cache and site-wide cooldown.":"Requires owner access and shared Redis safety setup. No extra lookup calls until enabled."}</small></span></label></div>
 {results.length>0&&<div className="searchCounts" aria-live="polite"><span>Found <strong>{counts.total}</strong></span><span className="ok">✓ {counts.verified} confirmed</span><span className="muted">? {counts.unknown} without platform data</span>{verifiedOnly&&counts.unknown>0&&<button type="button" className="secondary" onClick={()=>{setVerifiedOnly(false);setPageIndex(0)}}>SHOW UNCONFIRMED ({counts.unknown})</button>}</div>}
 <div className="row"><button type="button" className="secondary" disabled={checkingPlatforms||searching||!selectedUnknown.length} onClick={verifySelected}>CHECK SELECTED PLATFORMS ({Math.min(selectedUnknown.length,safeVerifyConfig?.maxSelection||50)})</button>{checkingPlatforms&&<button type="button" className="secondary" disabled={stopPlatformChecks.current} onClick={()=>{stopPlatformChecks.current=true;setStatus("Stopping safely after the current batch / wait…")}}>STOP CHECKING</button>}<button disabled={searching||checkingPlatforms} onClick={add}>ADD SELECTED TO GITHUB</button></div>
 {!safeChecksReady&&<p className="muted" style={{fontSize:12}}>ℹ️ Extra platform lookups are not enabled: {safeChecksReason} Searches still use the platform metadata already returned by enabled sources. <a href="#platform-setup" onClick={e=>{e.preventDefault();setStatus(`To enable safe checks, configure Upstash Redis in Vercel and set SAFE_PLATFORM_VERIFY_ENABLED=true. See SMART_SEARCH_SETUP.md in the ZIP. ${safeChecksReason}`)}}>How to enable safe checks</a></p>}
 <p className="searchStatus" aria-live="polite">{status}</p>{checkProgress&&<div className="platformCheckProgress" role="status"><progress aria-label="Platform verification progress" value={checkProgress.processed} max={Math.max(1,checkProgress.total)}/><span>{checkProgress.processed} of {checkProgress.total} checked • {checkProgress.resolved} confirmed • {checkProgress.unresolved} unconfirmed</span></div>}
 <p className="muted" style={{fontSize:12}}>Search uses a short cooldown and caches repeated results. Unconfirmed avatars cannot be truthfully labelled PC, Android or iOS without evidence; showing confirmed only is a display filter, not a data deletion. On Vercel, shared Redis provides cross-instance request protection.</p>
 </div>
 <div className="row resultTools"><select aria-label="Filter fetched cards by source" value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value);setPageIndex(0)}}><option value="All">All sources</option>{selectedProviders.map(name=><option key={name} value={name}>{name} only</option>)}</select><span className="muted">Showing {visibleResults.length?`${safePage*PAGE_SIZE+1}–${Math.min((safePage+1)*PAGE_SIZE,visibleResults.length)}`:"0"} of {visibleResults.length} loaded avatars{searchSummary?.truncated?` (${searchSummary.totalUnique} matching IDs in fetched batches; increase the search limit for more)`:""} • {Object.values(selected).filter(Boolean).length} selected</span>
 <button type="button" className="secondary" disabled={checkingPlatforms||searching||!pageResults.length} onClick={()=>setSelected(s=>({...s,...Object.fromEntries(pageResults.map(a=>[a.id,true]))}))}>SELECT THIS PAGE</button>
 <button type="button" className="secondary" disabled={checkingPlatforms||searching||!allKnown.length} onClick={()=>setSelected(s=>({...s,...Object.fromEntries(allKnown.map(a=>[a.id,true]))}))}>SELECT ALL KNOWN ({allKnown.length})</button>
 <button type="button" className="secondary" disabled={checkingPlatforms||searching||!allUnknown.length} onClick={()=>setSelected(s=>({...s,...Object.fromEntries(allUnknown.map(a=>[a.id,true]))}))}>SELECT ALL UNKNOWN ({allUnknown.length})</button>
 <button type="button" className="secondary" disabled={checkingPlatforms||searching} onClick={()=>setSelected({})}>CLEAR SELECTION</button></div>
 <div className="grid">{pageResults.map(a=><article className="avatar" key={a.id}>
  <label className="avatarCheck" title={`Select ${a.name}`}><input type="checkbox" aria-label={`Select ${a.name}`} disabled={checkingPlatforms||searching} checked={!!selected[a.id]} onChange={e=>setSelected({...selected,[a.id]:e.target.checked})}/></label>
  <div className="avatarTop">{a.thumbnailImageUrl||a.imageUrl?<img src={a.thumbnailImageUrl||a.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<div className="avatarPlaceholder">?</div>}
   <div className="avatarIdentity"><strong>{a.name}</strong><span className="muted">{a.author}</span></div>
  </div>
  <small className="avatarId" title={a.id}>{a.id}</small>
  <div className="avatarSource">Found in: {(a.sourceProviders?.length?a.sourceProviders:[a.metadataProvider||"Unknown"]).join(" · ")}</div>
  <div className="avatarPlatforms">{platformLabels(a).length?platformLabels(a).map(p=><span className="pill" key={p}>{p}</span>):<span className="unknownPlatform">Platform not confirmed · check before importing</span>}</div>
 </article>)}</div>
 {pageCount>1&&<nav className="pageNav" aria-label="Avatar search pages"><button type="button" disabled={pageIndex===0} onClick={()=>setPageIndex(p=>Math.max(0,p-1))}>← Previous</button><span>Page {safePage+1} of {pageCount}</span><button type="button" disabled={pageIndex>=pageCount-1} onClick={()=>setPageIndex(p=>Math.min(pageCount-1,p+1))}>Next →</button></nav>}
 </main>
}