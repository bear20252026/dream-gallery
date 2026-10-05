import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RAPIER, type Physics } from '../engine/physics'
import { rng } from './noise'
import { terrainHeight } from './terrain'

/**
 * The small things on the hill that can be looked at or touched: the pilot's crashed biplane, a
 * "hat" that is really a boa digesting an elephant, the empty sheep box with three air holes,
 * baobab sprouts (pulled up one by one, they grow back) and the rose under her glass dome.
 * Everything is simple vertex-coloured Lambert so it sits in the painted scene.
 */

export type Circle = { x: number; z: number; r: number }
type V3 = THREE.Vector3
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
export const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)

/** Hand-placed spots (world x, z; yaw turns the prop's +z). */
export const PROP_SPOTS = {
  plane: { x: 10.8, z: 25.2, yaw: 1.95 },
  hat: { x: -17, z: 24, yaw: 0.55 },
  sprouts: [
    [1.5, 17],
    [8.6, 12.4],
    [-3.6, 21],
    [6.3, 5.9],
  ] as [number, number][],
}
const SPROUT_REGROW = 180

/** Colour a geometry: a flat colour, optionally varied per vertex by `shade(position, normal)`. */
export function paint(g: THREE.BufferGeometry, c: THREE.Color, shade?: (p: V3, n: V3) => THREE.Color | number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  if (geo !== g) g.dispose()
  geo.deleteAttribute('uv')
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  const pos = geo.getAttribute('position')
  const nor = geo.getAttribute('normal')
  const col = new Float32Array(pos.count * 3)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const out = new THREE.Color()
  for (let i = 0; i < pos.count; i += 1) {
    out.copy(c)
    if (shade) {
      p.fromBufferAttribute(pos, i)
      n.fromBufferAttribute(nor, i)
      const s = shade(p, n)
      if (typeof s === 'number') out.multiplyScalar(s)
      else out.copy(s)
    }
    col[i * 3] = out.r
    col[i * 3 + 1] = out.g
    col[i * 3 + 2] = out.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

export function place(g: THREE.BufferGeometry, at: V3, rot?: THREE.Euler, scale?: V3): THREE.BufferGeometry {
  return g.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), scale ?? v3(1, 1, 1)))
}

export const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
export const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg)
export const ball = (r: number, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h)
export const E = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z)

