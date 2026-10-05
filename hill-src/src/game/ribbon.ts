import * as THREE from 'three'
import { rng } from './noise'
import type { RuinAnchors } from './ruin'
import { terrainHeight } from './terrain'
import type { Wind } from './wind'

/**
 * The red ribbon: two cloth tails (Verlet particles, structural/shear/bend constraints) tied at
 * the band's knot and driven by quadratic aerodynamic drag, which produces flag-like flutter on
 * its own. A thin string hangs from the band's right side and a loose rope loop sags from the
 * knob; both are Verlet chains drawn as camera-facing strips.
 */

const AIR = 0.72 // 0.5 * rho * Cd
const AREAL_DENSITY = 0.2 // kg/m^2, a silk sash
const MAX_ACC = 160

class Cloth {
  readonly pos: Float32Array
  readonly prev: Float32Array
  readonly inv: Float32Array
  readonly acc: Float32Array
  readonly index: Uint16Array
  private readonly cons: Int32Array
  private readonly rest: Float32Array
  private readonly stiff: Float32Array
  private readonly mass: Float32Array

  constructor(
    readonly cols: number,
    readonly rows: number,
    anchor: THREE.Vector3,
    across: THREE.Vector3,
    along: THREE.Vector3,
    width: (v: number) => number,
    readonly length: number,
  ) {
    const n = cols * rows
    this.pos = new Float32Array(n * 3)
    this.prev = new Float32Array(n * 3)
    this.inv = new Float32Array(n)
    this.acc = new Float32Array(n * 3)
    this.mass = new Float32Array(n)
    const dv = length / (rows - 1)
    for (let i = 0; i < rows; i += 1) {
      const v = i / (rows - 1)
      const w = width(v)
      for (let j = 0; j < cols; j += 1) {
        const k = i * cols + j
        const u = j / (cols - 1) - 0.5
        const p = anchor.clone().addScaledVector(along, v * length).addScaledVector(across, u * w)
        this.pos.set([p.x, p.y, p.z], k * 3)
        this.prev.set([p.x, p.y, p.z], k * 3)
        this.mass[k] = (AREAL_DENSITY * w * dv) / cols
        this.inv[k] = i === 0 ? 0 : 1 / this.mass[k]
      }
    }
    const cons: number[] = []
    const stiff: number[] = []
    const add = (a: number, b: number, s: number) => {
      cons.push(a, b)
      stiff.push(s)
    }
    for (let i = 0; i < rows; i += 1) {
      for (let j = 0; j < cols; j += 1) {
        const k = i * cols + j
        if (j + 1 < cols) add(k, k + 1, 1)
        if (i + 1 < rows) add(k, k + cols, 1)
        if (i + 1 < rows && j + 1 < cols) {
          add(k, k + cols + 1, 0.6)
          add(k + 1, k + cols, 0.6)
        }
        if (i + 2 < rows) add(k, k + cols * 2, 0.12)
      }
    }
    this.cons = new Int32Array(cons)
    this.stiff = new Float32Array(stiff)
    this.rest = new Float32Array(stiff.length)
    for (let c = 0; c < this.rest.length; c += 1) {
      const a = this.cons[c * 2] * 3
      const b = this.cons[c * 2 + 1] * 3
      this.rest[c] = Math.hypot(this.pos[a] - this.pos[b], this.pos[a + 1] - this.pos[b + 1], this.pos[a + 2] - this.pos[b + 2])
    }
    const idx: number[] = []
    for (let i = 0; i < rows - 1; i += 1) {
      for (let j = 0; j < cols - 1; j += 1) {
        const a = i * cols + j
        idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1)
      }
    }
    this.index = new Uint16Array(idx)
  }

  step(dt: number, wind: Wind, caps: Capsule[], iterations: number): void {
    const { pos, prev, inv, acc, index } = this
    const n = inv.length
    acc.fill(0)
    for (let k = 0; k < n; k += 1) acc[k * 3 + 1] = -9.8
    // Aerodynamic drag per triangle, split over its corners.
    const w = _w
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t] * 3
      const b = index[t + 1] * 3
      const c = index[t + 2] * 3
      const e1x = pos[b] - pos[a]
      const e1y = pos[b + 1] - pos[a + 1]
      const e1z = pos[b + 2] - pos[a + 2]
      const e2x = pos[c] - pos[a]
      const e2y = pos[c + 1] - pos[a + 1]
      const e2z = pos[c + 2] - pos[a + 2]
      let nx = e1y * e2z - e1z * e2y
      let ny = e1z * e2x - e1x * e2z
      let nz = e1x * e2y - e1y * e2x
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-9) continue
      const area = len * 0.5
      nx /= len
      ny /= len
      nz /= len
      _p.set((pos[a] + pos[b] + pos[c]) / 3, (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3)
      wind.velocityAt(_p, w)
      const vx = (pos[a] - prev[a] + pos[b] - prev[b] + pos[c] - prev[c]) / (3 * dt)
      const vy = (pos[a + 1] - prev[a + 1] + pos[b + 1] - prev[b + 1] + pos[c + 1] - prev[c + 1]) / (3 * dt)
      const vz = (pos[a + 2] - prev[a + 2] + pos[b + 2] - prev[b + 2] + pos[c + 2] - prev[c + 2]) / (3 * dt)
      const rx = w.x - vx
      const ry = w.y - vy
      const rz = w.z - vz
      const vn = rx * nx + ry * ny + rz * nz
      const fn = AIR * area * vn * Math.abs(vn)
      // A little skin friction along the surface keeps the tail streaming downwind.
      const tx = rx - vn * nx
      const ty = ry - vn * ny
      const tz = rz - vn * nz
      const ft = AIR * 0.06 * area
      for (const q of [a, b, c]) {
        const im = inv[q / 3] / 3
        acc[q] += (fn * nx + ft * tx) * im
        acc[q + 1] += (fn * ny + ft * ty) * im
        acc[q + 2] += (fn * nz + ft * tz) * im
      }
    }
    const dt2 = dt * dt
    for (let k = 0; k < n; k += 1) {
      if (inv[k] === 0) continue
      const i = k * 3
      let ax = acc[i]
      let ay = acc[i + 1]
      let az = acc[i + 2]
      const am = Math.hypot(ax, ay, az)
      if (am > MAX_ACC) {
        const s = MAX_ACC / am
        ax *= s
        ay *= s
        az *= s
      }
      for (let d = 0; d < 3; d += 1) {
        const x = pos[i + d]
        const v = (x - prev[i + d]) * 0.992
        prev[i + d] = x
        pos[i + d] = x + v + (d === 0 ? ax : d === 1 ? ay : az) * dt2
      }
    }
    for (let it = 0; it < iterations; it += 1) {
      for (let c = 0; c < this.rest.length; c += 1) {
        const a = this.cons[c * 2]
        const b = this.cons[c * 2 + 1]
        const wa = inv[a]
        const wb = inv[b]
        const ws = wa + wb
        if (ws === 0) continue
        const ia = a * 3
        const ib = b * 3
        const dx = pos[ib] - pos[ia]
        const dy = pos[ib + 1] - pos[ia + 1]
        const dz = pos[ib + 2] - pos[ia + 2]
        const d = Math.hypot(dx, dy, dz) || 1e-6
        const diff = ((d - this.rest[c]) / (d * ws)) * this.stiff[c]
        pos[ia] += dx * diff * wa
        pos[ia + 1] += dy * diff * wa
        pos[ia + 2] += dz * diff * wa
        pos[ib] -= dx * diff * wb
        pos[ib + 1] -= dy * diff * wb
        pos[ib + 2] -= dz * diff * wb
      }
    }
    collide(pos, inv, caps)
  }
}

