import { RexelError } from "../errors.ts";

export const CHANNELS = 4;
export const MAX_IMAGE_SIDE = 16384;
export const MAX_IMAGE_PIXELS = 67_108_864;

export interface RasterData {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array<ArrayBuffer>;
}

export function assertImageSize(width: number, height: number) {
  const valid =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_SIDE &&
    height <= MAX_IMAGE_SIDE &&
    width * height <= MAX_IMAGE_PIXELS;
  if (!valid) {
    throw new RexelError({
      reason: `Image size ${width}x${height} is outside the supported range (each side 1..${MAX_IMAGE_SIDE}, at most ${MAX_IMAGE_PIXELS} pixels)`,
    });
  }
}

export class Raster implements RasterData {
  readonly data: Float32Array<ArrayBuffer>;

  constructor(
    readonly width: number,
    readonly height: number,
    data?: Float32Array<ArrayBuffer>,
  ) {
    assertImageSize(width, height);
    const length = width * height * CHANNELS;
    if (data !== undefined && data.length !== length) {
      throw new RexelError({
        reason: `Image data has ${data.length} values but ${width}x${height} RGBA needs ${length}`,
      });
    }
    this.data = data ?? new Float32Array(length);
  }

  static from(source: RasterData): Raster {
    return source instanceof Raster ? source : new Raster(source.width, source.height, source.data);
  }
}
