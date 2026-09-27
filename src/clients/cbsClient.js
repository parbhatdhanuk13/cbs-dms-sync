// src/clients/cbsClient.js
const axios = require("axios");
const env = require("../config/env");
const logger = require("../logger");
const { getToken, invalidate } = require("../services/tokenManager");
const { cbsLimiter } = require("../services/rateLimiter");
const serviceHealth = require("../services/serviceHealth");

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
      const ms = Date.now() - startedAt;

      serviceHealth.recordSuccess("CBS", { latencyMs: ms, method, url });

      logger.debug("CBS request ok", { method, url, status: res.status, ms });
      return res.data;
    } catch (err) {
      const ms = Date.now() - startedAt;

      if (err.response?.status === 401) {
        logger.warn("CBS 401 — invalidating token and retrying", { url });
        invalidate();
        const fresh = await getToken();
        try {
          const retry = await cbsHttp.request({
            method,
            url,
            ...options,
            headers: { ...(options.headers || {}), Authorization: `Bearer ${fresh}` },
          });
          serviceHealth.recordSuccess("CBS", {
            latencyMs: Date.now() - startedAt,
            method,
            url,
          });
          return retry.data;
        } catch (retryErr) {
          serviceHealth.recordFailure("CBS", {
            error: retryErr.message,
            latencyMs: Date.now() - startedAt,
            method,
            url,
            httpStatus: retryErr.response?.status,
          });
          throw retryErr;
        }
      }

      serviceHealth.recordFailure("CBS", {
        error: err.message,
        latencyMs: ms,
        method,
        url,
        httpStatus: err.response?.status,
      });

      logger.warn("CBS request failed", {
        method,
        url,
        status: err.response?.status,
        error: err.message,
        ms,
      });
      throw err;
    }
  });
}

async function fetchDocuments({ fromDate, toDate }) {
  const params = new URLSearchParams({
    fromDate,
    toDate,
    documentType: "-1",
    branch: "-1",
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