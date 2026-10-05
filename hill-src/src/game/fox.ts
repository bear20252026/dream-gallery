import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { E, ball, paint, place, srgb, v3 } from './props'
import { terrainHeight, terrainNormal } from './terrain'

/**
 * The fox. Before it is tamed it lies in the grass at a spot of its own and, after each talk, gets
 * up and trots to a spot a little nearer the summit. Once tamed it follows the player, trotting to
 * their side and lying down when they stop. Poses blend between standing (trot cycle) and lying
 * (front paws stretched out, brush tail curled round); the head turns to watch the player.
 */

const UP = new THREE.Vector3(0, 1, 0)

export class Fox {
  readonly group = new THREE.Group()
  /** Head position (world) for interaction focus. */
  readonly focus = new THREE.Vector3()
  private readonly body = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly legs: { g: THREE.Group; front: boolean; side: number; phase: number }[] = []
  private readonly tail: THREE.Group[] = []
  private readonly eyes: THREE.Mesh[] = []
  private readonly ears: THREE.Mesh[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true })
  private readonly pos = new THREE.Vector3()
  private readonly goal = new THREE.Vector3()
  private mode: 'rest' | 'go' | 'follow' = 'rest'
  private goalYaw = 0
  private yaw = 0
  private speed = 0
  private rest = 1
  private idle = 10
  private phase = 0
  private blink = 2.5
  private earT = 0
  private earSide = 0
  private headYaw = 0
  private headPitch = 0
  private happy = 0
  private readonly tmp = new THREE.Vector3()
  private readonly n = new THREE.Vector3()
  private readonly qTilt = new THREE.Quaternion()
  private readonly qYaw = new THREE.Quaternion()

  constructor() {
    this.group.name = 'fox'
    const orange = srgb(0.9, 0.47, 0.17)
    const cream = srgb(0.97, 0.94, 0.88)
    const dark = srgb(0.23, 0.15, 0.11)
    const black = srgb(0.05, 0.045, 0.045)
    const mesh = (parts: THREE.BufferGeometry[]) => {
      const g = mergeGeometries(parts)!
      for (const p of parts) p.dispose()
      this.geometries.push(g)
      const m = new THREE.Mesh(g, this.material)
      m.castShadow = true
      return m
    }
    // Body: a long ellipsoid with a cream belly and bib.
    this.body.add(
      mesh([
        paint(place(ball(0.17, 16, 12), v3(0, 0, -0.02), undefined, v3(0.95, 0.9, 2.0)), orange, p => (p.y < -0.07 ? cream : 1)),
        paint(place(ball(0.11, 12, 10), v3(0, -0.01, 0.25), undefined, v3(0.95, 1.15, 0.9)), cream),
      ]),
    )
    // Head: skull with cream cheeks, a pointed snout, black nose; eyes and ears move on their own.
    this.head.add(
      mesh([
        paint(place(ball(0.115, 16, 12), v3(0, 0.06, 0.05), undefined, v3(1.05, 0.92, 1.0)), orange, p => (p.y < 0.035 && p.z > 0.07 ? cream : 1)),
        paint(place(new THREE.ConeGeometry(0.068, 0.2, 12), v3(0, 0.025, 0.2), E(Math.PI / 2)), orange, p => (p.y < 0.018 ? cream : 1)),
        paint(place(ball(0.024, 10, 8), v3(0, 0.03, 0.298)), black),
      ]),
    )
    const eyeGeo = paint(ball(0.02, 10, 8), black)
    const earGeo = paint(new THREE.ConeGeometry(0.058, 0.17, 10), orange, p => (p.y > 0.035 ? dark : 1))
    this.geometries.push(eyeGeo, earGeo)
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, this.material)
      eye.position.set(side * 0.056, 0.09, 0.145)
      eye.scale.set(1, 0.8, 0.5)
      const ear = new THREE.Mesh(earGeo, this.material)
      ear.position.set(side * 0.068, 0.19, 0.02)
      ear.rotation.set(-0.12, 0, -side * 0.28)
      ear.castShadow = true
      this.eyes.push(eye)
      this.ears.push(ear)
      this.head.add(eye, ear)
    }
    this.head.rotation.order = 'YXZ'
    // Legs: orange upper, dark "socks" and paws; pivots at the hips/shoulders.
    const legGeo = mergeGeometries([
      paint(place(new THREE.CylinderGeometry(0.03, 0.024, 0.33, 7), v3(0, -0.165, 0)), orange, p => (p.y < -0.13 ? dark : 1)),
      paint(place(ball(0.034, 10, 6), v3(0, -0.33, 0.015), undefined, v3(1, 0.6, 1.35)), dark),
    ])!
    this.geometries.push(legGeo)
    for (const [front, side, phase] of [
      [true, -1, 0],
      [true, 1, Math.PI],
      [false, -1, Math.PI],
      [false, 1, 0],
    ] as [boolean, number, number][]) {
      const g = new THREE.Group()
      const m = new THREE.Mesh(legGeo, this.material)
      m.castShadow = true
      g.add(m)
      g.position.set(side * (front ? 0.075 : 0.085), 0.34, front ? 0.2 : -0.22)
      this.legs.push({ g, front, side, phase })
      this.group.add(g)
    }
    // Brush tail: a chain of five puffs, the last one cream.
    const radii = [0.07, 0.088, 0.094, 0.084, 0.062]
    let parent: THREE.Object3D = this.group
    radii.forEach((r, k) => {
      const seg = new THREE.Group()
      const geo = paint(place(ball(r, 12, 8), v3(0, 0, -0.075), undefined, v3(1, 0.95, 1.6)), k === radii.length - 1 ? cream : orange)
      this.geometries.push(geo)
      const m = new THREE.Mesh(geo, this.material)
      m.castShadow = true
      seg.add(m)
      seg.position.set(0, 0, k === 0 ? 0 : -0.12)
      parent.add(seg)
      this.tail.push(seg)
      parent = seg
    })
    this.group.add(this.body, this.head)
  }

  /** True when the fox is still enough to be talked to. */
  get available(): boolean {
    return this.speed < 0.35 && !(this.mode === 'go' && Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) > 0.4)
  }

  get following(): boolean {
    return this.mode === 'follow'
  }

  /** Put the fox down lying at a spot. */
  place(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0, z)
    this.goal.copy(this.pos)
    this.yaw = this.goalYaw = yaw
    this.mode = 'rest'
    this.speed = 0
    this.rest = 1
    this.idle = 10
  }

  /** Get up and trot to a new spot, then lie down facing `yaw`. */
  goTo(x: number, z: number, yaw: number): void {
    this.goal.set(x, 0, z)
    this.goalYaw = yaw
    this.mode = 'go'
    this.idle = 0
  }

  follow(): void {
    this.mode = 'follow'
    this.idle = 0
  }

  /** A little happy wag, e.g. after a talk. */
  cheer(): void {
    this.happy = 1
  }

  update(dt: number, time: number, eye: THREE.Vector3, feet: THREE.Vector3, lookDir: THREE.Vector3, talking: boolean): void {
    // ── Goal ──
    if (this.mode === 'follow' && !talking) {
      const fx = lookDir.x
      const fz = lookDir.z
      const l = Math.hypot(fx, fz) || 1
      // Beside the player, a step behind their right shoulder.
      this.goal.set(feet.x + (-fz / l) * 1.45 - (fx / l) * 0.55, 0, feet.z + (fx / l) * 1.45 - (fz / l) * 0.55)
    }
    const dx = this.goal.x - this.pos.x
    const dz = this.goal.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    let want = 0
    if (!talking) {
      if (this.mode === 'go') want = dist > 0.1 ? Math.min(2.8, 0.7 + dist * 1.4) : 0
      else if (this.mode === 'follow' && (dist > 1.7 || (this.speed > 0.15 && dist > 0.35))) want = dist > 8 ? 6.8 : Math.min(3.4, 0.6 + dist * 0.9)
    }
    let turn = 0
    if (want > 0) {
      turn = Math.atan2(dx, dz) - this.yaw
    } else if (this.mode === 'rest' || (this.mode === 'go' && dist <= 0.1)) {
      turn = this.goalYaw - this.yaw
    }
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    this.yaw += THREE.MathUtils.clamp(turn, -dt * 5, dt * 5)
    if (want > 0) want *= Math.max(0, Math.cos(turn)) ** 2
    this.speed += (want - this.speed) * Math.min(1, dt * 4)
    if (this.speed < 0.01 && want === 0) this.speed = 0
    this.pos.x += Math.sin(this.yaw) * this.speed * dt
    this.pos.z += Math.cos(this.yaw) * this.speed * dt
    if (this.mode === 'go' && dist < 0.12 && this.speed < 0.2) this.mode = 'rest'
    // ── Stand or lie down ──
    this.idle = this.speed > 0.1 ? 0 : this.idle + dt
    const lie = this.speed < 0.1 && this.idle > (this.mode === 'follow' ? 2.8 : 0.6) ? 1 : 0
    this.rest += (lie - this.rest) * Math.min(1, dt * (lie ? 1.8 : 6))
    const r = this.rest
    // ── Root on the turf, tilted with the slope ──
    const y = terrainHeight(this.pos.x, this.pos.z)
    this.group.position.set(this.pos.x, y, this.pos.z)
    terrainNormal(this.pos.x, this.pos.z, this.n).lerp(UP, 0.4).normalize()
    this.qTilt.setFromUnitVectors(UP, this.n)
    this.qYaw.setFromAxisAngle(UP, this.yaw)
    this.group.quaternion.copy(this.qTilt).multiply(this.qYaw)
    // ── Pose ──
    const walk = Math.min(1, this.speed / 1.2) * (1 - r)
    this.phase += dt * (3 + this.speed * 4.2)
    const bob = Math.abs(Math.sin(this.phase)) * 0.028 * walk
    const breathe = Math.sin(time * 2.1) * 0.006
    const bodyY = THREE.MathUtils.lerp(0.4, 0.19, r) + bob
    this.body.position.set(0, bodyY, 0)
    this.body.scale.set(1, 1 + breathe, 1)
    for (const leg of this.legs) {
      leg.g.position.y = bodyY - 0.06
      const swing = Math.sin(this.phase + leg.phase) * 0.6 * walk
      if (leg.front) {
        leg.g.rotation.x = swing - 1.35 * r
        leg.g.scale.y = THREE.MathUtils.lerp(1, 0.82, r)
      } else {
        leg.g.rotation.x = swing + 0.4 * r
        leg.g.scale.y = THREE.MathUtils.lerp(1, 0.3, r)
      }
    }
    // Tail: droops and swings; curls round the body when lying.
    this.happy = Math.max(0, this.happy - dt * 0.25)
    const wagAmp = 0.1 + 0.3 * this.happy + 0.1 * walk
    const wagSpeed = 1.6 + 6 * this.happy
    this.tail[0].position.set(0, bodyY + 0.05, -0.33)
    this.tail.forEach((seg, k) => {
      const base = k === 0 ? THREE.MathUtils.lerp(-0.55, -0.12, r) : THREE.MathUtils.lerp(0.13, 0.03, r)
      seg.rotation.x = base + (k === 0 ? -walk * 0.25 : 0)
      seg.rotation.y = r * 0.5 + Math.sin(time * wagSpeed - k * 0.7) * wagAmp * (1 - r * 0.6)
    })
    // ── Head: watch the player when near, otherwise look about ──
    this.head.position.set(0, THREE.MathUtils.lerp(0.53, 0.31, r) + bob * 0.6, 0.31)
    this.group.updateMatrixWorld()
    this.tmp.copy(eye)
    this.group.worldToLocal(this.tmp).sub(this.head.position)
    const near = eye.distanceTo(this.group.position) < 14
    let yawT = Math.sin(time * 0.31) * 0.7 + Math.sin(time * 0.13) * 0.3
    let pitchT = -0.1 + Math.sin(time * 0.23) * 0.1
    if (near || talking) {
      yawT = THREE.MathUtils.clamp(Math.atan2(this.tmp.x, this.tmp.z), -1.2, 1.2)
      pitchT = THREE.MathUtils.clamp(-Math.atan2(this.tmp.y, Math.hypot(this.tmp.x, this.tmp.z)), -0.6, 0.45)
    }
    if (walk > 0.3 && !talking) {
      yawT *= 0.3
      pitchT = 0.05
    }
    const k = Math.min(1, dt * 4)
    this.headYaw += (yawT - this.headYaw) * k
    this.headPitch += (pitchT - this.headPitch) * k
    // A curious head tilt while talking.
    this.head.rotation.set(this.headPitch, this.headYaw, talking ? Math.sin(time * 0.9) * 0.12 : 0)
    // ── Blink, ear flicks ──
    this.blink -= dt
    const closed = this.blink < 0.12
    if (this.blink < 0) this.blink = 2.5 + Math.random() * 3.5
    for (const e of this.eyes) e.scale.y = closed ? 0.12 : 0.8
    this.earT -= dt
    if (this.earT < -0.25) {
      this.earT = 1.5 + Math.random() * 4
      this.earSide = Math.random() < 0.5 ? 0 : 1
    }
    this.ears.forEach((ear, i) => {
      const side = i === 0 ? -1 : 1
      const flick = this.earT < 0 && i === this.earSide ? Math.sin((-this.earT / 0.25) * Math.PI) * 0.5 : 0
      ear.rotation.set(-0.12 - flick * 0.6, 0, -side * (0.28 + flick * 0.3))
    })
    this.focus.copy(this.head.position).add(this.tmp.set(0, 0.05, 0.1))
    this.group.localToWorld(this.focus)
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose()
    this.material.dispose()
  }
}
