const uniq=a=>[...new Set(a)];

function addToken(out,value){
 if(value==null||value===false)return;
 if(Array.isArray(value)){for(const v of value)addToken(out,v);return}
 if(typeof value==="object"){
  // VRChat unityPackages + provider wrappers.
  if(value.platform!=null)addToken(out,value.platform);
  if(value.platformName!=null)addToken(out,value.platformName);
  if(value.targetPlatform!=null)addToken(out,value.targetPlatform);
  return;
 }
 const p=String(value).trim().toLowerCase();
 if(!p||p==="unknown")return;
 // Important: standalonewindows must NOT also become Android.
 if(p==="w"||p==="pc"||p.includes("standalonewindows")||p.includes("windows")||p==="win32"||p==="win64"){
  out.add("PC"); return;
 }
 if(p==="a"||p.includes("android")||p.includes("quest")){
  out.add("Android"); return;
 }
 if(p==="i"||p.includes("ios")||p.includes("iphone")||p.includes("ipad")){
  out.add("iOS"); return;
 }
}

const firstNonEmpty=(...v)=>v.find(x=>typeof x==="string"&&x.trim())||"";

export function platformSetFromAny(x){
 const out=new Set();
 if(!x)return [];
 for(const k of ["platforms","platform","compatibility","supportedPlatforms","supported_platforms"]){
  addToken(out,x[k]);
 }
 for(const k of ["unityPackages","unity_packages","packages","versions"]){
  addToken(out,x[k]);
 }
 if(x.pc===true||x.windows===true||x.hasPc===true||x.has_pc===true)out.add("PC");
 if(x.android===true||x.quest===true||x.hasAndroid===true||x.has_android===true)out.add("Android");
 if(x.ios===true||x.hasIos===true||x.has_ios===true)out.add("iOS");

 // Port of the Unity importer's VRCX performance fallback:
 // if explicit platform arrays are absent, performance fields still prove a build exists.
 if(out.size===0){
  const perf=x.performance||x.perf||{};
  const pc=firstNonEmpty(perf.standalonewindows,perf.pc,perf.pc_rating,perf.pcRating,
                         x.performancePc,x.performance_pc);
  const android=firstNonEmpty(perf.android,perf.android_rating,perf.androidRating,
                              perf.quest,perf.quest_rating,perf.questRating,
                              x.performanceAndroid,x.performance_android);
  const ios=firstNonEmpty(perf.ios,perf.ios_rating,perf.iosRating,
                          x.performanceIos,x.performance_ios);
  if(pc)out.add("PC");
  if(android)out.add("Android");
  if(ios)out.add("iOS");
 }
 return [...out];
}

export function hasKnownPlatform(a){return platformSetFromAny(a).length>0}
export function normalizedPlatformString(a){return platformSetFromAny(a).join(" • ")}
export function normalizeAvatarPlatforms(a){
 const platforms=platformSetFromAny(a);
 return platforms.length?{...a,platforms}:a;
}
