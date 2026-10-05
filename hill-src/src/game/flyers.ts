import * as THREE from 'three'
import { rng } from './noise'
import { terrainHeight } from './terrain'

/**
 * Life in the air, Ghibli style: loose flocks of white gull-like birds that circle the summit and
 * glide far out over the cloud sea, and a few white butterflies tumbling over the slope.
 *
 * Each kind is one instanced mesh. Paths are analytic in time (no state to drift), orientation
 * follows the path's velocity and birds bank into their turns. Wings flap in the vertex shader:
 * every wing vertex is rotated about the body axis at the shoulder and again at the elbow, with
 * the tip lagging behind; birds alternate between flapping and long glides.
 */

type FlapParams = { amp: number; tipAmp: number; lift: number; glide: number; elbow: number; bob: number }

function flapMaterial(p: FlapParams, key: string, glow: number): { material: THREE.MeshLambertMaterial; time: THREE.IUniform } {
  const time = { value: 0 }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aFlap; // phase, rate (rad/s), glide phase, 1 = never glides
uniform float uTime;
float fSide, fInner, fOuter, fA1, fA2, fPh, fFlapping;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `fSide = sign(position.x);
float fAx = abs(position.x);
fPh = uTime * aFlap.y + aFlap.x;
fFlapping = aFlap.w > 0.5 ? 1.0 : smoothstep(-0.25, 0.35, sin(uTime * 0.42 + aFlap.z));
fA1 = ${p.lift.toFixed(3)} + mix(${p.glide.toFixed(3)}, sin(fPh) * ${p.amp.toFixed(3)}, fFlapping);
fA2 = fA1 + mix(0.05, sin(fPh - 0.9) * ${p.tipAmp.toFixed(3)}, fFlapping);
fInner = min(fAx, ${p.elbow.toFixed(3)});
fOuter = max(fAx - ${p.elbow.toFixed(3)}, 0.0);
float fNa = fOuter > 0.0 ? fA2 : fA1;
vec3 objectNormal = fAx > 0.0 ? vec3(-fSide * sin(fNa), cos(fNa), 0.0) : vec3(0.0, 1.0, 0.0);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
transformed.x = fSide * (fInner * cos(fA1) + fOuter * cos(fA2));
transformed.y += fInner * sin(fA1) + fOuter * sin(fA2) - sin(fPh) * ${p.bob.toFixed(3)} * fFlapping;`,
      )
    // Sky light through thin feathers and wings keeps the undersides pale against the blue.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(3)};`,
    )
  }
  material.customProgramCacheKey = () => `flap-${key}`
  return { material, time }
}

type Tri = [number, number, number][]

