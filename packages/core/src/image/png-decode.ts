import { unzlibSync } from "fflate";
import { RexelError } from "../errors.ts";
import {
  ALLOWED_BIT_DEPTHS,
  BITS_PER_BYTE,
  BYTE_MAX,
  BYTES_PER_UINT16,
  BYTES_PER_UINT32,
  CHUNK_OVERHEAD,
  CHUNK_TYPE_LENGTH,
  ChunkType,
  ColorType,
  BitDepth,
  IHDR_LENGTH,
  Interlace,
  PNG_SIGNATURE,
  RGB_CHANNELS,
  SAMPLES_PER_PIXEL,
  asciiString,
  concatBytes,
  crc32,
  predict,
  toBitDepth,
  toColorType,
  toFilterType,
  toInterlace,
} from "./png-format.ts";
import { assertImageSize, CHANNELS, Raster } from "./raster.ts";

const BIT_DEPTH_OFFSET = 8;
const COLOR_TYPE_OFFSET = 9;
const COMPRESSION_OFFSET = 10;
const FILTER_METHOD_OFFSET = 11;
const INTERLACE_OFFSET = 12;
const SUPPORTED_METHOD = 0;
const ALPHA_INDEX = 3;
const OPAQUE = 1;
const TRANSPARENT = 0;

interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: BitDepth;
  readonly colorType: ColorType;
}

interface PngChunks {
  readonly header: PngHeader;
  readonly palette: Uint8Array | undefined;
  readonly transparency: Uint8Array | undefined;
  readonly data: Uint8Array;
}

function fail(reason: string): never {
  throw new RexelError({ reason: `Invalid PNG: ${reason}` });
}

function parseHeader(data: Uint8Array): PngHeader {
  if (data.length !== IHDR_LENGTH) fail("IHDR has the wrong length");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(0);
  const height = view.getUint32(BYTES_PER_UINT32);
  const rawBitDepth = view.getUint8(BIT_DEPTH_OFFSET);
  const rawColorType = view.getUint8(COLOR_TYPE_OFFSET);
  const colorType = toColorType(rawColorType);
  if (colorType === undefined) fail(`unknown color type ${rawColorType}`);
  const bitDepth = toBitDepth(rawBitDepth);
  if (bitDepth === undefined || !ALLOWED_BIT_DEPTHS[colorType].includes(bitDepth)) {
    fail(`bit depth ${rawBitDepth} is invalid for color type ${rawColorType}`);
  }
  if (view.getUint8(COMPRESSION_OFFSET) !== SUPPORTED_METHOD) fail("unknown compression method");
  if (view.getUint8(FILTER_METHOD_OFFSET) !== SUPPORTED_METHOD) fail("unknown filter method");
  const rawInterlace = view.getUint8(INTERLACE_OFFSET);
  const interlace = toInterlace(rawInterlace);
  if (interlace === undefined) fail(`unknown interlace method ${rawInterlace}`);
  if (interlace === Interlace.Adam7) {
    throw new RexelError({
      reason: "Interlaced PNG is not supported. Save the image without interlacing.",
    });
  }
  assertImageSize(width, height);
  return { width, height, bitDepth, colorType };
}

function readChunks(bytes: Uint8Array): PngChunks {
  if (
    bytes.length < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) {
    fail("the file does not start with the PNG signature");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  let header: PngHeader | undefined;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const data: Uint8Array[] = [];
  for (;;) {
    if (offset + CHUNK_OVERHEAD > bytes.length) fail("the file is truncated");
    const length = view.getUint32(offset);
    const typeStart = offset + BYTES_PER_UINT32;
    const dataStart = typeStart + CHUNK_TYPE_LENGTH;
    const dataEnd = dataStart + length;
    if (dataEnd + BYTES_PER_UINT32 > bytes.length) fail("the file is truncated");
    if (crc32(bytes.subarray(typeStart, dataEnd)) !== view.getUint32(dataEnd)) {
      fail("a chunk checksum does not match");
    }
    const type = asciiString(bytes.subarray(typeStart, dataStart));
    const chunk = bytes.subarray(dataStart, dataEnd);
    offset = dataEnd + BYTES_PER_UINT32;
    if (header === undefined && type !== ChunkType.Header) fail("IHDR must come first");
    switch (type) {
      case ChunkType.Header:
        header = parseHeader(chunk);
        break;
      case ChunkType.Palette:
        palette = chunk;
        break;
      case ChunkType.Transparency:
        transparency = chunk;
        break;
      case ChunkType.Data:
        data.push(chunk);
        break;
      case ChunkType.End:
        if (header === undefined) fail("IHDR is missing");
        if (data.length === 0) fail("IDAT is missing");
        return { header, palette, transparency, data: concatBytes(data) };
    }
  }
}

function inflate(data: Uint8Array): Uint8Array {
  try {
    return unzlibSync(data);
  } catch {
    return fail("the image data cannot be decompressed");
  }
}

function unfilter(header: PngHeader, filtered: Uint8Array): { rows: Uint8Array; stride: number } {
  const bitsPerPixel = SAMPLES_PER_PIXEL[header.colorType] * header.bitDepth;
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / BITS_PER_BYTE));
  const stride = Math.ceil((header.width * bitsPerPixel) / BITS_PER_BYTE);
  if (filtered.length < header.height * (stride + 1)) fail("the image data is too short");
  const rows = new Uint8Array(header.height * stride);
  for (let y = 0; y < header.height; y++) {
    const rawFilter = filtered[y * (stride + 1)] ?? 0;
    const filter = toFilterType(rawFilter);
    if (filter === undefined) fail(`unknown filter type ${rawFilter}`);
    const source = y * (stride + 1) + 1;
    const row = y * stride;
    const previous = row - stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? (rows[row + x - bytesPerPixel] ?? 0) : 0;
      const up = y > 0 ? (rows[previous + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? (rows[previous + x - bytesPerPixel] ?? 0) : 0;
      rows[row + x] = (filtered[source + x] ?? 0) + predict(filter, left, up, upLeft);
    }
  }
  return { rows, stride };
}