type Capsule = { a: THREE.Vector3; b: THREE.Vector3; r: number }
const _p = new THREE.Vector3()
const _w = new THREE.Vector3()

/** Pushes free particles out of every body capsule (a == b makes a sphere), then above the turf. */
function collide(pos: Float32Array, inv: Float32Array, caps: Capsule[]): void {
  for (let k = 0; k < inv.length; k += 1) {
    if (inv[k] === 0) continue
    const i = k * 3
    for (const cap of caps) {
      const ab = _ab.subVectors(cap.b, cap.a)
      const abLen2 = ab.lengthSq()
      const px = pos[i]
      const py = pos[i + 1]
      const pz = pos[i + 2]
      let t = abLen2 > 1e-9 ? ((px - cap.a.x) * ab.x + (py - cap.a.y) * ab.y + (pz - cap.a.z) * ab.z) / abLen2 : 0
      t = Math.max(0, Math.min(1, t))
      const cx = cap.a.x + ab.x * t
      const cy = cap.a.y + ab.y * t
      const cz = cap.a.z + ab.z * t
      const dx = px - cx
      const dy = py - cy
      const dz = pz - cz
      const d = Math.hypot(dx, dy, dz)
      if (d < cap.r && d > 1e-6) {
        const s = cap.r / d
        pos[i] = cx + dx * s
        pos[i + 1] = cy + dy * s
        pos[i + 2] = cz + dz * s
      }
    }
    const g = terrainHeight(pos[i], pos[i + 2]) + 0.04
    if (pos[i + 1] < g) pos[i + 1] = g
  }
}
const _ab = new THREE.Vector3()

