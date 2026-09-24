const axios = require("axios");
const env = require("../config/env");
const logger = require("../logger");

let cache = { token: null, expiresAt: 0 };
let inflight = null;

async function login() {
  const startedAt = Date.now();
  logger.info("CBS login start");
  try {
    const res = await axios.post(
      `${env.CBS_BASE_URL}/api/documents/login`,
      { username: env.CBS_USERNAME, password: env.CBS_PASSWORD },
      { timeout: 30000 }
    );
    const body = res.data.body;
    const expiresAt = new Date(body.expiresAt).getTime();
    logger.info("CBS login success", {
      expiresAt: body.expiresAt,
      ms: Date.now() - startedAt,
    });
    return { token: body.token, expiresAt };
  } catch (err) {
    logger.error("CBS login failed", {
      status: err.response?.status,
      error: err.message,
    });
    throw err;
  }
}

async function getToken() {
  const now = Date.now();
  if (cache.token && cache.expiresAt - now > env.CBS_TOKEN_REFRESH_MARGIN_MS) {
    return cache.token;
  }
  if (!inflight) {
    inflight = login()
      .then((t) => {
        cache = t;
        return t.token;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function invalidate() {
  logger.warn("CBS token invalidated");
  cache = { token: null, expiresAt: 0 };
}

module.exports = { getToken, invalidate, login };