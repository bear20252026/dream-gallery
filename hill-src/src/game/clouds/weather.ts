import * as THREE from 'three'
import { CONFIG } from '../config'
import { fbm2, rng, smoothstep } from '../noise'

/**
 * Cloud layout, baked once on the CPU:
 *
 * - Towering cumulus are unions of sphere "lobes" (stacked, with sub-lobes for the cauliflower
 *   look) stored as a signed distance field in a 3D texture (metres, negative inside).
 * - The cloud sea and the smaller humps on it are a heightfield in a 2D weather map:
 *     R: sea top height (m), G: hump factor 0..1, B: max top within SKIP_RADIUS (skipping).
 */
export const SKIP_RADIUS = 520

export type Lobe = { x: number; y: number; z: number; r: number }
type Cap = { x: number; z: number; y: number; r: number; hump: number }
type Tower = { lobes: Lobe[]; cx: number; cy: number; cz: number; bound: number }

/** [x, z, base radius, height above the sea]; the view from the spawn looks toward -z. */
const TOWERS: [number, number, number, number][] = [
  [-900, -3900, 1350, 3150], // the great tower right behind the ruin
  [1000, -4400, 1200, 2700],
  [2700, -5000, 1150, 3350],
  [-2800, -3500, 1150, 2550],
  [-4300, -2100, 950, 1900],
  [3900, -3000, 950, 2150],
  [-5300, -100, 1250, 2750],
  [-5100, 2500, 1050, 2150],
  [5300, -500, 1150, 2650],
  [5700, 2400, 950, 1850],
  [1600, 5600, 1200, 2450],
  [-1800, 5900, 1300, 2950],
  [4400, 6200, 950, 1750],
  [-4700, 6400, 1050, 2050],
  [-8000, -3900, 1250, 2350],
  [7700, -4500, 1250, 2550],
  [-700, -9300, 1650, 3450],
  [3200, -9100, 1350, 2650],
]

/** A cumulus complex: a main column plus shoulder columns, all lumpy and merging into the sea. */
function buildTower(R: () => number, tx: number, tz: number, rb: number, height: number): Lobe[] {
  const lobes: Lobe[] = []
  buildColumn(R, lobes, tx, tz, rb, height)
  const shoulders = height > 1500 ? 2 + Math.floor(R() * 2) : Math.floor(R() * 2)
  for (let s = 0; s < shoulders; s += 1) {
    const a = R() * Math.PI * 2
    const d = rb * (0.65 + R() * 0.45)
    buildColumn(R, lobes, tx + Math.cos(a) * d, tz + Math.sin(a) * d, rb * (0.55 + R() * 0.2), height * (0.35 + R() * 0.35))
  }
  return lobes
}

function buildColumn(R: () => number, lobes: Lobe[], tx: number, tz: number, rb: number, height: number): void {
  const sea = CONFIG.clouds.seaTop
  const first = lobes.length
  // Skirt: wide lobes half-sunk into the sea.
  for (let k = 0; k < 7; k += 1) {
    const a = (k / 7) * Math.PI * 2 + R() * 0.8
    const d = rb * (0.45 + R() * 0.45)
    const r = rb * (0.45 + R() * 0.25)
    lobes.push({ x: tx + Math.cos(a) * d, z: tz + Math.sin(a) * d, y: sea - r * 0.4 + R() * r * 0.25, r })
  }
  // Column: levels of 3-5 lobes that shrink and wander with height (wind shear lean).
  let y = sea + rb * 0.2
  let r = rb * 0.7
  let ax = tx
  let az = tz
  const leanX = (R() - 0.5) * 0.3
  const leanZ = (R() - 0.5) * 0.3
  const top = sea + height
  while (y + r < top) {
    const n = 3 + Math.floor(R() * 3)
    for (let k = 0; k < n; k += 1) {
      const a = R() * Math.PI * 2
      const d = r * (0.25 + R() * 0.5)
      lobes.push({ x: ax + Math.cos(a) * d, z: az + Math.sin(a) * d, y: y + (R() - 0.3) * r * 0.4, r: r * (0.62 + R() * 0.3) })
    }
    y += r * (0.5 + R() * 0.25)
    r *= 0.89 + R() * 0.05
    ax += leanX * r
    az += leanZ * r
  }
  // Crown: a cauliflower head, a rosette of bulging domes packed round a taller central one.
  lobes.push({ x: ax, z: az, y: top - r * 0.62, r: r * 0.74 })
  const petals = 5 + Math.floor(R() * 3)
  for (let k = 0; k < petals; k += 1) {
    const a = (k / petals) * Math.PI * 2 + R() * 0.5
    const d = r * (0.58 + R() * 0.22)
    lobes.push({ x: ax + Math.cos(a) * d, z: az + Math.sin(a) * d, y: top - r * (0.9 + R() * 0.45), r: r * (0.5 + R() * 0.18) })
  }
  // Florets: every big lobe grows rounded sub-lobes on its upper/outer skin, and the large ones
  // grow a second generation, so the heads bulge in clusters with clear creases between them.
  const sprout = (from: number, to: number, minR: number, gen: number) => {
    for (let i = from; i < to; i += 1) {
      const p = lobes[i]
      if (p.r < minR) continue
      const upper = p.y > sea + rb * 0.35
      const kids = gen === 0 ? (upper ? 3 + Math.floor(R() * 2) : 2 + Math.floor(R() * 2)) : 2 + Math.floor(R() * 2)
      for (let k = 0; k < kids; k += 1) {
        const a = R() * Math.PI * 2
        const elev = (upper ? 0.2 : -0.1) + R() * 1.15
        const dir = new THREE.Vector3(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev))
        const cr = p.r * (gen === 0 ? 0.36 + R() * 0.18 : 0.4 + R() * 0.14)
        const dist = p.r - cr * 0.22
        lobes.push({ x: p.x + dir.x * dist, y: p.y + dir.y * dist, z: p.z + dir.z * dist, r: cr })
      }
    }
  }
  const last = lobes.length
  sprout(first, last, 220, 0)
  sprout(last, lobes.length, 250, 1)
}

