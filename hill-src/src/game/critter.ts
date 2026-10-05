import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { rng } from './noise'
import { terrainNormal } from './terrain'

/**
 * The small white woolly creature sitting on the slope beside the ruin. It breathes, blinks,
 * flicks its ears, gazes around at the sky and turns its head to watch the player come close.
 */
function woolTexture(): THREE.Texture {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.fillStyle = 'rgb(128,128,128)'
  g.fillRect(0, 0, s, s)
  const R = rng(3)
  for (let i = 0; i < 420; i += 1) {
    const x = R() * s
    const y = R() * s
    const r = 4 + R() * 9
    for (const dx of [-s, 0, s]) {
      for (const dy of [-s, 0, s]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r)
        gr.addColorStop(0, 'rgba(210,210,210,0.8)')
        gr.addColorStop(0.7, 'rgba(150,150,150,0.4)')
        gr.addColorStop(1, 'rgba(90,90,90,0)')
        g.fillStyle = gr
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2)
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 3)
  return t
}

function woolMaterial(): THREE.MeshStandardMaterial {
  const bump = woolTexture()
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.8, 0.8, 0.83), roughness: 1, bumpMap: bump, bumpScale: 0.012 })
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `float fuzz = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.2);
      outgoingLight += vec3(0.32, 0.34, 0.42) * fuzz * 0.55;
      #include <opaque_fragment>`,
    )
  }
  return m
}

export class Critter {
  readonly group = new THREE.Group()
  private readonly body = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly ears: THREE.Mesh[] = []
  private readonly eyes: THREE.Mesh[] = []
  private yaw = 0
  private pitch = 0
  private gazeYaw = 0
  private gazePitch = 0.2
  private nextGaze = 2
  private nextBlink = 3
  private blink = 0
  private nextFlick = 2.5
  private flick = 0
  private flickEar = 0
  private t = 0
  private readonly R = rng(99)
  private readonly baseQuat = new THREE.Quaternion()

