const axios = require("axios");
const FormData = require("form-data");
const env = require("../config/env");
const logger = require("../logger");

const dmsHttp = axios.create({
  baseURL: env.DMS_BASE_URL,
  timeout: 180000,
  headers: { "x-api-key": env.DMS_API_KEY },
});

/**
 * Append a form field only if value is meaningful.
 * Skips null, undefined, empty, "null", "undefined".
 */
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
  // Safety — must be bytes
  if (!Buffer.isBuffer(file.buffer)) {
    throw new Error(
      `ingestToDms: file.buffer must be a Buffer (got ${typeof file.buffer}). ` +
      `Did you forget Buffer.from(base64, "base64")?`
    );
  }

  const form = new FormData();

  // ─── Required fields ───
  form.append("documentTypeId", String(documentTypeId));
  form.append("document_index_values", JSON.stringify(documentIndexValues));
  form.append("branchId", String(branchId));
  form.append("attachmentTypeId_1", String(attachmentTypeId));

  // ─── Optional CBS metadata — never breaks if missing ───
  appendIfPresent(form, "cbsSourceKey",       cbsMeta?.sourceKey);
  appendIfPresent(form, "cbsDocumentTypeId",  cbsMeta?.documentTypeId);
  appendIfPresent(form, "cbsDocumentSubType", cbsMeta?.documentSubType);

  // ─── File (raw bytes) ───
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

  return res.data;
}

module.exports = { ingestToDms };