class Rope {
  readonly pos: Float32Array
  readonly prev: Float32Array
  readonly inv: Float32Array
  private readonly rest: number

  constructor(readonly count: number, a: THREE.Vector3, b: THREE.Vector3 | null, length: number, down: THREE.Vector3) {
    this.pos = new Float32Array(count * 3)
    this.prev = new Float32Array(count * 3)
    this.inv = new Float32Array(count).fill(1)
    this.rest = length / (count - 1)
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1)
      const p = b ? a.clone().lerp(b, t).addScaledVector(down, Math.sin(t * Math.PI) * length * 0.3) : a.clone().addScaledVector(down, t * length)
      this.pos.set([p.x, p.y, p.z], i * 3)
      this.prev.set([p.x, p.y, p.z], i * 3)
    }
    this.inv[0] = 0
    if (b) this.inv[count - 1] = 0
  }

  step(dt: number, wind: Wind, caps: Capsule[], drag: number): void {
    const { pos, prev, inv } = this
    const dt2 = dt * dt
    for (let k = 0; k < this.count; k += 1) {
      if (inv[k] === 0) continue
      const i = k * 3
      _p.set(pos[i], pos[i + 1], pos[i + 2])
      wind.velocityAt(_p, _w)
      for (let d = 0; d < 3; d += 1) {
        const x = pos[i + d]
        const v = (x - prev[i + d]) * 0.985
        const vel = v / dt
        const wv = d === 0 ? _w.x : d === 1 ? _w.y * 0.3 : _w.z
        const a = (d === 1 ? -9.8 : 0) + (wv - vel) * drag
        prev[i + d] = x
        pos[i + d] = x + v + a * dt2
      }
    }
    for (let it = 0; it < 12; it += 1) {
      for (let k = 0; k < this.count - 1; k += 1) {
        const wa = inv[k]
        const wb = inv[k + 1]
        const ws = wa + wb
        if (ws === 0) continue
        const ia = k * 3
        const ib = ia + 3
        const dx = pos[ib] - pos[ia]
        const dy = pos[ib + 1] - pos[ia + 1]
        const dz = pos[ib + 2] - pos[ia + 2]
        const d = Math.hypot(dx, dy, dz) || 1e-6
        const diff = (d - this.rest) / (d * ws)
        pos[ia] += dx * diff * wa
        pos[ia + 1] += dy * diff * wa
        pos[ia + 2] += dz * diff * wa
        pos[ib] -= dx * diff * wb
        pos[ib + 1] -= dy * diff * wb
        pos[ib + 2] -= dz * diff * wb
      }
    }
    collide(pos, inv, caps)
  }
}

