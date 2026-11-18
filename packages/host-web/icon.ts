import { renderAppIcon } from "@rexel/ui/app-icon";
import type { Plugin } from "vite";

const SMALL_ICON_SIZE = 192;
const LARGE_ICON_SIZE = 512;
export const ICON_SIZES = [SMALL_ICON_SIZE, LARGE_ICON_SIZE] as const;
export const APPLE_TOUCH_SIZE = 180;
export const FAVICON_SIZE = 32;

export function iconFileName(size: number): string {
  return `icon-${size}.png`;
}

export function pwaIcons(): Plugin {
  const sizes = [...ICON_SIZES, APPLE_TOUCH_SIZE, FAVICON_SIZE];
  return {
    name: "rexel-pwa-icons",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const size = sizes.find((candidate) =>
          request.url?.endsWith(`/${iconFileName(candidate)}`),
        );
        if (size === undefined) {
          next();
          return;
        }
        response.setHeader("Content-Type", "image/png");
        response.end(renderAppIcon(size));
      });
    },
    generateBundle() {
      for (const size of sizes) {
        this.emitFile({ type: "asset", fileName: iconFileName(size), source: renderAppIcon(size) });
      }
    },
  };
}
