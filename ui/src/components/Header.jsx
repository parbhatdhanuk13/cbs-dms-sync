import React from "react";

export function Header({ running, triggering, lastRunFinishedAt, onSync }) {
  const lastRun = lastRunFinishedAt
    ? `last run finished at ${new Date(lastRunFinishedAt).toLocaleTimeString()}`
    : "";

  return (
    <header>
      <h1>
        CBS → DMS Bridge
        {lastRun && <span> — {lastRun}</span>}
      </h1>
      <button
        className={running ? "running" : ""}
        onClick={onSync}
        disabled={running || triggering}
      >
        {running
          ? "Running... ⏳"
          : triggering
          ? "Starting..."
          : "Start Sync ▶"}
      </button>
    </header>
  );
}