export function cloudLayout(seed = 7): { towers: Tower[]; caps: Cap[] } {
  const C = CONFIG.clouds
  const R = rng(seed)
  const specs = [...TOWERS]
  // Medium cumulus filling the gaps between the big complexes.
  for (let i = 0; i < 400 && specs.length < TOWERS.length + 26; i += 1) {
    const a = R() * Math.PI * 2
    const d = 2200 + R() * 8800
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    const rb = 380 + R() * 420
    if (specs.some(([sx, sz, sr]) => Math.hypot(sx - x, sz - z) < sr + rb + 500)) continue
    specs.push([x, z, rb, 450 + R() * 1100])
  }
  const towers: Tower[] = specs.map(([x, z, rb, h]) => {
    const lobes = buildTower(R, x, z, rb, h)
    const cx = lobes.reduce((s, l) => s + l.x, 0) / lobes.length
    const cy = lobes.reduce((s, l) => s + l.y, 0) / lobes.length
    const cz = lobes.reduce((s, l) => s + l.z, 0) / lobes.length
    const bound = Math.max(...lobes.map(l => Math.hypot(l.x - cx, l.y - cy, l.z - cz) + l.r))
    return { lobes, cx, cy, cz, bound }
  })
  const caps: Cap[] = []
  // Mid-size cumulus humps scattered across the sea, kept away from the summit.
  for (let i = 0; i < 110; i += 1) {
    const a = R() * Math.PI * 2
    const d = 1300 + Math.pow(R(), 0.7) * 11500
    const r = 160 + R() * 460
    caps.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: C.seaTop - r * (0.55 + R() * 0.3), r, hump: 1 })
  }
  // Mist puffs rising around the foot of the hill.
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2 + R() * 0.3
    const d = 210 + R() * 280
    const r = 60 + R() * 80
    caps.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: C.seaTop - r * 0.6 + 10 + R() * 22, r, hump: 0.6 })
  }
  return { towers, caps }
}

