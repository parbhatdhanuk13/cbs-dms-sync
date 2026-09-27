import { useEffect, useRef, useState } from "react";

const MAX_LOGS = 500;

export function useLogs(streamUrl = "/ui/logs/stream") {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    const es = new EventSource(streamUrl);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);
        setLogs((prev) => {
          const next = [...prev, entry];
          // Cap log buffer
          return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
        });
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setConnected(false);
      // Browser auto-reconnects; no manual retry needed
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [streamUrl]);

  return { logs, connected };
}