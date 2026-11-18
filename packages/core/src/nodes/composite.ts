import { definePureNode } from "../graph/node-definition.ts";
import { clamp01 } from "../image/alpha.ts";
import { luminance } from "../image/color-space.ts";
import { ALPHA, Raster } from "../image/raster.ts";

const HALF = 0.5;

const BLEND_MODES = {
  normal: (_base: number, layer: number) => layer,
  multiply: (base: number, layer: number) => base * layer,
  screen: (base: number, layer: number) => base + layer - base * layer,
  add: (base: number, layer: number) => Math.min(base + layer, 1),
  overlay: (base: number, layer: number) =>
    base <= HALF ? 2 * base * layer : 1 - 2 * (1 - base) * (1 - layer),
} as const;

type BlendMode = keyof typeof BLEND_MODES;

const BLEND_MODE_NAMES = Object.keys(BLEND_MODES) as BlendMode[];

export const blendNode = definePureNode({
  type: "core.blend",
  title: "Blend",
  category: "composite",
  inputs: { base: "image", layer: "image" },
  outputs: { image: "image" },
  params: {
    mode: { kind: "enum", options: BLEND_MODE_NAMES, default: "normal" },
    opacity: { kind: "number", default: 1, min: 0, max: 1, step: 0.01 },
    offset: { kind: "vector", default: [0, 0] },
  },
  process: (inputs, params) => {
    const { base, layer } = inputs;
    const blend = BLEND_MODES[params.mode];
    const result = base.clone();
    const offsetX = Math.round(params.offset[0]);
    const offsetY = Math.round(params.offset[1]);
    for (let y = 0; y < base.height; y++) {
      const layerY = y - offsetY;
      if (layerY < 0 || layerY >= layer.height) continue;
      for (let x = 0; x < base.width; x++) {
        const layerX = x - offsetX;
        if (layerX < 0 || layerX >= layer.width) continue;
        const baseIndex = base.index(x, y);
        const layerIndex = layer.index(layerX, layerY);
        const baseAlpha = base.data[baseIndex + ALPHA]!;
        const layerAlpha = layer.data[layerIndex + ALPHA]! * params.opacity;
        const alpha = layerAlpha + baseAlpha * (1 - layerAlpha);
        for (let channel = 0; channel < ALPHA; channel++) {
          const baseColor = base.data[baseIndex + channel]!;
          const layerColor = layer.data[layerIndex + channel]!;
          const mixed =
            layerAlpha * (1 - baseAlpha) * layerColor +
            layerAlpha * baseAlpha * blend(baseColor, layerColor) +
            (1 - layerAlpha) * baseAlpha * baseColor;
          result.data[baseIndex + channel] = alpha > 0 ? clamp01(mixed / alpha) : 0;
        }
        result.data[baseIndex + ALPHA] = alpha;
      }
    }
    return { image: result };
  },
});

export const maskNode = definePureNode({
  type: "core.mask",
  title: "Mask",
  category: "composite",
  inputs: { image: "image", mask: "image" },
  outputs: { image: "image" },
  params: {
    channel: { kind: "enum", options: ["luminance", "alpha"], default: "luminance" },
    invert: { kind: "boolean", default: false },
  },
  process: (inputs, params) => {
    const { image, mask } = inputs;
    const result = new Raster(image.width, image.height, image.data.slice());
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const index = image.index(x, y);
        let amount = 0;
        if (x < mask.width && y < mask.height) {
          const maskIndex = mask.index(x, y);
          const maskAlpha = mask.data[maskIndex + ALPHA]!;
          amount =
            params.channel === "alpha"
              ? maskAlpha
              : luminance(
                  mask.data[maskIndex]!,
                  mask.data[maskIndex + 1]!,
                  mask.data[maskIndex + 2]!,
                ) * maskAlpha;
        }
        result.data[index + ALPHA] =
          image.data[index + ALPHA]! * (params.invert ? 1 - amount : amount);
      }
    }
    return { image: result };
  },
});
