import { ALPHA, CHANNELS, Raster } from "./raster.ts";

export function premultiply(source: Raster): Raster {
  const result = source.clone();
  const { data } = result;
  for (let pixel = 0; pixel < data.length; pixel += CHANNELS) {
    const alpha = data[pixel + ALPHA] ?? 0;
    for (let channel = 0; channel < ALPHA; channel++) {
      data[pixel + channel] = (data[pixel + channel] ?? 0) * alpha;
    }
  }
  return result;
}

export function unpremultiplyInPlace(source: Raster): Raster {
  const { data } = source;
  for (let pixel = 0; pixel < data.length; pixel += CHANNELS) {
    const alpha = data[pixel + ALPHA] ?? 0;
    for (let channel = 0; channel < ALPHA; channel++) {
      data[pixel + channel] = alpha > 0 ? (data[pixel + channel] ?? 0) / alpha : 0;
    }
  }
  return source;
}

export function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
