const express = require("express");
const router = express.Router();
const { runSync } = require("../services/syncService");
const queue = require("../services/redisQueue");

let running = false;

router.get("/health", (req, res) => {
  res.json({ ok: true, running, ts: Date.now() });
});

router.get("/status", async (req, res) => {
  const status = await queue.getQueueStatus();
  res.json({ success: true, running, queue: status });
});

router.post("/sync", async (req, res) => {
  if (running) {
    return res.status(409).json({ success: false, message: "Sync already running" });
  }
  running = true;
  try {
    const result = await runSync();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    running = false;
  }
});

module.exports = router;