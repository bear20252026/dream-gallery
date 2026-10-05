/** Deterministic noise helpers (CPU side). Everything seeded, so the world is identical per load. */

export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash2(ix: number, iy: number, seed = 0): number {
  let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** 2D gradient noise in roughly [-1, 1]. */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const g = (cx: number, cy: number, dx: number, dy: number) => {
    const a = hash2(cx, cy, seed) * Math.PI * 2
    return Math.cos(a) * dx + Math.sin(a) * dy
  }
  const u = fade(fx)
  const v = fade(fy)
  const n00 = g(ix, iy, fx, fy)
  const n10 = g(ix + 1, iy, fx - 1, fy)
  const n01 = g(ix, iy + 1, fx, fy - 1)
  const n11 = g(ix + 1, iy + 1, fx - 1, fy - 1)
  const nx0 = n00 + (n10 - n00) * u
  const nx1 = n01 + (n11 - n01) * u
  return (nx0 + (nx1 - nx0) * v) * 1.41
}

export function fbm2(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let i = 0; i < octaves; i += 1) {
    sum += noise2(x, y, seed + i * 17) * amp
    norm += amp
    // Rotate each octave a little to hide the lattice.
    const nx = x * 1.6 - y * 1.2
    y = x * 1.2 + y * 1.6
    x = nx
    amp *= 0.5
  }
  return sum / norm
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