/** Swallowtail end with a few frayed nicks, as alpha. */
function ribbonAlpha(): THREE.Texture {
  const w = 64
  const h = 512
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#000'
  // v = 1 is the free end (canvas top with flipY).
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(w, 0)
  g.lineTo(w * 0.5, h * 0.07)
  g.closePath()
  g.fill()
  const R = rng(5)
  for (let i = 0; i < 9; i += 1) {
    const y = h * (0.07 + R() * 0.5)
    const left = R() < 0.5
    const d = w * (0.12 + R() * 0.2)
    g.beginPath()
    g.moveTo(left ? 0 : w, y)
    g.lineTo(left ? d : w - d, y + 3 + R() * 6)
    g.lineTo(left ? 0 : w, y + 8 + R() * 10)
    g.closePath()
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

export class Ribbon {
  readonly group = new THREE.Group()
  private readonly tails: { cloth: Cloth; geo: THREE.BufferGeometry }[] = []
  private readonly ropes: { rope: Rope; geo: THREE.BufferGeometry; width: number; drag: number }[] = []
  private readonly body: Capsule[]
  private readonly material: THREE.MeshStandardMaterial
  private readonly ropeMaterial: THREE.MeshStandardMaterial

  constructor(anchors: RuinAnchors, wind: Wind) {
    this.group.name = 'ribbon'
    const axis = anchors.bandAxis
    this.body = anchors.body
    const downwind = new THREE.Vector3(wind.dir.x, -0.15, wind.dir.y).normalize()
    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.6, 0.03, 0.045),
      roughness: 0.62,
      side: THREE.DoubleSide,
      alphaMap: ribbonAlpha(),
      alphaTest: 0.5,
    })
    this.material.onBeforeCompile = shader => {
      // Thin silk glows when the sun shines through it.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.55, 0.12, 0.1) * 0.35;',
      )
    }
    const specs = [
      { len: 13, rows: 52, w0: 1.05, w1: 0.7, offset: 0.12 },
      { len: 7, rows: 28, w0: 0.75, w1: 0.5, offset: -0.14 },
    ]
    for (const s of specs) {
      const anchor = anchors.knot.clone().addScaledVector(axis, s.offset)
      const cloth = new Cloth(4, s.rows, anchor, axis, downwind, v => s.w0 + (s.w1 - s.w0) * v, s.len)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(cloth.pos, 3).setUsage(THREE.DynamicDrawUsage))
      const uv = new Float32Array(cloth.cols * cloth.rows * 2)
      for (let i = 0; i < cloth.rows; i += 1) for (let j = 0; j < cloth.cols; j += 1) uv.set([j / (cloth.cols - 1), i / (cloth.rows - 1)], (i * cloth.cols + j) * 2)
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      geo.setIndex(new THREE.BufferAttribute(cloth.index, 1))
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, this.material)
      mesh.frustumCulled = false
      mesh.castShadow = true
      this.group.add(mesh)
      this.tails.push({ cloth, geo })
    }
    this.ropeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.5, 0.08, 0.07), roughness: 0.8, side: THREE.DoubleSide })
    const down = new THREE.Vector3(0, -1, 0)
    this.addRope(new Rope(30, anchors.stringTop, null, anchors.stringLength, down), 0.035, 1.2)
    this.addRope(new Rope(20, anchors.loopA, anchors.loopB, anchors.loopLength, down), 0.045, 0.6)
    // Settle before the first frame so the ribbon is already streaming.
    for (let i = 0; i < 240; i += 1) this.step(1 / 60, wind)
  }

  private addRope(rope: Rope, width: number, drag: number): void {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rope.count * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(rope.count * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage))
    const idx: number[] = []
    for (let i = 0; i < rope.count - 1; i += 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
    geo.setIndex(idx)
    const mesh = new THREE.Mesh(geo, this.ropeMaterial)
    mesh.frustumCulled = false
    this.group.add(mesh)
    this.ropes.push({ rope, geo, width, drag })
  }

  step(dt: number, wind: Wind): void {
    const sub = 2
    for (let s = 0; s < sub; s += 1) {
      for (const t of this.tails) t.cloth.step(dt / sub, wind, this.body, 6)
    }
    for (const r of this.ropes) r.rope.step(dt, wind, this.body, r.drag)
  }

  /** Push simulated positions to the GPU; ropes face the camera. */
  update(camera: THREE.Camera): void {
    for (const t of this.tails) {
      ;(t.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      t.geo.computeVertexNormals()
    }
    const eye = camera.position
    const tan = new THREE.Vector3()
    const side = new THREE.Vector3()
    const view = new THREE.Vector3()
    const nrm = new THREE.Vector3()
    for (const r of this.ropes) {
      const p = r.rope.pos
      const pa = r.geo.getAttribute('position') as THREE.BufferAttribute
      const na = r.geo.getAttribute('normal') as THREE.BufferAttribute
      for (let i = 0; i < r.rope.count; i += 1) {
        const a = Math.max(0, i - 1) * 3
        const b = Math.min(r.rope.count - 1, i + 1) * 3
        tan.set(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]).normalize()
        view.set(eye.x - p[i * 3], eye.y - p[i * 3 + 1], eye.z - p[i * 3 + 2]).normalize()
        side.crossVectors(tan, view).normalize().multiplyScalar(r.width * 0.5)
        nrm.crossVectors(side, tan).normalize()
        pa.setXYZ(i * 2, p[i * 3] - side.x, p[i * 3 + 1] - side.y, p[i * 3 + 2] - side.z)
        pa.setXYZ(i * 2 + 1, p[i * 3] + side.x, p[i * 3 + 1] + side.y, p[i * 3 + 2] + side.z)
        na.setXYZ(i * 2, nrm.x, nrm.y, nrm.z)
        na.setXYZ(i * 2 + 1, nrm.x, nrm.y, nrm.z)
      }
      pa.needsUpdate = true
      na.needsUpdate = true
    }
  }

  /** Tip of the long tail (for audio panning / debug). */
  get tip(): THREE.Vector3 {
    const c = this.tails[0].cloth
    const k = (c.rows * c.cols - 2) * 3
    return new THREE.Vector3(c.pos[k], c.pos[k + 1], c.pos[k + 2])
  }
}
