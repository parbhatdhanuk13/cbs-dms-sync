const express = require("express");
const router = express.Router();
const { runSync } = require("../services/syncService");

let running = false;

router.get("/health", (req, res) => {
  res.json({ ok: true, running, ts: Date.now() });
});

router.post("/sync", async (req, res) => {
  if (running) {
    return res.status(409).json({ success: false, message: "Sync already running" });
  }
  running = true;
  try {
    const { fromDate, toDate, documentType, branch } = req.body || {};
    const result = await runSync({ fromDate, toDate, documentType, branch });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    running = false;
  }
});

module.exports = router;