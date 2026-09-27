import React, { useCallback, useState } from "react";
import { Header } from "./components/Header";
import { StatsGrid } from "./components/StatsGrid";
import { LogViewer } from "./components/LogViewer";
import { Banner } from "./components/Banner";
import { StatusIndicator } from "./components/StatusIndicator";
import { useStatus } from "./hooks/useStatus";
import { useLogs } from "./hooks/useLogs";
import { api } from "./api";

export default function App() {
  const { data, error, lastUpdate, refresh } = useStatus(2000);
  const { logs, connected } = useLogs("/ui/logs/stream");
  const [banner, setBanner] = useState(null);
  const [triggering, setTriggering] = useState(false);

  const running = data?.state?.running === true;
  const queue = data?.queue || { pending: 0, processing: 0, success: 0, failed: 0 };
  const services = data?.services; 

  const handleSync = useCallback(async () => {
    if (running || triggering) return;

    setTriggering(true);
    setBanner({ type: "info", message: "Starting sync..." });

    try {
      const res = await api.triggerSync();
      if (res.success) {
        setBanner({ type: "info", message: "Sync started — watching progress below" });
        setTimeout(() => setBanner(null), 3000);
      } else {
        setBanner({ type: "error", message: res.message || "Sync failed to start" });
      }
    } catch (err) {
      setBanner({ type: "error", message: err.message || "Failed to trigger sync" });
    } finally {
      setTriggering(false);
      refresh();
    }
  }, [running, triggering, refresh]);

  return (
    <div className="container">
      <Header
        running={running}
        triggering={triggering}
        lastRunFinishedAt={data?.state?.lastRunFinishedAt}
        onSync={handleSync}
      />

      {banner && <Banner type={banner.type} message={banner.message} />}
      {error && <Banner type="error" message={`Status fetch failed: ${error}`} />}

      <StatusIndicator
        running={running}
        lastUpdate={lastUpdate}
        logsConnected={connected}
        services={services}
      />

      <StatsGrid queue={queue} />

      <LogViewer logs={logs} />
    </div>
  );
}