class SampleReader {
  private readonly maxValue: number;

  constructor(
    private readonly rows: Uint8Array,
    private readonly stride: number,
    private readonly bitDepth: BitDepth,
  ) {
    this.maxValue = 2 ** bitDepth - 1;
  }

  get max(): number {
    return this.maxValue;
  }

  read(y: number, sampleIndex: number): number {
    const row = y * this.stride;
    if (this.bitDepth === BitDepth.Sixteen) {
      const offset = row + sampleIndex * BYTES_PER_UINT16;
      return ((this.rows[offset] ?? 0) << BITS_PER_BYTE) | (this.rows[offset + 1] ?? 0);
    }
    const bitOffset = sampleIndex * this.bitDepth;
    const byte = this.rows[row + Math.floor(bitOffset / BITS_PER_BYTE)] ?? 0;
    const shift = BITS_PER_BYTE - this.bitDepth - (bitOffset % BITS_PER_BYTE);
    return (byte >> shift) & this.maxValue;
  }
}

function readUint16(bytes: Uint8Array | undefined, index: number): number | undefined {
  if (bytes === undefined || bytes.length < (index + 1) * BYTES_PER_UINT16) return undefined;
  const offset = index * BYTES_PER_UINT16;
  return ((bytes[offset] ?? 0) << BITS_PER_BYTE) | (bytes[offset + 1] ?? 0);
}

function toRaster(chunks: PngChunks, reader: SampleReader): Raster {
  const { width, height, colorType } = chunks.header;
  const samples = SAMPLES_PER_PIXEL[colorType];
  const { palette, transparency } = chunks;
  if (colorType === ColorType.Indexed && palette === undefined) fail("PLTE is missing");
  const keyGray = readUint16(transparency, 0);
  const keyRgb = [0, 1, 2].map((channel) => readUint16(transparency, channel));
  const raster = new Raster(width, height);
  const pixel = new Array<number>(samples).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < samples; channel++) {
        pixel[channel] = reader.read(y, x * samples + channel);
      }
      const target = (y * width + x) * CHANNELS;
      const rgba = decodePixel(
        colorType,
        pixel,
        reader.max,
        palette,
        transparency,
        keyGray,
        keyRgb,
      );
      raster.data.set(rgba, target);
    }
  }
  return raster;
}

function decodePixel(
  colorType: ColorType,
  pixel: readonly number[],
  max: number,
  palette: Uint8Array | undefined,
  transparency: Uint8Array | undefined,
  keyGray: number | undefined,
  keyRgb: readonly (number | undefined)[],
): readonly number[] {
  const [first = 0, second = 0, third = 0, fourth = 0] = pixel;
  switch (colorType) {
    case ColorType.Grayscale: {
      const gray = first / max;
      return [gray, gray, gray, first === keyGray ? TRANSPARENT : OPAQUE];
    }
    case ColorType.GrayscaleAlpha: {
      const gray = first / max;
      return [gray, gray, gray, second / max];
    }
    case ColorType.Truecolor: {
      const keyed = pixel.every((value, channel) => value === keyRgb[channel]);
      return [first / max, second / max, third / max, keyed ? TRANSPARENT : OPAQUE];
    }
    case ColorType.TruecolorAlpha:
      return [first / max, second / max, third / max, fourth / max];
    case ColorType.Indexed: {
      const entry = first * RGB_CHANNELS;
      if (palette === undefined || entry + ALPHA_INDEX > palette.length) {
        fail(`palette index ${first} is out of range`);
      }
      const alpha = transparency?.[first] ?? BYTE_MAX;
      return [
        (palette[entry] ?? 0) / BYTE_MAX,
        (palette[entry + 1] ?? 0) / BYTE_MAX,
        (palette[entry + 2] ?? 0) / BYTE_MAX,
        alpha / BYTE_MAX,
      ];
    }
  }
}

export function decodePng(bytes: Uint8Array): Raster {
  const chunks = readChunks(bytes);
  const { rows, stride } = unfilter(chunks.header, inflate(chunks.data));
  return toRaster(chunks, new SampleReader(rows, stride, chunks.header.bitDepth));
}
