import { strFromU8 } from "fflate";
import { RexelError } from "../errors.ts";
import type { Color } from "../graph/values.ts";
import { parseHexColor } from "../graph/values.ts";
import { decodePng } from "./png-decode.ts";
import { ALPHA, CHANNELS } from "./raster.ts";

const GPL_HEADER = "GIMP Palette";
const GPL_COLOR_LINE = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/;
const HEX_LINE = /^#?([0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)$/;
const CHANNEL_MAX = 255;
const MAX_PALETTE_COLORS = 4096;
const EXTENSION = /\.([a-z0-9]+)$/i;

function parseHex(text: string): Color[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith(";"))
    .map((line) => {
      const match = HEX_LINE.exec(line);
      if (match?.[1] === undefined)
        throw new RexelError({ reason: `"${line}" is not a hex color` });
      return parseHexColor(`#${match[1]}`);
    });
}

function parseGpl(text: string): Color[] {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== GPL_HEADER) {
    throw new RexelError({ reason: `GIMP palettes must start with "${GPL_HEADER}"` });
  }
  return lines.flatMap((line) => {
    const match = GPL_COLOR_LINE.exec(line);
    if (match === null) return [];
    const [, red = "0", green = "0", blue = "0"] = match;
    return [
      [
        Number(red) / CHANNEL_MAX,
        Number(green) / CHANNEL_MAX,
        Number(blue) / CHANNEL_MAX,
        1,
      ] as const,
    ];
  });
}

function parsePng(bytes: Uint8Array): Color[] {
  const image = decodePng(bytes);
  const seen = new Set<string>();
  const colors: Color[] = [];
  for (let offset = 0; offset < image.data.length; offset += CHANNELS) {
    if ((image.data[offset + ALPHA] ?? 0) === 0) continue;
    const color = Array.from(image.data.subarray(offset, offset + CHANNELS)) as [
      number,
      number,
      number,
      number,
    ];
    const key = color.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(color);
  }
  return colors;
}

export function parsePaletteFile(path: string, bytes: Uint8Array): Color[] {
  const extension = EXTENSION.exec(path)?.[1]?.toLowerCase();
  const colors =
    extension === "png"
      ? parsePng(bytes)
      : extension === "gpl"
        ? parseGpl(strFromU8(bytes))
        : extension === "hex" || extension === "txt"
          ? parseHex(strFromU8(bytes))
          : undefined;
  if (colors === undefined) {
    throw new RexelError({ reason: `Palette "${path}" must be a .hex, .txt, .gpl or .png file` });
  }
  if (colors.length === 0) throw new RexelError({ reason: `Palette "${path}" has no colors` });
  if (colors.length > MAX_PALETTE_COLORS) {
    throw new RexelError({
      reason: `Palette "${path}" has more than ${MAX_PALETTE_COLORS} colors`,
    });
  }
  return colors;
}
