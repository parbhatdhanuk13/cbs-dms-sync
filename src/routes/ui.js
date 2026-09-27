// src/routes/ui.js
const express = require("express");
const router = express.Router();

const { runSync } = require("../services/syncService");
const queue = require("../services/redisQueue");
const { logBus } = require("../logger/logStream");
const serviceHealth = require("../services/serviceHealth");
const logger = require("../logger");

const state = {
  running: false,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastRunResult: null,
};

router.get("/status", async (req, res) => {
  try {
    const queueStatus = await queue.getQueueStatus();
    const services = serviceHealth.getState();

    res.json({
      success: true,
      state,
      queue: queueStatus,
      services: {
        cbs: services.CBS,
        dms: services.DMS,
      },
      ts: Date.now(),
    });
  } catch (err) {
    logger.error("UI status fetch failed", { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/sync", async (req, res) => {
  if (state.running) {
    return res.status(409).json({ success: false, message: "Sync already running", state });
  }

  state.running = true;
  state.lastRunStartedAt = new Date().toISOString();

  res.json({ success: true, message: "Sync started", state });

  (async () => {
    try {
      const result = await runSync();
      state.lastRunResult = result;
      state.lastRunFinishedAt = new Date().toISOString();
      logger.info("UI-triggered sync finished", { result });
    } catch (err) {
      state.lastRunResult = { error: err.message };
      state.lastRunFinishedAt = new Date().toISOString();
      logger.error("UI-triggered sync failed", { error: err.message });
    } finally {
      state.running = false;
    }
  })();
});

router.get("/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch {}
  }, 15000);

  const onLog = (entry) => {
    try {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    } catch {}
  };

  logBus.on("log", onLog);

  req.on("close", () => {
    clearInterval(heartbeat);
    logBus.removeListener("log", onLog);
  });
});

module.exports = { router, state };