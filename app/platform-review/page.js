"use client";
import {useEffect,useState} from "react";

export default function PlatformReview(){
 const [me,setMe]=useState(null),[data,setData]=useState(null),[search,setSearch]=useState(""),[page,setPage]=useState(1);
 const [draft,setDraft]=useState({}),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
 const load=async(p=page,q=search)=>{
  const r=await fetch(`/api/platform-review?page=${p}&pageSize=50&search=${encodeURIComponent(q)}&t=${Date.now()}`,{cache:"no-store"});
  const j=await r.json();setData(r.ok?j:{error:j.error||"Could not load review queue"});
 };
 useEffect(()=>{fetch("/api/me",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(u=>{
  setMe(u||{isOwner:false});if(u?.isOwner)load(1,"");
 }).catch(()=>setMe({isOwner:false}));},[]);
 const chosen=id=>draft[id]||[];
 const toggle=(id,p)=>{const set=new Set(chosen(id));set.has(p)?set.delete(p):set.add(p);setDraft(d=>({...d,[id]:[...set]}));};
 async function lookup(a,provider){
  setBusy(true);setMsg(`Looking up ${a.id} with ${provider}...`);
  try{
   const endpoint=provider==="NekoSuneVR"?"/api/providers/nekosune-test":"/api/providers/kitsune-test";
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id,name:a.name||""})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Provider lookup failed");
   if(Array.isArray(j.platforms)&&j.platforms.length){setDraft(d=>({...d,[a.id]:j.platforms.filter(x=>["PC","Android","iOS"].includes(x))}));
    setMsg(`${provider} reports ${j.platforms.join(" + ")} for ${a.id}. Please confirm those platforms before VERIFY & ADD.`);
   }else setMsg(`${provider} did not provide verified platform evidence for this avatar.`);
  }catch(e){setMsg(e.message||String(e))}finally{setBusy(false)}
 }
 async function act(a,action){
  const platforms=chosen(a.id);
  if(action==="verify"&&!platforms.length){setMsg("Choose confirmed PC, Android, and/or iOS platforms first.");return}
  const prompt=action==="verify"
   ?`Verify ${a.id} as ${platforms.join(" + ")} and ADD it to the live database? Only confirm platforms that you checked.`
   :`Remove ${a.id} from Needs Review and ignore future UNKNOWN-platform rediscovery? This does NOT delete anything from the live database.`;
  if(!confirm(prompt))return;
  setBusy(true);
  try{
   const r=await fetch("/api/platform-review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,id:a.id,platforms})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Update failed");
   setMsg(action==="verify"?`Verified and added ${a.id}. ${j.remaining} left for review.`:`Dismissed ${a.id}. ${j.remaining} left for review.`);
   setDraft(d=>{const next={...d};delete next[a.id];return next});await load(page,search);
  }catch(e){setMsg(e.message||String(e))}finally{setBusy(false)}
 }
 if(!me)return <main><h1>Platform Needs Review</h1><p>Loading...</p></main>;
 if(!me.isOwner)return <main><h1>Platform Needs Review</h1><section className="card">Owner access required.</section></main>;
 return <main>
  <div className="eyebrow">AVA-VALT OWNER TOOLS</div>
  <h1>Platform Needs Review</h1>
  <p className="muted">When Quarantine Repair checks an avatar but cannot confirm its platform, the avatar moves here instead of staying in Quarantine. It is NOT added to the live database. Unchecked/deferred avatars remain quarantined until they have actually been checked.</p>
  <p><a href="/quarantine">← Back to Quarantine</a> · <a href="/">Admin home</a></p>
  {msg&&<section className="card"><b>{msg}</b></section>}
  <section className="card">
   <form onSubmit={e=>{e.preventDefault();setPage(1);load(1,search)}} className="row">
    <input aria-label="Search avatars" placeholder="Search avatar name, creator or avtr_ ID" value={search} onChange={e=>setSearch(e.target.value)}/>
    <button disabled={busy} type="submit">SEARCH</button>
    <button disabled={busy} type="button" className="secondary" onClick={()=>{setSearch("");setPage(1);load(1,"")}}>CLEAR</button>
   </form>
   <p><b>{data?.total??"—"}</b> avatar(s) awaiting manual review.</p>
   {data?.error&&<p className="err">{data.error}</p>}
  </section>
  {(data?.avatars||[]).map(a=>{const selected=chosen(a.id);return <section key={a.id} className="card">
   <div className="row" style={{alignItems:"flex-start"}}>
    {(a.thumbnailImageUrl||a.imageUrl)?<img alt="" src={a.thumbnailImageUrl||a.imageUrl} width={92} height={92} style={{objectFit:"cover",borderRadius:10}}/>:null}
    <div style={{flex:1,minWidth:250}}>
     <h2 style={{margin:"0 0 8px"}}>{a.name||a.id}</h2>
     <p className="muted">by {a.author||a.authorName||a.authorId||"Unknown creator"}</p>
     <code>{a.id}</code>
     <p className="muted">Last automatic lookup: {a.platformMetadataCheckedAt?new Date(a.platformMetadataCheckedAt).toLocaleString():"Not recorded"}</p>
     <div className="row" style={{margin:"10px 0"}}>
      { ["PC","Android","iOS"].map(p=><label key={p}><input type="checkbox" checked={selected.includes(p)} onChange={()=>toggle(a.id,p)}/> {p}</label>)}
      <button className="secondary" onClick={()=>setDraft(d=>({...d,[a.id]:["PC","Android","iOS"]}))}>ALL THREE</button>
     </div>
     <div className="row">
      <a className="button secondary" target="_blank" rel="noreferrer" href={`https://vrchat.com/home/avatar/${a.id}`}>OPEN VRCHAT</a>
      <button disabled={busy} className="secondary" onClick={()=>lookup(a,"NekoSuneVR")}>LOOK UP NEKOSUNEVR</button>
      <button disabled={busy} className="secondary" onClick={()=>lookup(a,"KitsuneDB")}>LOOK UP KITSUNEDB</button>
      <button disabled={busy||!selected.length} onClick={()=>act(a,"verify")}>VERIFY & ADD</button>
      <button disabled={busy} className="danger" onClick={()=>act(a,"dismiss")}>REMOVE FROM REVIEW</button>
     </div>
    </div>
   </div>
  </section>})}
  <div className="row" style={{justifyContent:"space-between"}}>
   <button className="secondary" disabled={busy||(data?.page||1)<=1} onClick={()=>{setPage(page-1);load(page-1,search)}}>← PREVIOUS</button>
   <span>Page {data?.page||1} / {data?.pages||1}</span>
   <button className="secondary" disabled={busy||(data?.page||1)>=(data?.pages||1)} onClick={()=>{setPage(page+1);load(page+1,search)}}>NEXT →</button>
  </div>
 </main>;
}
