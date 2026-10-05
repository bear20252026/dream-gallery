import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG } from './config'
import { GLSL_NOISE, GLSL_WIND } from './glsl'
import { rng } from './noise'
import { terrainHeight } from './terrain'

/**
 * The silent guardian on the summit: an ancient robot, abandoned long ago, sitting where it
 * stopped, like a big toy set down in the grass. Everything about it is round and heavy: a
 * pear-shaped body with a riveted round belly plate, a wide dome head sunk straight onto its
 * collar (no neck) with two big round eyes under heavy half-closed lids, round cheeks and round
 * ears; short fat arms whose chubby hands rest palm-down in the grass at its sides; short legs
 * stretched out in front, the soles of its big round feet turned toward you. A rusty wind-up
 * key sticks out of its back. Moss has crept over every upward face and up from the ground,
 * grass and daisies grow on its head, shoulders, lap and feet, lichen and rain streaks mark the
 * plates, and two small birds perch on it. The red silk is tied round a short post on its head;
 * a red cord hangs round its collar.
 *
 * Everything is built from lathed and rounded primitives in design units (about 6.5 tall,
 * sitting), then scaled, settled and turned into world space once, so colliders, overgrowth and
 * the ribbon's anchors all share the same coordinates.
 */

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)
const SHELL = srgb(0.84, 0.83, 0.8)
const SHELL_B = srgb(0.76, 0.76, 0.75)
const PLATE = srgb(0.88, 0.87, 0.83)
const JOINT = srgb(0.5, 0.51, 0.53)
const CORE = srgb(0.3, 0.31, 0.34)
const DARK = srgb(0.09, 0.1, 0.12)
const UP = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)
/** Design units to metres. */
const S = 1.35
const ARM_UPPER = 1.5
const ARM_FORE = 1.4
/** Eyelid hinge angles: half closed and sleepy, and lifted when the eyes wake. */
const LID_SLEEPY = 0.2
const LID_OPEN = -0.55

type V3 = THREE.Vector3
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const qAxis = (axis: V3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle)

export type WindUniforms = {
  uTime: { value: number }
  uWindDir: { value: THREE.Vector2 }
  uWindSpeed: { value: number }
  uWindScroll: { value: number }
  uWindGust: { value: number }
}
export type BodyCapsule = { a: THREE.Vector3; b: THREE.Vector3; r: number }

export type RuinAnchors = {
  /** Knot of the red silk band on the right upper arm (world), and the band's outward normal there. */
  knot: THREE.Vector3
  knotOut: THREE.Vector3
  /** Centre, axis (pointing up the arm) and radius of the band. */
  bandCenter: THREE.Vector3
  bandAxis: THREE.Vector3
  bandRadius: number
  /** A thin cord hanging from the band. */
  stringTop: THREE.Vector3
  stringLength: number
  /** Ends and length of the red cord that hangs from the knot as the bow's loop. */
  loopA: THREE.Vector3
  loopB: THREE.Vector3
  loopLength: number
  /** Capsules the silk and cords drape over (arms, shoulders, chest, head). */
  body: BodyCapsule[]
  /** Spot on the grass beside the resting hand where the white creature sits. */
  critter: THREE.Vector3
  /** Spot on the grass, in the nook between the right hand and the right leg, where the rose grows. */
  rose: THREE.Vector3
  /** Wrists of the right and left hands resting in the grass (world). */
  handR: THREE.Vector3
  handL: THREE.Vector3
  /** Horizontal unit vector the guardian faces (world). */
  forward: THREE.Vector3
  /** World point to look at when framing the whole figure. */
  focus: THREE.Vector3
}

/** Collects primitives placed in design space, moves them to world space and tints them. */
class Parts {
  readonly list: THREE.BufferGeometry[] = []
  constructor(
    private readonly toWorld: THREE.Matrix4,
    private readonly R: () => number,
  ) {}

  add(source: THREE.BufferGeometry, m: THREE.Matrix4, tone: THREE.Color, jitter = 0.035): void {
    // RoundedBoxGeometry is built non-indexed; index it so every part merges into one mesh.
    const geo = source.index ? source : mergeVertices(source)
    if (geo !== source) source.dispose()
    geo.applyMatrix4(m)
    geo.applyMatrix4(this.toWorld)
    const n = geo.getAttribute('position').count
    const k = 1 - jitter + this.R() * jitter * 2
    const c = new Float32Array(n * 3)
    for (let i = 0; i < n; i += 1) c.set([tone.r * k, tone.g * k, tone.b * k], i * 3)
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3))
    this.list.push(geo)
  }

  merge(): THREE.BufferGeometry {
    const g = mergeGeometries(this.list, false)
    if (!g) throw new Error('guardian: could not merge body parts')
    for (const p of this.list) p.dispose()
    this.list.length = 0
    return g
  }
}

/** Matrix placing a unit-height, Y-aligned primitive centred on the origin between a and b. */
function span(a: V3, b: V3): THREE.Matrix4 {
  const d = b.clone().sub(a)
  const len = d.length()
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(len))
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v3(1, len, 1))
}
/** Matrix standing a primitive whose base is at its origin on `a`, its +Y along `dir`. */
function stand(a: V3, dir: V3, spin = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize())
  if (spin) q.multiply(qAxis(UP, spin))
  return new THREE.Matrix4().compose(a, q, v3(1, 1, 1))
}
function at(p: V3, q?: THREE.Quaternion, s?: V3): THREE.Matrix4 {
  return new THREE.Matrix4().compose(p, q ?? new THREE.Quaternion(), s ?? v3(1, 1, 1))
}
/** A segment with chamfered ends, base at the origin, `len` tall. */
function barrel(r: number, len: number, seg = 20): THREE.BufferGeometry {
  const b = Math.min(len * 0.16, r * 0.45)
  const pts = [[0.001, 0], [r * 0.8, 0], [r, b], [r, len - b], [r * 0.8, len], [0.001, len]]
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)
}
const ball = (r: number) => new THREE.SphereGeometry(r, 22, 14)
/** Unit-height cylinder, radius r0 at the bottom and r1 at the top. */
const tube = (r0: number, r1: number) => new THREE.CylinderGeometry(r1, r0, 1, 18, 1)
const ring = (r: number, t: number, seg = 44) => new THREE.TorusGeometry(r, t, 8, seg)
/** FLAT lays a torus (which lies in XY) into XZ; FACE turns a Y-axis disc to face +Z. */
const FLAT = qAxis(X, -Math.PI / 2)
const FACE = qAxis(X, Math.PI / 2)

