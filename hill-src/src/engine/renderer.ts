import * as THREE from 'three'
import { QUALITY } from '../game/config'
import type { Quality } from './save'

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse) return 'low'
  if (cores <= 4) return 'medium'
  return 'high'
}

/**
 * Owns the WebGL renderer, pixel ratio and canvas sizing. The frame pipeline (scene target,
 * clouds, composite) lives in game/pipeline.ts and renders through `gl`.
 *
 * Adaptive resolution: if frames stay slow the pixel ratio steps down (never below 60 % of the
 * preset) and recovers when there is headroom again.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private basePixelRatio = 1
  private scale = 1
  private slow = 0
  private fast = 0
  private avg = 1 / 60
  onResize?: () => void

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.NoToneMapping
    this.gl.shadowMap.type = THREE.PCFShadowMap
    this.applyQuality(quality)
    window.addEventListener('resize', () => this.resize())
  }

  applyQuality(quality: Quality): void {
    const preset = QUALITY[quality]
    this.gl.shadowMap.enabled = preset.shadows
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, preset.pixelRatio)
    this.scale = 1
    this.resize()
  }

  /** Feed real frame time; adjusts resolution when the GPU cannot keep up. */
  adapt(frameSeconds: number): void {
    this.avg += (Math.min(frameSeconds, 0.1) - this.avg) * 0.05
    if (this.avg > 1 / 40) {
      this.slow += frameSeconds
      this.fast = 0
    } else if (this.avg < 1 / 58) {
      this.fast += frameSeconds
      this.slow = 0
    } else {
      this.slow = 0
      this.fast = 0
    }
    if (this.slow > 1.5 && this.scale > 0.6) {
      this.scale = Math.max(0.6, this.scale - 0.1)
      this.slow = 0
      this.resize()
    } else if (this.fast > 6 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.1)
      this.fast = 0
      this.resize()
    }
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.gl.setPixelRatio(this.basePixelRatio * this.scale)
    this.gl.setSize(w, h, false)
    this.onResize?.()
  }

  get aspect(): number {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    return w / h
  }
}
