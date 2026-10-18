// UI-only platform review helpers: searches cannot truthfully invent missing builds.
export function reportedPlatforms(avatar) {
  const raw = Array.isArray(avatar?.platforms) ? avatar.platforms : String(avatar?.platforms || '').split(/[•,]/);
  const results = new Set();
  for (const item of raw) {
    const p = String(item || '').trim().toLowerCase();
    if (p === 'pc' || p === 'windows' || p === 'standalonewindows') results.add('PC');
    else if (p === 'quest' || p === 'android') results.add('Android');
    else if (p === 'ios') results.add('iOS');
  }
  return ['PC','Android','iOS'].filter(p=>results.has(p));
}

export function platformReviewCounts(avatars) {
  const list = Array.isArray(avatars) ? avatars : [];
  const verified = list.filter(a => reportedPlatforms(a).length).length;
  return {total:list.length, verified, unknown:list.length-verified};
}

// Select only search results that have explicit PC, Android/Quest, or iOS evidence.
// This includes results on other pagination pages, without provider/API requests.
export function knownPlatformAvatars(avatars) {
  const seen = new Set();
  return (avatars || []).filter(avatar => {
    const id = String(avatar?.id || '').toLowerCase();
    if (!id || seen.has(id) || !reportedPlatforms(avatar).length) return false;
    seen.add(id);
    return true;
  });
}

export function pendingPlatformChecks(avatars, max=50) {
  const seen = new Set(), pending = [];
  for (const avatar of avatars || []) {
    if (!avatar?.id || seen.has(avatar.id.toLowerCase()) || avatar.safePlatformCheckCompleted || reportedPlatforms(avatar).length) continue;
    seen.add(avatar.id.toLowerCase());
    pending.push(avatar);
    if (pending.length >= max) break;
  }
  return pending;
}

// Preserve discovery metadata and previously known platform evidence. Exact IDs only.
export function applyPlatformCheckResults(existing, checked) {
  const updates = new Map((checked || []).filter(x=>x?.id).map(x => [x.id.toLowerCase(), x]));
  return (existing || []).map(a => {
    const result = updates.get(String(a.id || '').toLowerCase());
    if (!result) return a;
    const platforms = ['PC','Android','iOS'].filter(p=>reportedPlatforms(a).includes(p)||reportedPlatforms(result).includes(p));
    return {...a, platforms, safePlatformCheckCompleted:true,
      platformMetadataCheckedAt:result.platformMetadataCheckedAt,
      platformMetadataState:platforms.length?'VERIFIED':'UNRESOLVED',
      metadataProvider:platforms.length && !reportedPlatforms(a).length ? result.metadataProvider : a.metadataProvider,
      sourceProviders:a.sourceProviders};
  });
}

export function filterAvatarCards(avatars, {platform='All',source='All',verifiedOnly=true}={}) {
  return (avatars || []).filter(a => {
    const platforms=reportedPlatforms(a);
    return (!verifiedOnly || platforms.length>0)
      && (platform==='All'||platforms.includes(platform))
      && (source==='All'||(a.sourceProviders||[a.metadataProvider]).includes(source));
  });
}
