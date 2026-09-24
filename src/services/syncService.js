const { v4: uuidv4 } = require("uuid");
const pLimit = require("p-limit");
const env = require("../config/env");
const logger = require("../logger");
const { fetchDocuments, downloadFile } = require("../clients/cbsClient");
const { ingestToDms } = require("../clients/dmsClient");
const { mapBranch, mapAttachmentType, buildIndexValues } = require("./mapper");
const { detectMime, mimeFromExtension } = require("./mimeDetector");
const { DMS_DOCUMENT_TYPE_ID } = require("../config/mappings");

// ─── MIME types DMS accepts (must mirror DMS's Section 3 list) ───
const DMS_ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// ─── Retryability check ───
function isRetryable(err) {
  if (err.name === "MappingError") return false;
  if (err.response) {
    const s = err.response.status;
    if (s >= 400 && s < 500 && s !== 408 && s !== 429) return false;
    return true;
  }
  if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND"].includes(err.code)) return true;
  return true;
}

// ─── Retry with exponential backoff + non-retryable short-circuit ───
async function withRetry(fn, { attempts = 3, baseMs = 1000, label = "op" } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err)) {
        logger.warn(`${label} failed (non-retryable)`, {
          attempt: i + 1,
          status: err.response?.status,
          error: err.message,
        });
        throw err;
      }

      if (i < attempts - 1) {
        const wait = baseMs * Math.pow(2, i);
        logger.warn(`${label} failed, retrying`, {
          attempt: i + 1,
          of: attempts,
          waitMs: wait,
          status: err.response?.status,
          error: err.message,
        });
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

// ─── Process one CBS document ───
async function processDocument(cbsDoc, { requestId }) {
  const { documentTypeId, sourceKey, branchId } = cbsDoc;

  // 1. Map CBS → DMS
  const dmsBranchId = mapBranch(branchId);
  const dmsAttachmentTypeId = mapAttachmentType(documentTypeId);
  const documentIndexValues = buildIndexValues(cbsDoc);

  // 2. Download from CBS
  const fileResp = await withRetry(
    () => downloadFile({ documentTypeId, sourceKey }),
    {
      attempts: env.MAX_RETRY_ATTEMPTS,
      baseMs: env.RETRY_BACKOFF_MS,
      label: `CBS download ${sourceKey}`,
    }
  );

  if (!fileResp?.baseString) {
    throw new Error(`CBS returned empty file for sourceKey=${sourceKey}`);
  }

  // 3. Base64 → bytes
  const buffer = Buffer.from(fileResp.baseString, "base64");

  // 4. Detect real MIME from bytes (CBS's contentType is useless)
  const realMime = detectMime(buffer);
  const extMime = mimeFromExtension(fileResp.fileName);
  const finalMime =
    realMime !== "application/octet-stream" ? realMime : extMime || "application/octet-stream";

  if (extMime && realMime !== "application/octet-stream" && extMime !== realMime) {
    logger.warn("MIME / extension mismatch", {
      requestId,
      sourceKey,
      fileName: fileResp.fileName,
      extMime,
      realMime,
    });
  }

  // 5. Fail early if MIME isn't accepted by DMS
  if (!DMS_ALLOWED_MIMES.has(finalMime)) {
    throw new Error(
      `MIME ${finalMime} not accepted by DMS (fileName=${fileResp.fileName}, sourceKey=${sourceKey})`
    );
  }

  // 6. Send to DMS
  const result = await withRetry(
    () =>
      ingestToDms({
        documentTypeId: DMS_DOCUMENT_TYPE_ID,
        documentIndexValues,
        branchId: dmsBranchId,
        attachmentTypeId: dmsAttachmentTypeId,
        file: {
          buffer,
          fileName: fileResp.fileName,
          contentType: finalMime,
        },
        cbsMeta: {
          sourceKey,
          documentTypeId,
          documentSubType: cbsDoc.documentSubType,
        },
        requestId,
      }),
    {
      attempts: env.MAX_RETRY_ATTEMPTS,
      baseMs: env.RETRY_BACKOFF_MS,
      label: `DMS ingest ${sourceKey}`,
    }
  );

  return {
    sourceKey,
    fileName: fileResp.fileName,
    sizeKb: Math.round(buffer.length / 1024),
    mime: finalMime,
    dmsDocumentId: result?.data?.documentId,
  };
}

// ─── Run one sync batch ───
async function runSync({ fromDate, toDate, documentType, branch } = {}) {
  const requestId = uuidv4();
  const runLogger = logger.child({ requestId });

  const payload = {
    fromDate: fromDate || env.SYNC_FROM_DATE,
    toDate: toDate || env.SYNC_TO_DATE,
    documentType: documentType ?? env.SYNC_DOCUMENT_TYPE,
    branch: branch ?? env.SYNC_BRANCH,
  };

  runLogger.info("SYNC START", { payload });
  const startedAt = Date.now();

  // 1. Fetch list
  const listResp = await fetchDocuments(payload);
  const docs = listResp.documents || [];

  runLogger.info("SYNC LIST FETCHED", {
    count: docs.length,
    totalCount: listResp.totalCount,
    pageSize: listResp.pageSize,
  });

  if (docs.length === 0) {
    runLogger.info("SYNC COMPLETE (nothing to do)", { ms: Date.now() - startedAt });
    return { requestId, total: 0, success: 0, failed: 0, ms: Date.now() - startedAt };
  }

  // 2. Process with bounded concurrency
  const limit = pLimit(Math.max(1, env.DOWNLOAD_CONCURRENCY));
  const results = await Promise.allSettled(
    docs.map((doc) => limit(() => processDocument(doc, { requestId })))
  );

  // 3. Aggregate results
  const ok = [];
  const failed = [];
  results.forEach((r, idx) => {
    const cbsDoc = docs[idx];
    if (r.status === "fulfilled") {
      ok.push(r.value);
      runLogger.info("SYNC DOC OK", {
        sourceKey: cbsDoc.sourceKey,
        fileName: r.value.fileName,
        sizeKb: r.value.sizeKb,
        mime: r.value.mime,
        dmsDocumentId: r.value.dmsDocumentId,
      });
    } else {
      failed.push({ cbsDoc, err: r.reason });
      runLogger.error("SYNC DOC FAILED", {
        sourceKey: cbsDoc.sourceKey,
        documentTypeId: cbsDoc.documentTypeId,
        branchId: cbsDoc.branchId,
        error: r.reason?.message,
        stack: r.reason?.stack,
      });
    }
  });

  const summary = {
    requestId,
    total: docs.length,
    success: ok.length,
    failed: failed.length,
    ms: Date.now() - startedAt,
  };
  runLogger.info("SYNC COMPLETE", summary);
  return summary;
}

module.exports = { runSync, processDocument };