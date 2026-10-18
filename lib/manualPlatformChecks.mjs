// The API checks at most ten avatar IDs per request to protect the community
// services it relies on. A manual check can cover a much larger selection by
// sending these requests sequentially rather than increasing that API limit.
export const PLATFORM_CHECK_BATCH_SIZE = 10;

export function platformCheckBatches(avatars, size = PLATFORM_CHECK_BATCH_SIZE) {
  const requested = Math.trunc(Number(size));
  const batchSize = Number.isFinite(requested) && requested > 0 ? Math.min(PLATFORM_CHECK_BATCH_SIZE, requested) : PLATFORM_CHECK_BATCH_SIZE;
  const seen = new Set();
  const unique = [];
  for (const avatar of avatars || []) {
    if (!avatar?.id || seen.has(avatar.id)) continue;
    seen.add(avatar.id);
    unique.push(avatar);
  }
  const groups = [];
  for (let index = 0; index < unique.length; index += batchSize) {
    groups.push(unique.slice(index, index + batchSize));
  }
  return groups;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runSelectedPlatformChecks({
  avatars,
  requestBatch,
  onBatch = () => {},
  shouldStop = () => false,
  delayMs = 30000,
  wait = sleep
}) {
  const batches = platformCheckBatches(avatars);
  const summary = {
    total: batches.reduce((total, batch) => total + batch.length, 0),
    processed: 0,
    batchesFinished: 0,
    batchCount: batches.length,
    attempted: 0,
    resolved: 0,
    unresolved: 0,
    deferred: 0,
    stopped: false,
    error: null
  };
  for (let i = 0; i < batches.length; i++) {
    if (shouldStop()) { summary.stopped = true; break; }
    try {
      const response = await requestBatch(batches[i], i);
      if (!Array.isArray(response?.avatars)) throw new Error('Platform lookup returned an invalid response.');
      const stats = response.stats || {};
      summary.processed += batches[i].length;
      summary.batchesFinished++;
      summary.attempted += Number(stats.attempted) || 0;
      summary.resolved += Number(stats.resolvedByLookup) || 0;
      summary.deferred += Number(stats.deferred) || 0;
      summary.unresolved += Math.max(0, (Number(stats.unresolved) || 0) - (Number(stats.deferred) || 0));
      await onBatch(response, { ...summary });
    } catch (error) {
      summary.error = error?.message || 'Platform verification failed.';
      break; // Retain earlier successful batches; do not hammer a failing API.
    }
    if (i < batches.length - 1 && !shouldStop() && delayMs > 0) await wait(delayMs);
  }
  if (shouldStop()) summary.stopped = true;
  return summary;
}
