import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { E, ball, cyl, paint, place, srgb, v3 } from './props'
import { terrainHeight, terrainNormal } from './terrain'

/**
 * A Malayan tapir grazing on the east slope: black at both ends with the famous white saddle,
 * a short, restless trunk and white-rimmed ears. It ambles between grazing spots inside its
 * patch, lifts its head to watch the player come near, and turns to face them to talk.
 */

const UP = new THREE.Vector3(0, 1, 0)
/** The patch it grazes (world x, z, radius). */
export const TAPIR_AREA = { x: 11, z: 17.5, r: 3 }
/** Places it should not wander onto (the shoebill's stone, a baobab sprout). */
const AVOID: [number, number, number][] = [
  [7.2, 15.2, 1.9],
  [8.6, 12.4, 1.4],
]
export type AnimalSound = 'squeak' | 'clatter'

export class Tapir {
  readonly group = new THREE.Group()
  /** Head position (world) for interaction focus. */
  readonly focus = new THREE.Vector3()
  /** A sound to play this frame (the encounter layer takes it). */
  sound: AnimalSound | null = null
  private readonly body = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly trunk: THREE.Group[] = []
  private readonly legs: { g: THREE.Group; phase: number }[] = []
  private readonly eyes: THREE.Mesh[] = []
  private readonly ears: THREE.Mesh[] = []
  private readonly tail: THREE.Mesh
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true })
  private readonly pos = new THREE.Vector3(TAPIR_AREA.x, 0, TAPIR_AREA.z)
  private readonly goal = new THREE.Vector3(TAPIR_AREA.x, 0, TAPIR_AREA.z)
  private mode: 'graze' | 'walk' = 'graze'
  private timer = 5
  private yaw = -2.2
  private speed = 0
  private phase = 0
  private headYaw = 0
  private headPitch = 0.5
  private greetT = 0
  private blink = 3
  private earT = 1
  private earSide = 0
  private wasNear = false
  private squeakCool = 0
  private readonly tmp = new THREE.Vector3()
  private readonly n = new THREE.Vector3()
  private readonly qTilt = new THREE.Quaternion()
  private readonly qYaw = new THREE.Quaternion()

  constructor() {
    this.group.name = 'tapir'
    const black = srgb(0.1, 0.1, 0.115)
    const white = srgb(0.9, 0.89, 0.86)
    const ring = srgb(0.32, 0.32, 0.34)
    const nose = srgb(0.2, 0.19, 0.2)
    const mesh = (parts: THREE.BufferGeometry[]) => {
      const g = mergeGeometries(parts)!
      for (const p of parts) p.dispose()
      this.geometries.push(g)
      const m = new THREE.Mesh(g, this.material)
      m.castShadow = true
      return m
    }
    // The saddle: white from just behind the shoulders to the rump; the lower hind thighs stay black.
    const saddle = (p: THREE.Vector3) => {
      if (p.z > 0.14 + (p.y - 0.62) * 0.35) return black
      if (p.z < -0.5 && p.y < 0.5) return black
      return 1
    }
    this.body.add(
      mesh([
        paint(place(ball(0.4, 28, 20), v3(0, 0.64, -0.08), undefined, v3(0.88, 0.86, 1.95)), white, saddle),
        paint(place(ball(0.36, 22, 16), v3(0, 0.7, -0.5), undefined, v3(1, 0.95, 1)), white, saddle),
        paint(place(ball(0.3, 20, 14), v3(0, 0.64, 0.42), undefined, v3(0.95, 1, 1.1)), white, saddle),
        paint(place(ball(0.23, 16, 12), v3(0, 0.63, 0.7), undefined, v3(0.9, 1, 1.2)), black),
      ]),
    )
    // Head: a domed skull tapering to the snout, grey rings round the small eyes.
    this.head.add(
      mesh([
        paint(place(ball(0.2, 18, 14), v3(0, -0.02, 0.2), undefined, v3(0.8, 0.95, 1.5)), black),
        paint(place(ball(0.12, 14, 10), v3(0, -0.08, 0.44), undefined, v3(0.85, 0.8, 1.3)), black),
        paint(place(ball(0.032, 10, 8), v3(-0.128, 0.03, 0.25), undefined, v3(0.5, 1, 1)), ring),
        paint(place(ball(0.032, 10, 8), v3(0.128, 0.03, 0.25), undefined, v3(0.5, 1, 1)), ring),
      ]),
    )
    this.head.position.set(0, 0.66, 0.74)
    this.head.rotation.order = 'YXZ'
    const eyeGeo = mergeGeometries([paint(ball(0.02, 10, 8), srgb(0.04, 0.03, 0.03)), paint(place(ball(0.006, 6, 4), v3(0, 0.008, 0.017)), srgb(1, 1, 1))])!
    const earGeo = paint(place(ball(0.075, 14, 10), v3(0, 0.07, 0), undefined, v3(0.75, 1.15, 0.3)), black, p =>
      Math.hypot(p.x / 0.056, (p.y - 0.07) / 0.086) > 0.78 ? white : 1,
    )
    this.geometries.push(eyeGeo, earGeo)
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, this.material)
      eye.position.set(side * 0.14, 0.03, 0.26)
      eye.rotation.y = side * 1.0
      const ear = new THREE.Mesh(earGeo, this.material)
      ear.position.set(side * 0.1, 0.15, 0.1)
      ear.castShadow = true
      this.eyes.push(eye)
      this.ears.push(ear)
      this.head.add(eye, ear)
    }
    // Trunk: three tapering segments hanging from the snout; the last ends in a soft grey tip.
    let parent: THREE.Object3D = this.head
    for (let k = 0; k < 3; k += 1) {
      const rb = 0.055 - k * 0.01
      const parts = [paint(place(cyl(rb - 0.01, rb, 0.1, 10), v3(0, 0, 0.05), E(Math.PI / 2)), black)]
      if (k === 2) parts.push(paint(place(ball(rb - 0.004, 10, 8), v3(0, 0, 0.1)), nose))
      const seg = new THREE.Group()
      seg.add(mesh(parts))
      seg.position.set(0, k === 0 ? -0.1 : 0, k === 0 ? 0.58 : 0.1)
      parent.add(seg)
      this.trunk.push(seg)
      parent = seg
    }
    // Legs: short black pillars with rounded feet; pivots at the shoulders and hips.
    for (const [x, y, z, phase, hind] of [
      [-0.17, 0.44, 0.4, 0, false],
      [0.17, 0.44, 0.4, Math.PI, false],
      [-0.19, 0.46, -0.55, Math.PI, true],
      [0.19, 0.46, -0.55, 0, true],
    ] as [number, number, number, number, boolean][]) {
      const g = new THREE.Group()
      g.add(
        mesh([
          paint(place(cyl(0.075, 0.066, 0.36, 10), v3(0, -0.2, 0)), black),
          paint(place(ball(0.08, 12, 8), v3(0, -0.4, 0.02), undefined, v3(1, 0.5, 1.2)), black),
          paint(place(ball(hind ? 0.13 : 0.1, 12, 10), v3(0, -0.02, 0), undefined, hind ? v3(0.85, 1.4, 1.1) : v3(0.9, 1.2, 1)), black),
        ]),
      )
      g.position.set(x, y, z)
      this.legs.push({ g, phase })
      this.group.add(g)
    }
    this.tail = mesh([paint(place(ball(0.045, 10, 8), v3(0, 0, -0.03), undefined, v3(1, 1.2, 1.4)), black)])
    this.tail.position.set(0, 0.8, -0.9)
    this.group.add(this.body, this.head, this.tail)
  }

  /** True when it stands still enough to be talked to. */
  get available(): boolean {
    return this.speed < 0.3
  }

  /** A talk started: curl the trunk up and squeak. */
  greet(): void {
    this.greetT = 1
    this.sound = 'squeak'
    this.squeakCool = 20
  }

  private curl = 0

  private pickGoal(): void {
    for (let i = 0; i < 12; i += 1) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * TAPIR_AREA.r
      const x = TAPIR_AREA.x + Math.cos(a) * r
      const z = TAPIR_AREA.z + Math.sin(a) * r
      if (Math.hypot(x - this.pos.x, z - this.pos.z) < 1.2) continue
      if (AVOID.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue
      this.goal.set(x, 0, z)
      this.mode = 'walk'
      return
    }
    this.timer = 3
  }

  update(dt: number, time: number, eye: THREE.Vector3, talking: boolean): void {
    const near = Math.hypot(eye.x - this.pos.x, eye.z - this.pos.z) < 5.5
    this.squeakCool = Math.max(0, this.squeakCool - dt)
    if (near && !this.wasNear && this.squeakCool === 0) {
      this.sound = 'squeak'
      this.squeakCool = 40
    }
    this.wasNear = near
    // ── Where to go: stop and watch when the player is near, else graze and amble ──
    let want = 0
    let turn = 0
    if (talking) {
      turn = Math.atan2(eye.x - this.pos.x, eye.z - this.pos.z) - this.yaw
      turn = Math.atan2(Math.sin(turn), Math.cos(turn))
      if (Math.abs(turn) < 0.5) turn = 0
    } else if (!near) {
      if (this.mode === 'graze') {
        this.timer -= dt
        if (this.timer <= 0) this.pickGoal()
      } else {
        const dx = this.goal.x - this.pos.x
        const dz = this.goal.z - this.pos.z
        const dist = Math.hypot(dx, dz)
        if (dist < 0.15) {
          this.mode = 'graze'
          this.timer = 7 + Math.random() * 9
        } else {
          want = Math.min(0.5, 0.15 + dist * 0.4)
          turn = Math.atan2(dx, dz) - this.yaw
        }
      }
    }
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    const applied = THREE.MathUtils.clamp(turn, -dt * 1.2, dt * 1.2)
    this.yaw += applied
    const turnRate = Math.abs(applied) / Math.max(dt, 1e-4)
    if (want > 0) want *= Math.max(0, Math.cos(turn)) ** 2
    this.speed += (want - this.speed) * Math.min(1, dt * 2.5)
    if (this.speed < 0.005 && want === 0) this.speed = 0
    this.pos.x += Math.sin(this.yaw) * this.speed * dt
    this.pos.z += Math.cos(this.yaw) * this.speed * dt
    // ── Root on the turf, tilted with the slope ──
    this.group.position.set(this.pos.x, terrainHeight(this.pos.x, this.pos.z), this.pos.z)
    terrainNormal(this.pos.x, this.pos.z, this.n).lerp(UP, 0.35).normalize()
    this.qTilt.setFromUnitVectors(UP, this.n)
    this.qYaw.setFromAxisAngle(UP, this.yaw)
    this.group.quaternion.copy(this.qTilt).multiply(this.qYaw)
    // ── Gait: diagonal pairs; a shuffle when it turns on the spot ──
    const walk = Math.min(1, this.speed / 0.4 + turnRate * 0.5)
    if (walk > 0.02) this.phase += dt * (2.2 + this.speed * 7)
    const bob = Math.abs(Math.sin(this.phase)) * 0.018 * walk
    this.body.position.y = bob
    this.body.scale.y = 1 + Math.sin(time * 1.6) * 0.008
    for (const leg of this.legs) leg.g.rotation.x = Math.sin(this.phase + leg.phase) * 0.42 * walk
    // ── Head: trunk in the grass while grazing, lifted to watch the player ──
    this.group.updateMatrixWorld()
    this.tmp.copy(eye)
    this.group.worldToLocal(this.tmp).sub(this.head.position)
    let yawT = Math.sin(time * 0.21) * 0.25
    let pitchT = this.mode === 'graze' ? 0.55 + Math.sin(time * 0.37) * 0.08 : 0.12
    if (near || talking) {
      yawT = THREE.MathUtils.clamp(Math.atan2(this.tmp.x, this.tmp.z), -0.9, 0.9)
      pitchT = THREE.MathUtils.clamp(-Math.atan2(this.tmp.y, Math.hypot(this.tmp.x, this.tmp.z)), -0.5, 0.3)
    }
    const k = Math.min(1, dt * 2.2)
    this.headYaw += (yawT - this.headYaw) * k
    this.headPitch += (pitchT - this.headPitch) * k
    this.head.position.y = 0.66 + bob * 0.7
    this.head.rotation.set(this.headPitch, this.headYaw, 0)
    // Trunk: quick sniffing twitches while grazing, a slow sway otherwise, curled up to greet.
    this.greetT = Math.max(0, this.greetT - dt * 0.35)
    this.curl += ((this.greetT > 0.25 ? 1 : 0) - this.curl) * Math.min(1, dt * 4)
    const sniff = this.mode === 'graze' && !near && !talking
    this.trunk.forEach((seg, i) => {
      const wig = Math.sin(time * (sniff ? 9 : 2.3) + i * 0.9) * (sniff ? 0.1 : 0.07)
      seg.rotation.x = THREE.MathUtils.lerp(0.42 + i * 0.12 + wig, -0.75, this.curl)
      seg.rotation.y = Math.sin(time * 1.7 + i * 1.3) * (sniff ? 0.12 : 0.05)
    })
    // ── Blink, ear flicks (ears prick up towards the player), a little tail wag ──
    this.blink -= dt
    if (this.blink < 0) this.blink = 2.5 + Math.random() * 4
    for (const e of this.eyes) e.scale.y = this.blink < 0.14 ? 0.15 : 1
    this.earT -= dt
    if (this.earT < -0.3) {
      this.earT = 1.2 + Math.random() * 3.5
      this.earSide = Math.random() < 0.5 ? 0 : 1
    }
    const listen = near || talking ? 1 : 0
    this.ears.forEach((ear, i) => {
      const side = i === 0 ? -1 : 1
      const flick = this.earT < 0 && i === this.earSide ? Math.sin((-this.earT / 0.3) * Math.PI) : 0
      ear.rotation.set(-0.25 - flick * 0.5 + listen * 0.1, side * (listen * 0.4 + Math.sin(time * 0.5 + i) * 0.1), -side * (0.35 + flick * 0.3))
    })
    this.tail.rotation.y = Math.sin(time * 2.6) * 0.25
    this.head.updateMatrixWorld()
    this.focus.set(0, 0.02, 0.35)
    this.head.localToWorld(this.focus)
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose()
    this.material.dispose()
  }
}
