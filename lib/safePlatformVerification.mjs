// Owner-only, opt-in, low-traffic manual platform verification.
// Uses ONE AviSeek /world/avatars batch fetch for up to ten IDs; no PAW, NSVR,
// AvtrZip, CuteDB or VRChat fallbacks. Uses Upstash REST for a Vercel-wide
// throttle and shared cache. Refuses to call AviSeek if storage isn't working.
export const SAFE_PLATFORM_BATCH_SIZE = 10;
export const SAFE_PLATFORM_SESSION_MAX = 50;
export const SAFE_PLATFORM_INTERVAL_SECONDS = 30;
export const SAFE_PLATFORM_INTERVAL_MS = SAFE_PLATFORM_INTERVAL_SECONDS * 1000;
const CHECK_ID = /^avtr_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CACHE_PREFIX = 'avavalt:safe-platform:v1';
const API = 'https://aviseek.vrchatlegends.com/api/world/avatars';

export function safeVerificationConfig(env = process.env) {
  return {
    enabled: env.SAFE_PLATFORM_VERIFY_ENABLED === 'true' && Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
    ownerOnly: true,
    maxSelection: SAFE_PLATFORM_SESSION_MAX,
    batchSize: SAFE_PLATFORM_BATCH_SIZE,
    intervalMs: SAFE_PLATFORM_INTERVAL_MS,
    provider: 'AviSeek',
    reason: env.SAFE_PLATFORM_VERIFY_ENABLED !== 'true' ? 'Safety mode: bulk platform checks are OFF until you opt in.' : (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) ? 'Shared Redis rate limiting must be configured before checks are enabled.' : null
  };
}

