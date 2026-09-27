import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // During dev, proxy API calls to the running bridge
      "/ui": "http://localhost:5050",
      "/admin": "http://localhost:5050",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});