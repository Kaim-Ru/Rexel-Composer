import type { Color, PortType, PortValue, RasterData, Vector } from "@rexel-composer/plugin-api";
import { RexelError } from "../errors.ts";
import { Raster } from "../image/raster.ts";

export type { Color, PortType, PortValue, Vector };

export type Values = Readonly<Record<string, PortValue>>;

const HEX_COLOR = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/;
const HEX_RADIX = 16;
const HEX_CHANNEL_LENGTH = 2;
const RGB_CHANNEL_COUNT = 3;
const CHANNEL_MAX = 255;
const COLOR_CHANNELS = 4;
const VECTOR_LENGTH = 2;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function parseHexColor(hex: string): Color {
  const match = HEX_COLOR.exec(hex);
  if (match === null)
    throw new RexelError({ reason: `"${hex}" is not a #RRGGBB or #RRGGBBAA color` });
  const digits = `${match[1] ?? ""}${match[2] ?? "ff"}`;
  const channel = (index: number) =>
    parseInt(
      digits.slice(index * HEX_CHANNEL_LENGTH, (index + 1) * HEX_CHANNEL_LENGTH),
      HEX_RADIX,
    ) / CHANNEL_MAX;
  return [channel(0), channel(1), channel(2), channel(RGB_CHANNEL_COUNT)];
}

export function formatHexColor(color: Color): string {
  const hex = color
    .map((channel) =>
      Math.round(Math.min(Math.max(channel, 0), 1) * CHANNEL_MAX)
        .toString(HEX_RADIX)
        .padStart(HEX_CHANNEL_LENGTH, "0"),
    )
    .join("");
  return `#${hex}`;
}

export function isRasterData(value: unknown): value is RasterData {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    value.data instanceof Float32Array &&
    "width" in value &&
    typeof value.width === "number"
  );
}

export function reviveValue(value: unknown): unknown {
  return isRasterData(value) ? Raster.from(value) : value;
}

export function reviveRecord(record: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, reviveValue(value)]),
  );
}

function isNumberArray(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

export function valueMatchesType(value: unknown, type: PortType): boolean {
  switch (type) {
    case "image":
      return isRasterData(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "vector":
      return isNumberArray(value, VECTOR_LENGTH);
    case "color":
      return isNumberArray(value, COLOR_CHANNELS);
  }
}

export function describeValue(value: PortValue): string {
  if (typeof value === "number") return String(value);
  if (isRasterData(value)) return `${value.width}x${value.height}`;
  return value.length === COLOR_CHANNELS ? formatHexColor(value) : `(${value.join(", ")})`;
}

export function transferablesOf(values: Readonly<Record<string, unknown>>): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const value of Object.values(values)) {
    if (isRasterData(value)) buffers.add(value.data.buffer);
  }
  return [...buffers];
}
