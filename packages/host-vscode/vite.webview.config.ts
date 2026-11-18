import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  build: {
    target: "es2023",
    outDir: "dist/webview",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      input: "src/webview/main.tsx",
      output: {
        format: "es",
        entryFileNames: "webview.js",
        chunkFileNames: "[name].js",
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith(".css")) ? "webview.css" : "[name][extname]",
      },
    },
  },
});