/** Soft glass: a fresnel rim and a sun glint, otherwise nearly clear. */
function glassMaterial(sunDir: V3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir.clone().normalize() } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        if (!gl_FrontFacing) n = -n;
        float f = pow(1.0 - abs(dot(n, v)), 2.6);
        float spec = pow(max(dot(n, normalize(uSun + v)), 0.0), 90.0);
        float a = clamp(0.05 + 0.5 * f + spec * 0.8, 0.0, 0.85);
        gl_FragColor = vec4(vec3(0.82, 0.9, 1.0) * (0.7 + 0.5 * f) + vec3(spec * 2.4), a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

type Sprout = { at: V3; mesh: THREE.Mesh; state: 'up' | 'pulled' | 'gone' | 'growing'; t: number; phase: number }

export class Props {
  readonly group = new THREE.Group()
  readonly grassMask: Circle[] = []
  /** Areas the random rock scatter must keep clear. */
  readonly reserved: Circle[] = []
  readonly planeFocus = new THREE.Vector3()
  readonly hatFocus = new THREE.Vector3()
  readonly boxFocus = new THREE.Vector3()
  readonly roseFocus = new THREE.Vector3()
  readonly sprouts: Sprout[] = []
  private readonly propeller = new THREE.Group()
  private readonly rose = new THREE.Group()
  private readonly dome: THREE.Mesh
  private readonly domeHome = new THREE.Vector3()
  private readonly domeAside = new THREE.Vector3()
  private domeT = 0
  private domeTarget = 0
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []

  constructor(physics: Physics, anchors: { rose: V3; critter: V3; forward: V3 }, sunDir: V3) {
    this.group.name = 'props'
    const lambert = new THREE.MeshLambertMaterial({ vertexColors: true })
    const flat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    const petals = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    const glass = glassMaterial(sunDir)
    this.materials.push(lambert, flat, petals, glass)
    const mesh = (parts: THREE.BufferGeometry[], mat: THREE.Material) => {
      const g = mergeGeometries(parts)!
      for (const p of parts) p.dispose()
      this.geometries.push(g)
      const m = new THREE.Mesh(g, mat)
      m.castShadow = true
      m.receiveShadow = true
      return m
    }
    const fwd = v3(anchors.forward.x, 0, anchors.forward.z).normalize()
    const right = v3(-fwd.z, 0, fwd.x)

    // ── The pilot's biplane, nose down in the turf (local +z = nose) ──
    {
      const s = PROP_SPOTS.plane
      const cream = srgb(0.93, 0.88, 0.78)
      const red = srgb(0.78, 0.2, 0.17)
      const dark = srgb(0.17, 0.15, 0.14)
      const wood = srgb(0.5, 0.4, 0.3)
      const soot = (p: V3) => (p.z > 1.3 ? 0.78 : 1)
      const parts = [
        paint(place(cyl(0.46, 0.2, 3.6, 14), v3(0, 0, 0), E(Math.PI / 2)), cream, soot),
        paint(place(cyl(0.49, 0.48, 0.42, 16), v3(0, 0, 1.86), E(Math.PI / 2)), red),
        paint(place(ball(0.21, 12, 8), v3(0, 0, 2.08), undefined, v3(1, 1, 0.55)), dark),
        paint(place(new THREE.TorusGeometry(0.3, 0.06, 8, 20), v3(0, 0.33, -0.2), E(Math.PI / 2)), srgb(0.38, 0.22, 0.13)),
        paint(place(cyl(0.28, 0.28, 0.02, 16), v3(0, 0.31, -0.2)), dark),
        paint(place(box(0.5, 0.22, 0.03), v3(0, 0.46, 0.22), E(-0.4)), srgb(0.7, 0.8, 0.86)),
        // Upper wing with red tips, lower wing (the right half crumpled against the turf).
        paint(place(box(4.3, 0.08, 0.9), v3(0, 0.95, 0.55)), cream),
        paint(place(box(0.5, 0.085, 0.905), v3(2.4, 0.95, 0.55)), red),
        paint(place(box(0.5, 0.085, 0.905), v3(-2.4, 0.95, 0.55)), red),
        paint(place(box(2.4, 0.08, 0.85), v3(-1.35, -0.28, 0.6)), cream),
        paint(place(box(2.3, 0.08, 0.85), v3(1.3, -0.42, 0.62), E(0.05, 0, -0.22)), cream, p => (p.x > 1.9 ? 0.85 : 1)),
        // Interplane and cabane struts.
        ...[-1.6, 1.6].flatMap(x => [0.3, 0.8].map(z => paint(place(cyl(0.028, 0.028, 1.22, 6), v3(x, x > 0 ? 0.28 : 0.34, z), E(0, 0, x > 0 ? 0.12 : 0)), wood))),
        ...[-0.32, 0.32].map(x => paint(place(cyl(0.025, 0.025, 0.72, 6), v3(x, 0.62, 0.55), E(0, 0, -x * 0.9)), wood)),
        // Tail: stabiliser, fin and rudder stripe.
        paint(place(box(1.7, 0.05, 0.55), v3(0, 0.05, -1.72)), cream),
        paint(place(box(0.05, 0.72, 0.62), v3(0, 0.42, -1.78)), red),
        paint(place(box(0.055, 0.14, 0.64), v3(0, 0.18, -1.78)), cream),
        // Landing gear.
        ...[-0.6, 0.6].map(x => paint(place(cyl(0.23, 0.23, 0.1, 14), v3(x, -0.78, 0.95), E(0, 0, Math.PI / 2)), dark)),
        ...[-0.6, 0.6].map(x => paint(place(cyl(0.03, 0.03, 0.62, 6), v3(x * 0.72, -0.5, 0.92), E(0, 0, x > 0 ? -0.45 : 0.45)), wood)),
      ]
      const plane = mesh(parts, lambert)
      const blades = mesh(
        [
          paint(place(box(0.16, 1.1, 0.045), v3(0, 0.55, 0)), wood),
          // The bent blade folds back where it hit the ground.
          paint(place(box(0.16, 0.5, 0.045), v3(0, -0.25, 0)), wood),
          paint(place(box(0.16, 0.62, 0.045), v3(0, -0.72, -0.2), E(0.75)), wood),
          paint(place(ball(0.09, 10, 8), v3(0, 0, 0)), dark),
        ],
        lambert,
      )
      this.propeller.add(blades)
      this.propeller.position.set(0, 0, 2.2)
      const root = new THREE.Group()
      root.add(plane, this.propeller)
      const h = terrainHeight(s.x, s.z)
      root.position.set(s.x, h + 1.05, s.z)
      root.rotation.set(0.46, s.yaw, 0.12, 'YXZ')
      root.updateMatrixWorld(true)
      this.group.add(root)
      this.planeFocus.copy(v3(0, 0.3, -0.2).applyMatrix4(root.matrixWorld))
      const q = root.quaternion
      physics.addStaticBox(v3(0, 0, 0.1).applyMatrix4(root.matrixWorld), v3(1.0, 1.0, 4.2), q)
      physics.addStaticBox(v3(0, 0.33, 0.58).applyMatrix4(root.matrixWorld), v3(5.0, 1.4, 1.0), q)
      const nose = v3(0, 0, 1.8).applyMatrix4(root.matrixWorld)
      this.grassMask.push({ x: nose.x, z: nose.z, r: 0.9 })
      this.reserved.push({ x: s.x, z: s.z, r: 4.5 })
    }

    // ── The "hat": a boa digesting an elephant (local +x = length) ──
    {
      const s = PROP_SPOTS.hat
      const g = new THREE.IcosahedronGeometry(1, 4)
      const pos = g.getAttribute('position')
      const p = new THREE.Vector3()
      for (let i = 0; i < pos.count; i += 1) {
        p.fromBufferAttribute(pos, i)
        const u = p.x
        const hump = 0.18 + 0.07 * (1 - u * u) + 1.02 * Math.exp(-(((u - 0.1) / 0.38) ** 2))
        const width = 0.5 + 0.55 * Math.exp(-(((u - 0.05) / 0.52) ** 2))
        pos.setXYZ(i, u * 2.3, p.y > 0 ? p.y * hump * 1.45 : p.y * 0.3, p.z * width)
      }
      g.computeVertexNormals()
      const R = rng(71)
      const stone = srgb(0.6, 0.62, 0.64)
      const moss = srgb(0.36, 0.5, 0.22)
      const tone = new THREE.Color()
      let vi = 0
      let jitter = 1
      const colored = paint(g, stone, (q, n) => {
        // Vertices arrive three per face: one tone jitter per facet.
        if (vi++ % 3 === 0) jitter = 0.88 + R() * 0.2
        const m = THREE.MathUtils.smoothstep(n.y, 0.55, 0.85) * THREE.MathUtils.smoothstep(q.y, 0.35, 0.9)
        return tone.copy(stone).lerp(moss, m * 0.85).multiplyScalar(jitter)
      })
      const hat = mesh([colored], flat)
      const h = terrainHeight(s.x, s.z)
      hat.position.set(s.x, h - 0.12, s.z)
      hat.rotation.y = s.yaw
      hat.updateMatrixWorld(true)
      this.group.add(hat)
      this.hatFocus.set(s.x, h + 1.0, s.z)
      const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(hat.geometry.getAttribute('position').array))
      if (hull) {
        const qq = hat.quaternion
        physics.world.createCollider(hull.setTranslation(hat.position.x, hat.position.y, hat.position.z).setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }))
      }
      this.grassMask.push({ x: s.x, z: s.z, r: 1.9 })
      this.reserved.push({ x: s.x, z: s.z, r: 3.6 })
    }

    // ── The sheep box with three air holes, beside the sheep ──
    {
      const c = anchors.critter
      const at = c.clone().addScaledVector(right, -1.05).addScaledVector(fwd, 0.35)
      at.y = terrainHeight(at.x, at.z)
      const wood = srgb(0.74, 0.55, 0.34)
      const groove = srgb(0.5, 0.35, 0.2)
      const hinge = new THREE.Matrix4().makeTranslation(0, 0.42, -0.23)
      const lid = paint(box(0.66, 0.04, 0.5), wood, pp => (pp.y > 0 ? 1.06 : 0.8))
      lid.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.02, 0.25))
      lid.applyMatrix4(new THREE.Matrix4().makeRotationX(-0.55))
      lid.applyMatrix4(hinge)
      const parts = [
        paint(place(box(0.62, 0.42, 0.46), v3(0, 0.21, 0)), wood, (pp, n) => (n.y > 0.5 ? 0.9 : 1) * (0.94 + 0.08 * Math.sin(pp.y * 40))),
        paint(place(box(0.63, 0.014, 0.47), v3(0, 0.14, 0)), groove),
        paint(place(box(0.63, 0.014, 0.47), v3(0, 0.28, 0)), groove),
        paint(place(box(0.56, 0.05, 0.4), v3(0, 0.39, 0)), srgb(0.86, 0.76, 0.42)),
        ...[-0.17, 0, 0.17].map(x => paint(place(cyl(0.038, 0.038, 0.02, 12), v3(x, 0.23, 0.231), E(Math.PI / 2)), srgb(0.1, 0.07, 0.05))),
        lid,
      ]
      const crate = mesh(parts, lambert)
      crate.position.copy(at)
      crate.rotation.y = Math.atan2(fwd.x, fwd.z) + 0.35
      crate.updateMatrixWorld(true)
      this.group.add(crate)
      this.boxFocus.copy(at).add(v3(0, 0.3, 0))
      physics.addStaticBox(v3(0, 0.21, 0).applyMatrix4(crate.matrixWorld), v3(0.62, 0.42, 0.46), crate.quaternion)
      this.grassMask.push({ x: at.x, z: at.z, r: 0.5 })
      this.reserved.push({ x: at.x, z: at.z, r: 1.2 })
    }

    // ── Baobab sprouts: a little soil mound each, and a two-leaf shoot ──
    {
      const leaf = srgb(0.55, 0.78, 0.24)
      const stem = srgb(0.34, 0.5, 0.17)
      const soil = srgb(0.4, 0.3, 0.2)
      const shoot = () => [
        paint(place(cyl(0.016, 0.026, 0.3, 6), v3(0, 0.15, 0)), stem),
        paint(place(ball(1, 12, 6), v3(-0.1, 0.31, 0), E(0, 0, 0.35), v3(0.12, 0.022, 0.07)), leaf, (_, n) => (n.y > 0 ? 1.12 : 0.72)),
        paint(place(ball(1, 12, 6), v3(0.1, 0.31, 0), E(0, 0, -0.35), v3(0.12, 0.022, 0.07)), leaf, (_, n) => (n.y > 0 ? 1.12 : 0.72)),
        paint(place(ball(0.028, 8, 6), v3(0, 0.335, 0)), srgb(0.72, 0.86, 0.36)),
      ]
      const moundGeo = paint(place(ball(0.2, 12, 6), v3(0, 0, 0), undefined, v3(1, 0.3, 1)), soil, (_, n) => 0.85 + n.y * 0.2)
      this.geometries.push(moundGeo)
      PROP_SPOTS.sprouts.forEach(([x, z], i) => {
        const y = terrainHeight(x, z)
        const mound = new THREE.Mesh(moundGeo, lambert)
        mound.position.set(x, y, z)
        mound.receiveShadow = true
        const m = mesh(shoot(), lambert)
        m.position.set(x, y, z)
        m.scale.setScalar(1.3)
        m.rotation.y = i * 1.7
        this.group.add(mound, m)
        this.sprouts.push({ at: v3(x, y + 0.32, z), mesh: m, state: 'up', t: 0, phase: i * 2.1 })
        this.grassMask.push({ x, z, r: 0.5 })
        this.reserved.push({ x, z, r: 1.5 })
      })
    }

    // ── The rose, tucked beside the guardian's big resting hand, under her glass dome ──
    {
      const at = anchors.rose.clone()
      at.y = terrainHeight(at.x, at.z)
      const green = srgb(0.25, 0.43, 0.15)
      const stemCurve = new THREE.CatmullRomCurve3([v3(0, 0, 0), v3(0.015, 0.15, 0.01), v3(-0.01, 0.3, 0), v3(0.004, 0.45, 0.004)])
      const parts: THREE.BufferGeometry[] = [paint(new THREE.TubeGeometry(stemCurve, 16, 0.011, 6), green)]
      ;[0.08, 0.17, 0.26, 0.35].forEach((y, i) => {
        const a = i * 2.2
        parts.push(paint(place(new THREE.ConeGeometry(0.009, 0.035, 5), v3(Math.cos(a) * 0.012, y, Math.sin(a) * 0.012), E(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2)), srgb(0.36, 0.3, 0.14)))
      })
      ;[
        [0.15, 0.4],
        [0.25, 2.6],
      ].forEach(([y, a]) => {
        const g = place(ball(1, 10, 6), v3(0.055, 0, 0), E(0, 0, 0.45), v3(0.07, 0.012, 0.034))
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(a)).applyMatrix4(new THREE.Matrix4().makeTranslation(0, y, 0))
        parts.push(paint(g, green, (_, n) => (n.y > 0 ? 1.1 : 0.75)))
      })
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2
        parts.push(paint(place(new THREE.ConeGeometry(0.012, 0.05, 4), v3(Math.cos(a) * 0.03, 0.445, Math.sin(a) * 0.03), E(Math.sin(a) * 2.2, 0, -Math.cos(a) * 2.2)), green))
      }
      const bloomY = 0.49
      const petalRing = (r: number, t0: number, t1: number, count: number, len: number, off: number, y: number, c: THREE.Color) => {
        for (let k = 0; k < count; k += 1) {
          const g = new THREE.SphereGeometry(r, 8, 6, off + (k / count) * Math.PI * 2, len, t0, t1 - t0)
          g.translate(0, y - bloomY, 0)
          parts.push(paint(g, c, pp => THREE.MathUtils.lerp(0.62, 1.2, THREE.MathUtils.clamp((pp.y - (y - bloomY) + r) / (r * 1.6), 0, 1))))
        }
      }
      const bloom: THREE.BufferGeometry[] = []
      const before = parts.length
      petalRing(0.092, 0.36 * Math.PI, 0.9 * Math.PI, 5, 0.55 * Math.PI, 0, bloomY, srgb(0.76, 0.08, 0.12))
      petalRing(0.068, 0.24 * Math.PI, 0.86 * Math.PI, 5, 0.55 * Math.PI, 0.63, bloomY + 0.015, srgb(0.84, 0.1, 0.14))
      petalRing(0.046, 0.12 * Math.PI, 0.8 * Math.PI, 3, 0.8 * Math.PI, 1.1, bloomY + 0.028, srgb(0.68, 0.05, 0.09))
      bloom.push(...parts.splice(before))
      bloom.push(paint(place(ball(0.03, 10, 8), v3(0, 0.012, 0), undefined, v3(1, 1.3, 1)), srgb(0.6, 0.04, 0.08)))
      for (const g of bloom) g.translate(0, bloomY, 0)
      const stemMesh = mesh(parts, lambert)
      const bloomMesh = mesh(bloom, petals)
      this.rose.add(stemMesh, bloomMesh)
      this.rose.position.copy(at)
      this.rose.scale.setScalar(1.25)
      this.group.add(this.rose)
      this.roseFocus.copy(at).add(v3(0, 0.55, 0))
      // Bell jar: a lathe profile with a small knob.
      const profile = [v3(0.235, 0, 0), v3(0.235, 0.46, 0), v3(0.225, 0.54, 0), v3(0.195, 0.61, 0), v3(0.14, 0.66, 0), v3(0.065, 0.685, 0), v3(0.0, 0.69, 0)].map(p => new THREE.Vector2(p.x, p.y))
      const jar = mergeGeometries([new THREE.LatheGeometry(profile, 32).deleteAttribute('uv'), place(ball(0.032, 12, 8), v3(0, 0.715, 0)).deleteAttribute('uv')])!
      this.geometries.push(jar)
      this.dome = new THREE.Mesh(jar, glass)
      this.dome.renderOrder = 2
      this.domeHome.copy(at)
      this.domeAside.copy(at).addScaledVector(right, 0.7).addScaledVector(fwd, 0.25)
      this.domeAside.y = terrainHeight(this.domeAside.x, this.domeAside.z)
      this.dome.position.copy(this.domeHome)
      this.group.add(this.dome)
      physics.addStaticCylinder(v3(at.x, at.y + 0.35, at.z), 0.24, 0.7)
      this.grassMask.push({ x: at.x, z: at.z, r: 0.42 }, { x: this.domeAside.x, z: this.domeAside.z, r: 0.34 })
      this.reserved.push({ x: at.x, z: at.z, r: 1.5 })
    }
  }

  sproutsStanding(): number {
    return this.sprouts.filter(s => s.state === 'up').length
  }

  pullSprout(i: number): void {
    const s = this.sprouts[i]
    if (!s || s.state !== 'up') return
    s.state = 'pulled'
    s.t = 0
  }

  /** Lift the glass dome off the rose (set down beside her), or put it back. */
  setDome(lifted: boolean): void {
    this.domeTarget = lifted ? 1 : 0
  }

  update(dt: number, time: number, gust: number): void {
    // The bent propeller creaks round a little when the wind gusts.
    this.propeller.rotation.z = 0.35 + Math.sin(time * 0.6) * 0.06 + gust * 0.22 * Math.sin(time * 1.9)
    for (const s of this.sprouts) {
      s.t += dt
      const m = s.mesh
      if (s.state === 'up') {
        m.rotation.z = Math.sin(time * 1.8 + s.phase) * 0.07 * (0.5 + gust)
      } else if (s.state === 'pulled') {
        const k = Math.min(1, s.t / 0.9)
        m.position.y = s.at.y - 0.32 + (1 - (1 - k) * (1 - k)) * 0.55
        m.rotation.y += dt * 7
        m.scale.setScalar(1.3 * (1 - k))
        if (k >= 1) {
          s.state = 'gone'
          s.t = 0
          m.visible = false
        }
      } else if (s.state === 'gone' && s.t > SPROUT_REGROW) {
        s.state = 'growing'
        s.t = 0
        m.visible = true
        m.position.y = s.at.y - 0.32
      } else if (s.state === 'growing') {
        const k = Math.min(1, s.t / 2.5)
        m.scale.setScalar(1.3 * k * k * (3 - 2 * k))
        if (k >= 1) s.state = 'up'
      }
    }
    // Dome: an arc from home to beside the rose.
    const d = this.domeTarget - this.domeT
    this.domeT += Math.sign(d) * Math.min(Math.abs(d), dt / 0.9)
    const k = this.domeT * this.domeT * (3 - 2 * this.domeT)
    this.dome.position.lerpVectors(this.domeHome, this.domeAside, k)
    this.dome.position.y += Math.sin(Math.PI * k) * 0.45
    this.dome.rotation.z = Math.sin(Math.PI * k) * 0.25
    // The rose sways more with the dome off.
    this.rose.rotation.z = Math.sin(time * 1.4) * (0.01 + 0.06 * k * (0.4 + gust))
    this.rose.rotation.x = Math.sin(time * 1.1 + 1) * (0.008 + 0.035 * k * (0.4 + gust))
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
  }
}