/** Two-bone IK: elbow and (possibly clamped) wrist for a shoulder, a wrist target and a pole. */
function ik(a: V3, target: V3, l1: number, l2: number, pole: V3): { elbow: V3; wrist: V3; reached: boolean } {
  const d = target.clone().sub(a)
  const full = d.length()
  const dist = Math.min(full, (l1 + l2) * 0.999)
  const dir = d.divideScalar(full)
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x))
  const po = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize()
  return { elbow: a.clone().addScaledVector(dir, x).addScaledVector(po, h), wrist: a.clone().addScaledVector(dir, dist), reached: full <= l1 + l2 }
}

/** A mitten hand lying palm-down: its wrist, where its fingers point, and the side (+1/-1 across the hand) of its thumb. */
type Mitt = { wrist: V3; f: V3; inner: number }
/** Palm, finger bones and tips of a fat mitten hand with three short chubby fingers and a thumb (pure geometry, no meshes). */
function mittBones(h: Mitt): { q: THREE.Quaternion; palmC: V3; bones: { a: V3; b: V3; r: number }[]; joints: { p: V3; r: number }[]; tips: V3[] } {
  const f = h.f.clone().setY(0).normalize()
  const w = UP.clone().cross(f).normalize() // (w, up, f) is a right-handed frame
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w, UP, f))
  const palmC = h.wrist.clone().addScaledVector(f, 0.55).addScaledVector(UP, -0.04)
  const bones: { a: V3; b: V3; r: number }[] = []
  const joints: { p: V3; r: number }[] = []
  const tips: V3[] = []
  const finger = (base: V3, dir0: V3, lens: number[], curl: number, r: number) => {
    let p = base
    const dir = dir0.clone()
    joints.push({ p, r })
    for (const len of lens) {
      dir.applyAxisAngle(w, curl) // positive curl bends the finger down toward the turf
      const n = p.clone().addScaledVector(dir, len)
      bones.push({ a: p, b: n, r })
      joints.push({ p: n, r: r * 0.97 })
      p = n
    }
    tips.push(p)
  }
  for (let k = 0; k < 3; k += 1) {
    const base = h.wrist.clone().addScaledVector(f, 0.98).addScaledVector(w, (k - 1) * 0.36).addScaledVector(UP, -0.03)
    finger(base, f.clone().applyAxisAngle(UP, (k - 1) * 0.12), [0.3, 0.24], 0.42, 0.19)
  }
  const thumbBase = h.wrist.clone().addScaledVector(f, 0.42).addScaledVector(w, h.inner * 0.56).addScaledVector(UP, -0.08)
  finger(thumbBase, f.clone().addScaledVector(w, h.inner * 0.9).normalize(), [0.28, 0.22], 0.3, 0.18)
  return { q, palmC, bones, joints, tips }
}

