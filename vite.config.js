import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 8501,
    strictPort: true,
  },
  build: {
    target: "es2020",
    rollupOptions: { input: { game: "index.html", report: "report.html" } },
    assetsInlineLimit: 0,
  },
});
