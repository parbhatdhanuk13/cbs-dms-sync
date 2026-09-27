const Redis = require("ioredis");
const env = require("../config/env");
const logger = require("../logger");

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  maxRetriesPerRequest: null,       // important — don't drop on retry
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on("connect", () => logger.info("Redis connected", { host: env.REDIS_HOST, port: env.REDIS_PORT }));
redis.on("ready", () => logger.info("Redis ready"));
redis.on("error", (err) => logger.error("Redis error", { error: err.message }));
redis.on("close", () => logger.warn("Redis connection closed"));

module.exports = redis;