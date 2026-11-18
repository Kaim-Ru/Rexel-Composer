import { CHANNELS, Raster } from "./raster.ts";

const SIGMAS_PER_RADIUS = 3;
const ALPHA = 3;

enum Axis {
  Horizontal,
  Vertical,
}

function gaussianKernel(radius: number): Float32Array {
  const half = Math.ceil(radius);
  const sigma = radius / SIGMAS_PER_RADIUS;
  const weights = Float32Array.from({ length: half * 2 + 1 }, (_, index) => {
    const distance = index - half;
    return Math.exp(-(distance * distance) / (2 * sigma * sigma));
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

function premultiply(source: Raster): Raster {
  const result = new Raster(source.width, source.height, source.data.slice());
  const { data } = result;
  for (let pixel = 0; pixel < data.length; pixel += CHANNELS) {
    const alpha = data[pixel + ALPHA] ?? 0;
    for (let channel = 0; channel < ALPHA; channel++) {
      data[pixel + channel] = (data[pixel + channel] ?? 0) * alpha;
    }
  }
  return result;
}

function unpremultiply(source: Raster): Raster {
  const { data } = source;
  for (let pixel = 0; pixel < data.length; pixel += CHANNELS) {
    const alpha = data[pixel + ALPHA] ?? 0;
    for (let channel = 0; channel < ALPHA; channel++) {
      data[pixel + channel] = alpha > 0 ? (data[pixel + channel] ?? 0) / alpha : 0;
    }
  }
  return source;
}

function convolve(source: Raster, kernel: Float32Array, axis: Axis): Raster {
  const { width, height } = source;
  const result = new Raster(width, height);
  const half = (kernel.length - 1) / 2;
  const length = axis === Axis.Horizontal ? width : height;
  const lines = axis === Axis.Horizontal ? height : width;
  const pixelIndex =
    axis === Axis.Horizontal
      ? (line: number, position: number) => (line * width + position) * CHANNELS
      : (line: number, position: number) => (position * width + line) * CHANNELS;
  const sum = new Float32Array(CHANNELS);
  for (let line = 0; line < lines; line++) {
    for (let position = 0; position < length; position++) {
      sum.fill(0);
      kernel.forEach((weight, tap) => {
        const sample = Math.min(Math.max(position + tap - half, 0), length - 1);
        const index = pixelIndex(line, sample);
        for (let channel = 0; channel < CHANNELS; channel++) {
          sum[channel] = (sum[channel] ?? 0) + (source.data[index + channel] ?? 0) * weight;
        }
      });
      result.data.set(sum, pixelIndex(line, position));
    }
  }
  return result;
}

export function gaussianBlur(source: Raster, radius: number): Raster {
  if (radius === 0) return source;
  const kernel = gaussianKernel(radius);
  const horizontal = convolve(premultiply(source), kernel, Axis.Horizontal);
  return unpremultiply(convolve(horizontal, kernel, Axis.Vertical));
}
