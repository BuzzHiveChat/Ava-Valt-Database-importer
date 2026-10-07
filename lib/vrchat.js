const BASE="https://api.vrchat.cloud/api/1";
let cachedSession=null; let cachedAt=0;
const UA=()=>process.env.VRCHAT_USER_AGENT||"Ava-Valt/2.9 (avatar platform metadata; contact: set VRCHAT_USER_AGENT)";
const baseHeaders=()=>({"Accept":"application/json","User-Agent":UA()});
const cleanCookie=v=>String(v||"").trim().replace(/^auth=/i,"").split(";")[0].trim();
function cookieFromSetCookie(v){const m=String(v||"").match(/(?:^|[,;]\s*)auth=([^;,\s]+)/i);return m?.[1]||""}
function basic(){
 const u=process.env.VRCHAT_USERNAME,p=process.env.VRCHAT_PASSWORD;
 if(!u||!p)return "";
 return "Basic "+Buffer.from(`${encodeURIComponent(u)}:${encodeURIComponent(p)}`).toString("base64");
}
async function json(r){try{return await r.json()}catch{return {}}}
export async function vrchatSession(){
 if(cachedSession?.ok && Date.now()-cachedAt<10*60*1000)return cachedSession;
 let auth=cleanCookie(process.env.VRCHAT_AUTH_COOKIE);
 if(auth){
  const r=await fetch(`${BASE}/auth/user`,{headers:{...baseHeaders(),Cookie:`auth=${auth}`},cache:"no-store",signal:AbortSignal.timeout(12000)});
  const j=await json(r);
  if(r.ok&&!j?.requiresTwoFactorAuth){cachedSession={ok:true,auth,user:j,source:"VRCHAT_AUTH_COOKIE"};cachedAt=Date.now();return cachedSession;}
 }
 const b=basic();
 if(!b)return {ok:false,state:"LOGIN_REQUIRED",message:"Set VRCHAT_AUTH_COOKIE, or VRCHAT_USERNAME and VRCHAT_PASSWORD, in Vercel Environment Variables."};
 const r=await fetch(`${BASE}/auth/user`,{headers:{...baseHeaders(),Authorization:b},cache:"no-store",signal:AbortSignal.timeout(12000)});
 const j=await json(r); const fresh=cookieFromSetCookie(r.headers.get("set-cookie"));
 if(j?.requiresTwoFactorAuth?.length)return {ok:false,state:"TWO_FACTOR_REQUIRED",message:`VRChat requires ${j.requiresTwoFactorAuth.join(" / ")}. Use a reusable authenticated cookie in VRCHAT_AUTH_COOKIE after completing login.`,temporaryAuth:fresh||undefined};
 if(r.ok&&(fresh||j?.id)){cachedSession={ok:true,auth:fresh,user:j,source:"VRCHAT_USERNAME/VRCHAT_PASSWORD"};cachedAt=Date.now();return cachedSession;}
 if(r.status===429)return {ok:false,state:"RATE_LIMITED",message:"VRChat temporarily rate-limited login. Add/reuse VRCHAT_AUTH_COOKIE instead of repeatedly creating sessions."};
 return {ok:false,state:"LOGIN_FAILED",message:j?.error?.message||`VRChat login failed (HTTP ${r.status}).`};
}
export async function vrchatStatus(){
 try{const s=await vrchatSession();return {connected:!!s.ok,state:s.ok?"CONNECTED":s.state,user:s.ok?(s.user?.displayName||s.user?.username||null):null,source:s.ok?s.source:null,message:s.ok?null:s.message}}
 catch(e){return {connected:false,state:"UNAVAILABLE",message:e.message}}
}
export async function vrchatAvatar(id){
 if(!/^avtr_[0-9a-f-]+$/i.test(String(id||"")))return {ok:false,state:"INVALID_ID"};
 const s=await vrchatSession(); if(!s.ok)return s;
 const r=await fetch(`${BASE}/avatars/${encodeURIComponent(id)}`,{headers:{...baseHeaders(),Cookie:`auth=${s.auth}`},cache:"no-store",signal:AbortSignal.timeout(12000)});
 const j=await json(r);
 if(r.status===404)return {ok:false,state:"NOT_FOUND"};
 if(r.status===429)return {ok:false,state:"RATE_LIMITED"};
 if(!r.ok)return {ok:false,state:r.status===401?"LOGIN_REQUIRED":"UNAVAILABLE",message:j?.error?.message||`HTTP ${r.status}`};
 const set=new Set();
 for(const p of j?.unityPackages||[]){const x=String(p?.platform||"").toLowerCase();if(x==="standalonewindows")set.add("PC");else if(x==="android")set.add("Android");else if(x==="ios")set.add("iOS")}
 return {ok:true,avatar:j,platforms:[...set]};
}
