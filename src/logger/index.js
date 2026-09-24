const path = require("path");
const fs = require("fs");
const winston = require("winston");
require("winston-daily-rotate-file");
const env = require("../config/env");

if (!fs.existsSync(env.LOG_DIR)) fs.mkdirSync(env.LOG_DIR, { recursive: true });

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format;

// Console format (dev-friendly)
const consoleFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  splat(),
  printf(({ level, message, timestamp, stack, service, ...meta }) => {
    const m = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
    return `[${timestamp}] ${level}: ${message}${m}${stack ? "\n" + stack : ""}`;
  })
);

// File format (JSON, one line per log)
const fileFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json()
);

// All logs → daily rotated
const combinedFile = new winston.transports.DailyRotateFile({
  filename: path.join(env.LOG_DIR, "bridge-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "30d",
  format: fileFormat,
  level: env.LOG_LEVEL,
});

// Errors only → daily rotated
const errorFile = new winston.transports.DailyRotateFile({
  filename: path.join(env.LOG_DIR, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "60d",
  format: fileFormat,
  level: "error",
});

// Sync-specific log (one line per document — easy to grep)
const syncFile = new winston.transports.DailyRotateFile({
  filename: path.join(env.LOG_DIR, "sync-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "30m",
  maxFiles: "90d",
  format: fileFormat,
  level: "info",
});

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: "cbs-dms-bridge" },
  transports: [
    combinedFile,
    errorFile,
    syncFile,
    new winston.transports.Console({
      format: env.NODE_ENV === "development" ? consoleFormat : fileFormat,
    }),
  ],
  exitOnError: false,
});

// Child logger factory — adds context to every log line
logger.child = (meta) => {
  return winston.createLogger({
    level: env.LOG_LEVEL,
    defaultMeta: { service: "cbs-dms-bridge", ...meta },
    transports: [
      combinedFile,
      errorFile,
      syncFile,
      new winston.transports.Console({
        format: env.NODE_ENV === "development" ? consoleFormat : fileFormat,
      }),
    ],
  });
};

// Redaction helper — call before logging any config object
const SENSITIVE = new Set(["password", "token", "authorization", "x-api-key", "apikey"]);
logger.redact = function redact(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const k of Object.keys(obj)) {
    if (SENSITIVE.has(k.toLowerCase())) out[k] = "[REDACTED]";
    else if (typeof obj[k] === "object") out[k] = redact(obj[k]);
    else out[k] = obj[k];
  }
  return out;
};

module.exports = logger;