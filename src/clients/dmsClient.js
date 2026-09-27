// src/clients/dmsClient.js
const axios = require("axios");
const FormData = require("form-data");
const env = require("../config/env");
const logger = require("../logger");
const serviceHealth = require("../services/serviceHealth");

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

  const startedAt = Date.now();

  try {
    const res = await dmsHttp.post("/api/documents/ingest", form, {
      headers: { ...form.getHeaders() },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const ms = Date.now() - startedAt;

    if (res.data?.success !== true) {
      serviceHealth.recordFailure("DMS", {
        error: `success=false: ${res.data?.message || "unknown"}`,
        latencyMs: ms,
        method: "POST",
        url: "/api/documents/ingest",
        httpStatus: res.status,
      });

      const err = new Error(
        `DMS returned success=false for sourceKey=${cbsMeta?.sourceKey}: ${res.data?.message || "unknown"}`
      );
      err.response = res;
      err.nonRetryable = true;
      throw err;
    }

    serviceHealth.recordSuccess("DMS", {
      latencyMs: ms,
      method: "POST",
      url: "/api/documents/ingest",
    });

    logger.info("DMS ingest ok", {
      requestId,
      cbsSourceKey: cbsMeta?.sourceKey,
      dmsDocumentId: res.data?.data?.documentId,
      ms,
    });
    return res.data;
  } catch (err) {
    if (!err.nonRetryable) {
      serviceHealth.recordFailure("DMS", {
        error: err.message,
        latencyMs: Date.now() - startedAt,
        method: "POST",
        url: "/api/documents/ingest",
        httpStatus: err.response?.status,
      });
    }

    logger.error("DMS ingest failed", {
      requestId,
      cbsSourceKey: cbsMeta?.sourceKey,
      status: err.response?.status,
      error: err.message,
      ms: Date.now() - startedAt,
    });
    throw err;
  }
}

module.exports = { ingestToDms };