export function sanitizeAvatarInputs(avatars) {
  const seen = new Set(), cleaned = [];
  for (const a of Array.isArray(avatars) ? avatars : []) {
    const id = String(a?.id || '');
    if (!CHECK_ID.test(id) || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    cleaned.push({id, name: String(a.name || '').slice(0, 200), author: String(a.author || '').slice(0, 200), platforms: []});
    if (cleaned.length === SAFE_PLATFORM_BATCH_SIZE) break;
  }
  return cleaned;
}

export function parseAviSeekPlatforms(record) {
  if (!record || typeof record !== 'object') return [];
  const raw = Array.isArray(record.platforms) ? record.platforms : [];
  const platforms = new Set();
  for (const p of raw) {
    const s = String(p || '').toLowerCase();
    if (s === 'pc' || s === 'windows' || s === 'standalonewindows') platforms.add('PC');
    if (s === 'quest' || s === 'android') platforms.add('Android');
    if (s === 'ios') platforms.add('iOS');
  }
  return ['PC', 'Android', 'iOS'].filter(p => platforms.has(p));
}

export class SafeVerifyError extends Error {
  constructor(message, status = 503, retryAfter = null) {
    super(message); this.status = status; this.retryAfter = retryAfter;
  }
}

export async function upstashCommand(command, {env = process.env, fetchImpl = fetch} = {}) {
  const url = String(env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  if (!/^https:\/\//.test(url) || !env.UPSTASH_REDIS_REST_TOKEN) throw new SafeVerifyError('Shared rate limiting is not configured. Checks are disabled.');
  let response;
  try {
    response = await fetchImpl(url, {method: 'POST', headers: {'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json'}, body: JSON.stringify(command), cache: 'no-store', signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  } catch {
    throw new SafeVerifyError('Shared rate limiting is unavailable. No avatar API request was sent.');
  }
}

export async function upstashPipeline(commands, {env = process.env, fetchImpl = fetch} = {}) {
  if (!commands.length) return;
  const url = String(env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  try {
    const response = await fetchImpl(`${url}/pipeline`, {method: 'POST', headers: {'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json'}, body: JSON.stringify(commands), cache: 'no-store', signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data) || data.some(v => v.error)) throw new Error('Cache write rejected');
  } catch {
    // Cache writes are best effort; the global permit is still in effect.
  }
}

export async function verifyAviSeekBatch(avatars, {env = process.env, fetchImpl = fetch, command, pipeline} = {}) {
  if (!safeVerificationConfig(env).enabled) throw new SafeVerifyError('Bulk platform checks are disabled for API safety. Configure Redis and opt in first.', 503);
  const input = sanitizeAvatarInputs(avatars);
  if (!input.length) throw new SafeVerifyError('Select 1 to 10 valid avatar IDs.', 400);
  const cmd = command || (args => upstashCommand(args, {env, fetchImpl}));
  const pipe = pipeline || (args => upstashPipeline(args, {env, fetchImpl}));

  const cached = await cmd(['MGET', ...input.map(a => `${CACHE_PREFIX}:avatar:${a.id.toLowerCase()}`)]);
  if (!Array.isArray(cached) || cached.length !== input.length) throw new SafeVerifyError('Shared cache unavailable. No provider calls were made.');
  const results = new Map(), missing = [];
  for (let i = 0; i < input.length; i++) {
    try {
      const hit = cached[i] ? JSON.parse(cached[i]) : null;
      if (hit && Array.isArray(hit.platforms)) { results.set(input[i].id.toLowerCase(), hit.platforms); continue; }
    } catch {}
    missing.push(input[i]);
  }
  if (missing.length) {
    const cooldown = await cmd(['GET', `${CACHE_PREFIX}:cooldown`]);
    if (cooldown) throw new SafeVerifyError('AviSeek has requested a pause. Please try again later.', 429, Math.max(30, Math.min(3600, Number(cooldown) || 300)));
    const permit = await cmd(['SET', `${CACHE_PREFIX}:global-slot`, '1', 'NX', 'EX', String(SAFE_PLATFORM_INTERVAL_SECONDS)]);
    if (permit !== 'OK') throw new SafeVerifyError('Another platform batch was checked recently. Please wait before trying again.', 429, SAFE_PLATFORM_INTERVAL_SECONDS);
    const url = new URL(API);
    url.searchParams.set('ids', missing.map(a => a.id).join(','));
    let response;
    try {
      response = await fetchImpl(url.toString(), {headers: {Accept: 'application/json', 'User-Agent': 'Ava-Valt/3.0 (safe admin platform review)'}, cache: 'no-store', signal: AbortSignal.timeout(10000)});
    } catch { throw new SafeVerifyError('AviSeek is not responding. Platform checks stopped to avoid more requests.', 503); }
    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const parsed = Number(header);
      const when = Date.parse(header || '');
      const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : Number.isFinite(when) ? Math.ceil((when - Date.now()) / 1000) : 300;
      const waitSeconds = Math.max(30, Math.min(3600, seconds));
      await cmd(['SET', `${CACHE_PREFIX}:cooldown`, String(waitSeconds), 'EX', String(waitSeconds)]);
      throw new SafeVerifyError(`AviSeek is rate-limiting requests. Pausing for at least ${waitSeconds} seconds.`, 429, waitSeconds);
    }
    if (!response.ok) throw new SafeVerifyError(`AviSeek returned HTTP ${response.status}. Checks stopped.`, 503);
    let json;
    try { json = await response.json(); }
    catch { throw new SafeVerifyError('AviSeek returned invalid JSON. Checks stopped.', 503); }
    const found = Array.isArray(json?.avatars) ? json.avatars : Array.isArray(json) ? json : [];
    const byId = new Map(found.filter(x => CHECK_ID.test(String(x?.id || ''))).map(x => [x.id.toLowerCase(), x]));
    const writes = [];
    for (const a of missing) {
      const platforms = parseAviSeekPlatforms(byId.get(a.id.toLowerCase()));
      results.set(a.id.toLowerCase(), platforms);
      writes.push(['SET', `${CACHE_PREFIX}:avatar:${a.id.toLowerCase()}`, JSON.stringify({platforms}), 'EX', String(platforms.length ? 21600 : 1800)]);
    }
    await pipe(writes);
  }
  const now = new Date().toISOString();
  const output = input.map(a => ({...a, platforms: results.get(a.id.toLowerCase()) || [], metadataProvider: 'AviSeek', metadataCheckedAt: now, platformMetadataCheckedAt: now, platformMetadataState: (results.get(a.id.toLowerCase()) || []).length ? 'VERIFIED' : 'UNRESOLVED'}));
  const resolvedByLookup = output.filter(a => a.platforms.length).length;
  return {avatars: output, stats: {input: input.length, attempted: missing.length, resolvedByLookup, unresolved: input.length - resolvedByLookup, deferred: 0, cached: input.length - missing.length}};
}
