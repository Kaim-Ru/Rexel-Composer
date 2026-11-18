import { encodePng, parseHexColor, Raster } from "@rexel/core";

const ICON_ROWS = [
  "................",
  "................",
  "..AAAA..........",
  "..AAAA..........",
  "..AAAALLL.......",
  "..AAAA..L.......",
  "........L.......",
  "........L.......",
  "........L.......",
  "........L.BBBB..",
  "........LLBBBB..",
  "..........BBBB..",
  "..........BBBB..",
  "................",
  "................",
  "................",
];

const ICON_COLORS: Record<string, string> = {
  ".": "#1f1f1f",
  A: "#0078d4",
  B: "#cccccc",
  L: "#cccccc",
};

export function renderAppIcon(size: number): Uint8Array {
  const raster = new Raster(size, size);
  const cells = ICON_ROWS.length;
  for (let y = 0; y < size; y++) {
    const row = ICON_ROWS[Math.floor((y * cells) / size)] ?? "";
    for (let x = 0; x < size; x++) {
      const key = row[Math.floor((x * cells) / size)] ?? ".";
      raster.data.set(parseHexColor(ICON_COLORS[key] ?? "#000000"), raster.index(x, y));
    }
  }
  return encodePng(raster);
}
