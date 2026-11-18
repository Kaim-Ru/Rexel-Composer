import { ALPHA, CHANNELS, type Raster } from "./raster.ts";

export const PIXEL_CENTER = 0.5;

export function sampleNearest(source: Raster, x: number, y: number, target: Float32Array) {
  const column = Math.floor(x);
  const row = Math.floor(y);
  if (column < 0 || row < 0 || column >= source.width || row >= source.height) {
    target.fill(0);
    return;
  }
  target.set(source.data.subarray(source.index(column, row), source.index(column, row) + CHANNELS));
}

export function sampleBilinear(source: Raster, x: number, y: number, target: Float32Array) {
  const left = Math.floor(x - PIXEL_CENTER);
  const top = Math.floor(y - PIXEL_CENTER);
  const fractionX = x - PIXEL_CENTER - left;
  const fractionY = y - PIXEL_CENTER - top;
  target.fill(0);
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const column = left + dx;
      const row = top + dy;
      if (column < 0 || row < 0 || column >= source.width || row >= source.height) continue;
      const weight =
        (dx === 0 ? 1 - fractionX : fractionX) * (dy === 0 ? 1 - fractionY : fractionY);
      const index = source.index(column, row);
      const alpha = (source.data[index + ALPHA] ?? 0) * weight;
      for (let channel = 0; channel < ALPHA; channel++) {
        target[channel] = (target[channel] ?? 0) + (source.data[index + channel] ?? 0) * alpha;
      }
      target[ALPHA] = (target[ALPHA] ?? 0) + alpha;
    }
  }
  const alpha = target[ALPHA] ?? 0;
  for (let channel = 0; channel < ALPHA; channel++) {
    target[channel] = alpha > 0 ? (target[channel] ?? 0) / alpha : 0;
  }
}
