const axios = require("axios");
const FormData = require("form-data");
const env = require("../config/env");
const logger = require("../logger");

const dmsHttp = axios.create({
  baseURL: env.DMS_BASE_URL,
  timeout: 180000,
  headers: { "x-api-key": env.DMS_API_KEY },
});

function appendIfPresent(form, key, value) {
  if (value === undefined || value === null) return;
  const str = String(value).trim();
  if (str === "" || str === "null" || str === "undefined") return;
  form.append(key, str);
}

async function ingestToDms({
  documentTypeId,
  documentIndexValues,
  branchId,
  attachmentTypeId,
  file,
  cbsMeta,
  requestId,
}) {
  if (!Buffer.isBuffer(file.buffer)) {
    throw new Error(
      `ingestToDms: file.buffer must be a Buffer (got ${typeof file.buffer})`
    );
  }

  const form = new FormData();
  form.append("documentTypeId", String(documentTypeId));
  form.append("document_index_values", JSON.stringify(documentIndexValues));
  form.append("branchId", String(branchId));
  form.append("attachmentTypeId_1", String(attachmentTypeId));

  appendIfPresent(form, "cbsSourceKey", cbsMeta?.sourceKey);
  appendIfPresent(form, "cbsDocumentTypeId", cbsMeta?.documentTypeId);
  appendIfPresent(form, "cbsDocumentSubType", cbsMeta?.documentSubType);

  form.append("files_1", file.buffer, {
    filename: file.fileName,
    contentType: file.contentType,
  });

  logger.debug("Sending to DMS", {
    requestId,
    sourceKey: cbsMeta?.sourceKey ?? null,
    fileName: file.fileName,
    sizeBytes: file.buffer.length,
    mime: file.contentType,
  });

  const res = await dmsHttp.post("/api/documents/ingest", form, {
    headers: { ...form.getHeaders() },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  logger.info("DMS response received", {
    requestId,
    cbsSourceKey: cbsMeta?.sourceKey,
    success: res.data?.success,
    documentId: res.data?.data?.documentId,
  });

  // ═══════════════════════════════════════════════════════════════
  // ⚠️  Contract: only return if DMS said success: true
  // Otherwise throw — caller keeps doc in Redis for retry
  // ═══════════════════════════════════════════════════════════════
  if (res.data?.success !== true) {
    const err = new Error(
      `DMS returned success=${res.data?.success} for sourceKey=${cbsMeta?.sourceKey}: ` +
      `${res.data?.message || "unknown"}`
    );
    err.response = res;
    err.nonRetryable = true;
    throw err;
  }

  return res.data;
}

module.exports = { ingestToDms };