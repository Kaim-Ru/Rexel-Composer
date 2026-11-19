import { renderAppIcon } from "@rexel-composer/ui/app-icon";
import { defineConfig } from "vite";

const NODE_TARGET = "node20";
const MARKETPLACE_ICON_SIZE = 128;

export default defineConfig({
  plugins: [
    {
      name: "rexel-extension-icon",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "icon.png",
          source: renderAppIcon(MARKETPLACE_ICON_SIZE),
        });
      },
    },
  ],
  build: {
    ssr: true,
    target: NODE_TARGET,
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: { extension: "src/extension.ts" },
      external: ["vscode"],
      output: { format: "cjs", entryFileNames: "[name].cjs" },
    },
  },
  ssr: { noExternal: true, target: "node" },
});
