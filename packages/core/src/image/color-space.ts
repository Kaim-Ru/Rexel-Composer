const HUE_SECTORS = 6;
const DEGREES_PER_TURN = 360;
const LUMA_RED = 0.2126;
const LUMA_GREEN = 0.7152;
const LUMA_BLUE = 0.0722;
const SECTOR_GREEN = 2;
const SECTOR_BLUE = 4;
const SECTOR_RED_GREEN = 0;
const SECTOR_GREEN_START = 1;
const SECTOR_CYAN = 2;
const SECTOR_BLUE_START = 3;
const SECTOR_MAGENTA = 4;

export function luminance(red: number, green: number, blue: number): number {
  return red * LUMA_RED + green * LUMA_GREEN + blue * LUMA_BLUE;
}

export function rgbToHsv(red: number, green: number, blue: number): [number, number, number] {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta + HUE_SECTORS) % HUE_SECTORS;
    else if (max === green) hue = (blue - red) / delta + SECTOR_GREEN;
    else hue = (red - green) / delta + SECTOR_BLUE;
  }
  return [(hue / HUE_SECTORS) * DEGREES_PER_TURN, max === 0 ? 0 : delta / max, max];
}

export function hsvToRgb(hue: number, saturation: number, value: number): [number, number, number] {
  const wrapped =
    (((hue % DEGREES_PER_TURN) + DEGREES_PER_TURN) % DEGREES_PER_TURN) / DEGREES_PER_TURN;
  const scaled = wrapped * HUE_SECTORS;
  const sector = Math.floor(scaled) % HUE_SECTORS;
  const fraction = scaled - Math.floor(scaled);
  const low = value * (1 - saturation);
  const falling = value * (1 - saturation * fraction);
  const rising = value * (1 - saturation * (1 - fraction));
  switch (sector) {
    case SECTOR_RED_GREEN:
      return [value, rising, low];
    case SECTOR_GREEN_START:
      return [falling, value, low];
    case SECTOR_CYAN:
      return [low, value, rising];
    case SECTOR_BLUE_START:
      return [low, falling, value];
    case SECTOR_MAGENTA:
      return [rising, low, value];
    default:
      return [value, low, falling];
  }
}
