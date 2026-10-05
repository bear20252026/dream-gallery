import * as THREE from 'three'
import { rng, smoothstep } from './noise'
import { terrainHeight } from './terrain'
import type { Wind } from './wind'

/**
 * Leaves and flower petals carried across the summit by the wind.
 *
 * A pool of small instanced cards is simulated on the CPU inside a circle that follows the camera.
 * Each flake takes the local wind (slower down in the grass, lifted when a gust arrives), flutters
 * sideways, sinks slowly between gusts and tumbles as it goes; flakes that settle may lie in the
 * grass until the next gust. Flakes that leave the circle re-enter on its upwind side, so a steady
 * stream crosses the view, thickest when it gusts. Shapes are cut in the fragment shader.
 */
const MAX_FLAKES = 170
const RADIUS = 16
/** Flakes live between the ground (or this far below the camera when high above it) and above. */
const BELOW = 6
const ABOVE = 6

type Flake = {
  pos: THREE.Vector3
  vel: THREE.Vector3
  axis: THREE.Vector3
  angle: number
  spin: number
  size: number
  fall: number
  follow: number
  phase: number
  rate: number
  rest: number
}

const LEAF_COLOURS = [
  [0.28, 0.5, 0.1],
  [0.36, 0.56, 0.12],
  [0.48, 0.6, 0.13],
  [0.6, 0.62, 0.16],
  [0.78, 0.62, 0.2],
]
const PETAL_COLOURS = [
  [0.97, 0.96, 0.91],
  [0.98, 0.84, 0.88],
  [1.0, 0.88, 0.42],
  [0.76, 0.62, 0.95],
]

export class Drift {
  readonly mesh: THREE.InstancedMesh
  private readonly flakes: Flake[] = []
  private readonly R = rng(71)
  private readonly w = new THREE.Vector3()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly m = new THREE.Matrix4()
  private time = 0
  private seeded = false

