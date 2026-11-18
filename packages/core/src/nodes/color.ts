import { definePureNode } from "../graph/node-definition.ts";
import type { Color } from "../graph/values.ts";
import { clamp01 } from "../image/alpha.ts";
import { hsvToRgb, luminance, rgbToHsv } from "../image/color-space.ts";
import { ALPHA } from "../image/raster.ts";

const MAX_HUE_SHIFT = 180;
const MAX_CHANNEL_GAIN = 4;
const MIN_GAMMA = 0.01;
const MAX_GAMMA = 10;
const LEVELS_EPSILON = 1e-6;
const RED = 0;
const GREEN = 1;
const BLUE = 2;

export const hsvNode = definePureNode({
  type: "core.hsv",
  title: "Hue / Saturation / Value",
  category: "color",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    hue: { kind: "number", default: 0, min: -MAX_HUE_SHIFT, max: MAX_HUE_SHIFT, step: 1 },
    saturation: { kind: "number", default: 1, min: 0, max: MAX_CHANNEL_GAIN, step: 0.01 },
    value: { kind: "number", default: 1, min: 0, max: MAX_CHANNEL_GAIN, step: 0.01 },
  },
  process: (inputs, params) => ({
    image: inputs.image.map((pixel, target) => {
      const [hue, saturation, value] = rgbToHsv(pixel[RED]!, pixel[GREEN]!, pixel[BLUE]!);
      const rgb = hsvToRgb(
        hue + params.hue,
        clamp01(saturation * params.saturation),
        value * params.value,
      );
      target.set([clamp01(rgb[RED]), clamp01(rgb[GREEN]), clamp01(rgb[BLUE]), pixel[ALPHA]!]);
    }),
  }),
});

export const levelsNode = definePureNode({
  type: "core.levels",
  title: "Levels",
  category: "color",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    inputBlack: { kind: "number", default: 0, min: 0, max: 1, step: 0.01 },
    inputWhite: { kind: "number", default: 1, min: 0, max: 1, step: 0.01 },
    gamma: { kind: "number", default: 1, min: MIN_GAMMA, max: MAX_GAMMA, step: 0.01 },
    outputBlack: { kind: "number", default: 0, min: 0, max: 1, step: 0.01 },
    outputWhite: { kind: "number", default: 1, min: 0, max: 1, step: 0.01 },
  },
  process: (inputs, params) => {
    const range = Math.max(params.inputWhite - params.inputBlack, LEVELS_EPSILON);
    const exponent = 1 / params.gamma;
    const adjust = (channel: number) => {
      const normalized = clamp01((channel - params.inputBlack) / range) ** exponent;
      return params.outputBlack + normalized * (params.outputWhite - params.outputBlack);
    };
    return {
      image: inputs.image.map((pixel, target) => {
        target.set([
          adjust(pixel[RED]!),
          adjust(pixel[GREEN]!),
          adjust(pixel[BLUE]!),
          pixel[ALPHA]!,
        ]);
      }),
    };
  },
});

export const invertNode = definePureNode({
  type: "core.invert",
  title: "Invert",
  category: "color",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {},
  process: (inputs) => ({
    image: inputs.image.map((pixel, target) => {
      target.set([1 - pixel[RED]!, 1 - pixel[GREEN]!, 1 - pixel[BLUE]!, pixel[ALPHA]!]);
    }),
  }),
});

export const grayscaleNode = definePureNode({
  type: "core.grayscale",
  title: "Grayscale",
  category: "color",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {},
  process: (inputs) => ({
    image: inputs.image.map((pixel, target) => {
      const gray = luminance(pixel[RED]!, pixel[GREEN]!, pixel[BLUE]!);
      target.set([gray, gray, gray, pixel[ALPHA]!]);
    }),
  }),
});

function nearestColor(palette: readonly Color[], red: number, green: number, blue: number): Color {
  let best = palette[0]!;
  let bestDistance = Infinity;
  for (const color of palette) {
    const distance =
      (color[RED] - red) ** 2 + (color[GREEN] - green) ** 2 + (color[BLUE] - blue) ** 2;
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
}

export const paletteNode = definePureNode({
  type: "core.palette",
  title: "Palette Reduce",
  category: "color",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    colors: { kind: "palette", default: ["#0f380fff", "#306230ff", "#8bac0fff", "#9bbc0fff"] },
    file: { kind: "asset", assetKind: "palette", optional: true },
  },
  process: (inputs, params) => {
    const palette = params.file ?? params.colors;
    return {
      image: inputs.image.map((pixel, target) => {
        const color = nearestColor(palette, pixel[RED]!, pixel[GREEN]!, pixel[BLUE]!);
        target.set([color[RED], color[GREEN], color[BLUE], pixel[ALPHA]!]);
      }),
    };
  },
});
