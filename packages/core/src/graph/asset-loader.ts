import type { ProjectFileSystem } from "../host.ts";
import { RexelError } from "../errors.ts";
import { parsePaletteFile } from "../image/palette-file.ts";
import { decodePng } from "../image/png-decode.ts";
import type { Raster } from "../image/raster.ts";
import type { Color } from "./values.ts";

export class AssetLoader {
  private readonly images = new Map<string, Promise<Raster>>();
  private readonly palettes = new Map<string, Promise<Color[]>>();

  constructor(private readonly fileSystem: ProjectFileSystem) {}

  image(path: string): Promise<Raster> {
    return this.remember(this.images, path, (bytes) => decodePng(bytes));
  }

  palette(path: string): Promise<Color[]> {
    return this.remember(this.palettes, path, (bytes) => parsePaletteFile(path, bytes));
  }

  clear() {
    this.images.clear();
    this.palettes.clear();
  }

  private remember<Value>(
    store: Map<string, Promise<Value>>,
    path: string,
    decode: (bytes: Uint8Array) => Value,
  ): Promise<Value> {
    let result = store.get(path);
    if (result === undefined) {
      result = this.fileSystem.read(path).then((bytes) => {
        try {
          return decode(bytes);
        } catch (error) {
          throw new RexelError({ reason: `${path}: ${RexelError.from(error).message}` });
        }
      });
      result.catch(() => store.delete(path));
      store.set(path, result);
    }
    return result;
  }
}
