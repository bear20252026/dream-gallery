import * as THREE from 'three'
import type { RemotePose } from '../net/room'
import type { Note } from '../net/notes'
import { terrainHeight } from './terrain'

/**
 * What the shared hill adds to the scene: other travellers as faint silhouettes (a rim of light
 * and a little golden scarf in the wind), other travellers' notes as glowing flowers in the grass,
 * sparkles when someone is liked, and what the player is looking at among them (focus).
 */
export type SocialFocus = { kind: 'ghost'; id: number } | { kind: 'note'; note: Note; own: boolean }

type WindLike = { dir: THREE.Vector2; gust: number }

const GHOST_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  vY = position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`

const GHOST_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uPulse;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  f = f * f;
  float shimmer = 0.82 + 0.18 * sin(uTime * 2.1 + vY * 6.5);
  float feet = smoothstep(0.02, 0.5, vY);
  float a = uAlpha * (0.05 + 0.6 * f) * shimmer * feet + uPulse * (0.12 + 0.4 * f);
  vec3 c = uColor * (1.1 + 0.9 * f + uPulse * 1.6);
  gl_FragColor = vec4(c, clamp(a, 0.0, 0.9));
}`

const SCARF_VERT = /* glsl */ `
uniform float uTime;
uniform float uGust;
varying float vU;
void main() {
  vec3 p = position;
  float u = p.x / 0.62;
  vU = u;
  float w = 0.6 + uGust;
  p.y += sin(uTime * 7.0 - u * 9.0) * 0.045 * u * w - u * u * 0.08;
  p.z += sin(uTime * 5.3 - u * 7.0 + 1.3) * 0.06 * u * w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const SCARF_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vU;
void main() {
  gl_FragColor = vec4(uColor, uAlpha * (0.62 - 0.35 * vU));
}`

/** Soft round dot used by halos, motes and sparkles. */
function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

type Ghost = {
  id: number
  group: THREE.Group
  scarf: THREE.Mesh
  mat: THREE.ShaderMaterial
  scarfMat: THREE.ShaderMaterial
  fade: number
  seen: boolean
  pulse: number
  phase: number
  x: number
  z: number
  y: number
}

type Flower = { note: Note; own: boolean; group: THREE.Group; halo: THREE.Sprite; bloom: THREE.Object3D; at: THREE.Vector3; phase: number }

const MAX_GHOSTS = 8
const MOTES_PER_FLOWER = 5
const MAX_FLOWERS = 17
const SPARKS = 72

export class Social {
  readonly group = new THREE.Group()
  focus: SocialFocus | null = null

  private readonly ghosts = new Map<number, Ghost>()
  private readonly flowers: Flower[] = []
  private remotes: RemotePose[] = []
  private time = 0

