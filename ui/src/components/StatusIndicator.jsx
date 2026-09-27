import React from "react";

export function StatusIndicator({ running, lastUpdate, logsConnected }) {
  return (
    <div className="status-line">
      <span>
        <span className={"dot" + (running ? "" : " idle")} />
        {running ? "Running" : "Idle"}
      </span>
      <span>|</span>
      <span>
        Logs:{" "}
        <span className={logsConnected ? "logs-ok" : "logs-bad"}>
          {logsConnected ? "connected" : "disconnected"}
        </span>
      </span>
      <span>|</span>
      <span>Last update: {lastUpdate ? lastUpdate.toLocaleTimeString() : "—"}</span>
    </div>
  );
}