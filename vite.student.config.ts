import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The page students do exercises on. The Worker serves the built files under
// /student/ and the page itself at /a/<link>; see worker/wrangler.jsonc.
export default defineConfig({
  plugins: [react()],
  base: "/student/",
  build: {
    outDir: "worker/public/student",
    emptyOutDir: true,
    target: ["es2020", "safari14"],
    rollupOptions: { input: "student.html" },
    // The embedded lesson font dominates the size, as in the app.
    chunkSizeWarningLimit: 1024,
  },
});