  private readonly bodyGeo: THREE.BufferGeometry
  private readonly headGeo: THREE.BufferGeometry
  private readonly scarfGeo: THREE.BufferGeometry
  private readonly bloomGeo: THREE.BufferGeometry
  private readonly stemGeo: THREE.BufferGeometry
  private readonly dot = dotTexture()
  private readonly bloomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 1.95, 1.2), toneMapped: false })
  private readonly ownBloomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.75, 0.62), toneMapped: false })
  private readonly stemMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#5f8f3a') })
  private readonly heartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.3, 1.5), toneMapped: false })

  private readonly motes: THREE.Points
  private readonly motePos: Float32Array
  private readonly moteCol: Float32Array
  private readonly sparks: THREE.Points
  private readonly sparkPos: Float32Array
  private readonly sparkCol: Float32Array
  private readonly sparkVel: Float32Array
  private readonly sparkLife: Float32Array
  private sparkNext = 0

  constructor() {
    // A cloaked traveller, ~1.7 m: the profile is turned on a lathe, the head is a small sphere.
    const profile = [
      [0.001, 0.0], [0.3, 0.03], [0.33, 0.28], [0.3, 0.62], [0.25, 0.96], [0.21, 1.2],
      [0.25, 1.32], [0.17, 1.42], [0.07, 1.47], [0.001, 1.48],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    this.bodyGeo = new THREE.LatheGeometry(profile, 22)
    this.headGeo = new THREE.SphereGeometry(0.15, 18, 12).translate(0, 1.63, 0)
    this.scarfGeo = new THREE.PlaneGeometry(0.62, 0.085, 10, 1).translate(0.31, 0, 0)

    // Glowing note flower: six cupped petals around a heart, on a stem taller than the grass.
    const petals: THREE.BufferGeometry[] = []
    for (let i = 0; i < 6; i++) {
      const p = new THREE.CircleGeometry(0.075, 10).scale(0.62, 1, 1).translate(0, 0.07, 0)
      p.rotateX(-1.05).rotateY((i / 6) * Math.PI * 2)
      petals.push(p.toNonIndexed())
    }
    this.bloomGeo = mergeSimple(petals)
    this.stemGeo = new THREE.CylinderGeometry(0.009, 0.013, 0.52, 5).translate(0, 0.26, 0)
    this.bloomMat.side = this.ownBloomMat.side = THREE.DoubleSide

    const moteCount = MAX_FLOWERS * MOTES_PER_FLOWER
    this.motePos = new Float32Array(moteCount * 3)
    this.moteCol = new Float32Array(moteCount * 3)
    const mg = new THREE.BufferGeometry()
    mg.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3))
    mg.setAttribute('color', new THREE.BufferAttribute(this.moteCol, 3))
    this.motes = new THREE.Points(mg, this.pointsMaterial(0.07))
    this.motes.frustumCulled = false
    this.group.add(this.motes)

    this.sparkPos = new Float32Array(SPARKS * 3)
    this.sparkCol = new Float32Array(SPARKS * 3)
    this.sparkVel = new Float32Array(SPARKS * 3)
    this.sparkLife = new Float32Array(SPARKS)
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3))
    sg.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3))
    this.sparks = new THREE.Points(sg, this.pointsMaterial(0.11))
    this.sparks.frustumCulled = false
    this.group.add(this.sparks)
  }

  private pointsMaterial(size: number): THREE.PointsMaterial {
    return new THREE.PointsMaterial({
      size,
      map: this.dot,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    })
  }

  // ─── other travellers ────────────────────────────────────────────────────

  setRemotes(list: RemotePose[]): void {
    this.remotes = list
  }
  /** The other travellers on the hill right now (their feet press the grass too). */
  get others(): readonly RemotePose[] {
    return this.remotes
  }

  get travellersInView(): number {
    return this.ghosts.size
  }

  private makeGhost(id: number): Ghost {
    const mat = new THREE.ShaderMaterial({
      vertexShader: GHOST_VERT,
      fragmentShader: GHOST_FRAG,
      uniforms: { uColor: { value: new THREE.Color(0.95, 0.97, 1.0) }, uAlpha: { value: 0 }, uPulse: { value: 0 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
    })
    const scarfMat = new THREE.ShaderMaterial({
      vertexShader: SCARF_VERT,
      fragmentShader: SCARF_FRAG,
      uniforms: { uColor: { value: new THREE.Color(1.6, 1.05, 0.35) }, uAlpha: { value: 0 }, uTime: { value: 0 }, uGust: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const group = new THREE.Group()
    const body = new THREE.Mesh(this.bodyGeo, mat)
    const head = new THREE.Mesh(this.headGeo, mat)
    body.renderOrder = head.renderOrder = 5
    const scarf = new THREE.Mesh(this.scarfGeo, scarfMat)
    scarf.position.set(0, 1.43, 0.02)
    scarf.renderOrder = 6
    group.add(body, head, scarf)
    this.group.add(group)
    return { id, group, scarf, mat, scarfMat, fade: 0, seen: true, pulse: 0, phase: Math.random() * 6.28, x: 0, z: 0, y: 0 }
  }

  /** Light up a traveller (a like was sent to or received from them). */
  pulse(id: number): void {
    const g = this.ghosts.get(id)
    if (!g) return
    g.pulse = 1
    this.burst(new THREE.Vector3(g.x, g.y + 1.2, g.z), 22)
  }

  /** Sparkles over a note's flower (a drawing someone on the hill has just left). */
  bloom(id: number): void {
    const f = this.flowers.find(fl => fl.note.id === id)
    if (f) this.burst(f.at, 26)
  }

  // ─── notes as flowers ────────────────────────────────────────────────────

  /** Replace the found notes (others) and the traveller's own note (shown in ribbon red). */
  setNotes(others: Note[], own: Note | null): void {
    for (const f of this.flowers) this.group.remove(f.group)
    this.flowers.length = 0
    const list: [Note, boolean][] = others.filter(n => n.id !== own?.id).slice(0, MAX_FLOWERS - 1).map(n => [n, false])
    if (own) list.push([own, true])
    for (const [note, isOwn] of list) {
      const group = new THREE.Group()
      const y = terrainHeight(note.x, note.z)
      group.position.set(note.x, y, note.z)
      const stem = new THREE.Mesh(this.stemGeo, this.stemMat)
      const bloom = new THREE.Group()
      bloom.position.y = 0.52
      bloom.add(new THREE.Mesh(this.bloomGeo, isOwn ? this.ownBloomMat : this.bloomMat))
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), this.heartMat)
      heart.position.y = 0.02
      bloom.add(heart)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color: isOwn ? new THREE.Color(1, 0.42, 0.36) : new THREE.Color(1, 0.86, 0.52), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, toneMapped: false }))
      halo.scale.setScalar(0.95)
      halo.position.y = 0.55
      group.add(stem, bloom, halo)
      this.group.add(group)
      this.flowers.push({ note, own: isOwn, group, halo, bloom, at: new THREE.Vector3(note.x, y + 0.5, note.z), phase: Math.random() * 6.28 })
    }
    this.moteCol.fill(0)
    ;(this.motes.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true
  }

  // ─── sparkles ────────────────────────────────────────────────────────────

  burst(at: THREE.Vector3, n: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.sparkNext
      this.sparkNext = (this.sparkNext + 1) % SPARKS
      const a = Math.random() * Math.PI * 2
      const r = 0.2 + Math.random() * 0.35
      this.sparkPos.set([at.x + Math.cos(a) * r, at.y + (Math.random() - 0.3) * 0.6, at.z + Math.sin(a) * r], i * 3)
      this.sparkVel.set([Math.cos(a) * 0.25, 0.6 + Math.random() * 0.9, Math.sin(a) * 0.25], i * 3)
      this.sparkLife[i] = 1.2 + Math.random() * 0.8
    }
  }

  // ─── per frame ───────────────────────────────────────────────────────────

  update(dt: number, camera: THREE.Camera, active: boolean, wind: WindLike): void {
    this.time += dt
    const t = this.time

    // Travellers fade in where they appear and out where they leave.
    for (const g of this.ghosts.values()) g.seen = false
    for (const r of this.remotes.slice(0, MAX_GHOSTS)) {
      let g = this.ghosts.get(r.id)
      if (!g) {
        g = this.makeGhost(r.id)
        this.ghosts.set(r.id, g)
      }
      g.seen = true
      g.x = r.x
      g.z = r.z
      g.phase += dt * (r.moving ? 7.5 : 1.2)
      const bob = r.moving ? Math.abs(Math.sin(g.phase)) * 0.05 : Math.sin(g.phase) * 0.012
      g.y = terrainHeight(r.x, r.z)
      g.group.position.set(r.x, g.y + bob, r.z)
      g.group.rotation.set(r.moving ? -0.06 : 0, r.yaw, 0, 'YXZ')
      g.scarf.rotation.y = Math.atan2(-wind.dir.y, wind.dir.x) - r.yaw
    }
    for (const [id, g] of this.ghosts) {
      g.fade = Math.min(1, Math.max(0, g.fade + (g.seen ? dt : -dt) * 0.9))
      g.pulse = Math.max(0, g.pulse - dt * 0.8)
      g.mat.uniforms.uAlpha.value = g.fade
      g.mat.uniforms.uPulse.value = g.pulse * g.pulse
      g.mat.uniforms.uTime.value = t + g.phase * 0.1
      g.scarfMat.uniforms.uAlpha.value = g.fade
      g.scarfMat.uniforms.uTime.value = t
      g.scarfMat.uniforms.uGust.value = wind.gust
      if (!g.seen && g.fade <= 0) {
        this.group.remove(g.group)
        g.mat.dispose()
        g.scarfMat.dispose()
        this.ghosts.delete(id)
      }
    }

    // Flowers breathe; motes drift up from each and fade.
    this.flowers.forEach((f, fi) => {
      const s = Math.sin(t * 1.6 + f.phase)
      ;(f.halo.material as THREE.SpriteMaterial).opacity = 0.42 + 0.2 * s
      f.halo.scale.setScalar(0.85 + 0.12 * s)
      f.bloom.rotation.set(Math.sin(t * 1.3 + f.phase) * 0.12 * (0.4 + wind.gust), t * 0.25 + f.phase, Math.cos(t * 1.1 + f.phase) * 0.1 * (0.4 + wind.gust))
      for (let k = 0; k < MOTES_PER_FLOWER; k++) {
        const i = fi * MOTES_PER_FLOWER + k
        const life = (t * 0.33 + k / MOTES_PER_FLOWER + f.phase) % 1
        const a = f.phase * 3 + k * 2.4 + t * 0.4
        const r = 0.12 + life * 0.25
        this.motePos.set([f.at.x + Math.cos(a) * r, f.at.y - 0.25 + life * 1.3, f.at.z + Math.sin(a) * r], i * 3)
        const b = Math.sin(life * Math.PI) * 1.4
        if (f.own) this.moteCol.set([b, b * 0.45, b * 0.38], i * 3)
        else this.moteCol.set([b, b * 0.85, b * 0.5], i * 3)
      }
    })
    const mp = this.motes.geometry.attributes
    ;(mp.position as THREE.BufferAttribute).needsUpdate = true
    ;(mp.color as THREE.BufferAttribute).needsUpdate = true

    for (let i = 0; i < SPARKS; i++) {
      const l = (this.sparkLife[i] = Math.max(0, this.sparkLife[i] - dt))
      if (l <= 0) {
        this.sparkCol.set([0, 0, 0], i * 3)
        continue
      }
      for (let c = 0; c < 3; c++) this.sparkPos[i * 3 + c] += this.sparkVel[i * 3 + c] * dt
      this.sparkVel[i * 3 + 1] *= 1 - dt * 0.8
      const b = Math.min(1, l) * 1.8
      this.sparkCol.set([b, b * 0.85, b * 0.45], i * 3)
    }
    const sp = this.sparks.geometry.attributes
    ;(sp.position as THREE.BufferAttribute).needsUpdate = true
    ;(sp.color as THREE.BufferAttribute).needsUpdate = true

    this.focus = active ? this.pickFocus(camera) : null
  }

  private readonly fwd = new THREE.Vector3()
  private readonly to = new THREE.Vector3()

  /** The traveller (≤ 6 m, near the view centre) or note flower (≤ 3.2 m) being looked at. */
  private pickFocus(camera: THREE.Camera): SocialFocus | null {
    camera.getWorldDirection(this.fwd)
    const eye = camera.position
    let best: SocialFocus | null = null
    let bestScore = -Infinity
    for (const g of this.ghosts.values()) {
      if (!g.seen || g.fade < 0.5) continue
      this.to.set(g.x - eye.x, g.y + 1.15 - eye.y, g.z - eye.z)
      const d = this.to.length()
      if (d > 6 || d < 0.3) continue
      const cos = this.to.dot(this.fwd) / d
      if (cos < 0.94) continue
      const score = cos - d * 0.01
      if (score > bestScore) {
        bestScore = score
        best = { kind: 'ghost', id: g.id }
      }
    }
    for (const f of this.flowers) {
      this.to.subVectors(f.at, eye)
      const d = this.to.length()
      if (d > 3.2 || d < 0.2) continue
      const cos = this.to.dot(this.fwd) / d
      if (cos < 0.86) continue
      const score = cos - d * 0.01 - 0.02
      if (score > bestScore) {
        bestScore = score
        best = { kind: 'note', note: f.note, own: f.own }
      }
    }
    return best
  }
}

/** Merge non-indexed geometries that share position/normal/uv layouts. */
function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv'] as const
  const out = new THREE.BufferGeometry()
  for (const name of names) {
    const size = parts[0].getAttribute(name).itemSize
    const total = parts.reduce((n, p) => n + p.getAttribute(name).count, 0)
    const arr = new Float32Array(total * size)
    let o = 0
    for (const p of parts) {
      const a = p.getAttribute(name).array as Float32Array
      arr.set(a, o)
      o += a.length
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size))
  }
  return out
}
