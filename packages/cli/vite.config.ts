import { defineConfig } from "vite";

const NODE_TARGET = "node22";

export default defineConfig({
  build: {
    ssr: true,
    target: NODE_TARGET,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { main: "src/main.ts", worker: "src/worker.ts" },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        banner: (chunk) => (chunk.name === "main" ? "#!/usr/bin/env node" : ""),
      },
    },
  },
  ssr: { noExternal: true, target: "node" },
});
