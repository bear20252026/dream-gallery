import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Physics } from '../engine/physics'
import { E, ball, box, cyl, paint, place, srgb, v3, type Circle } from './props'
import type { AnimalSound } from './tapir'
import { terrainHeight } from './terrain'

/**
 * A shoebill standing on a low mossy stone like a second, smaller guardian: slate-grey, stilt
 * legs, and the great clog-shaped bill with its hooked tip. It barely moves. When the player comes
 * near it turns its head, very slowly, to stare; it blinks slowly; now and then it clatters its
 * bill; and when spoken to it bows, clattering, the way shoebills greet each other.
 */

/** Where it stands (world x, z; yaw turns its +z). Seen side-on from the spawn. */
export const SHOEBILL_SPOT = { x: 7.2, z: 15.2, yaw: -1.68 }
const FEET_Y = 0.23

export class Shoebill {
  readonly group = new THREE.Group()
  /** Head position (world) for interaction focus. */
  readonly focus = new THREE.Vector3()
  readonly grassMask: Circle = { x: SHOEBILL_SPOT.x, z: SHOEBILL_SPOT.z, r: 0.75 }
  sound: AnimalSound | null = null
  private readonly bird = new THREE.Group()
  private readonly body = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly jaw = new THREE.Group()
  private readonly crest: THREE.Mesh
  private readonly eyes: THREE.Mesh[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true })
  private headYaw = 0
  private headPitch = 0.1
  private yawGoal = 0
  private pitchGoal = 0.1
  private lookT = 6
  private bowT = -1
  private clatterT = 0
  private idleClatter = 25
  private blink = 4
  private readonly tmp = new THREE.Vector3()

  constructor(physics: Physics) {
    this.group.name = 'shoebill'
    const slate = srgb(0.5, 0.56, 0.61)
    const chest = srgb(0.6, 0.65, 0.69)
    const wing = srgb(0.45, 0.5, 0.55)
    const primaries = srgb(0.3, 0.33, 0.37)
    const leg = srgb(0.28, 0.29, 0.31)
    const bill = srgb(0.74, 0.69, 0.52)
    const mottle = srgb(0.52, 0.5, 0.43)
    const mesh = (parts: THREE.BufferGeometry[]) => {
      const g = mergeGeometries(parts)!
      for (const p of parts) p.dispose()
      this.geometries.push(g)
      // No shadow flags: with the bird standing flush on its stone, shadowing both blanked the
      // whole frame at close range in testing; unshadowed, bird and stone render correctly.
      const m = new THREE.Mesh(g, this.material)
      return m
    }
    const mottled = (p: THREE.Vector3) => (Math.sin(p.x * 97 + 1.3) * Math.sin(p.z * 71 + p.y * 43) > 0.45 ? mottle : 1)
    // The stone: a low, irregular faceted slab with moss on its flat top.
    const stone = cyl(0.5, 0.66, 0.56, 7)
    const sp = stone.getAttribute('position')
    for (let i = 0; i < sp.count; i += 1) {
      const a = Math.atan2(sp.getZ(i), sp.getX(i))
      const s = 1 + 0.13 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5 + 2)
      sp.setXYZ(i, sp.getX(i) * s, sp.getY(i), sp.getZ(i) * s * 0.85)
    }
    stone.deleteAttribute('normal')
    const stoneMesh = mesh([
      paint(place(stone, v3(0, FEET_Y - 0.28, 0)), srgb(0.6, 0.62, 0.6), (p, n) =>
        n.y > 0.7 ? srgb(0.42, 0.55, 0.3) : p.y < FEET_Y - 0.2 ? 0.8 : 1,
      ),
    ])
    this.group.add(stoneMesh)
    // Legs and long toes (dark grey), the ankle joint halfway up.
    const legParts: THREE.BufferGeometry[] = []
    for (const side of [-1, 1]) {
      const x = side * 0.07
      for (const a of [-0.4, 0, 0.4]) {
        legParts.push(paint(place(box(0.014, 0.012, 0.15), v3(x + Math.sin(a) * 0.075, 0.006, 0.02 + Math.cos(a) * 0.075), E(0, a, 0)), leg))
      }
      legParts.push(paint(place(box(0.012, 0.012, 0.08), v3(x, 0.006, -0.02)), leg))
      legParts.push(paint(place(cyl(0.016, 0.019, 0.3, 8), v3(x, 0.15, 0.02)), leg))
      legParts.push(paint(place(ball(0.024, 8, 6), v3(x, 0.3, 0.02)), leg))
      legParts.push(paint(place(cyl(0.022, 0.018, 0.24, 8), v3(side * 0.066, 0.42, 0.03), E(0.25, 0, 0)), leg))
    }
    this.bird.add(mesh(legParts))
    // Body: an upright egg leaning forward, lighter on the chest; folded wings with dark primaries.
    const wingShade = (p: THREE.Vector3) => (p.y < 0.68 || p.z < -0.17 ? primaries : 1)
    this.body.add(
      mesh([
        paint(place(ball(0.2, 20, 16), v3(0, 0.78, 0), E(0.35, 0, 0), v3(0.85, 1.35, 1.0)), slate, p => (p.z > 0.1 && p.y > 0.7 ? chest : 1)),
        paint(place(ball(0.16, 16, 12), v3(-0.13, 0.8, -0.06), E(0.45, 0, 0), v3(0.35, 1.2, 1.25)), wing, wingShade),
        paint(place(ball(0.16, 16, 12), v3(0.13, 0.8, -0.06), E(0.45, 0, 0), v3(0.35, 1.2, 1.25)), wing, wingShade),
        paint(place(ball(0.1, 12, 8), v3(0, 0.57, -0.19), E(-0.6, 0, 0), v3(0.8, 0.5, 1.4)), primaries),
        paint(place(cyl(0.075, 0.1, 0.2, 14), v3(0, 1.04, 0.07), E(0.25, 0, 0)), chest),
      ]),
    )
    // Head: a big round skull and the clog: broad upper bill with a ridge and a hooked nail.
    this.head.add(
      mesh([
        paint(place(ball(0.105, 18, 14), v3(0, 0.07, 0.02), undefined, v3(0.92, 1.0, 1.08)), slate),
        paint(place(ball(1, 20, 12), v3(0, 0.035, 0.2), undefined, v3(0.068, 0.05, 0.14)), bill, mottled),
        paint(place(ball(1, 12, 8), v3(0, 0.075, 0.19), undefined, v3(0.022, 0.022, 0.13)), bill, mottled),
        paint(place(new THREE.ConeGeometry(0.018, 0.05, 8), v3(0, 0.01, 0.335), E(Math.PI + 0.4, 0, 0)), srgb(0.4, 0.38, 0.33)),
      ]),
    )
    this.jaw.add(mesh([paint(place(ball(1, 16, 10), v3(0, -0.02, 0.125), undefined, v3(0.06, 0.028, 0.13)), srgb(0.78, 0.73, 0.57), mottled)]))
    this.jaw.position.set(0, 0.015, 0.07)
    const eyeGeo = mergeGeometries([paint(ball(0.019, 12, 8), srgb(0.86, 0.87, 0.78)), paint(place(ball(0.009, 8, 6), v3(0, 0, 0.014)), srgb(0.04, 0.04, 0.04))])!
    this.geometries.push(eyeGeo)
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, this.material)
      eye.position.set(side * 0.058, 0.09, 0.075)
      eye.rotation.y = side * 0.55
      this.eyes.push(eye)
      this.head.add(eye)
    }
    this.crest = mesh([paint(place(new THREE.ConeGeometry(0.028, 0.09, 8), v3(0, 0.045, 0)), slate)])
    this.crest.position.set(0, 0.15, -0.06)
    this.head.add(this.jaw, this.crest)
    this.head.position.set(0, 1.12, 0.1)
    this.head.rotation.order = 'YXZ'
    this.body.add(this.head)
    this.bird.add(this.body)
    this.bird.position.y = FEET_Y
    this.group.add(this.bird)
    const { x, z, yaw } = SHOEBILL_SPOT
    const y = terrainHeight(x, z)
    this.group.position.set(x, y, z)
    this.group.rotation.y = yaw
    physics.addStaticCylinder(v3(x, y + 0.75, z), 0.55, 1.5)
  }

  /** A talk ended: bow, clattering the bill, the way shoebills greet. */
  bow(): void {
    this.bowT = 0
  }

  /** A talk started: lift the head and clatter. */
  clatter(): void {
    if (this.bowT >= 0) return
    this.clatterT = 1
    this.sound = 'clatter'
  }

  private birdYaw = 0

  update(dt: number, time: number, eye: THREE.Vector3, talking: boolean, gust: number): void {
    this.group.updateMatrixWorld()
    this.tmp.copy(eye)
    this.bird.worldToLocal(this.tmp).sub(this.head.position)
    const near = Math.hypot(eye.x - this.group.position.x, eye.z - this.group.position.z) < 12
    const toPlayer = Math.atan2(this.tmp.x, this.tmp.z)
    // ── Where to look: the player when near, turning very slowly; otherwise now and then elsewhere ──
    this.lookT -= dt
    if (near || talking) {
      this.yawGoal = THREE.MathUtils.clamp(toPlayer, -1.3, 1.3)
      this.pitchGoal = THREE.MathUtils.clamp(-Math.atan2(this.tmp.y, Math.hypot(this.tmp.x, this.tmp.z)), -0.4, 0.5)
    } else if (this.lookT < 0) {
      this.lookT = 8 + Math.random() * 10
      this.yawGoal = (Math.random() - 0.5) * 1.1
      this.pitchGoal = 0.05 + Math.random() * 0.2
    }
    // Spoken to from behind, it shuffles round on its stone to face the player.
    if (talking && Math.abs(toPlayer) > 0.9) this.birdYaw += THREE.MathUtils.clamp(toPlayer, -dt * 0.6, dt * 0.6)
    this.bird.rotation.y = this.birdYaw
    const k = Math.min(1, dt * 0.7)
    this.headYaw += (this.yawGoal - this.headYaw) * k
    this.headPitch += (this.pitchGoal - this.headPitch) * k
    // ── Bow: down (1.4 s), a clattering hold, back up; now and then a clatter on its own ──
    let bow = 0
    if (this.bowT >= 0) {
      const before = this.bowT
      this.bowT += dt
      const t = this.bowT
      const ease = (u: number) => u * u * (3 - 2 * u)
      bow = t < 1.4 ? ease(t / 1.4) : t < 2.7 ? 1 : t < 4.5 ? 1 - ease((t - 2.7) / 1.8) : 0
      if (before < 1.25 && t >= 1.25) {
        this.clatterT = 1.2
        this.sound = 'clatter'
      }
      if (t >= 4.5) this.bowT = -1
    } else if (near && !talking) {
      this.idleClatter -= dt
      if (this.idleClatter <= 0) {
        this.idleClatter = 50 + Math.random() * 50
        this.clatterT = 1
        this.sound = 'clatter'
      }
    }
    this.clatterT = Math.max(0, this.clatterT - dt)
    const clatter = this.clatterT > 0
    // Lean the body (about the hips) into the bow; the head goes down with it.
    const lean = 0.16 * bow
    this.body.rotation.x = lean
    this.body.position.set(0, 0.5 * (1 - Math.cos(lean)), -0.5 * Math.sin(lean))
    this.body.scale.y = 1 + Math.sin(time * 1.4) * 0.006
    const lift = clatter && bow < 0.5 ? -0.25 : 0
    this.head.rotation.set(THREE.MathUtils.lerp(this.headPitch + lift, 1.15, bow), THREE.MathUtils.lerp(this.headYaw, 0, bow), 0)
    this.jaw.rotation.x = clatter ? (Math.sin(time * 75) > 0 ? 0.22 : 0.02) : 0.02
    this.crest.rotation.set(-1.05 + Math.sin(time * 3.1) * 0.06 * (0.4 + gust) + bow * 0.3, 0, Math.sin(time * 2.3) * 0.05 * (0.4 + gust))
    // ── A slow blink ──
    this.blink -= dt
    if (this.blink < 0) this.blink = 4 + Math.random() * 6
    for (const e of this.eyes) e.scale.y = this.blink < 0.3 ? 0.12 : 1
    this.head.updateMatrixWorld()
    this.focus.set(0, 0.06, 0.12)
    this.head.localToWorld(this.focus)
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose()
    this.material.dispose()
  }
}
