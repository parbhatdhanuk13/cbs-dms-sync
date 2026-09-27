const { v4: uuidv4 } = require("uuid");
const env = require("../config/env");
const logger = require("../logger");
const { fetchDocuments, downloadFile } = require("../clients/cbsClient");
const { ingestToDms } = require("../clients/dmsClient");
const { mapBranch, mapAttachmentType, buildIndexValues } = require("./mapper");
const { detectMime, mimeFromExtension } = require("./mimeDetector");
const { DMS_DOCUMENT_TYPE_ID } = require("../config/mappings");
const queue = require("./redisQueue");

const DMS_ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// ─── Retry helpers ───
function isRetryable(err) {
  if (err.name === "MappingError") return false;
  if (err.nonRetryable) return false;
  if (err.response) {
    const s = err.response.status;
    return !(s >= 400 && s < 500 && s !== 408 && s !== 429);
  }
  return true;
}

async function withRetry(fn, { attempts = 3, baseMs = 1000, label = "op" } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err;
      if (i < attempts - 1) {
        const wait = baseMs * Math.pow(2, i);
        logger.warn(`${label} failed, retrying`, { attempt: i + 1, wait, error: err.message });
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

// ═══════════════════════════════════════════════════════════════
// Process ONE document end-to-end
// Returns summary on success, throws on failure
// ═══════════════════════════════════════════════════════════════
async function processDocument(cbsDoc, { requestId }) {
  const { documentTypeId, sourceKey, branchId } = cbsDoc;

  const dmsBranchId = mapBranch(branchId);
  const dmsAttachmentTypeId = mapAttachmentType(documentTypeId);
  const documentIndexValues = buildIndexValues(cbsDoc);

  // 1. Download from CBS
  const fileResp = await withRetry(
    () => downloadFile({ documentTypeId, sourceKey }),
    { attempts: env.MAX_RETRY_ATTEMPTS, baseMs: env.RETRY_BACKOFF_MS, label: `CBS download ${sourceKey}` }
  );

  if (!fileResp?.baseString) {
    const err = new Error(`CBS returned empty file for sourceKey=${sourceKey}`);
    err.nonRetryable = true;
    throw err;
  }

  const buffer = Buffer.from(fileResp.baseString, "base64");
  if (buffer.length === 0) {
    const err = new Error(`CBS returned 0-byte file for sourceKey=${sourceKey}`);
    err.nonRetryable = true;
    throw err;
  }

  const realMime = detectMime(buffer);
  const extMime = mimeFromExtension(fileResp.fileName);
  const finalMime = realMime !== "application/octet-stream" ? realMime : extMime || "application/octet-stream";

  if (!DMS_ALLOWED_MIMES.has(finalMime)) {
    const err = new Error(`MIME ${finalMime} not accepted by DMS (sourceKey=${sourceKey})`);
    err.nonRetryable = true;
    throw err;
  }

  // 2. Send to DMS — ingestToDms THROWS unless success === true
  const result = await withRetry(
    () =>
      ingestToDms({
        documentTypeId: DMS_DOCUMENT_TYPE_ID,
        documentIndexValues,
        branchId: dmsBranchId,
        attachmentTypeId: dmsAttachmentTypeId,
        file: { buffer, fileName: fileResp.fileName, contentType: finalMime },
        cbsMeta: { sourceKey, documentTypeId, documentSubType: cbsDoc.documentSubType },
        requestId,
      }),
    { attempts: env.MAX_RETRY_ATTEMPTS, baseMs: env.RETRY_BACKOFF_MS, label: `DMS ingest ${sourceKey}` }
  );

  return {
    sourceKey,
    fileName: fileResp.fileName,
    sizeKb: Math.round(buffer.length / 1024),
    mime: finalMime,
    dmsDocumentId: result?.data?.documentId,
  };
}

// ═══════════════════════════════════════════════════════════════
// DRAIN QUEUE — Process every doc in Redis ONE BY ONE
// Stops only when queue is empty
// ═══════════════════════════════════════════════════════════════
async function drainQueue({ requestId, runLogger }) {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  while (true) {
    // Peek queue length first
    const lengths = await queue.getQueueLengths();
    if (lengths.pending === 0) break;

    // Claim next doc (moves pending → processing)
    const claimed = await queue.claimNext();
    if (!claimed) break;

    const { sourceKey, doc: cbsDoc } = claimed;
    processed++;

    runLogger.info("PROCESSING DOC", {
      sourceKey,
      index: processed,
      remaining: lengths.pending - 1,
    });

    try {
      const result = await processDocument(cbsDoc, { requestId });

      // ✅ DMS said success:true → remove from Redis
      await queue.completeDoc(sourceKey);
      succeeded++;

      runLogger.info("DOC SUCCESS", {
        sourceKey,
        dmsDocumentId: result.dmsDocumentId,
        fileName: result.fileName,
      });
    } catch (err) {
      failed++;
      // ❌ Keep in Redis — will retry on next /sync
      await queue.markFailed(sourceKey, err.message);
      runLogger.error("DOC FAILED", {
        sourceKey,
        error: err.message,
        willRetry: true,
      });
    }
  }

  return { processed, succeeded, failed };
}

// ═══════════════════════════════════════════════════════════════
// FETCH FROM CBS — only called when Redis queue is empty
// ═══════════════════════════════════════════════════════════════
async function fetchAndEnqueueFromCbs({ runLogger }) {
  try {
    const listResp = await fetchDocuments({
      fromDate: env.SYNC_FROM_DATE,
      toDate: env.SYNC_TO_DATE,
    });

    const docs = listResp.documents || [];
    runLogger.info("CBS LIST FETCHED", { count: docs.length, totalCount: listResp.totalCount });

    if (docs.length === 0) return 0;

    const added = await queue.enqueueBatch(docs);
    runLogger.info("ENQUEUED TO REDIS", {
      fetched: docs.length,
      newlyAdded: added,
      alreadyKnown: docs.length - added,
    });

    return added;
  } catch (err) {
    runLogger.error("CBS LIST FETCH FAILED", { error: err.message });
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY — runSync()
// ═══════════════════════════════════════════════════════════════
async function runSync() {
  const requestId = uuidv4();
  const runLogger = logger.child({ requestId });
  const startedAt = Date.now();

  runLogger.info("SYNC START", {
    fromDate: env.SYNC_FROM_DATE,
    toDate: env.SYNC_TO_DATE,
  });

  // ─── STEP 1: Recover crashed items ───
  await queue.recoverProcessing();

  // ─── STEP 2: Show current queue state ───
  const initialLengths = await queue.getQueueLengths();
  runLogger.info("QUEUE STATE ON START", initialLengths);

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Drain existing queue FIRST (no CBS call yet)
  // ═══════════════════════════════════════════════════════════════
  if (initialLengths.pending > 0) {
    runLogger.info("DRAINING EXISTING QUEUE", { pending: initialLengths.pending });

    const drainResult = await drainQueue({ requestId, runLogger });
    totalProcessed += drainResult.processed;
    totalSucceeded += drainResult.succeeded;
    totalFailed += drainResult.failed;

    runLogger.info("QUEUE DRAINED", drainResult);

    // If any failed → STOP. Don't call CBS. User must fix.
    if (drainResult.failed > 0) {
      const summary = {
        requestId,
        processed: totalProcessed,
        succeeded: totalSucceeded,
        failed: totalFailed,
        queueStatus: await queue.getQueueStatus(),
        ms: Date.now() - startedAt,
        note: "Queue not empty (failures). Restart sync to retry.",
      };
      runLogger.warn("STOPPING — failures remain in queue", summary);
      return summary;
    }
  } else {
    runLogger.info("QUEUE EMPTY — will fetch from CBS");
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Only NOW fetch from CBS (queue is empty)
  // ═══════════════════════════════════════════════════════════════
  let fetchRound = 0;
  const MAX_FETCH_ROUNDS = 100;

  while (fetchRound < MAX_FETCH_ROUNDS) {
    fetchRound++;

    // Double-check queue is empty before fetching
    const lengths = await queue.getQueueLengths();
    if (lengths.pending > 0 || lengths.processing > 0) {
      runLogger.warn("Queue not empty — skipping CBS fetch", lengths);
      break;
    }

    runLogger.info("FETCHING FROM CBS", { round: fetchRound });
    const added = await fetchAndEnqueueFromCbs({ runLogger });

    if (added === 0) {
      runLogger.info("No new documents from CBS — done");
      break;
    }

    // Process newly added docs
    const drainResult = await drainQueue({ requestId, runLogger });
    totalProcessed += drainResult.processed;
    totalSucceeded += drainResult.succeeded;
    totalFailed += drainResult.failed;

    runLogger.info("ROUND COMPLETE", { round: fetchRound, ...drainResult });

    if (drainResult.failed > 0) {
      runLogger.warn("Stopping — failures remain");
      break;
    }
  }

  // ─── STEP 5: Summary ───
  const summary = {
    requestId,
    processed: totalProcessed,
    succeeded: totalSucceeded,
    failed: totalFailed,
    fetchRounds: fetchRound,
    queueStatus: await queue.getQueueStatus(),
    ms: Date.now() - startedAt,
  };

  await queue.setLastRunAt(new Date().toISOString());
  runLogger.info("SYNC COMPLETE", summary);
  return summary;
}

module.exports = { runSync, processDocument, drainQueue, fetchAndEnqueueFromCbs };