import { useEffect, useState, useRef } from "react";
import { api } from "../api";

export function useStatus(pollMs = 2000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);

  async function refresh() {
    try {
      const res = await api.getStatus();
      setData(res);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to fetch status");
    }
  }

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, pollMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pollMs]);

  return { data, error, lastUpdate, refresh };
}