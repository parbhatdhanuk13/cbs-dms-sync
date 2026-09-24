const axios = require("axios");
const env = require("../config/env");
const logger = require("../logger");
const { getToken, invalidate } = require("../services/tokenManager");
const { cbsLimiter } = require("../services/rateLimiter");

const cbsHttp = axios.create({
  baseURL: env.CBS_BASE_URL,
  timeout: 60000,
});

async function cbsRequest(method, url, options = {}) {
  return cbsLimiter.schedule(async () => {
    const startedAt = Date.now();
    const token = await getToken();

    try {
      const res = await cbsHttp.request({
        method,
        url,
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      logger.debug("CBS request ok", {
        method,
        url,
        status: res.status,
        ms: Date.now() - startedAt,
      });
      return res.data;
    } catch (err) {
      if (err.response?.status === 401) {
        logger.warn("CBS 401 — invalidating token and retrying", { url });
        invalidate();
        const fresh = await getToken();
        const retry = await cbsHttp.request({
          method,
          url,
          ...options,
          headers: { ...(options.headers || {}), Authorization: `Bearer ${fresh}` },
        });
        return retry.data;
      }
      logger.warn("CBS request failed", {
        method,
        url,
        status: err.response?.status,
        error: err.message,
        ms: Date.now() - startedAt,
      });
      throw err;
    }
  });
}

/**
 * Fetch documents list from CBS.
 * CBS returns 10 docs per page (no page param today — returns first batch).
 * Once CBS supports pagination, add `page` handling.
 */
async function fetchDocuments({ fromDate, toDate, documentType, branch }) {
  const params = new URLSearchParams({
    fromDate,
    toDate,
    documentType: String(documentType ?? -1),
    branch: String(branch ?? -1),
  });
  return cbsRequest("GET", `/api/documents/?${params.toString()}`);
}

async function downloadFile({ documentTypeId, sourceKey }) {
  const params = new URLSearchParams({
    documentTypeId: String(documentTypeId),
    sourceKey: String(sourceKey),
  });
  return cbsRequest("GET", `/api/documents/file?${params.toString()}`);
}

module.exports = { fetchDocuments, downloadFile };