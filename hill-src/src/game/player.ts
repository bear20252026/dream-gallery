import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import type { Input } from '../engine/input'
import { CONFIG } from './config'
import { terrainHeight } from './terrain'

/**
 * First-person walker: a capsule driven by Rapier's kinematic character controller (slopes,
 * steps, snapping to the turf), smoothed acceleration, coyote-time jumps, gentle head bob and a
 * soft boundary where the wind leans against you before the hill drops into the cloud sea.
 */
export class Player {
  yaw: number
  pitch: number
  readonly feet = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  grounded = true
  /** Called on every footfall (for audio). */
  onStep?: (sprinting: boolean) => void
  onLand?: (impact: number) => void
  private readonly body: RAPIER.RigidBody
  private readonly collider: RAPIER.Collider
  private readonly kcc: RAPIER.KinematicCharacterController
  private readonly prev = new THREE.Vector3()
  private readonly cur = new THREE.Vector3()
  private coyote = 0
  private jumpBuffer = 0
  private stride = 0
  private bob = 0
  private bobAmp = 0
  private sprintBlend = 0
  private airTime = 0
  private readonly move = new THREE.Vector3()

  constructor(physics: Physics, spawn: THREE.Vector3, yaw: number, pitch: number) {
    const P = CONFIG.player
    this.yaw = yaw
    this.pitch = pitch
    const y = terrainHeight(spawn.x, spawn.z) + P.halfHeight + P.radius + 0.05
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, y, spawn.z))
    this.collider = physics.world.createCollider(RAPIER.ColliderDesc.capsule(P.halfHeight, P.radius).setFriction(0), this.body)
    this.kcc = physics.world.createCharacterController(0.02)
    this.kcc.setUp({ x: 0, y: 1, z: 0 })
    this.kcc.setMaxSlopeClimbAngle((52 * Math.PI) / 180)
    this.kcc.setMinSlopeSlideAngle((58 * Math.PI) / 180)
    this.kcc.enableAutostep(0.4, 0.25, true)
    this.kcc.enableSnapToGround(0.45)
    this.kcc.setApplyImpulsesToDynamicBodies(false)
    this.cur.set(spawn.x, y, spawn.z)
    this.prev.copy(this.cur)
    this.feet.set(spawn.x, y - P.halfHeight - P.radius, spawn.z)
  }

  teleport(p: THREE.Vector3, yaw: number, pitch: number): void {
    const P = CONFIG.player
    const y = terrainHeight(p.x, p.z) + P.halfHeight + P.radius + 0.05
    this.body.setTranslation({ x: p.x, y, z: p.z }, true)
    this.body.setNextKinematicTranslation({ x: p.x, y, z: p.z })
    this.cur.set(p.x, y, p.z)
    this.prev.copy(this.cur)
    this.velocity.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = pitch
  }

  /** Mouse / stick look, applied every rendered frame. */
  look(dx: number, dy: number): void {
    const C = CONFIG.camera
    this.yaw -= dx
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, C.minPitch, C.maxPitch)
  }

  step(dt: number, input: Input): void {
    const P = CONFIG.player
    this.prev.copy(this.cur)
    const idle = Math.hypot(input.move.x, input.move.y) < 0.05
    const sprint = input.held('sprint') && input.move.y > 0.2
    const speed = sprint ? P.sprintSpeed : P.walkSpeed
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    // Forward is -z at yaw 0.
    const wantX = (-sin * input.move.y + cos * input.move.x) * speed
    const wantZ = (-cos * input.move.y - sin * input.move.x) * speed
    const control = this.grounded ? 1 : 0.35
    const k = 1 - Math.exp(-P.acceleration * control * dt)
    this.velocity.x += (wantX - this.velocity.x) * k
    this.velocity.z += (wantZ - this.velocity.z) * k
    // Soft boundary: the wind leans on you, then a firm edge above the cloud sea.
    const r = Math.hypot(this.cur.x, this.cur.z)
    if (r > P.softRadius) {
      const push = Math.min(1, (r - P.softRadius) / (P.hardRadius - P.softRadius))
      this.velocity.x -= (this.cur.x / r) * push * 14 * dt
      this.velocity.z -= (this.cur.z / r) * push * 14 * dt
    }
    // Standing still comes to a clean stop (the easing above never quite reaches zero).
    if (idle && this.grounded && Math.hypot(this.velocity.x, this.velocity.z) < 0.15) {
      this.velocity.x = 0
      this.velocity.z = 0
    }
    this.jumpBuffer = input.consume('jump') ? 0.14 : Math.max(0, this.jumpBuffer - dt)
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt)
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.velocity.y = P.jumpSpeed
      this.jumpBuffer = 0
      this.coyote = 0
      this.grounded = false
    }
    this.velocity.y += P.gravity * dt
    if (this.grounded && this.velocity.y < 0) this.velocity.y = -1.5
    this.move.copy(this.velocity).multiplyScalar(dt)
    this.kcc.computeColliderMovement(this.collider, this.move)
    const m = this.kcc.computedMovement()
    const wasGrounded = this.grounded
    this.grounded = this.kcc.computedGrounded()
    // Planted feet: resolving the small downward press against a slope nudges the capsule a hair
    // downhill every step, a slow creep while you stand and watch the clouds. A settled traveller
    // with no input and no momentum keeps exactly the same spot; landing, settling after a
    // teleport and sliding on slopes too steep to stand on all move more than this and still apply.
    const planted =
      idle && wasGrounded && this.grounded && this.velocity.x === 0 && this.velocity.z === 0 && this.velocity.y <= 0 && Math.abs(m.x) + Math.abs(m.y) + Math.abs(m.z) < 0.003
    let nx = planted ? this.cur.x : this.cur.x + m.x
    let nz = planted ? this.cur.z : this.cur.z + m.z
    const nr = Math.hypot(nx, nz)
    if (nr > P.hardRadius) {
      nx *= P.hardRadius / nr
      nz *= P.hardRadius / nr
    }
    this.cur.set(nx, planted ? this.cur.y : this.cur.y + m.y, nz)
    // Safety net: never fall through the turf.
    const floor = terrainHeight(nx, nz) + P.halfHeight + P.radius - 0.05
    if (this.cur.y < floor) {
      this.cur.y = floor
      this.velocity.y = Math.max(0, this.velocity.y)
    }
    this.body.setNextKinematicTranslation(this.cur)
    if (this.grounded) {
      if (!wasGrounded && this.airTime > 0.25) this.onLand?.(Math.min(1, this.airTime / 1.2))
      this.airTime = 0
      if (this.velocity.y < 0) this.velocity.y = 0
    } else {
      this.airTime += dt
    }
    // Stride for head bob and footsteps.
    const hv = Math.hypot(m.x, m.z) / dt
    if (this.grounded && hv > 0.4) {
      const before = Math.floor(this.stride)
      this.stride += (hv * dt) / (sprint ? 1.05 : 0.78)
      if (Math.floor(this.stride) !== before) this.onStep?.(sprint)
    }
    this.bobAmp += ((this.grounded ? Math.min(1, hv / P.sprintSpeed) : 0) - this.bobAmp) * (1 - Math.exp(-8 * dt))
    this.sprintBlend += ((sprint && hv > 3 ? 1 : 0) - this.sprintBlend) * (1 - Math.exp(-4 * dt))
    this.bob = this.stride
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z)
  }

  applyCamera(camera: THREE.PerspectiveCamera, alpha: number, reducedMotion: boolean): void {
    const P = CONFIG.player
    const pos = new THREE.Vector3().lerpVectors(this.prev, this.cur, alpha)
    this.feet.set(pos.x, pos.y - P.halfHeight - P.radius, pos.z)
    camera.position.set(pos.x, this.feet.y + P.eyeHeight, pos.z)
    if (!reducedMotion) {
      const ph = this.bob * Math.PI
      camera.position.y += Math.abs(Math.sin(ph)) * 0.05 * this.bobAmp - 0.025 * this.bobAmp
      const side = Math.cos(ph) * 0.025 * this.bobAmp
      camera.position.x += Math.cos(this.yaw) * side
      camera.position.z -= Math.sin(this.yaw) * side
    }
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    const fov = CONFIG.camera.fov + (reducedMotion ? 0 : this.sprintBlend * 5)
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }
}
