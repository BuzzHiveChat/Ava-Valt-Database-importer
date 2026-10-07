import {platformSetFromAny} from "./platforms";

const BASE="https://avtr.fumikoecho.net";
const timeout=()=>Number(process.env.KITSUNE_WEBSITE_TIMEOUT_MS||4500);
const enabled=()=>process.env.KITSUNE_WEBSITE_PLATFORM_FALLBACK!=="false";
const headers=()=>({
 "Accept":"text/html,application/xhtml+xml",
 "Accept-Language":"en-GB,en;q=0.9",
 "User-Agent":process.env.VRCHAT_USER_AGENT||"Ava-Valt/2.21 (platform metadata resolver)"
});

function decodeHtml(s=""){
 return String(s)
  .replace(/&nbsp;/gi," ")
  .replace(/&amp;/gi,"&")
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,"<")
  .replace(/&gt;/gi,">");
}

function explicitBadgePlatforms(text=""){
 const t=decodeHtml(text).replace(/\s+/g," ");
 const out=new Set();

 // KitsuneDB currently renders badges such as "PC + Quest" on avatar cards.
 // Only accept explicit badge-like combinations here; do not treat the page's
 // global PC / Quest / iOS filter controls as evidence for a particular avatar.
 const comboPatterns=[
  /\bPC\s*\+\s*Quest\s*\+\s*iOS\b/ig,
  /\bPC\s*\+\s*Quest\b/ig,
  /\bPC\s*\+\s*Android\s*\+\s*iOS\b/ig,
  /\bPC\s*\+\s*Android\b/ig,
  /\bPC\s*\+\s*iOS\b/ig,
  /\bQuest\s*\+\s*iOS\b/ig,
  /\bAndroid\s*\+\s*iOS\b/ig,
  /\bPC\s+VR\b/ig
 ];
 for(const re of comboPatterns){
  for(const m of t.matchAll(re)){
   const value=m[0];
   for(const p of platformSetFromAny({platform:value}))out.add(p);
  }
 }

 // Also support platform data embedded in server-rendered JSON / data attributes.
 const jsonish=[
  /"platforms"\s*:\s*(\[[^\]]{0,300}\])/ig,
  /"platform"\s*:\s*"([^"]{1,100})"/ig,
  /"compatibility"\s*:\s*(\[[^\]]{0,300}\])/ig,
  /data-platforms?=["']([^"']{1,150})["']/ig
 ];
 for(const re of jsonish){
  for(const m of t.matchAll(re)){
   const raw=m[1]||"";
   for(const p of platformSetFromAny({platform:raw}))out.add(p);
  }
 }
 return [...out];
}

function scopeAroundAvatar(html,id){
 const raw=String(html||"");
 const lower=raw.toLowerCase(),needle=String(id||"").toLowerCase();
 const at=needle?lower.indexOf(needle):-1;
 if(at>=0)return raw.slice(Math.max(0,at-3500),Math.min(raw.length,at+5000));

 // If an exact-ID search produced one result, use only the result area rather
 // than the header/filter controls.
 const one=/\bRESULTS?\s*1\b/i.exec(decodeHtml(raw));
 if(one){
  const start=Math.max(0,one.index);
  return raw.slice(start,Math.min(raw.length,start+9000));
 }
 return "";
}

async function get(url){
 try{
  const r=await fetch(url,{headers:headers(),cache:"no-store",redirect:"follow",signal:AbortSignal.timeout(timeout())});
  if(!r.ok)return {ok:false,status:r.status,url};
  return {ok:true,status:r.status,url,html:await r.text()};
 }catch(e){return {ok:false,status:0,url,error:e?.message||String(e)}}
}

export async function kitsuneWebsitePlatformLookup(avatar){
 if(!enabled()||!avatar?.id)return {platforms:[],provider:null,attempts:[]};
 const id=String(avatar.id);
 const name=String(avatar.name||"").trim();

 // Exact ID search first. Detail-route guesses are harmless read-only fallbacks
 // because KitsuneDB's visible site routes can change independently of VRCX.
 const urls=[
  `${BASE}/avatars?search=${encodeURIComponent(id)}`,
  `${BASE}/avatars?q=${encodeURIComponent(id)}`,
  `${BASE}/avatars/${encodeURIComponent(id)}`,
  `${BASE}/avatar/${encodeURIComponent(id)}`
 ];
 // A name query is last and accepted only when the rendered page says there is
 // exactly one result. This avoids assigning another avatar's platform by name.
 if(name && name!=="Unknown Avatar")urls.push(`${BASE}/avatars?search=${encodeURIComponent(name)}`);

 const attempts=[];
 for(const url of urls){
  const r=await get(url);
  attempts.push({url,status:r.status,ok:r.ok});
  if(!r.ok)continue;

  const scope=scopeAroundAvatar(r.html,id);
  if(!scope)continue;

  // For name fallback, require a single result or an exact avatar ID in the page.
  const isNameFallback=url.includes(encodeURIComponent(name))&&!url.includes(encodeURIComponent(id));
  if(isNameFallback && !/\bRESULTS?\s*1\b/i.test(decodeHtml(r.html)) &&
     !String(r.html).toLowerCase().includes(id.toLowerCase()))continue;

  const platforms=explicitBadgePlatforms(scope);
  if(platforms.length)return {
   platforms,
   provider:"KitsuneDB Website",
   evidence:"public platform badge",
   url,
   attempts
  };
 }
 return {platforms:[],provider:null,attempts};
}

export {explicitBadgePlatforms};
