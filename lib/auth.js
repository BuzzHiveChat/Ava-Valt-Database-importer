
import crypto from "crypto";
const secret=()=>process.env.SESSION_SECRET||"";
export function makeSession(){
  const payload=`avavalt:${Date.now()+1000*60*60*24*7}`;
  const sig=crypto.createHmac("sha256",secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}
export function validSession(v){
  try{
    const raw=Buffer.from(v||"","base64url").toString(); const parts=raw.split(":"); if(parts.length!==3||parts[0]!=="avavalt") return false;
    if(Number(parts[1])<Date.now()) return false;
    const payload=`${parts[0]}:${parts[1]}`; const sig=crypto.createHmac("sha256",secret()).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(parts[2]));
  }catch{return false}
}