/** Rotation turning +Z to `forward`, keeping +Y as close to `up` as it can. */
function faceFrame(forward: V3, up: V3): THREE.Quaternion {
  const z = forward.clone().normalize()
  const x = up.clone().cross(z).normalize()
  const y = z.clone().cross(x)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

type Profile = readonly (readonly [number, number])[]
/** Radius of a lathe profile ([r, y] pairs, y rising) at height y. */
function profileR(pts: Profile, y: number): number {
  for (let i = 1; i < pts.length; i += 1) {
    const [r0, y0] = pts[i - 1]
    const [r1, y1] = pts[i]
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0)
  }
  return pts[pts.length - 1][0]
}
/** A lathe turned so its seam faces backward. */
function lathe(pts: Profile): THREE.BufferGeometry {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 56).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI))
}
/** The pear-shaped body, widest low down, and the wide, squat dome of the head. */
const BODY: Profile = [[0.001, 0], [1.25, 0.02], [1.95, 0.24], [2.4, 0.66], [2.62, 1.25], [2.64, 1.85], [2.48, 2.5], [2.16, 3.05], [1.78, 3.45], [1.5, 3.66], [0.001, 3.74]]
const HEAD: Profile = [[0.001, -0.74], [1.18, -0.74], [1.6, -0.56], [1.83, -0.22], [1.88, 0.12], [1.8, 0.5], [1.56, 0.86], [1.14, 1.1], [0.6, 1.22], [0.001, 1.26]]
/** The round belly plate: an ellipsoid bulging out of the front of the body. */
const BELLY = { y: 1.45, z: 1.98, r: new THREE.Vector3(1.75, 1.5, 0.95) }

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export class Ruin {
  private eyeMat!: THREE.MeshStandardMaterial
  private glow = 0
  private glowTarget = 0
  /** The two heavy eyelids, half closed; they lift as the eyes wake. */
  private readonly lids: THREE.Object3D[] = []
  readonly group = new THREE.Group()
  readonly anchors: RuinAnchors
  /** Circles on the ground where the meadow should not grow through the seat, legs, feet and hands. */
  readonly grassMask: { x: number; z: number; r: number }[] = []
  private readonly materials: THREE.Material[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly perched: { head: THREE.Object3D; body: THREE.Object3D; lift: THREE.Object3D; base: number; next: number; target: number; hop: number }[] = []
  private readonly R2 = rng(99)

  constructor(physics: Physics, wind: WindUniforms) {
    const C = CONFIG.ruin
    const ground = terrainHeight(0, 0)
    this.group.name = 'ruin'
    const R = rng(4051)
    // Design space -> world: scale, a slight settle toward its left side, the yaw, onto the summit.
    const worldQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, C.yaw, -C.lean, 'YXZ'))
    const origin = v3(0, ground - 0.14, 0)
    const toWorld = new THREE.Matrix4().compose(origin, worldQ, v3(S, S, S))
    const W = (p: V3) => p.clone().applyMatrix4(toWorld)
    const WD = (d: V3) => d.clone().applyQuaternion(worldQ).normalize()
    /** Design-space height of the turf under design point (x, z). */
    const groundAt = (x: number, z: number) => {
      let y = (ground - origin.y) / S
      for (let i = 0; i < 4; i += 1) {
        const w = W(v3(x, y, z))
        y += (terrainHeight(w.x, w.z) - w.y) / S
      }
      return y
    }
    const P = new Parts(toWorld, R)

    // ── A big pear-shaped body sitting in the turf, leaning back a little ──
    const backQ = qAxis(X, -0.1)
    const bodyM = new THREE.Matrix4().compose(v3(0, groundAt(0, -0.2) - 0.32, -0.2), backQ, v3(1, 1, 0.92))
    const tp = (x: number, y: number, z: number) => v3(x, y, z).applyMatrix4(bodyM)
    const inBody = (m: THREE.Matrix4) => bodyM.clone().multiply(m)
    const rAt = (y: number) => profileR(BODY, y)
    /** Body-local point on the skin at height y, `a` radians round from straight ahead, lifted by `out`. */
    const skinL = (y: number, a: number, out = 0) => v3(Math.sin(a) * (rAt(y) + out), y, Math.cos(a) * (rAt(y) + out))
    P.add(lathe(BODY), bodyM, SHELL, 0.01)
    for (const y of [0.62, 2.72]) P.add(ring(rAt(y) + 0.02, 0.075, 80), inBody(at(v3(0, y, 0), FLAT)), SHELL_B)
    for (let i = -7; i <= 7; i += 1) P.add(ball(0.06), inBody(at(skinL(2.88, i * 0.2, 0.01))), SHELL_B)
    // A round belly plate, riveted round its rim, with a worn hatch in the middle.
    P.add(ball(1), inBody(at(v3(0, BELLY.y, BELLY.z), undefined, BELLY.r)), PLATE, 0.01)
    for (let k = 0; k < 20; k += 1) {
      const a = (k / 20) * Math.PI * 2
      const x = Math.cos(a) * 1.6
      const y = BELLY.y + Math.sin(a) * 1.36
      const e = 1 - (x / BELLY.r.x) ** 2 - ((y - BELLY.y) / BELLY.r.y) ** 2
      P.add(ball(0.055), inBody(at(v3(x, y, BELLY.z + BELLY.r.z * Math.sqrt(Math.max(0, e)) + 0.01))), SHELL_B)
    }
    const hatch = v3(0, BELLY.y + 0.1, BELLY.z + BELLY.r.z - 0.04)
    P.add(new THREE.CylinderGeometry(0.72, 0.76, 0.14, 44), inBody(at(hatch, FACE)), SHELL_B)
    for (const r of [0.62, 0.34]) P.add(ring(r, 0.045, 48), inBody(at(hatch.clone().add(v3(0, 0, 0.08)))), PLATE)
    P.add(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 20), inBody(at(hatch.clone().add(v3(0, 0, 0.1)), FACE)), JOINT)
    for (let k = 0; k < 4; k += 1) {
      const a = Math.PI / 4 + (k * Math.PI) / 2
      P.add(ball(0.06), inBody(at(hatch.clone().add(v3(Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0.09)))), SHELL)
    }
    // Vents on the flanks.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k += 1) {
        const a = side * 1.32
        P.add(new RoundedBoxGeometry(0.62, 0.1, 0.16, 2, 0.04), inBody(at(skinL(1.75 + k * 0.28, a, -0.03), qAxis(UP, a))), CORE)
      }
    }
    // A back hatch, and a big wind-up key that nobody has turned for a very long time.
    {
      const back = skinL(1.95, Math.PI, -0.03)
      P.add(new THREE.CylinderGeometry(0.7, 0.74, 0.12, 40), inBody(at(back, qAxis(UP, Math.PI).multiply(FACE))), PLATE)
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2
        P.add(ball(0.055), inBody(at(back.clone().add(v3(Math.cos(a) * 0.6, Math.sin(a) * 0.6, -0.07)))), SHELL_B)
      }
      const shaftEnd = back.clone().add(v3(0, 0, -0.62))
      P.add(barrel(0.24, 0.14), inBody(stand(back.clone().add(v3(0, 0, -0.04)), v3(0, 0, -1))), SHELL_B)
      P.add(tube(0.13, 0.12), inBody(span(back, shaftEnd)), JOINT)
      const across = v3(Math.cos(0.4), Math.sin(0.4), 0)
      const lobeQ = new THREE.Quaternion().setFromUnitVectors(UP, v3(0, 0, -1).cross(across).normalize())
      for (const s of [-1, 1]) {
        P.add(new THREE.CylinderGeometry(0.4, 0.4, 0.11, 30), inBody(at(shaftEnd.clone().addScaledVector(across, s * 0.42).add(v3(0, 0, -0.22)), lobeQ)), SHELL_B)
      }
      P.add(ball(0.2), inBody(at(shaftEnd.clone().add(v3(0, 0, -0.1)))), SHELL)
    }

    // ── No neck: a wide dome head sits straight on a thick collar ring, bowed toward the creature ──
    P.add(tube(1.46, 1.4), inBody(span(v3(0, 3.42, 0), v3(0, 3.98, 0))), CORE)
    P.add(ring(1.58, 0.2, 64), inBody(at(v3(0, 3.62, 0), FLAT)), SHELL_B)
    const headQ = backQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.26, 0.22, -0.1, 'YXZ')))
    const headUp = UP.clone().applyQuaternion(headQ)
    const headM = new THREE.Matrix4().compose(tp(0, 3.74, 0.04).addScaledVector(headUp, 0.72), headQ, v3(1, 1, 0.9))
    const hp = (x: number, y: number, z: number) => v3(x, y, z).applyMatrix4(headM)
    const inHead = (m: THREE.Matrix4) => headM.clone().multiply(m)
    const hrAt = (y: number) => profileR(HEAD, y)
    /** Head-local point on the front of the dome at (x, y), sunk by `inset`, and its outward normal. */
    const face = (x: number, y: number, inset = 0) => {
      const r = hrAt(y)
      const z = Math.sqrt(Math.max(0.01, r * r - x * x))
      // Outward normal of the lathe (radial part plus its slope), corrected for the head's squash.
      const n = v3(x / r, 20 * (r - hrAt(y + 0.05)), (z / r) * 1.1).normalize()
      return { p: v3(x, y, z - inset), n }
    }
    P.add(lathe(HEAD), headM, SHELL, 0.01)
    P.add(ring(hrAt(-0.1) + 0.01, 0.06, 72), inHead(at(v3(0, -0.1, 0), FLAT)), SHELL_B)
    // Two big round eyes set wide apart: dark sockets under thick rims (lenses and lids come later).
    const eyes: { c: V3; q: THREE.Quaternion; side: number }[] = []
    for (const side of [-1, 1]) {
      const { p, n } = face(side * 0.72, 0.3, 0.03)
      const q = faceFrame(n, UP)
      P.add(new THREE.CylinderGeometry(0.44, 0.44, 0.18, 40), inHead(at(p, q.clone().multiply(FACE))), DARK, 0)
      P.add(ring(0.47, 0.085, 44), inHead(at(p.clone().addScaledVector(n, 0.06), q)), SHELL_B)
      eyes.push({ c: p.clone().addScaledVector(n, 0.03), q, side })
    }
    // Round cheeks and a small mouth slot.
    for (const side of [-1, 1]) {
      const { p, n } = face(side * 1.12, -0.2, 0.14)
      P.add(ball(0.32), inHead(at(p, faceFrame(n, UP), v3(1, 0.85, 0.42))), PLATE)
    }
    {
      const { p, n } = face(0, -0.36, 0.06)
      P.add(new RoundedBoxGeometry(0.62, 0.14, 0.2, 2, 0.06), inHead(at(p, faceFrame(n, UP))), CORE)
    }
    // Big round ears.
    for (const side of [-1, 1]) {
      const c = v3(side * (hrAt(0.1) - 0.04), 0.1, -0.05)
      const q = new THREE.Quaternion().setFromUnitVectors(UP, v3(side, 0, 0))
      P.add(new THREE.CylinderGeometry(0.5, 0.56, 0.3, 36), inHead(at(c, q)), SHELL_B)
      P.add(new THREE.CylinderGeometry(0.3, 0.3, 0.36, 28), inHead(at(c.clone().add(v3(side * 0.04, 0, 0)), q)), CORE)
      P.add(ring(0.42, 0.05, 36), inHead(at(c.clone().add(v3(side * 0.16, 0, 0)), faceFrame(v3(side, 0, 0), UP))), PLATE)
    }
    // A short post on top of the head with a round knob; the red silk is tied round it.
    const postBase = v3(0.3, 1.14, -0.32)
    const postDir = v3(0.18, 1, -0.14).normalize()
    const postTip = postBase.clone().addScaledVector(postDir, 0.8)
    P.add(barrel(0.24, 0.12), inHead(stand(postBase.clone().addScaledVector(postDir, -0.05), postDir)), SHELL_B)
    P.add(tube(0.12, 0.1), inHead(span(postBase, postTip)), JOINT)
    P.add(ball(0.2), inHead(at(postTip)), PLATE)

    // ── Shoulders: joint balls under dome caps (their tops are where the grass grows) ──
    const shoulders = [-1, 1].map(side => {
      const sock = tp(side * 2.3, 2.62, 0.1)
      P.add(ball(0.62), at(sock), JOINT)
      const padQ = backQ.clone().multiply(qAxis(Z, -side * 0.55))
      const padC = tp(side * 2.38, 2.88, 0.1)
      P.add(ball(0.76), at(padC, padQ, v3(1, 0.62, 1.05)), PLATE)
      P.add(ring(0.74, 0.045, 48), at(padC.clone().add(v3(0, -0.07, 0).applyQuaternion(padQ)), padQ.clone().multiply(FLAT), v3(1, 1.05, 1)), SHELL_B)
      return { sock, padC }
    })

    // ── Short fat arms; the chubby hands rest palm-down in the grass at its sides ──
    const limb = (a: V3, b: V3, r0: number, r1: number) => {
      P.add(tube(r0, r1), span(a, b), SHELL)
      const d = b.clone().sub(a)
      const len = d.length()
      d.divideScalar(len)
      const rq = new THREE.Quaternion().setFromUnitVectors(Z, d)
      for (const t of [0.24, 0.76]) P.add(ring(r0 + (r1 - r0) * t + 0.015, 0.065, 40), at(a.clone().addScaledVector(d, len * t), rq), SHELL_B)
    }
    const arm = (side: number, wx: number, wz: number, f: V3) => {
      const start = shoulders[side < 0 ? 0 : 1].sock.clone().add(v3(side * 0.3, -0.18, 0))
      const pose = (wrist: V3): Mitt => ({ wrist, f, inner: side < 0 ? 1 : -1 })
      // Settle the hand so the palm and fingertips just touch the turf.
      let target = v3(wx, groundAt(wx, wz) + 0.42, wz)
      for (let i = 0; i < 3; i += 1) {
        const b = mittBones(pose(target))
        let gap = b.palmC.y - 0.4 - groundAt(b.palmC.x, b.palmC.z)
        for (const t of b.tips) gap = Math.min(gap, t.y - 0.19 - groundAt(t.x, t.z))
        target = target.clone().add(v3(0, -0.04 - gap, 0))
      }
      const pole = v3(side * 0.5, 0, -1).normalize()
      const sol = ik(start, target, ARM_UPPER, ARM_FORE, pole)
      P.add(ball(0.52), at(start), JOINT)
      limb(start, sol.elbow, 0.6, 0.56)
      P.add(ball(0.57), at(sol.elbow), JOINT)
      P.add(ball(0.44), at(sol.elbow.clone().addScaledVector(pole, 0.3), undefined, v3(1, 1, 0.75)), PLATE)
      limb(sol.elbow, sol.wrist, 0.54, 0.5)
      const b = mittBones(pose(sol.wrist))
      P.add(ball(0.44), at(sol.wrist), JOINT)
      P.add(ball(1), at(b.palmC, b.q, v3(0.66, 0.4, 0.62)), SHELL)
      for (const j of b.joints) P.add(ball(j.r), at(j.p), SHELL_B)
      for (const bone of b.bones) P.add(tube(bone.r, bone.r * 0.95), span(bone.a, bone.b), SHELL)
      return { start, elbow: sol.elbow, wrist: sol.wrist, palmC: b.palmC, tips: b.tips, reached: sol.reached }
    }
    const right = arm(-1, -3.35, 0.85, v3(-0.55, 0, 0.83).normalize())
    const left = arm(1, 3.35, 1.0, v3(0.45, 0, 0.9).normalize())
    if (!left.reached || !right.reached) console.warn('guardian: an arm cannot reach its target')

    // ── Short legs stretched out in front in a V; big round feet, soles turned toward you ──
    const legs = [-1, 1].map(side => {
      const hip = tp(side * 1.22, 0.8, 1.35)
      const ax = side * 1.95
      const az = 3.55
      const ankle = v3(ax, groundAt(ax, az) + 0.62, az)
      P.add(ball(0.9), at(hip), JOINT)
      P.add(tube(0.78, 0.92), span(ankle, hip), SHELL)
      const d = hip.clone().sub(ankle)
      const len = d.length()
      d.divideScalar(len)
      const rq = new THREE.Quaternion().setFromUnitVectors(Z, d)
      for (const t of [0.28, 0.7]) P.add(ring(0.78 + 0.14 * t + 0.02, 0.07, 44), at(ankle.clone().addScaledVector(d, len * t), rq), SHELL_B)
      P.add(ball(0.5), at(ankle.clone().lerp(hip, 0.5).add(v3(0, 0.74, 0)), undefined, v3(1.05, 0.5, 1.15)), PLATE)
      P.add(ball(0.66), at(ankle), JOINT)
      const footQ = qAxis(UP, side * 0.2).multiply(qAxis(X, -0.25))
      const fc = ankle.clone().add(v3(side * 0.08, 0.42, 0.4))
      P.add(ball(1), at(fc, footQ, v3(0.86, 1.02, 0.66)), SHELL_B)
      // An oval sole with a raised rim and a round pad.
      const sole = fc.clone().add(v3(0, -0.04, 0.6).applyQuaternion(footQ))
      P.add(new THREE.CylinderGeometry(0.7, 0.7, 0.24, 40), at(sole, footQ.clone().multiply(FACE), v3(0.92, 1, 1.2)), PLATE)
      P.add(ring(0.56, 0.05, 40), at(sole.clone().add(v3(0, 0, 0.12).applyQuaternion(footQ)), footQ, v3(0.92, 1.2, 1)), SHELL_B)
      P.add(ball(0.26), at(sole.clone().add(v3(0, -0.1, 0.1).applyQuaternion(footQ)), footQ, v3(1, 1, 0.4)), SHELL_B)
      return { hip, ankle, fc, top: fc.clone().add(v3(0, 1.02, 0).applyQuaternion(footQ)) }
    })

    // ── Body mesh and its collider ──
    const bodyGeo = P.merge()
    const shellMat = shellMaterial(ground)
    const body = new THREE.Mesh(bodyGeo, shellMat)
    body.castShadow = true
    body.receiveShadow = true
    body.name = 'guardian'
    this.group.add(body)
    this.geometries.push(bodyGeo)
    this.materials.push(shellMat)
    {
      const verts = new Float32Array(bodyGeo.getAttribute('position').array as ArrayLike<number>)
      const index = new Uint32Array(bodyGeo.getIndex()!.array as ArrayLike<number>)
      physics.world.createCollider(RAPIER.ColliderDesc.trimesh(verts, index).setFriction(0.6))
    }

    // Two dark glossy lenses deep in their sockets; they glow amber when it wakes.
    const eyeMat = new THREE.MeshStandardMaterial({ color: srgb(0.06, 0.07, 0.09), roughness: 0.16, metalness: 0.1 })
    const lensParts = eyes.map(e => ball(0.36).applyMatrix4(inHead(at(e.c, e.q, v3(1, 1, 0.45)))).applyMatrix4(toWorld))
    const eyeGeo = mergeGeometries(lensParts)!
    for (const g of lensParts) g.dispose()
    eyeMat.emissive.copy(srgb(1.0, 0.72, 0.38))
    eyeMat.emissiveIntensity = 0
    this.eyeMat = eyeMat
    this.group.add(new THREE.Mesh(eyeGeo, eyeMat))
    this.geometries.push(eyeGeo)
    this.materials.push(eyeMat)
    // Heavy round lids over the top of each eye. Each hinges in a frame flattened toward the face,
    // so it stays snug over the lens as it lifts.
    {
      const cap = new THREE.SphereGeometry(0.5, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2)
      const rim = new THREE.CircleGeometry(0.5, 28).applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      const lidGeo = mergeGeometries([cap, rim])!
      cap.dispose()
      rim.dispose()
      const n = lidGeo.getAttribute('position').count
      const col = new Float32Array(n * 3)
      for (let i = 0; i < n; i += 1) col.set([SHELL.r, SHELL.g, SHELL.b], i * 3)
      lidGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      this.geometries.push(lidGeo)
      for (const e of eyes) {
        const hinge = new THREE.Group()
        hinge.position.copy(W(e.c.clone().applyMatrix4(headM)))
        // Tilted so the lid droops toward the outer corner: a kind, sleepy look.
        hinge.quaternion.copy(worldQ).multiply(headQ).multiply(e.q).multiply(qAxis(Z, -e.side * 0.22))
        hinge.scale.set(S, S, S * 0.56)
        const lid = new THREE.Mesh(lidGeo, shellMat)
        lid.rotation.x = LID_SLEEPY
        lid.receiveShadow = true
        hinge.add(lid)
        this.group.add(hinge)
        this.lids.push(lid)
      }
    }

    // ── Overgrowth: grass tufts and daisies on the upward faces ──
    const grass = overgrowth(bodyGeo, ground, wind)
    this.group.add(grass)
    this.geometries.push(grass.geometry)
    this.materials.push(grass.material as THREE.Material)

    // ── Red silk band round the post on its head, and its knot ──
    const bandCenter = W(postBase.clone().addScaledVector(postDir, 0.42).applyMatrix4(headM))
    const bandAxis = WD(postDir.clone().transformDirection(headM))
    const bandRadius = 0.11 * S + 0.03
    const windW = v3(CONFIG.wind.dir.x, 0, CONFIG.wind.dir.y)
    const knotOut = windW.clone().addScaledVector(bandAxis, -windW.dot(bandAxis)).normalize()
    const knot = bandCenter.clone().addScaledVector(knotOut, bandRadius)
    const bandMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.035, 0.05), roughness: 0.75, side: THREE.DoubleSide })
    this.materials.push(bandMat)
    const bandQ = new THREE.Quaternion().setFromUnitVectors(UP, bandAxis)
    const redPiece = (g: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(g, bandMat)
      m.castShadow = true
      this.group.add(m)
      this.geometries.push(g)
    }
    for (const [off, h, dr] of [[0.02, 0.28, 0], [-0.21, 0.1, 0.012]] as const) {
      redPiece(new THREE.CylinderGeometry(bandRadius + dr, bandRadius + dr + 0.01, h, 28, 1, true).applyMatrix4(at(bandCenter.clone().addScaledVector(bandAxis, off), bandQ)))
    }
    redPiece(ball(0.14).applyMatrix4(at(knot.clone().addScaledVector(knotOut, 0.04), bandQ, v3(1.25, 0.8, 0.85))))
    const backW = W(v3(0, 0, -1)).sub(W(v3(0, 0, 0))).normalize()
    const hangSide = backW.addScaledVector(bandAxis, -backW.dot(bandAxis)).normalize()

    // ── Two small birds perched on its head and on the toe of its left foot ──
    const perches: [V3, number][] = [
      [W(hp(0.62, 1.17, 0.3)), C.yaw + 0.6],
      [W(legs[1].top), C.yaw + 2.4],
    ]
    for (const [p, yaw] of perches) {
      const b = perchedBird()
      b.group.position.copy(p)
      b.group.rotation.y = yaw
      this.group.add(b.group)
      this.perched.push({ head: b.head, body: b.group, lift: b.lift, base: yaw, next: 1 + this.R2() * 3, target: 0, hop: 0 })
      this.geometries.push(...b.geometries)
      this.materials.push(...b.materials)
    }

    // ── Anchors for the ribbon, the creature, the rose and the cameras ──
    const tipsL = left.tips.slice(0, 3).reduce((s, t) => s.add(t), v3(0, 0, 0)).multiplyScalar(1 / 3)
    const critter = W(tipsL.add(v3(-0.25, 0, 0.55)))
    critter.y = terrainHeight(critter.x, critter.z)
    // The rose grows in the nook between the right hand and the right leg.
    const rose = W(v3(-3.0, 0, 2.75))
    rose.y = terrainHeight(rose.x, rose.z)
    this.anchors = {
      knot,
      knotOut,
      bandCenter,
      bandAxis,
      bandRadius,
      stringTop: bandCenter.clone().addScaledVector(hangSide, bandRadius),
      stringLength: 0.9,
      // The cord hangs from the knot as the bow's loop, so the silk on its head reads as a tied bow.
      loopA: knot.clone().addScaledVector(bandAxis, 0.09),
      loopB: knot.clone().addScaledVector(bandAxis, -0.09),
      loopLength: 0.8,
      body: [
        { a: W(right.start), b: W(right.elbow), r: 0.6 * S },
        { a: W(right.elbow), b: W(right.wrist), r: 0.55 * S },
        { a: W(right.palmC), b: W(right.palmC), r: 0.6 * S },
        { a: W(shoulders[0].padC), b: W(shoulders[0].padC), r: 0.74 * S },
        { a: W(shoulders[1].padC), b: W(shoulders[1].padC), r: 0.74 * S },
        { a: W(tp(0, 1.6, 0.12)), b: W(tp(0, 1.6, 0.12)), r: 2.5 * S },
        { a: W(hp(0, -0.55, 0)), b: W(hp(0, -0.55, 0)), r: 1.8 * S },
        { a: W(postBase.clone().applyMatrix4(headM)), b: W(postTip.clone().applyMatrix4(headM)), r: 0.12 * S },
        { a: W(left.start), b: W(left.elbow), r: 0.6 * S },
        { a: W(left.elbow), b: W(left.wrist), r: 0.55 * S },
        { a: W(left.palmC), b: W(left.palmC), r: 0.6 * S },
        ...legs.map(L => ({ a: W(L.ankle), b: W(L.hip), r: 0.85 * S })),
        ...legs.map(L => ({ a: W(L.fc), b: W(L.fc), r: 0.8 * S })),
      ],
      critter,
      rose,
      handR: W(right.wrist),
      handL: W(left.wrist),
      forward: W(v3(0, 0, 1)).sub(W(v3(0, 0, 0))).setY(0).normalize(),
      focus: W(tp(0, 2.4, 0.4)),
    }
    const mask = (p: V3, r: number) => {
      const w = W(p)
      this.grassMask.push({ x: w.x, z: w.z, r })
    }
    mask(tp(0, 0, 0.2), 2.3 * S)
    for (const L of legs) {
      for (const t of [0.2, 0.55, 0.9]) mask(L.ankle.clone().lerp(L.hip, t), 0.8 * S)
      mask(L.fc, 0.78 * S)
    }
    for (const A of [left, right]) {
      mask(A.palmC, 0.6 * S)
      for (const t of A.tips) mask(t, 0.24 * S)
    }
  }

  /** Wake the eyes: the lids lift and a soft amber glow fades up over a few seconds (or at once). */
  setAwake(on: boolean, instant = false): void {
    this.glowTarget = on ? 1 : 0
    if (instant) this.glow = this.glowTarget
  }

  /** The eyes and lids follow the glow; the perched birds now and then turn their heads, or hop round. */
  update(dt: number, time: number, gust: number): void {
    this.glow += (this.glowTarget - this.glow) * (1 - Math.exp(-dt * 0.45))
    this.eyeMat.emissiveIntensity = this.glow * (2.1 + 0.5 * Math.sin(time * 1.3))
    const lid = LID_SLEEPY + (LID_OPEN - LID_SLEEPY) * smooth(0, 0.7, this.glow)
    for (const l of this.lids) l.rotation.x = lid
    for (const b of this.perched) {
      b.next -= dt * (1 + gust * 0.8)
      if (b.next <= 0) {
        b.next = 1.2 + this.R2() * 3.5
        if (this.R2() < 0.2) {
          b.base += (this.R2() - 0.5) * 2.4
          b.hop = 1
        } else b.target = (this.R2() - 0.5) * 2.2
      }
      b.head.rotation.y += (b.target - b.head.rotation.y) * (1 - Math.exp(-dt * 14))
      b.body.rotation.y += (b.base - b.body.rotation.y) * (1 - Math.exp(-dt * 9))
      if (b.hop > 0) b.hop = Math.max(0, b.hop - dt * 4)
      b.lift.position.y = Math.sin(b.hop * Math.PI) * 0.09
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
  }
}

