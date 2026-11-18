import { RexelError } from "../errors.ts";
import { definePureNode } from "../graph/node-definition.ts";
import { CHANNELS, Raster } from "../image/raster.ts";
import { PIXEL_CENTER, sampleBilinear, sampleNearest } from "../image/sampling.ts";

const DEGREES_PER_HALF_TURN = 180;
const DEGREES_TO_RADIANS = Math.PI / DEGREES_PER_HALF_TURN;
const MIN_SCALE = 1e-4;
const MAX_TILES = 64;

export const transformNode = definePureNode({
  type: "core.transform",
  title: "Transform",
  category: "transform",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    offset: { kind: "vector", default: [0, 0] },
    rotation: { kind: "number", default: 0, min: -360, max: 360, step: 1 },
    scale: { kind: "vector", default: [1, 1] },
    interpolation: { kind: "enum", options: ["nearest", "bilinear"], default: "nearest" },
  },
  process: (inputs, params) => {
    const source = inputs.image;
    const { width, height } = source;
    const result = new Raster(width, height);
    const cos = Math.cos(-params.rotation * DEGREES_TO_RADIANS);
    const sin = Math.sin(-params.rotation * DEGREES_TO_RADIANS);
    const scaleX = Math.sign(params.scale[0] || 1) * Math.max(Math.abs(params.scale[0]), MIN_SCALE);
    const scaleY = Math.sign(params.scale[1] || 1) * Math.max(Math.abs(params.scale[1]), MIN_SCALE);
    const centerX = width / 2;
    const centerY = height / 2;
    const sample = params.interpolation === "nearest" ? sampleNearest : sampleBilinear;
    const target = new Float32Array(CHANNELS);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x + PIXEL_CENTER - centerX - params.offset[0];
        const dy = y + PIXEL_CENTER - centerY - params.offset[1];
        const rotatedX = dx * cos - dy * sin;
        const rotatedY = dx * sin + dy * cos;
        sample(source, rotatedX / scaleX + centerX, rotatedY / scaleY + centerY, target);
        result.data.set(target, result.index(x, y));
      }
    }
    return { image: result };
  },
});

export const flipNode = definePureNode({
  type: "core.flip",
  title: "Flip",
  category: "transform",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    horizontal: { kind: "boolean", default: true },
    vertical: { kind: "boolean", default: false },
  },
  process: (inputs, params) => {
    const source = inputs.image;
    const result = new Raster(source.width, source.height);
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const sourceX = params.horizontal ? source.width - 1 - x : x;
        const sourceY = params.vertical ? source.height - 1 - y : y;
        const index = source.index(sourceX, sourceY);
        result.data.set(source.data.subarray(index, index + CHANNELS), result.index(x, y));
      }
    }
    return { image: result };
  },
});

export const cropNode = definePureNode({
  type: "core.crop",
  title: "Crop",
  category: "transform",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    x: { kind: "integer", default: 0, min: 0 },
    y: { kind: "integer", default: 0, min: 0 },
    width: { kind: "integer", default: 0, min: 0 },
    height: { kind: "integer", default: 0, min: 0 },
  },
  process: (inputs, params) => {
    const source = inputs.image;
    const left = Math.min(params.x, source.width);
    const top = Math.min(params.y, source.height);
    const width = Math.min(params.width === 0 ? source.width : params.width, source.width - left);
    const height = Math.min(
      params.height === 0 ? source.height : params.height,
      source.height - top,
    );
    if (width <= 0 || height <= 0) {
      throw new RexelError({
        reason: `The crop area is outside the ${source.width}x${source.height} image`,
      });
    }
    const result = new Raster(width, height);
    for (let y = 0; y < height; y++) {
      const start = source.index(left, top + y);
      result.data.set(source.data.subarray(start, start + width * CHANNELS), result.index(0, y));
    }
    return { image: result };
  },
});

export const tileNode = definePureNode({
  type: "core.tile",
  title: "Tile",
  category: "transform",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {
    columns: { kind: "integer", default: 2, min: 1, max: MAX_TILES },
    rows: { kind: "integer", default: 2, min: 1, max: MAX_TILES },
  },
  process: (inputs, params) => {
    const source = inputs.image;
    const result = new Raster(source.width * params.columns, source.height * params.rows);
    for (let y = 0; y < result.height; y++) {
      for (let column = 0; column < params.columns; column++) {
        const start = source.index(0, y % source.height);
        result.data.set(
          source.data.subarray(start, start + source.width * CHANNELS),
          result.index(column * source.width, y),
        );
      }
    }
    return { image: result };
  },
});
