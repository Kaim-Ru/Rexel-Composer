import { definePureNode } from "../graph/node-definition.ts";
import type { Color } from "../graph/values.ts";
import { clamp01 } from "../image/alpha.ts";
import { cellular, perlin } from "../image/noise.ts";
import { ALPHA, Raster } from "../image/raster.ts";
import { PIXEL_CENTER } from "../image/sampling.ts";

const DEGREES_PER_HALF_TURN = 180;
const DEGREES_TO_RADIANS = Math.PI / DEGREES_PER_HALF_TURN;
const HALF = 0.5;
const MAX_NOISE_SCALE = 1024;
const MIN_NOISE_SCALE = 0.01;
const DEFAULT_NOISE_SCALE = 8;
const MAX_OCTAVES = 8;
const MIN_GRADIENT_RADIUS = 0.001;
const MAX_GRADIENT_RADIUS = 4;
const DEFAULT_SHAPE_POSITION = 64;
const MAX_SHAPE_EXTENT = 65536;

function fill(
  width: number,
  height: number,
  shade: (x: number, y: number, target: Float32Array) => void,
) {
  const raster = new Raster(width, height);
  const target = new Float32Array(ALPHA + 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      shade(x + PIXEL_CENTER, y + PIXEL_CENTER, target);
      raster.data.set(target, raster.index(x, y));
    }
  }
  return raster;
}

function mixColors(from: Color, to: Color, t: number, target: Float32Array) {
  const alpha = from[ALPHA] + (to[ALPHA] - from[ALPHA]) * t;
  for (let channel = 0; channel < ALPHA; channel++) {
    const premultiplied =
      from[channel]! * from[ALPHA] + (to[channel]! * to[ALPHA] - from[channel]! * from[ALPHA]) * t;
    target[channel] = alpha > 0 ? premultiplied / alpha : 0;
  }
  target[ALPHA] = alpha;
}

export const solidNode = definePureNode({
  type: "core.solid",
  title: "Solid Color",
  category: "generate",
  inputs: {},
  outputs: { image: "image" },
  params: { color: { kind: "color", default: "#ffffffff" } },
  process: (_inputs, params, { canvas }) => ({
    image: fill(canvas.width, canvas.height, (_x, _y, target) => {
      target.set(params.color);
    }),
  }),
});

export const gradientNode = definePureNode({
  type: "core.gradient",
  title: "Gradient",
  category: "generate",
  inputs: {},
  outputs: { image: "image" },
  params: {
    shape: { kind: "enum", options: ["linear", "radial"], default: "linear" },
    from: { kind: "color", default: "#000000ff" },
    to: { kind: "color", default: "#ffffffff" },
    angle: { kind: "number", default: 0, min: -360, max: 360, step: 1 },
    center: { kind: "vector", default: [HALF, HALF] },
    radius: {
      kind: "number",
      default: HALF,
      min: MIN_GRADIENT_RADIUS,
      max: MAX_GRADIENT_RADIUS,
      step: 0.01,
    },
  },
  process: (_inputs, params, { canvas }) => {
    const { width, height } = canvas;
    const directionX = Math.cos(params.angle * DEGREES_TO_RADIANS);
    const directionY = Math.sin(params.angle * DEGREES_TO_RADIANS);
    const extent = HALF * (Math.abs(directionX) + Math.abs(directionY));
    const radius = params.radius * Math.min(width, height);
    return {
      image: fill(width, height, (x, y, target) => {
        const t =
          params.shape === "linear"
            ? ((x / width - HALF) * directionX + (y / height - HALF) * directionY) / extent / 2 +
              HALF
            : Math.hypot(x - params.center[0] * width, y - params.center[1] * height) / radius;
        mixColors(params.from, params.to, clamp01(t), target);
      }),
    };
  },
});

export const noiseNode = definePureNode({
  type: "core.noise",
  title: "Noise",
  category: "generate",
  inputs: {},
  outputs: { image: "image" },
  params: {
    pattern: { kind: "enum", options: ["perlin", "cell"], default: "perlin" },
    scale: {
      kind: "number",
      default: DEFAULT_NOISE_SCALE,
      min: MIN_NOISE_SCALE,
      max: MAX_NOISE_SCALE,
      step: 0.1,
    },
    octaves: { kind: "integer", default: 1, min: 1, max: MAX_OCTAVES },
    seed: { kind: "integer", default: 0 },
  },
  process: (_inputs, params, { canvas }) => {
    const { width, height } = canvas;
    const frequency = params.scale / width;
    return {
      image: fill(width, height, (x, y, target) => {
        const value =
          params.pattern === "perlin"
            ? perlin(x * frequency, y * frequency, params.seed, params.octaves)
            : cellular(x * frequency, y * frequency, params.seed);
        target.set([value, value, value, 1]);
      }),
    };
  },
});

export const shapeNode = definePureNode({
  type: "core.shape",
  title: "Shape",
  category: "generate",
  inputs: {},
  outputs: { image: "image" },
  params: {
    shape: { kind: "enum", options: ["rectangle", "circle"], default: "rectangle" },
    center: { kind: "vector", default: [DEFAULT_SHAPE_POSITION, DEFAULT_SHAPE_POSITION] },
    size: { kind: "vector", default: [DEFAULT_SHAPE_POSITION, DEFAULT_SHAPE_POSITION] },
    color: { kind: "color", default: "#ffffffff" },
    antialias: { kind: "boolean", default: true },
  },
  process: (_inputs, params, { canvas }) => {
    const halfWidth = Math.min(Math.abs(params.size[0]), MAX_SHAPE_EXTENT) / 2;
    const halfHeight = Math.min(Math.abs(params.size[1]), MAX_SHAPE_EXTENT) / 2;
    const [centerX, centerY] = params.center;
    const coverage = (x: number, y: number): number => {
      const dx = x - centerX;
      const dy = y - centerY;
      if (params.shape === "rectangle") {
        const inside = Math.min(halfWidth - Math.abs(dx), halfHeight - Math.abs(dy));
        return params.antialias ? clamp01(inside + HALF) : inside >= 0 ? 1 : 0;
      }
      if (halfWidth === 0 || halfHeight === 0) return 0;
      const normalized = Math.hypot(dx / halfWidth, dy / halfHeight);
      const signedDistance = (normalized - 1) * Math.min(halfWidth, halfHeight);
      return params.antialias ? clamp01(HALF - signedDistance) : normalized <= 1 ? 1 : 0;
    };
    return {
      image: fill(canvas.width, canvas.height, (x, y, target) => {
        target.set(params.color);
        target[ALPHA] = params.color[ALPHA] * coverage(x, y);
      }),
    };
  },
});
