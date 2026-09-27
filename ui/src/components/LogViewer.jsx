import React, { useEffect, useRef } from "react";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function LogLine({ entry }) {
  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString()
    : "";
  const level = (entry.level || "info").toLowerCase();

  let extra = "";
  if (entry.sourceKey) extra += ` sourceKey=${entry.sourceKey}`;
  if (entry.dmsDocumentId) extra += ` dmsId=${entry.dmsDocumentId}`;
  if (entry.error) extra += ` error="${entry.error}"`;

  return (
    <div className="log-line">
      <span className="log-time">{time}</span>
      <span className={"log-level " + level}>{level.toUpperCase()}</span>
      <span className="log-message">
        {entry.message}
        {extra && <span className="log-extra">{extra}</span>}
      </span>
    </div>
  );
}

export function LogViewer({ logs }) {
  const containerRef = useRef(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom when new logs arrive, unless user scrolled up
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !autoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = nearBottom;
  }

  if (logs.length === 0) {
    return (
      <div className="logs" ref={containerRef}>
        <div className="empty">Waiting for logs...</div>
      </div>
    );
  }

  return (
    <div className="logs" ref={containerRef} onScroll={handleScroll}>
      {logs.map((entry, idx) => (
        <LogLine key={idx} entry={entry} />
      ))}
    </div>
  );
}