/** Weathered ceramic: vertex tones plus rain streaks, grime near the ground, lichen and moss. */
function shellMaterial(groundY: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  m.onBeforeCompile = shader => {
    shader.uniforms.uGroundY = { value: groundY }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nvarying vec3 vRN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRN = normalize(mat3(modelMatrix) * objectNormal);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE}\nuniform float uGroundY;\nvarying vec3 vRW;\nvarying vec3 vRN;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 wn = normalize(vRN);
          vec3 wp = vRW;
          float n1 = fbm3(wp.xz * 0.55 + vec2(wp.y * 0.4, -wp.y * 0.3));
          float n2 = vnoise(wp.xz * 3.1 + wp.y * 2.3);
          float n3 = vnoise(vec2((wp.x + wp.z) * 2.6, wp.y * 0.22) + 7.0);
          float side = 1.0 - abs(wn.y);
          // Rain streaks run down the side faces; grime settles low on the legs.
          diffuseColor.rgb *= 1.0 - 0.28 * side * smoothstep(0.5, 0.84, n3);
          diffuseColor.rgb *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 3.5, wp.y - uGroundY));
          // Pale lichen specks.
          float lichen = smoothstep(0.8, 0.9, vnoise(wp.xz * 9.0 + wp.y * 7.0 + 3.0)) * (0.4 + 0.6 * n1);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.5, 0.2), lichen * 0.45);
          // Moss on every upward face, in patches, and creeping up from the turf.
          float moss = smoothstep(0.5, 0.82, wn.y + (n1 - 0.5) * 0.6) * smoothstep(0.32, 0.6, n1 * 0.7 + n2 * 0.45);
          moss = max(moss, (1.0 - smoothstep(0.1, 0.95, wp.y - uGroundY + (n2 - 0.5) * 0.6)) * 0.9);
          vec3 mossCol = mix(vec3(0.07, 0.15, 0.025), vec3(0.2, 0.3, 0.06), n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, mossCol, clamp(moss, 0.0, 1.0) * 0.9);
        }`,
      )
  }
  return m
}

/**
 * Grass tufts and a few daisies scattered over the body's upward faces (area-weighted, fewer on
 * the feet where the meadow already hides them), swaying with the shared wind field.
 */
function overgrowth(geo: THREE.BufferGeometry, groundY: number, wind: WindUniforms): THREE.Mesh {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const index = geo.getIndex()!
  const tris = index.count / 3
  const cdf = new Float64Array(tris)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  const load = (t: number) => {
    a.fromBufferAttribute(pos, index.getX(t * 3))
    b.fromBufferAttribute(pos, index.getX(t * 3 + 1))
    c.fromBufferAttribute(pos, index.getX(t * 3 + 2))
    e1.subVectors(b, a)
    e2.subVectors(c, a)
    return n.crossVectors(e1, e2).length()
  }
  let total = 0
  for (let t = 0; t < tris; t += 1) {
    const len = load(t)
    if (len > 1e-9) {
      const h = (a.y + b.y + c.y) / 3 - groundY
      total += len * 0.5 * smooth(0.55, 0.92, n.y / len) * (h < 1.4 ? 0.2 : 1)
    }
    cdf[t] = total
  }
  const R = rng(771)
  const pick = () => {
    const u = R() * total
    let lo = 0
    let hi = tris - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cdf[mid] < u) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const P: number[] = []
  const N: number[] = []
  const Cl: number[] = []
  const Sw: number[] = []
  const I: number[] = []
  const vert = (p: V3, nrm: V3, col: THREE.Color, sway: number) => {
    P.push(p.x, p.y, p.z)
    N.push(nrm.x, nrm.y, nrm.z)
    Cl.push(col.r, col.g, col.b)
    Sw.push(sway)
    return P.length / 3 - 1
  }
  const ROOT = srgb(0.16, 0.26, 0.07)
  const TIPS = [srgb(0.42, 0.6, 0.16), srgb(0.56, 0.68, 0.22), srgb(0.36, 0.54, 0.2)]
  const STEM = srgb(0.24, 0.4, 0.1)
  const PETALS = [srgb(0.97, 0.96, 0.91), srgb(0.97, 0.96, 0.91), srgb(0.98, 0.9, 0.6)]
  const CENTRE = srgb(0.98, 0.74, 0.16)
  /** A tapered, curved blade; returns its tip. */
  const blade = (base: V3, up: V3, h: number, w: number, lean: V3, bend: number, root: THREE.Color, tip: THREE.Color): V3 => {
    const dir = up.clone().addScaledVector(lean, bend).normalize()
    const side = dir.clone().cross(lean).normalize()
    const first = P.length / 3
    const LEVELS = 4
    let top = base
    for (let i = 0; i <= LEVELS; i += 1) {
      const t = i / LEVELS
      const centre = base.clone().addScaledVector(dir, h * t).addScaledVector(lean, h * 0.32 * t * t)
      const hw = (w / 2) * (1 - t * 0.92)
      const col = root.clone().lerp(tip, Math.pow(t, 0.8))
      vert(centre.clone().addScaledVector(side, -hw), up, col, h * t * t)
      vert(centre.clone().addScaledVector(side, hw), up, col, h * t * t)
      top = centre
    }
    for (let i = 0; i < LEVELS; i += 1) {
      const k = first + i * 2
      I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
    return top
  }
  const face = v3(-0.25, 1, 0.2).normalize()
  const fu = face.clone().cross(X).normalize()
  const fw = face.clone().cross(fu).normalize()
  for (let k = 0; k < 340; k += 1) {
    load(pick())
    n.normalize()
    let u = R()
    let v = R()
    if (u + v > 1) {
      u = 1 - u
      v = 1 - v
    }
    const p = a.clone().addScaledVector(e1, u).addScaledVector(e2, v)
    const up = UP.clone().lerp(n, 0.3).normalize()
    const size = 0.75 + R() * 0.8
    const tip = TIPS[Math.floor(R() * TIPS.length)]
    const blades = 8 + Math.floor(R() * 7)
    for (let j = 0; j < blades; j += 1) {
      const ang = R() * Math.PI * 2
      const off = v3(Math.cos(ang), 0, Math.sin(ang))
      off.addScaledVector(n, -off.dot(n))
      const base = p.clone().addScaledVector(off, 0.03 + R() * 0.09 * size).addScaledVector(n, -0.02)
      const la = ang + (R() - 0.5)
      blade(base, up, (0.12 + R() * 0.22) * size, 0.035 + R() * 0.025, v3(Math.cos(la), 0, Math.sin(la)), 0.35 + R() * 0.5, ROOT, tip.clone().multiplyScalar(0.9 + R() * 0.2))
    }
    if (R() < 0.16) {
      // A daisy: a thin stem with a flat, sky-facing flower head.
      const hs = (0.2 + R() * 0.16) * size
      const la = R() * Math.PI * 2
      const top = blade(p, up, hs, 0.016, v3(Math.cos(la), 0, Math.sin(la)), 0.12, STEM, STEM)
      const petalR = 0.05 + R() * 0.03
      const col = PETALS[Math.floor(R() * PETALS.length)]
      const centre = vert(top, face, CENTRE, hs)
      const COUNT = 18
      for (let i = 0; i < COUNT; i += 1) {
        const ang = (i / COUNT) * Math.PI * 2
        const r = i % 2 === 0 ? petalR : petalR * 0.45
        const q = top.clone().addScaledVector(fu, Math.cos(ang) * r).addScaledVector(fw, Math.sin(ang) * r).addScaledVector(face, i % 2 ? 0.004 : -0.006)
        vert(q, face, col, hs)
      }
      for (let i = 0; i < COUNT; i += 1) I.push(centre, centre + 1 + i, centre + 1 + ((i + 1) % COUNT))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 3))
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(Sw, 1))
  g.setIndex(I)
  g.computeBoundingSphere()
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { uTime: wind.uTime, uWindDir: wind.uWindDir, uWindSpeed: wind.uWindSpeed, uWindScroll: wind.uWindScroll, uWindGust: wind.uWindGust })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE}\n${GLSL_WIND}\nattribute float aSway;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec2 w = windAt(transformed.xz);
          vec2 across = vec2(-uWindDir.y, uWindDir.x);
          float s = aSway;
          transformed.xz += (uWindDir * (0.3 + w.x * 0.6) + across * w.y * 0.08) * s;
          transformed.y -= s * s * (0.2 + 0.35 * w.x);
        }`,
      )
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
  }
  const mesh = new THREE.Mesh(g, mat)
  mesh.receiveShadow = true
  mesh.name = 'guardian-grass'
  return mesh
}

