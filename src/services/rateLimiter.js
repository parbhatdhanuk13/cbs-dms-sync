const Bottleneck = require("bottleneck");
const env = require("../config/env");

const cbsLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: Math.ceil(60000 / env.CBS_RATE_LIMIT_PER_MIN),
  reservoir: env.CBS_RATE_LIMIT_PER_MIN,
  reservoirRefreshAmount: env.CBS_RATE_LIMIT_PER_MIN,
  reservoirRefreshInterval: 60000,
});

module.exports = { cbsLimiter };