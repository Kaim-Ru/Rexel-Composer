import { zlibSync } from "fflate";
import {
  BYTE_MAX,
  BYTES_PER_UINT32,
  CHUNK_OVERHEAD,
  CHUNK_TYPE_LENGTH,
  ChunkType,
  ColorType,
  BitDepth,
  FILTER_TYPES,
  FilterType,
  IHDR_LENGTH,
  Interlace,
  PNG_SIGNATURE,
  asciiBytes,
  concatBytes,
  crc32,
  predict,
} from "./png-format.ts";
import { CHANNELS, type Raster } from "./raster.ts";

const SIGNED_BYTE_LIMIT = 128;
const BYTE_VALUES = 256;
const COMPRESSION_METHOD = 0;
const FILTER_METHOD = 0;

function quantize(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 1) * BYTE_MAX);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(CHUNK_OVERHEAD + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(asciiBytes(type), BYTES_PER_UINT32);
  bytes.set(data, BYTES_PER_UINT32 + CHUNK_TYPE_LENGTH);
  const crcEnd = BYTES_PER_UINT32 + CHUNK_TYPE_LENGTH + data.length;
  view.setUint32(crcEnd, crc32(bytes.subarray(BYTES_PER_UINT32, crcEnd)));
  return bytes;
}

function header(raster: Raster): Uint8Array {
  const data = new Uint8Array(IHDR_LENGTH);
  const view = new DataView(data.buffer);
  view.setUint32(0, raster.width);
  view.setUint32(BYTES_PER_UINT32, raster.height);
  data.set(
    [BitDepth.Eight, ColorType.TruecolorAlpha, COMPRESSION_METHOD, FILTER_METHOD, Interlace.None],
    BYTES_PER_UINT32 + BYTES_PER_UINT32,
  );
  return data;
}

function filterRow(
  filter: FilterType,
  pixels: Uint8Array,
  row: number,
  stride: number,
  target: Uint8Array,
) {
  const previous = row - stride;
  for (let x = 0; x < stride; x++) {
    const left = x >= CHANNELS ? (pixels[row + x - CHANNELS] ?? 0) : 0;
    const up = previous >= 0 ? (pixels[previous + x] ?? 0) : 0;
    const upLeft = previous >= 0 && x >= CHANNELS ? (pixels[previous + x - CHANNELS] ?? 0) : 0;
    target[x] = (pixels[row + x] ?? 0) - predict(filter, left, up, upLeft);
  }
}

function cost(row: Uint8Array): number {
  let total = 0;
  for (const byte of row) total += byte < SIGNED_BYTE_LIMIT ? byte : BYTE_VALUES - byte;
  return total;
}

function filterImage(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * CHANNELS;
  const filtered = new Uint8Array(height * (stride + 1));
  const candidates = FILTER_TYPES.map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    let best = 0;
    let bestCost = Infinity;
    FILTER_TYPES.forEach((filter, index) => {
      const candidate = candidates[index];
      if (candidate === undefined) return;
      filterRow(filter, pixels, y * stride, stride, candidate);
      const candidateCost = cost(candidate);
      if (candidateCost < bestCost) {
        best = index;
        bestCost = candidateCost;
      }
    });
    const offset = y * (stride + 1);
    filtered[offset] = FILTER_TYPES[best] ?? FilterType.None;
    filtered.set(candidates[best] ?? new Uint8Array(stride), offset + 1);
  }
  return filtered;
}

export function encodePng(raster: Raster): Uint8Array {
  const pixels = Uint8Array.from(raster.data, quantize);
  const data = zlibSync(filterImage(pixels, raster.width, raster.height));
  return concatBytes([
    PNG_SIGNATURE,
    chunk(ChunkType.Header, header(raster)),
    chunk(ChunkType.Data, data),
    chunk(ChunkType.End, new Uint8Array()),
  ]);
}
