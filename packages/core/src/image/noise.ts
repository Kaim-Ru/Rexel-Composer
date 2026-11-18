const HASH_PRIME_X = 0x27d4eb2d;
const NOISE_HALF = 0.5;
const HASH_PRIME_Y = 0x165667b1;
const HASH_PRIME_SEED = 0x9e3779b9;
const HASH_MIX = 0x85ebca6b;
const HASH_MIX_SECOND = 0xc2b2ae35;
const HASH_SHIFT_HIGH = 16;
const HASH_SHIFT_MID = 13;
const UINT32_RANGE = 4294967296;
const GRADIENT_DIRECTIONS = 8;
const FADE_QUINTIC = 6;
const FADE_QUARTIC = 15;
const FADE_CUBIC = 10;
const PERLIN_RANGE = Math.SQRT2;
const OCTAVE_GAIN = 0.5;
const OCTAVE_LACUNARITY = 2;
const NEIGHBOR_RANGE = 1;

function hash(x: number, y: number, seed: number): number {
  let value =
    Math.imul(x, HASH_PRIME_X) ^ Math.imul(y, HASH_PRIME_Y) ^ Math.imul(seed, HASH_PRIME_SEED);
  value = Math.imul(value ^ (value >>> HASH_SHIFT_HIGH), HASH_MIX);
  value = Math.imul(value ^ (value >>> HASH_SHIFT_MID), HASH_MIX_SECOND);
  value ^= value >>> HASH_SHIFT_HIGH;
  return (value >>> 0) / UINT32_RANGE;
}

function fade(t: number): number {
  return t * t * t * (t * (t * FADE_QUINTIC - FADE_QUARTIC) + FADE_CUBIC);
}

function gradientDot(cellX: number, cellY: number, seed: number, dx: number, dy: number): number {
  const angle =
    (Math.floor(hash(cellX, cellY, seed) * GRADIENT_DIRECTIONS) / GRADIENT_DIRECTIONS) *
    Math.PI *
    2;
  return Math.cos(angle) * dx + Math.sin(angle) * dy;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function perlinOctave(x: number, y: number, seed: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const dx = x - cellX;
  const dy = y - cellY;
  const u = fade(dx);
  const v = fade(dy);
  const top = lerp(
    gradientDot(cellX, cellY, seed, dx, dy),
    gradientDot(cellX + 1, cellY, seed, dx - 1, dy),
    u,
  );
  const bottom = lerp(
    gradientDot(cellX, cellY + 1, seed, dx, dy - 1),
    gradientDot(cellX + 1, cellY + 1, seed, dx - 1, dy - 1),
    u,
  );
  return lerp(top, bottom, v) * PERLIN_RANGE;
}

export function perlin(x: number, y: number, seed: number, octaves: number): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let range = 0;
  for (let octave = 0; octave < octaves; octave++) {
    total += perlinOctave(x * frequency, y * frequency, seed + octave) * amplitude;
    range += amplitude;
    amplitude *= OCTAVE_GAIN;
    frequency *= OCTAVE_LACUNARITY;
  }
  return Math.min(Math.max((total / range) * NOISE_HALF + NOISE_HALF, 0), 1);
}

export function cellular(x: number, y: number, seed: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let nearest = Infinity;
  for (let offsetY = -NEIGHBOR_RANGE; offsetY <= NEIGHBOR_RANGE; offsetY++) {
    for (let offsetX = -NEIGHBOR_RANGE; offsetX <= NEIGHBOR_RANGE; offsetX++) {
      const neighborX = cellX + offsetX;
      const neighborY = cellY + offsetY;
      const pointX = neighborX + hash(neighborX, neighborY, seed);
      const pointY = neighborY + hash(neighborY, neighborX, seed + 1);
      nearest = Math.min(nearest, Math.hypot(pointX - x, pointY - y));
    }
  }
  return Math.min(nearest, 1);
}