/** A small white bird with grey wings, sitting; its head turns on its own. */
function perchedBird(): { group: THREE.Group; lift: THREE.Group; head: THREE.Group; geometries: THREE.BufferGeometry[]; materials: THREE.Material[] } {
  const white = new THREE.MeshLambertMaterial({ color: srgb(0.96, 0.96, 0.94) })
  const grey = new THREE.MeshLambertMaterial({ color: srgb(0.44, 0.47, 0.55) })
  const orange = new THREE.MeshLambertMaterial({ color: srgb(0.96, 0.62, 0.2) })
  const black = new THREE.MeshBasicMaterial({ color: 0x111114 })
  const geometries: THREE.BufferGeometry[] = []
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, p: V3, rx = 0) => {
    geometries.push(g)
    const mesh = new THREE.Mesh(g, m)
    mesh.position.copy(p)
    mesh.rotation.x = rx
    mesh.castShadow = true
    parent.add(mesh)
    return mesh
  }
  const group = new THREE.Group()
  const lift = new THREE.Group()
  group.add(lift)
  add(lift, new THREE.SphereGeometry(0.1, 14, 10).scale(0.85, 0.8, 1.5), white, v3(0, 0.1, 0), -0.35)
  for (const s of [-1, 1]) add(lift, new THREE.SphereGeometry(0.08, 10, 8).scale(0.35, 0.62, 1.55), grey, v3(s * 0.075, 0.125, -0.035), -0.3)
  add(lift, new THREE.BoxGeometry(0.09, 0.016, 0.15), grey, v3(0, 0.07, -0.17), 0.35)
  const head = new THREE.Group()
  head.position.set(0, 0.205, 0.1)
  lift.add(head)
  add(head, new THREE.SphereGeometry(0.066, 12, 10), white, v3(0, 0, 0))
  add(head, new THREE.ConeGeometry(0.018, 0.065, 8).rotateX(Math.PI / 2), orange, v3(0, -0.005, 0.085))
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.012, 6, 6), black, v3(s * 0.037, 0.016, 0.045))
  group.scale.setScalar(1.6)
  return { group, lift, head, geometries, materials: [white, grey, orange, black] }
}