function buildGeometry(tris: { pts: Tri; cols: [number, number, number][] }[]): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const nrm: number[] = []
  for (const t of tris) {
    for (let i = 0; i < 3; i += 1) {
      pos.push(...t.pts[i])
      col.push(...t.cols[i])
      nrm.push(0, 1, 0)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  return g
}

/** Gull silhouette, 1 m span, facing +z: slim body, forked tail, swept wings with grey tips. */
function birdGeometry(): THREE.BufferGeometry {
  // Pale grey rather than pure white, so the shaded undersides read against white cloud too.
  const W: [number, number, number] = [0.88, 0.89, 0.92]
  const L: [number, number, number] = [0.8, 0.82, 0.88]
  const G: [number, number, number] = [0.5, 0.54, 0.62]
  const D: [number, number, number] = [0.2, 0.22, 0.27]
  const tris: { pts: Tri; cols: [number, number, number][] }[] = []
  const N: [number, number, number] = [0, 0, 0.21]
  const SL: [number, number, number] = [-0.045, 0.012, 0.06]
  const SR: [number, number, number] = [0.045, 0.012, 0.06]
  const HL: [number, number, number] = [-0.028, 0, -0.1]
  const HR: [number, number, number] = [0.028, 0, -0.1]
  const TC: [number, number, number] = [0, 0, -0.19]
  const TL: [number, number, number] = [-0.075, 0, -0.27]
  const TR: [number, number, number] = [0.075, 0, -0.27]
  tris.push({ pts: [N, SR, SL], cols: [W, W, W] })
  tris.push({ pts: [SL, SR, HR], cols: [W, W, W] }, { pts: [SL, HR, HL], cols: [W, W, W] })
  tris.push({ pts: [HL, HR, TC], cols: [W, W, W] }, { pts: [HL, TC, TL], cols: [W, W, L] }, { pts: [HR, TR, TC], cols: [W, L, W] })
  for (const s of [1, -1]) {
    const RL: [number, number, number] = [0.045 * s, 0.012, 0.085]
    const RT: [number, number, number] = [0.045 * s, 0.012, -0.065]
    const EL: [number, number, number] = [0.26 * s, 0.012, 0.075]
    const ET: [number, number, number] = [0.26 * s, 0.012, -0.075]
    const P: [number, number, number] = [0.5 * s, 0.012, -0.14]
    tris.push({ pts: [RL, EL, ET], cols: [W, L, L] }, { pts: [RL, ET, RT], cols: [W, L, W] })
    tris.push({ pts: [EL, P, ET], cols: [G, D, G] })
  }
  return buildGeometry(tris)
}

/** Butterfly, 1 unit span, facing +z: rounded fore and hind wings fanned from the body. */
function butterflyGeometry(): THREE.BufferGeometry {
  const B: [number, number, number] = [0.18, 0.16, 0.13]
  const W: [number, number, number] = [0.98, 0.98, 0.94]
  const T: [number, number, number] = [0.3, 0.3, 0.3]
  const tris: { pts: Tri; cols: [number, number, number][] }[] = []
  tris.push({ pts: [[0, 0.01, 0.2], [0.018, 0.01, -0.2], [-0.018, 0.01, -0.2]], cols: [B, B, B] })
  for (const s of [1, -1]) {
    const r0: [number, number, number] = [0.02 * s, 0, 0.1]
    const r1: [number, number, number] = [0.02 * s, 0, -0.02]
    const r2: [number, number, number] = [0.02 * s, 0, -0.16]
    const fore: [number, number, number][] = [[0.24 * s, 0, 0.24], [0.44 * s, 0, 0.2], [0.5 * s, 0, 0.04], [0.32 * s, 0, -0.05]]
    const hind: [number, number, number][] = [[0.36 * s, 0, -0.08], [0.32 * s, 0, -0.27], [0.13 * s, 0, -0.33]]
    const fc = [W, T, T, W]
    for (let i = 0; i < fore.length - 1; i += 1) tris.push({ pts: [r0, fore[i], fore[i + 1]], cols: [W, fc[i], fc[i + 1]] })
    tris.push({ pts: [r0, fore[fore.length - 1], r1], cols: [W, W, W] })
    tris.push({ pts: [r1, fore[fore.length - 1], hind[0]], cols: [W, W, W] })
    for (let i = 0; i < hind.length - 1; i += 1) tris.push({ pts: [r1, hind[i], hind[i + 1]], cols: [W, W, W] })
    tris.push({ pts: [r1, hind[hind.length - 1], r2], cols: [W, W, W] })
  }
  return buildGeometry(tris)
}

type Flock = {
  /** Path position at time t. */
  path: (t: number, out: THREE.Vector3) => THREE.Vector3
  count: number
  spread: number
  scale: number
}

const FLOCKS: Flock[] = [
  // Circling just above the summit, seen overhead from the hill and in the title shot.
  {
    count: 6,
    spread: 5,
    scale: 1.7,
    path: (t, o) => {
      const a = t * 0.22
      const r = 34 + Math.sin(t * 0.07) * 8
      return o.set(Math.cos(a) * r, 24 + Math.sin(t * 0.11) * 5, Math.sin(a) * r)
    },
  },
  // A wide loop round the hill and out over the edge, the other way round.
  {
    count: 9,
    spread: 8,
    scale: 1.9,
    path: (t, o) => {
      const a = -t * 0.12 + 1.7
      const r = 95 + Math.sin(t * 0.05 + 1) * 20
      return o.set(-20 + Math.cos(a) * r, 36 + Math.sin(t * 0.09) * 6, -40 + Math.sin(a) * r)
    },
  },
  // Far out over the cloud sea ahead of the spawn view.
  {
    count: 12,
    spread: 16,
    scale: 2.6,
    path: (t, o) => {
      const a = t * 0.075 + 4
      return o.set(-60 + Math.cos(a) * 170, 18 + Math.sin(t * 0.06) * 8, -260 + Math.sin(a) * 120)
    },
  },
  // A pair that sweeps low over the summit and the slope in a lazy figure of eight.
  {
    count: 2,
    spread: 2.5,
    scale: 1.5,
    path: (t, o) => {
      const w = t * 0.085
      return o.set(Math.sin(w) * 48, 13 + Math.sin(w * 3) * 4, 8 + Math.sin(w * 2) * 26)
    },
  },
]

type Bird = { flock: Flock; slot: THREE.Vector3; weave: number; lag: number }

/** Butterfly homes on the slope between the spawn point and the summit. */
const BUTTERFLY_HOMES: [number, number][] = [
  [3, 25],
  [9.5, 20],
  [-4.5, 17],
  [12, 11],
  [-9, 9],
  [2, 12],
]

const UP = new THREE.Vector3(0, 1, 0)

export class Flyers {
  readonly group = new THREE.Group()
  private readonly birds: Bird[] = []
  readonly birdMesh: THREE.InstancedMesh
  readonly butterflyMesh: THREE.InstancedMesh
  private readonly birdTime: THREE.IUniform
  private readonly butterflyTime: THREE.IUniform
  private readonly butterflySeeds: number[] = []
  private readonly m = new THREE.Matrix4()
  private readonly p0 = new THREE.Vector3()
  private readonly p1 = new THREE.Vector3()
  private readonly p2 = new THREE.Vector3()
  private readonly f = new THREE.Vector3()
  private readonly acc = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private readonly x = new THREE.Vector3()
  private readonly y = new THREE.Vector3()
  private readonly z = new THREE.Vector3()

  constructor(seed = 29) {
    const R = rng(seed)
    for (const flock of FLOCKS) {
      for (let i = 0; i < flock.count; i += 1) {
        const a = R() * Math.PI * 2
        const d = Math.sqrt(R()) * flock.spread
        this.birds.push({
          flock,
          slot: new THREE.Vector3(Math.cos(a) * d, (R() - 0.5) * flock.spread * 0.35, Math.sin(a) * d),
          weave: R() * Math.PI * 2,
          lag: (R() - 0.5) * 1.2,
        })
      }
    }
    const bird = flapMaterial({ amp: 0.62, tipAmp: 0.55, lift: 0.1, glide: 0.08, elbow: 0.26, bob: 0.025 }, 'bird', 0.12)
    this.birdTime = bird.time
    const bg = birdGeometry()
    const bFlap = new Float32Array(this.birds.length * 4)
    for (let i = 0; i < this.birds.length; i += 1) bFlap.set([R() * 6.28, 8.5 + R() * 2.5, R() * 6.28, 0], i * 4)
    bg.setAttribute('aFlap', new THREE.InstancedBufferAttribute(bFlap, 4))
    this.birdMesh = new THREE.InstancedMesh(bg, bird.material, this.birds.length)
    this.birdMesh.frustumCulled = false
    this.birdMesh.name = 'birds'

    const fly = flapMaterial({ amp: 0.95, tipAmp: 0, lift: 0.45, glide: 0.3, elbow: 1, bob: 0.06 }, 'butterfly', 0.3)
    this.butterflyTime = fly.time
    const fg = butterflyGeometry()
    const n = BUTTERFLY_HOMES.length
    const fFlap = new Float32Array(n * 4)
    for (let i = 0; i < n; i += 1) {
      // 5-6 wingbeats a second: slow enough to read at 30-60 fps without strobing.
      fFlap.set([R() * 6.28, 31 + R() * 7, 0, 1], i * 4)
      this.butterflySeeds.push(R() * 100)
    }
    fg.setAttribute('aFlap', new THREE.InstancedBufferAttribute(fFlap, 4))
    this.butterflyMesh = new THREE.InstancedMesh(fg, fly.material, n)
    this.butterflyMesh.frustumCulled = false
    this.butterflyMesh.name = 'butterflies'
    // Mostly cabbage whites, one or two pale brimstones.
    const tint = new THREE.Color()
    for (let i = 0; i < n; i += 1) this.butterflyMesh.setColorAt(i, tint.setRGB(1, i % 3 === 1 ? 0.9 : 1, i % 3 === 1 ? 0.45 : 1))
    this.group.add(this.birdMesh, this.butterflyMesh)
  }

  update(time: number): void {
    this.birdTime.value = time
    this.butterflyTime.value = time
    const h = 0.25
    for (let i = 0; i < this.birds.length; i += 1) {
      const b = this.birds[i]
      const t = time + b.lag
      this.birdAt(b, t - h, this.p0)
      this.birdAt(b, t, this.p1)
      this.birdAt(b, t + h, this.p2)
      this.orient(this.p0, this.p1, this.p2, h, 1, b.flock.scale)
      this.birdMesh.setMatrixAt(i, this.m)
    }
    this.birdMesh.instanceMatrix.needsUpdate = true

    for (let i = 0; i < BUTTERFLY_HOMES.length; i += 1) {
      const s = this.butterflySeeds[i]
      const hb = 0.06
      this.butterflyAt(i, s, time - hb, this.p0)
      this.butterflyAt(i, s, time, this.p1)
      this.butterflyAt(i, s, time + hb, this.p2)
      this.orient(this.p0, this.p1, this.p2, hb, 0.15, 0.12)
      this.butterflyMesh.setMatrixAt(i, this.m)
    }
    this.butterflyMesh.instanceMatrix.needsUpdate = true
  }

  private birdAt(b: Bird, t: number, out: THREE.Vector3): THREE.Vector3 {
    b.flock.path(t, out)
    const w = t * 0.55 + b.weave
    return out.add(b.slot).add(this.acc.set(Math.sin(w) * 1.3, Math.sin(w * 1.3 + 1) * 0.6, Math.cos(w * 0.8) * 1.3))
  }

  private butterflyAt(i: number, s: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const [hx, hz] = BUTTERFLY_HOMES[i]
    const x = hx + Math.sin(t * 0.43 + s) * 2.6 + Math.sin(t * 1.37 + s * 2) * 0.9 + Math.sin(t * 3.1 + s) * 0.18
    const z = hz + Math.cos(t * 0.31 + s * 1.7) * 2.2 + Math.sin(t * 1.11 + s * 3) * 0.8 + Math.cos(t * 2.7 + s) * 0.18
    // Above the grass tips, where they can be seen from eye height.
    const y = terrainHeight(x, z) + 1.08 + Math.sin(t * 0.9 + s) * 0.28 + Math.sin(t * 4.3 + s * 5) * 0.1
    return out.set(x, y, z)
  }

  /** Matrix at p1 facing along the path, banked by the sideways acceleration (bank = gain). */
  private orient(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, h: number, bank: number, scale: number): void {
    this.f.subVectors(p2, p0)
    if (this.f.lengthSq() < 1e-8) this.f.set(0, 0, 1)
    this.f.normalize()
    // Felt gravity: gravity plus the turning acceleration tilts "up" into the turn.
    this.acc.copy(p2).add(p0).addScaledVector(p1, -2).multiplyScalar(1 / (h * h))
    this.acc.addScaledVector(this.f, -this.acc.dot(this.f))
    this.up.copy(UP).multiplyScalar(9.8).addScaledVector(this.acc, bank).normalize()
    this.x.crossVectors(this.up, this.f).normalize()
    this.y.crossVectors(this.f, this.x)
    this.m.makeBasis(this.x.multiplyScalar(scale), this.y.multiplyScalar(scale), this.z.copy(this.f).multiplyScalar(scale))
    this.m.setPosition(p1)
  }

  dispose(): void {
    this.birdMesh.geometry.dispose()
    ;(this.birdMesh.material as THREE.Material).dispose()
    this.butterflyMesh.geometry.dispose()
    ;(this.butterflyMesh.material as THREE.Material).dispose()
  }
}