  constructor(physics: Physics, at: THREE.Vector3, faceToward: THREE.Vector3) {
    this.group.name = 'critter'
    const wool = woolMaterial()
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.08, 0.075, 0.09), roughness: 0.7 })
    const horn = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.56, 0.46), roughness: 0.6 })
    const face = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.72, 0.68, 0.7), roughness: 0.9 })
    const sphere = new THREE.SphereGeometry(1, 24, 16)
    const put = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
      const m = new THREE.Mesh(sphere, mat)
      m.position.set(x, y, z)
      m.scale.set(sx, sy, sz)
      m.castShadow = true
      m.receiveShadow = true
      parent.add(m)
      return m
    }
    // Body (local +x is forward), sitting: haunches low, chest a little higher.
    put(this.body, wool, 0, 0.36, 0, 0.46, 0.34, 0.36)
    const puffs: [number, number, number, number][] = [
      [0.22, 0.5, 0.12, 0.2],
      [0.22, 0.5, -0.12, 0.2],
      [-0.05, 0.58, 0.14, 0.2],
      [-0.05, 0.58, -0.14, 0.2],
      [-0.28, 0.42, 0.16, 0.2],
      [-0.28, 0.42, -0.16, 0.2],
      [-0.12, 0.3, 0.26, 0.19],
      [-0.12, 0.3, -0.26, 0.19],
      [0.16, 0.26, 0.24, 0.17],
      [0.16, 0.26, -0.24, 0.17],
      [-0.4, 0.3, 0, 0.18],
    ]
    for (const [x, y, z, r] of puffs) put(this.body, wool, x, y, z, r)
    put(this.body, wool, -0.52, 0.42, 0, 0.1) // tail
    // Front legs, tucked forward.
    const leg = new THREE.CapsuleGeometry(0.045, 0.2, 4, 8)
    for (const z of [0.11, -0.11]) {
      const m = new THREE.Mesh(leg, dark)
      m.position.set(0.36, 0.12, z)
      m.rotation.z = 1.2
      m.castShadow = true
      this.body.add(m)
    }
    // Head.
    this.head.position.set(0.4, 0.66, 0)
    put(this.head, wool, 0, 0, 0, 0.19, 0.17, 0.16)
    put(this.head, face, 0.13, -0.05, 0, 0.1, 0.085, 0.085)
    put(this.head, wool, -0.02, 0.12, 0, 0.1)
    put(this.head, dark, 0.215, -0.04, 0, 0.022, 0.018, 0.03) // nose
    for (const z of [0.075, -0.075]) {
      const eye = put(this.head, dark, 0.14, 0.035, z, 0.024)
      this.eyes.push(eye)
      const ear = put(this.head, face, 0.0, 0.03, z * 2.1, 0.11, 0.035, 0.055)
      ear.rotation.x = z > 0 ? -0.5 : 0.5
      this.ears.push(ear)
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 16, Math.PI * 1.4), horn)
      h.position.set(-0.03, 0.08, z * 1.6)
      h.rotation.set(0, z > 0 ? 0.3 : -0.3, 0.6)
      h.castShadow = true
      this.head.add(h)
    }
    this.body.add(this.head)
    this.group.add(this.body)
    // Sit on the slope, facing the ruin.
    const n = terrainNormal(at.x, at.z)
    this.group.position.copy(at).addScaledVector(n, -0.04)
    const up = new THREE.Vector3(0, 1, 0).lerp(n, 0.6).normalize()
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
    const dir = faceToward.clone().sub(at).setY(0).normalize()
    this.group.rotateY(Math.atan2(-dir.z, dir.x))
    this.group.updateMatrixWorld(true)
    this.baseQuat.copy(this.group.quaternion)
    physics.world.createCollider(RAPIER.ColliderDesc.ball(0.45).setTranslation(at.x, at.y + 0.4, at.z))
  }

  update(dt: number, eye: THREE.Vector3): void {
    this.t += dt
    const breathe = Math.sin(this.t * 2.1)
    this.body.scale.set(1, 1 + breathe * 0.018, 1 + breathe * 0.01)
    // Where to look: the player when close and in front, otherwise wander gaze over the sky.
    const local = this.group.worldToLocal(eye.clone()).sub(this.head.position)
    const dist = local.length()
    const toYaw = Math.atan2(-local.z, local.x)
    const toPitch = Math.atan2(local.y, Math.hypot(local.x, local.z))
    this.nextGaze -= dt
    if (this.nextGaze <= 0) {
      this.nextGaze = 2.5 + this.R() * 4
      this.gazeYaw = (this.R() - 0.5) * 1.6
      this.gazePitch = 0.1 + this.R() * 0.45
    }
    let ty = this.gazeYaw
    let tp = this.gazePitch
    if (dist < 14 && Math.abs(toYaw) < 1.9) {
      ty = toYaw
      tp = toPitch
    }
    ty = THREE.MathUtils.clamp(ty, -1.25, 1.25)
    tp = THREE.MathUtils.clamp(tp, -0.5, 0.7)
    const k = 1 - Math.exp(-dt * 3.2)
    this.yaw += (ty - this.yaw) * k
    this.pitch += (tp - this.pitch) * k
    this.head.rotation.set(0, this.yaw, this.pitch * 0.8, 'YZX')
    // Blink.
    this.nextBlink -= dt
    if (this.nextBlink <= 0) {
      this.nextBlink = 2.5 + this.R() * 4
      this.blink = 0.14
    }
    this.blink = Math.max(0, this.blink - dt)
    for (const e of this.eyes) e.scale.y = this.blink > 0 ? 0.004 : 0.024
    // Ear flick.
    this.nextFlick -= dt
    if (this.nextFlick <= 0) {
      this.nextFlick = 1.8 + this.R() * 4
      this.flick = 0.3
      this.flickEar = this.R() < 0.5 ? 0 : 1
    }
    this.flick = Math.max(0, this.flick - dt)
    this.ears.forEach((ear, i) => {
      const base = i === 0 ? -0.5 : 0.5
      const f = i === this.flickEar ? Math.sin((this.flick / 0.3) * Math.PI) * 0.6 : 0
      ear.rotation.x = base + (i === 0 ? -f : f)
    })
  }
}
