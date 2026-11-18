export const BITS_PER_BYTE = 8;
export const BYTE_MAX = 255;
export const UINT16_MAX = 65535;
export const BYTES_PER_UINT16 = 2;
export const BYTES_PER_UINT32 = 4;
export const CHUNK_TYPE_LENGTH = 4;
export const CHUNK_OVERHEAD = BYTES_PER_UINT32 + CHUNK_TYPE_LENGTH + BYTES_PER_UINT32;
export const IHDR_LENGTH = 13;
export const RGB_CHANNELS = 3;

export const PNG_SIGNATURE = asciiBytes("\x89PNG\r\n\x1a\n");

export const ChunkType = {
  Header: "IHDR",
  Palette: "PLTE",
  Transparency: "tRNS",
  Data: "IDAT",
  End: "IEND",
} as const;

export enum ColorType {
  Grayscale = 0,
  Truecolor = 2,
  Indexed = 3,
  GrayscaleAlpha = 4,
  TruecolorAlpha = 6,
}

export enum BitDepth {
  One = 1,
  Two = 2,
  Four = 4,
  Eight = 8,
  Sixteen = 16,
}

export enum FilterType {
  None = 0,
  Sub = 1,
  Up = 2,
  Average = 3,
  Paeth = 4,
}

export const FILTER_TYPES = [
  FilterType.None,
  FilterType.Sub,
  FilterType.Up,
  FilterType.Average,
  FilterType.Paeth,
] as const;

export enum Interlace {
  None = 0,
  Adam7 = 1,
}

export const SAMPLES_PER_PIXEL: Readonly<Record<ColorType, number>> = {
  [ColorType.Grayscale]: 1,
  [ColorType.Truecolor]: RGB_CHANNELS,
  [ColorType.Indexed]: 1,
  [ColorType.GrayscaleAlpha]: 2,
  [ColorType.TruecolorAlpha]: 4,
};

export const ALLOWED_BIT_DEPTHS: Readonly<Record<ColorType, readonly BitDepth[]>> = {
  [ColorType.Grayscale]: [
    BitDepth.One,
    BitDepth.Two,
    BitDepth.Four,
    BitDepth.Eight,
    BitDepth.Sixteen,
  ],
  [ColorType.Truecolor]: [BitDepth.Eight, BitDepth.Sixteen],
  [ColorType.Indexed]: [BitDepth.One, BitDepth.Two, BitDepth.Four, BitDepth.Eight],
  [ColorType.GrayscaleAlpha]: [BitDepth.Eight, BitDepth.Sixteen],
  [ColorType.TruecolorAlpha]: [BitDepth.Eight, BitDepth.Sixteen],
};

export function asciiBytes(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function asciiString(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

const CRC_POLYNOMIAL = 0xedb88320;
const CRC_INITIAL = 0xffffffff;
const BYTE_MASK = 0xff;
const BYTE_VALUES = 256;

const CRC_TABLE = Uint32Array.from({ length: BYTE_VALUES }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < BITS_PER_BYTE; bit++) {
    crc = crc & 1 ? CRC_POLYNOMIAL ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = CRC_INITIAL;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & BYTE_MASK] ?? 0) ^ (crc >>> BITS_PER_BYTE);
  }
  return (crc ^ CRC_INITIAL) >>> 0;
}

export function predict(filter: FilterType, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case FilterType.None:
      return 0;
    case FilterType.Sub:
      return left;
    case FilterType.Up:
      return up;
    case FilterType.Average:
      return Math.floor((left + up) / 2);
    case FilterType.Paeth:
      return paethPredictor(left, up, upLeft);
  }
}

function enumLookup<Member extends number>(
  members: readonly Member[],
): (value: number) => Member | undefined {
  const byValue = new Map<number, Member>(members.map((member) => [member, member]));
  return (value) => byValue.get(value);
}

export const toFilterType = enumLookup(FILTER_TYPES);

export const toColorType = enumLookup([
  ColorType.Grayscale,
  ColorType.Truecolor,
  ColorType.Indexed,
  ColorType.GrayscaleAlpha,
  ColorType.TruecolorAlpha,
]);

export const toBitDepth = enumLookup([
  BitDepth.One,
  BitDepth.Two,
  BitDepth.Four,
  BitDepth.Eight,
  BitDepth.Sixteen,
]);

export const toInterlace = enumLookup([Interlace.None, Interlace.Adam7]);

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  return distanceUp <= distanceUpLeft ? up : upLeft;
}
