import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { iconFileName, ICON_SIZES, pwaIcons } from "./icon.ts";

const BASE = "/Rexel-Composer/";
const THEME_COLOR = "#1f1f1f";
const MAX_PRECACHE_BYTES = 8_388_608;
const CHUNK_WARNING_KILOBYTES = 1024;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "rexel-content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    pwaIcons(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      manifest: {
        name: "RexelComposer",
        short_name: "Rexel",
        description: "Node-based pixel art compositor",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        icons: [
          ...ICON_SIZES.map((size) => ({
            src: iconFileName(size),
            sizes: `${size}x${size}`,
            type: "image/png",
          })),
          {
            src: iconFileName(Math.max(...ICON_SIZES)),
            sizes: `${Math.max(...ICON_SIZES)}x${Math.max(...ICON_SIZES)}`,
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,ttf,woff2,rxc,hex,txt,gpl}"],
        maximumFileSizeToCacheInBytes: MAX_PRECACHE_BYTES,
        navigateFallback: `${BASE}index.html`,
      },
    }),
  ],
  worker: { format: "es" },
  build: {
    target: "es2023",
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: CHUNK_WARNING_KILOBYTES,
  },
});
