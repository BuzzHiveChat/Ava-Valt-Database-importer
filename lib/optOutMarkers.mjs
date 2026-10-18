// Avatar *description* markers are avatar-level requests, never evidence that a
// third-party provider owns a creator account. Keep all matching ID based.
const word=(s,w)=>new RegExp(`(?:^|[^a-zA-Z0-9_])${w}(?=$|[^a-zA-Z0-9_])`,'i').test(String(s||''));
export const AUTO_AVATAR_MARKERS = new Set(['blacklist','unlist','private','do_not_import','do_not_list','do_not_index']);
export function isAutoAvatarMarker(marker){return AUTO_AVATAR_MARKERS.has(String(marker||'').toLowerCase());}
export function detectOptOutMarkers(a){
 const description=String(a?.description||a?.avatarDescription||'');
 const bio=String(a?.authorBio||a?.authorDescription||a?.creatorBio||'');
 let avatar=null;
 if(/\bblack\s*list(?:ed)?\b/i.test(description)&&!/\b(?:not|do\s+not|don'?t)\s+black\s*list\b/i.test(description))avatar='blacklist';
 else if(word(description,'unlist'))avatar='unlist';
 else if(/\b(?:do\s*not|don'?t|no)\s+(?:re-?import|import)(?:ing)?\b/i.test(description))avatar='do_not_import';
 else if(/\b(?:do\s*not|don'?t|no)\s+(?:list|listing|publish|index|indexing)\b/i.test(description))avatar='do_not_list';
 else if(!/\b(?:not|isn'?t|is\s+not)\s+(?:a\s+)?private\b/i.test(description) && (/\b(?:not\s+(?:for\s+)?public|keep\s+(?:it\s+)?private|private\s+avatar)\b/i.test(description) || word(description,'private')))avatar='private';
 const creator=word(bio,'permanent_unlist')?'permanent_unlist':null;
 return {avatar,creator};
}
