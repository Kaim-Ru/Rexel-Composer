import { definePureNode } from "../graph/node-definition.ts";
import { clamp01, premultiply, unpremultiplyInPlace } from "../image/alpha.ts";
import { luminance } from "../image/color-space.ts";
import { gaussianBlur } from "../image/gaussian-blur.ts";
import { ALPHA, CHANNELS, Raster } from "../image/raster.ts";

const BAYER_QUADRANTS = 4;
const BAYER_LOWER_LEFT = 3;
const DEFAULT_BLUR_RADIUS = 4;
const MAX_BLUR_RADIUS = 256;
const MAX_SHARPEN_AMOUNT = 10;
const MIN_SHARPEN_RADIUS = 0.1;
const MAX_SHARPEN_RADIUS = 64;
const MAX_EDGE_STRENGTH = 10;
const DEFAULT_PIXEL_SIZE = 4;
const MAX_PIXEL_SIZE = 512;
const MAX_DITHER_LEVELS = 256;
const BAYER_SIZES = { "2x2": 2, "4x4": 4, "8x8": 8 } as const;
const SOBEL_CENTER_WEIGHT = 2;
const PIXEL_CENTER = 0.5;

export const blurNode = definePureNode({
  type: "core.blur",
  title: "Blur",
  category: "filter",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    radius: {
      kind: "number",
      default: DEFAULT_BLUR_RADIUS,
      min: 0,
      max: MAX_BLUR_RADIUS,
      step: 0.5,
    },
  },
  process: (inputs, params) => ({ image: gaussianBlur(inputs.image, params.radius) }),
});

export const sharpenNode = definePureNode({
  type: "core.sharpen",
  title: "Sharpen",
  category: "filter",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    amount: { kind: "number", default: 1, min: 0, max: MAX_SHARPEN_AMOUNT, step: 0.05 },
    radius: {
      kind: "number",
      default: 1,
      min: MIN_SHARPEN_RADIUS,
      max: MAX_SHARPEN_RADIUS,
      step: 0.1,
    },
  },
  process: (inputs, params) => {
    const source = inputs.image;
    const blurred = gaussianBlur(source, params.radius);
    const result = new Raster(source.width, source.height);
    for (let offset = 0; offset < source.data.length; offset += CHANNELS) {
      for (let channel = 0; channel < ALPHA; channel++) {
        const original = source.data[offset + channel]!;
        result.data[offset + channel] = clamp01(
          original + (original - blurred.data[offset + channel]!) * params.amount,
        );
      }
      result.data[offset + ALPHA] = source.data[offset + ALPHA]!;
    }
    return { image: result };
  },
});

export const edgeNode = definePureNode({
  type: "core.edge",
  title: "Edge Detect",
  category: "filter",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: { strength: { kind: "number", default: 1, min: 0, max: MAX_EDGE_STRENGTH, step: 0.05 } },
  process: (inputs, params) => {
    const source = inputs.image;
    const { width, height } = source;
    const brightness = new Float32Array(width * height);
    for (let pixel = 0; pixel < width * height; pixel++) {
      const offset = pixel * CHANNELS;
      brightness[pixel] =
        luminance(source.data[offset]!, source.data[offset + 1]!, source.data[offset + 2]!) *
        source.data[offset + ALPHA]!;
    }
    const at = (x: number, y: number) =>
      brightness[
        Math.min(Math.max(y, 0), height - 1) * width + Math.min(Math.max(x, 0), width - 1)
      ]!;
    const result = new Raster(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const horizontal =
          at(x + 1, y - 1) +
          SOBEL_CENTER_WEIGHT * at(x + 1, y) +
          at(x + 1, y + 1) -
          (at(x - 1, y - 1) + SOBEL_CENTER_WEIGHT * at(x - 1, y) + at(x - 1, y + 1));
        const vertical =
          at(x - 1, y + 1) +
          SOBEL_CENTER_WEIGHT * at(x, y + 1) +
          at(x + 1, y + 1) -
          (at(x - 1, y - 1) + SOBEL_CENTER_WEIGHT * at(x, y - 1) + at(x + 1, y - 1));
        const magnitude = clamp01(Math.hypot(horizontal, vertical) * params.strength);
        result.data.set([magnitude, magnitude, magnitude, 1], result.index(x, y));
      }
    }
    return { image: result };
  },
});

export const pixelateNode = definePureNode({
  type: "core.pixelate",
  title: "Pixelate",
  category: "filter",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: { size: { kind: "integer", default: DEFAULT_PIXEL_SIZE, min: 1, max: MAX_PIXEL_SIZE } },
  process: (inputs, params) => {
    const source = premultiply(inputs.image);
    const { width, height } = source;
    const result = new Raster(width, height);
    const sum = new Float32Array(CHANNELS);
    for (let top = 0; top < height; top += params.size) {
      for (let left = 0; left < width; left += params.size) {
        const bottom = Math.min(top + params.size, height);
        const right = Math.min(left + params.size, width);
        sum.fill(0);
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            const index = source.index(x, y);
            for (let channel = 0; channel < CHANNELS; channel++)
              sum[channel]! += source.data[index + channel]!;
          }
        }
        const count = (bottom - top) * (right - left);
        for (let channel = 0; channel < CHANNELS; channel++) sum[channel]! /= count;
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) result.data.set(sum, result.index(x, y));
        }
      }
    }
    return { image: unpremultiplyInPlace(result) };
  },
});

function bayerMatrix(size: number): Float32Array {
  let matrix = [0];
  for (let current = 1; current < size; current *= 2) {
    const next = new Array<number>(current * 2 * current * 2);
    for (let y = 0; y < current; y++) {
      for (let x = 0; x < current; x++) {
        const value = matrix[y * current + x]! * BAYER_QUADRANTS;
        const row = current * 2;
        next[y * row + x] = value;
        next[y * row + x + current] = value + 2;
        next[(y + current) * row + x] = value + BAYER_LOWER_LEFT;
        next[(y + current) * row + x + current] = value + 1;
      }
    }
    matrix = next;
  }
  return Float32Array.from(matrix, (value) => (value + PIXEL_CENTER) / (size * size));
}

export const ditherNode = definePureNode({
  type: "core.dither",
  title: "Dither",
  category: "filter",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    levels: { kind: "integer", default: 2, min: 2, max: MAX_DITHER_LEVELS },
    matrix: { kind: "enum", options: ["2x2", "4x4", "8x8"], default: "4x4" },
  },
  process: (inputs, params) => {
    const size = BAYER_SIZES[params.matrix];
    const thresholds = bayerMatrix(size);
    const source = inputs.image;
    const steps = params.levels - 1;
    const result = new Raster(source.width, source.height);
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const threshold = thresholds[(y % size) * size + (x % size)]!;
        const index = source.index(x, y);
        for (let channel = 0; channel < ALPHA; channel++) {
          const value = clamp01(source.data[index + channel]!);
          result.data[index + channel] =
            Math.min(Math.floor(value * steps + threshold), steps) / steps;
        }
        result.data[index + ALPHA] = source.data[index + ALPHA]!;
      }
    }
    return { image: result };
  },
});
