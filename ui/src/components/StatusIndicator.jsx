// ui/src/components/StatusIndicator.jsx
import React from "react";

function ServicePill({ name, service }) {
  const isUp = service?.status === "UP";
  const isDown = service?.status === "DOWN";
  const cls = isUp ? "up" : isDown ? "down" : "unknown";

  return (
    <span className={"service-pill " + cls} title={service?.error || service?.status}>
      <span className="service-pill-dot" />
      <span className="service-pill-name">{name}</span>
      <span className="service-pill-status">
        {isUp ? "UP" : isDown ? "DOWN" : "?"}
      </span>
      {isUp && service?.latencyMs != null && (
        <span className="service-pill-latency">{service.latencyMs}ms</span>
      )}
    </span>
  );
}

export function StatusIndicator({ running, lastUpdate, logsConnected, services }) {
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

      {/* ⬇️ CBS + DMS inline pills */}
      <ServicePill name="CBS" service={services?.cbs} />
      <ServicePill name="DMS" service={services?.dms} />

      <span>|</span>

      <span>Last update: {lastUpdate ? lastUpdate.toLocaleTimeString() : "—"}</span>
    </div>
  );
}