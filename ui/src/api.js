// All requests go to the same origin in production
// In dev, Vite proxies them to :5050

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {
      // ignore
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const api = {
  getStatus: () => request("/ui/status"),
  triggerSync: () => request("/ui/sync", { method: "POST" }),
};