// src/services/serviceHealth.js
/**
 * Passive health tracking.
 * Every real CBS/DMS call updates this state.
 */

const state = {
  CBS: {
    name: "CBS",
    status: "UNKNOWN",        // "UP" | "DOWN" | "UNKNOWN"
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    latencyMs: null,
    consecutiveFailures: 0,
    lastMethod: null,
    lastUrl: null,
  },
  DMS: {
    name: "DMS",
    status: "UNKNOWN",
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    latencyMs: null,
    consecutiveFailures: 0,
    lastMethod: null,
    lastUrl: null,
  },
};

const FAILURE_THRESHOLD = 1; // mark down after 1 failure

function recordSuccess(service, { latencyMs, method, url }) {
  const s = state[service];
  if (!s) return;
  s.status = "UP";
  s.lastSuccessAt = new Date().toISOString();
  s.lastError = null;
  s.latencyMs = latencyMs;
  s.consecutiveFailures = 0;
  s.lastMethod = method;
  s.lastUrl = url;
}

function recordFailure(service, { error, latencyMs, method, url, httpStatus }) {
  const s = state[service];
  if (!s) return;
  s.lastFailureAt = new Date().toISOString();
  s.lastError = error || `HTTP ${httpStatus}`;
  s.latencyMs = latencyMs;
  s.consecutiveFailures += 1;
  s.lastMethod = method;
  s.lastUrl = url;

  if (s.consecutiveFailures >= FAILURE_THRESHOLD) {
    s.status = "DOWN";
  }
}

function getState() {
  const now = Date.now();
  const snapshot = {};
  for (const key of Object.keys(state)) {
    const s = state[key];
    const last = s.lastSuccessAt || s.lastFailureAt;
    const ageMs = last ? now - new Date(last).getTime() : null;
    snapshot[key] = {
      name: s.name,
      status: s.status,
      latencyMs: s.latencyMs,
      error: s.lastError,
      lastSuccessAt: s.lastSuccessAt,
      lastFailureAt: s.lastFailureAt,
      consecutiveFailures: s.consecutiveFailures,
      lastMethod: s.lastMethod,
      lastUrl: s.lastUrl,
      ageMs,
    };
  }
  return snapshot;
}

module.exports = { recordSuccess, recordFailure, getState };