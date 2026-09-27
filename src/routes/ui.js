// src/routes/ui.js
const express = require("express");
const router = express.Router();

const { runSync } = require("../services/syncService");
const queue = require("../services/redisQueue");
const { logBus } = require("../logger/logStream");
const logger = require("../logger");

// ─── Shared runtime state for the UI ───
const state = {
  running: false,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastRunResult: null,
};

// ═══════════════════════════════════════════════════════════════
// GET /ui/status — current state + queue counts
// ═══════════════════════════════════════════════════════════════
router.get("/status", async (req, res) => {
  try {
    const queueStatus = await queue.getQueueStatus();
    res.json({
      success: true,
      state,
      queue: queueStatus,
      ts: Date.now(),
    });
  } catch (err) {
    logger.error("UI status fetch failed", { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /ui/sync — trigger a sync (non-blocking)
// ═══════════════════════════════════════════════════════════════
router.post("/sync", async (req, res) => {
  if (state.running) {
    return res.status(409).json({
      success: false,
      message: "Sync already running",
      state,
    });
  }

  state.running = true;
  state.lastRunStartedAt = new Date().toISOString();

  // Respond immediately — sync runs in background
  res.json({ success: true, message: "Sync started", state });

  // Fire and forget
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

// ═══════════════════════════════════════════════════════════════
// GET /ui/logs/stream — Server-Sent Events live log stream
// ═══════════════════════════════════════════════════════════════
router.get("/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // for nginx
  res.flushHeaders();

  // Initial comment to open the stream
  res.write(": connected\n\n");

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      // client gone
    }
  }, 15000);

  // Forward every log event to this SSE client
  const onLog = (entry) => {
    try {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    } catch {
      // client disconnected mid-write
    }
  };

  logBus.on("log", onLog);

  // Cleanup when client disconnects
  req.on("close", () => {
    clearInterval(heartbeat);
    logBus.removeListener("log", onLog);
  });
});

module.exports = { router, state };