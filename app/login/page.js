"use client";
import {useState} from "react";
export default function Login(){
 const [p,setP]=useState(""),[e,setE]=useState(""),[busy,setBusy]=useState(false);
 async function go(x){
  x.preventDefault();if(busy)return;setBusy(true);setE("");
  try{
   const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p})});
   if(r.ok){location.assign("/");return}
   setE(r.status===401?"Wrong password.":`Sign-in is temporarily unavailable (HTTP ${r.status}). Ask the owner to check the deployment logs.`);
  }catch{setE("Could not reach the sign-in server. Please try again.")}
  finally{setBusy(false)}
 }
 return <main><div className="card"><h1>Ava-Vault Staff Login</h1><form onSubmit={go} className="row"><input type="password" value={p} onChange={x=>setP(x.target.value)} placeholder="Staff or owner password" aria-label="Staff or owner password" autoComplete="current-password" required/><button disabled={busy}>{busy?"Signing in…":"LOGIN"}</button></form><p role="alert" className="err">{e}</p><p><a href="/creator-opt-out">Creator opt-out information</a></p></div></main>
}