  constructor(density: number) {
    const R = this.R
    const geo = new THREE.PlaneGeometry(1, 1)
    const kinds = new Float32Array(MAX_FLAKES)
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    this.mesh = new THREE.InstancedMesh(geo, material, MAX_FLAKES)
    const col = new THREE.Color()
    for (let i = 0; i < MAX_FLAKES; i += 1) {
      const petal = R() < 0.36
      kinds[i] = petal ? 1 : 0
      const c = petal ? PETAL_COLOURS[Math.floor(R() * PETAL_COLOURS.length)] : LEAF_COLOURS[Math.floor(R() * LEAF_COLOURS.length)]
      this.mesh.setColorAt(i, col.setRGB(c[0], c[1], c[2]))
      this.flakes.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
        angle: R() * Math.PI * 2,
        spin: (petal ? 3 : 2) + R() * 4,
        size: petal ? 0.05 + R() * 0.03 : 0.1 + R() * 0.07,
        fall: petal ? 0.35 + R() * 0.3 : 0.6 + R() * 0.5,
        follow: petal ? 2.6 + R() * 1.4 : 1.4 + R() * 1.2,
        phase: R() * Math.PI * 2,
        rate: 1.2 + R() * 2.2,
        rest: 0,
      })
    }
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1))
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aKind;\nvarying vec2 vFUv;\nvarying float vFKind;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFUv = uv;\nvFKind = aKind;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFUv;\nvarying float vFKind;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec2 q = vFUv * 2.0 - 1.0;
  bool inside;
  if (vFKind < 0.5) {
    // Leaf: a pointed oval, fuller toward the stalk, with a short stalk and a darker midrib.
    float hw = 0.46 * (1.0 - q.y * q.y) * (1.0 - 0.28 * q.y);
    inside = abs(q.x) < hw || (abs(q.x) < 0.035 && q.y < -0.78);
    diffuseColor.rgb *= 1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.07, abs(q.x))) * step(-0.8, q.y);
  } else {
    // Petal: a rounded teardrop narrowing to its base.
    float r = length(vec2(q.x * (1.25 + max(-q.y, 0.0) * 0.9), q.y * 0.95 - 0.08));
    inside = r < 0.84;
  }
  if (!inside) discard;
}`,
        )
        // Thin leaves and petals glow with the light passing through them, so they never go black.
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.38;')
    }
    material.customProgramCacheKey = () => 'drift-v2'
    this.mesh.frustumCulled = false
    this.mesh.name = 'drift'
    this.setDensity(density)
  }

  setDensity(density: number): void {
    this.mesh.count = Math.round(MAX_FLAKES * (0.4 + 0.6 * Math.min(1, Math.max(0, density))))
  }

  update(dt: number, wind: Wind, cam: THREE.Vector3): void {
    const R = this.R
    dt = Math.min(dt, 0.05)
    this.time += dt
    const t = this.time
    if (!this.seeded) {
      this.seeded = true
      for (const f of this.flakes) this.respawn(f, wind, cam, false)
    }
    const dx0 = wind.dir.x
    const dz0 = wind.dir.y
    for (let i = 0; i < this.mesh.count; i += 1) {
      const f = this.flakes[i]
      const p = f.pos
      let dx = p.x - cam.x
      let dz = p.z - cam.z
      // Left behind by a teleport or the title/play switch: start again round the camera.
      if (dx * dx + dz * dz > RADIUS * RADIUS * 4 || Math.abs(p.y - cam.y) > 60) {
        this.respawn(f, wind, cam, false)
        dx = p.x - cam.x
        dz = p.z - cam.z
      }
      const ground = terrainHeight(p.x, p.z)
      const agl = p.y - ground
      if (f.rest > 0) {
        f.rest -= dt
        // Lie still in the grass until a gust (or until the camera walks away from it).
        if (wind.gust < 0.55 && f.rest > 0 && dx * dx + dz * dz <= RADIUS * RADIUS) {
          this.place(i, f, cam)
          continue
        }
        f.rest = 0
      }
      const w = wind.velocityAt(p, this.w)
      // Sheltered in the grass; gusts lift everything a little.
      w.multiplyScalar(0.3 + 0.7 * smoothstep(0, 2.5, agl))
      w.y += (wind.gust - 0.3) * 1.7 * (0.6 + 0.4 * Math.sin(t * 0.7 + f.phase))
      // Flutter: side-slip across the wind and a bobbing sink.
      const fl = Math.sin(t * f.rate + f.phase)
      w.x += -dz0 * fl * 0.8
      w.z += dx0 * fl * 0.8
      w.y += Math.cos(t * f.rate * 1.3 + f.phase) * 0.45 - f.fall
      f.vel.lerp(w, 1 - Math.exp(-dt * f.follow))
      p.addScaledVector(f.vel, dt)
      const floor = terrainHeight(p.x, p.z) + 0.05
      if (p.y < floor) {
        p.y = floor
        f.vel.y = Math.max(0, f.vel.y)
        f.vel.x *= 0.5
        f.vel.z *= 0.5
        if (wind.gust < 0.45 && R() < 0.05) f.rest = 1 + R() * 4
      }
      f.angle += f.spin * dt * (0.35 + Math.min(f.vel.length(), 8) * 0.12)
      dx = p.x - cam.x
      dz = p.z - cam.z
      if (dx * dx + dz * dz > RADIUS * RADIUS || p.y > cam.y + ABOVE + 3) this.respawn(f, wind, cam, true)
      this.place(i, f, cam)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  private place(i: number, f: Flake, cam: THREE.Vector3): void {
    // Shrink flakes that pass right by the eye instead of flashing across the screen.
    const d = f.pos.distanceTo(cam)
    const k = f.size * smoothstep(0.35, 0.9, d)
    this.q.setFromAxisAngle(f.axis, f.angle)
    this.m.compose(f.pos, this.q, this.s.set(k, k, k))
    this.mesh.setMatrixAt(i, this.m)
  }

  /** Enter on the upwind edge of the circle (or anywhere inside it when seeding). */
  private respawn(f: Flake, wind: Wind, cam: THREE.Vector3, upwind: boolean): void {
    const R = this.R
    let x: number
    let z: number
    if (upwind) {
      const a = Math.atan2(wind.dir.y, wind.dir.x) + Math.PI + (R() - 0.5) * Math.PI * 0.95
      const r = RADIUS * (0.9 + R() * 0.08)
      x = cam.x + Math.cos(a) * r
      z = cam.z + Math.sin(a) * r
    } else {
      const a = R() * Math.PI * 2
      const r = Math.sqrt(R()) * RADIUS * 0.95
      x = cam.x + Math.cos(a) * r
      z = cam.z + Math.sin(a) * r
    }
    const ground = terrainHeight(x, z)
    const lo = Math.max(ground + 0.15, cam.y - BELOW)
    const hi = Math.max(lo + 1, cam.y + ABOVE)
    f.pos.set(x, lo + (hi - lo) * R(), z)
    wind.velocityAt(f.pos, f.vel)
    f.rest = 0
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
