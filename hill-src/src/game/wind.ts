import * as THREE from 'three'
import { CONFIG } from './config'
import { noise2, smoothstep } from './noise'

/**
 * One wind for the whole scene: a slowly wandering direction and gusts that swell and fade.
 * Grass and terrain shading use the same direction/speed through uniforms; the ribbon cloth
 * samples `velocityAt` for a spatially varying push.
 */
export class Wind {
  readonly dir = new THREE.Vector2().copy(CONFIG.wind.dir)
  speed: number = CONFIG.wind.speed
  /** 0 calm .. 1 strongest gust. */
  gust = 0
  time = 0
  /** Metres the gust pattern has travelled downwind; integrated, so it never jumps when the speed changes. */
  scroll = 0
  /** The gust eased over ~1.2 s: the gentle scene-wide swell that the grass and turf follow. */
  gustSmooth = 0
  private readonly baseAngle = Math.atan2(CONFIG.wind.dir.y, CONFIG.wind.dir.x)

  update(dt: number): void {
    this.time += dt
    const t = this.time
    const g = noise2(t * 0.21, 0.5, 3) * 0.6 + noise2(t * 0.83, 4.5, 5) * 0.4
    this.gust = smoothstep(-0.15, 0.55, g)
    this.speed = CONFIG.wind.speed * (0.62 + this.gust * 0.85)
    this.scroll += this.speed * 0.8 * dt
    this.gustSmooth += (this.gust - this.gustSmooth) * (1 - Math.exp(-dt / 1.2))
    const a = this.baseAngle + noise2(t * 0.045, 9.5, 7) * 0.22
    this.dir.set(Math.cos(a), Math.sin(a))
  }

  /** Wind velocity (m/s) at a point: base flow, travelling gust cells and a little turbulence. */
  velocityAt(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const t = this.time
    const along = p.x * this.dir.x + p.z * this.dir.y
    const cell = noise2(along * 0.08 - t * 0.9, p.y * 0.12, 11) * 0.5 + 0.5
    const s = this.speed * (0.75 + cell * 0.5)
    const tx = noise2(p.y * 0.35 + t * 1.7, along * 0.2, 13)
    const ty = noise2(p.y * 0.4 - t * 1.3, along * 0.25 + 3, 17)
    return out.set(this.dir.x * s + tx * 1.4 * this.dir.y, ty * 0.9 + 0.05, this.dir.y * s - tx * 1.4 * this.dir.x)
  }
}
