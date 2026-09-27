const redis = require("./redisClient");
const logger = require("../logger");

// ─── Redis keys ───
const KEYS = {
  pending: "sync:pending",
  processing: "sync:processing",
  doc: (sourceKey) => `sync:doc:${sourceKey}`,
  done: (sourceKey) => `sync:done:${sourceKey}`,
  statsSuccess: "sync:stats:success",
  statsFailed: "sync:stats:failed",
  statsLastRun: "sync:stats:lastRun",
};

// ═══════════════════════════════════════════════════════════════
// RECOVERY — Move any leftover "processing" items back to "pending"
// Call this on bridge startup
// ═══════════════════════════════════════════════════════════════
async function recoverProcessing() {
  let recovered = 0;
  while (true) {
    const moved = await redis.rpoplpush(KEYS.processing, KEYS.pending);
    if (moved === null) break;
    recovered++;
  }
  if (recovered > 0) {
    logger.warn("Recovered in-flight docs from previous crash", { count: recovered });
  }
  return recovered;
}

// ═══════════════════════════════════════════════════════════════
// ENQUEUE — Add doc to pending queue (skip if already known)
// ═══════════════════════════════════════════════════════════════
async function enqueueDoc(doc) {
  const { sourceKey } = doc;

  const [existsPending, existsDone] = await Promise.all([
    redis.exists(KEYS.doc(sourceKey)),
    redis.exists(KEYS.done(sourceKey)),
  ]);

  if (existsPending || existsDone) return false;

  await redis.set(KEYS.doc(sourceKey), JSON.stringify(doc));
  await redis.lpush(KEYS.pending, sourceKey);
  return true;
}

async function enqueueBatch(docs) {
  let added = 0;
  for (const doc of docs) {
    const ok = await enqueueDoc(doc);
    if (ok) added++;
  }
  logger.info("Enqueued batch to Redis", { total: docs.length, added });
  return added;
}

// ═══════════════════════════════════════════════════════════════
// CLAIM — Atomically pop next item from pending → processing
// Returns { sourceKey, doc } or null if empty
// ═══════════════════════════════════════════════════════════════
async function claimNext() {
  const sourceKey = await redis.rpoplpush(KEYS.pending, KEYS.processing);
  if (!sourceKey) return null;

  const raw = await redis.get(KEYS.doc(sourceKey));
  if (!raw) {
    await redis.lrem(KEYS.processing, 1, sourceKey);
    logger.warn("Orphaned sourceKey in processing (no metadata)", { sourceKey });
    return null;
  }

  return { sourceKey, doc: JSON.parse(raw) };
}

// ═══════════════════════════════════════════════════════════════
// COMPLETE — Move to done, remove from processing
// ONLY call after DMS responds with success: true
// ═══════════════════════════════════════════════════════════════
async function completeDoc(sourceKey) {
  const pipeline = redis.pipeline();
  pipeline.lrem(KEYS.processing, 1, sourceKey);
  pipeline.rename(KEYS.doc(sourceKey), KEYS.done(sourceKey));
  pipeline.incr(KEYS.statsSuccess);
  await pipeline.exec();
  logger.info("Doc marked complete in Redis", { sourceKey });
}

// ═══════════════════════════════════════════════════════════════
// FAIL — Do NOT remove. Leave in processing for recovery on restart
// ═══════════════════════════════════════════════════════════════
async function markFailed(sourceKey, errorMsg) {
  await redis.hset(`${KEYS.doc(sourceKey)}:meta`, {
    lastError: errorMsg || "unknown",
    failedAt: new Date().toISOString(),
  });
  await redis.incr(KEYS.statsFailed);
}

// ═══════════════════════════════════════════════════════════════
// STATUS HELPERS
// ═══════════════════════════════════════════════════════════════
async function getQueueLengths() {
  const [pending, processing] = await Promise.all([
    redis.llen(KEYS.pending),
    redis.llen(KEYS.processing),
  ]);
  return { pending, processing };
}

async function hasPendingWork() {
  const { pending, processing } = await getQueueLengths();
  return pending + processing > 0;
}

async function getQueueStatus() {
  const [pending, processing, success, failed, lastRun] = await Promise.all([
    redis.llen(KEYS.pending),
    redis.llen(KEYS.processing),
    redis.get(KEYS.statsSuccess),
    redis.get(KEYS.statsFailed),
    redis.get(KEYS.statsLastRun),
  ]);

  return {
    pending: Number(pending),
    processing: Number(processing),
    success: Number(success || 0),
    failed: Number(failed || 0),
    lastRun,
  };
}

async function setLastRunAt(iso) {
  await redis.set(KEYS.statsLastRun, iso);
}

module.exports = {
  KEYS,
  recoverProcessing,
  enqueueDoc,
  enqueueBatch,
  claimNext,
  completeDoc,
  markFailed,
  getQueueLengths,
  hasPendingWork,
  getQueueStatus,
  setLastRunAt,
};