/** Sea heightfield weather map (half float, metres stored directly). */
export function buildWeatherMap(caps: Cap[], size = 512): THREE.DataTexture {
  const C = CONFIG.clouds
  const texel = (C.extent * 2) / size
  const top = new Float32Array(size * size)
  const hump = new Float32Array(size * size)
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const x = (i + 0.5) * texel - C.extent
      const z = (j + 0.5) * texel - C.extent
      const r = Math.hypot(x, z)
      let h = C.seaTop + fbm2(x / 2600, z / 2600, 3, 5) * 55 + fbm2(x / 700, z / 700, 2, 9) * 20
      h -= (1 - smoothstep(150, 900, r)) * 22
      top[j * size + i] = h
    }
  }
  for (const c of caps) {
    const i0 = Math.max(0, Math.floor((c.x - c.r + C.extent) / texel))
    const i1 = Math.min(size - 1, Math.ceil((c.x + c.r + C.extent) / texel))
    const j0 = Math.max(0, Math.floor((c.z - c.r + C.extent) / texel))
    const j1 = Math.min(size - 1, Math.ceil((c.z + c.r + C.extent) / texel))
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const x = (i + 0.5) * texel - C.extent
        const z = (j + 0.5) * texel - C.extent
        const d2 = (x - c.x) ** 2 + (z - c.z) ** 2
        if (d2 >= c.r * c.r) continue
        const cap = c.y + Math.sqrt(c.r * c.r - d2)
        const k = j * size + i
        if (cap > top[k]) {
          top[k] = cap
          hump[k] = Math.max(hump[k], c.hump * smoothstep(C.seaTop - 20, C.seaTop + 160, cap))
        }
      }
    }
  }
  const rad = Math.ceil(SKIP_RADIUS / texel) + 1
  const tmp = new Float32Array(size * size)
  const maxTop = new Float32Array(size * size)
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      let m = -Infinity
      for (let d = -rad; d <= rad; d += 1) m = Math.max(m, top[j * size + Math.min(size - 1, Math.max(0, i + d))])
      tmp[j * size + i] = m
    }
  }
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      let m = -Infinity
      for (let d = -rad; d <= rad; d += 1) m = Math.max(m, tmp[Math.min(size - 1, Math.max(0, j + d)) * size + i])
      maxTop[j * size + i] = m
    }
  }
  const data = new Uint16Array(size * size * 4)
  for (let k = 0; k < size * size; k += 1) {
    data[k * 4] = THREE.DataUtils.toHalfFloat(top[k])
    data[k * 4 + 1] = THREE.DataUtils.toHalfFloat(hump[k])
    data[k * 4 + 2] = THREE.DataUtils.toHalfFloat(maxTop[k])
    data[k * 4 + 3] = THREE.DataUtils.toHalfFloat(1)
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

export type TowerSdf = { texture: THREE.Data3DTexture; min: THREE.Vector3; size: THREE.Vector3 }

/**
 * Signed distance (m) to the union of all tower lobes, smooth-min blended. Built by splatting
 * each lobe into the voxels within `band` of its surface; everything else keeps a conservative
 * lower bound (bounding spheres per block, never below `band`) that is only used for skipping.
 */
export function buildTowerSdf(towers: Tower[], res = new THREE.Vector3(256, 48, 256)): TowerSdf {
  const min = new THREE.Vector3(-12000, -760, -12000)
  const size = new THREE.Vector3(24000, 4480, 24000)
  const nx = res.x
  const ny = res.y
  const nz = res.z
  const sx = size.x / nx
  const sy = size.y / ny
  const sz = size.z / nz
  const k = 90
  const band = 420
  const sdf = new Float32Array(nx * ny * nz)
  // 1) Block-wise lower bound from tower bounding spheres.
  const B = 8
  const half = Math.hypot(sx * B, sy * B, sz * B) * 0.5
  for (let bz = 0; bz < nz; bz += B) {
    for (let by = 0; by < ny; by += B) {
      for (let bx = 0; bx < nx; bx += B) {
        const cx = min.x + (bx + B / 2) * sx
        const cy = min.y + (by + B / 2) * sy
        const cz = min.z + (bz + B / 2) * sz
        let lb = 20000
        for (const t of towers) lb = Math.min(lb, Math.hypot(cx - t.cx, cy - t.cy, cz - t.cz) - t.bound - half)
        lb = Math.max(lb, band)
        for (let iz = bz; iz < Math.min(nz, bz + B); iz += 1)
          for (let iy = by; iy < Math.min(ny, by + B); iy += 1) sdf.fill(lb, (iz * ny + iy) * nx + bx, (iz * ny + iy) * nx + Math.min(nx, bx + B))
      }
    }
  }
  // 2) Exact near-surface distances: splat every lobe with a polynomial smooth min.
  for (const t of towers) {
    for (const l of t.lobes) {
      const reach = l.r + band
      const ix0 = Math.max(0, Math.floor((l.x - reach - min.x) / sx))
      const ix1 = Math.min(nx - 1, Math.ceil((l.x + reach - min.x) / sx))
      const iy0 = Math.max(0, Math.floor((l.y - reach - min.y) / sy))
      const iy1 = Math.min(ny - 1, Math.ceil((l.y + reach - min.y) / sy))
      const iz0 = Math.max(0, Math.floor((l.z - reach - min.z) / sz))
      const iz1 = Math.min(nz - 1, Math.ceil((l.z + reach - min.z) / sz))
      for (let iz = iz0; iz <= iz1; iz += 1) {
        const dz = min.z + (iz + 0.5) * sz - l.z
        for (let iy = iy0; iy <= iy1; iy += 1) {
          const dy = min.y + (iy + 0.5) * sy - l.y
          const row = (iz * ny + iy) * nx
          for (let ix = ix0; ix <= ix1; ix += 1) {
            const dx = min.x + (ix + 0.5) * sx - l.x
            const s = Math.sqrt(dx * dx + dy * dy + dz * dz) - l.r
            if (s > band) continue
            const d = sdf[row + ix]
            const h = Math.max(k - Math.abs(s - d), 0) / k
            sdf[row + ix] = Math.min(s, d) - h * h * k * 0.25
          }
        }
      }
    }
  }
  const data = new Uint16Array(nx * ny * nz)
  for (let i = 0; i < data.length; i += 1) data[i] = THREE.DataUtils.toHalfFloat(sdf[i])
  const texture = new THREE.Data3DTexture(data, nx, ny, nz)
  texture.format = THREE.RedFormat
  texture.type = THREE.HalfFloatType
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return { texture, min, size }
}
