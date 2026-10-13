import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

// Tauri expects a fixed dev port and serves the built files from dist/.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: ["es2021", "safari15"],
    outDir: "dist",
    // Desktop app loaded from disk; the embedded lesson font dominates the size.
    chunkSizeWarningLimit: 1024,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
