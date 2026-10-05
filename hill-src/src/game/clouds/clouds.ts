import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { CONFIG, type QualityPreset } from '../config'
import { createCloudNoise, type CloudNoise } from './noise3d'
import { QUAD_VERT, RAYMARCH_FRAG, RESOLVE_FRAG } from './shaders'
import { buildTowerSdf, buildWeatherMap, cloudLayout, SKIP_RADIUS, type TowerSdf } from './weather'

/**
 * Volumetric cloud sea + towering cumulus, ray-marched at reduced resolution into an MRT
 * (rgb = in-scattered light, a = transmittance; aux = cloud distance, scene distance) and
 * accumulated over frames with reprojection. The composite pass upsamples it depth-aware.
 */
export class Clouds {
  /** Cloud time runs faster than real time so the billows visibly roll (time-lapse feel). */
  timeScale = 3.4
  private readonly noise: CloudNoise
  private readonly weather: THREE.DataTexture
  private readonly sdf: TowerSdf
  private readonly march: THREE.ShaderMaterial
  private readonly resolve: THREE.ShaderMaterial
  private readonly quad = new FullScreenQuad()
  private current!: THREE.WebGLRenderTarget
  private history: THREE.WebGLRenderTarget[] = []
  private ping = 0
  private frame = 0
  private reset = true
  private flow = new THREE.Vector2()
  private boil = 0
  private time = 0
  private readonly prevViewProj = new THREE.Matrix4()
  private readonly viewProj = new THREE.Matrix4()
  private width = 0
  private height = 0

  constructor(private readonly renderer: THREE.WebGLRenderer, private preset: QualityPreset) {
    this.noise = createCloudNoise(renderer)
    const layout = cloudLayout()
    this.weather = buildWeatherMap(layout.caps, 512)
    this.sdf = buildTowerSdf(layout.towers)
    const C = CONFIG.clouds
    const camera = {
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uNear: { value: 0.1 },
      uFar: { value: 1000 },
    }
    this.march = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: RAYMARCH_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...camera,
        uWeather: { value: this.weather },
        uShape: { value: this.noise.shape },
        uDetail: { value: this.noise.detail },
        uTowerSdf: { value: this.sdf.texture },
        uSdfMin: { value: this.sdf.min },
        uSdfInvSize: { value: new THREE.Vector3(1 / this.sdf.size.x, 1 / this.sdf.size.y, 1 / this.sdf.size.z) },
        uDepth: { value: null },
        uDepthSize: { value: new THREE.Vector2(1, 1) },
        uSunDir: { value: CONFIG.sunDir.clone() },
        uSunLight: { value: new THREE.Vector3(1.12, 1.07, 0.97) },
        uAmbTop: { value: new THREE.Vector3(0.43, 0.53, 0.86) },
        uAmbBottom: { value: new THREE.Vector3(0.25, 0.32, 0.62) },
        uHaze: { value: new THREE.Vector3(0.5, 0.6, 0.9) },
        uSeaBase: { value: C.seaBase },
        uCeiling: { value: C.ceiling },
        uInvSpan: { value: 1 / (C.extent * 2) },
        uSkipRadius: { value: SKIP_RADIUS * 0.92 },
        uFlow: { value: new THREE.Vector2() },
        uBoil: { value: 0 },
        uTime: { value: 0 },
        uFrame: { value: 0 },
        uSteps: { value: preset.cloudSteps },
        uLightSteps: { value: preset.lightSteps },
        uStepScale: { value: 1 },
      },
    })
    this.resolve = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: RESOLVE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInvProj: camera.uInvProj,
        uCamWorld: camera.uCamWorld,
        uCamPos: camera.uCamPos,
        uNear: camera.uNear,
        uFar: camera.uFar,
        uCurrent: { value: null },
        uCurrentAux: { value: null },
        uHistory: { value: null },
        uPrevViewProj: { value: this.prevViewProj },
        uTexel: { value: new THREE.Vector2() },
        uBlend: { value: 0.14 },
        uReset: { value: 1 },
      },
    })
  }

  /** Resolved clouds (rgb light, a transmittance) and aux (x cloud distance, y scene distance). */
  get output(): THREE.Texture {
    return this.history[this.ping].texture
  }

  get aux(): THREE.Texture {
    return this.current.textures[1]
  }

  get size(): THREE.Vector2 {
    return new THREE.Vector2(this.width, this.height)
  }

  setQuality(preset: QualityPreset): void {
    this.preset = preset
    this.march.uniforms.uSteps.value = preset.cloudSteps
    this.march.uniforms.uLightSteps.value = preset.lightSteps
    this.width = 0
  }

  invalidate(): void {
    this.reset = true
  }

  setSize(fullWidth: number, fullHeight: number): void {
    const w = Math.max(64, Math.round(fullWidth * this.preset.cloudScale))
    const h = Math.max(36, Math.round(fullHeight * this.preset.cloudScale))
    if (w === this.width && h === this.height) return
    this.width = w
    this.height = h
    this.current?.dispose()
    for (const t of this.history) t.dispose()
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    this.current = new THREE.WebGLRenderTarget(w, h, { ...opts, count: 2 })
    // Aux is read at texel centres, plus bilinear sky checks by the composite's smooth upsample.
    this.current.textures[1].minFilter = THREE.LinearFilter
    this.current.textures[1].magFilter = THREE.LinearFilter
    this.history = [new THREE.WebGLRenderTarget(w, h, opts), new THREE.WebGLRenderTarget(w, h, opts)]
    this.resolve.uniforms.uTexel.value.set(1 / w, 1 / h)
    this.reset = true
  }

  /** Advance cloud motion; `windDir` is the direction the wind blows toward. */
  update(dt: number, windDir: THREE.Vector2, gust: number): void {
    const sdt = dt * this.timeScale
    this.time += sdt
    this.boil += sdt
    this.flow.addScaledVector(windDir, CONFIG.clouds.drift * (0.85 + gust * 0.3) * sdt)
  }

  render(camera: THREE.PerspectiveCamera, depth: THREE.Texture, depthSize: THREE.Vector2): void {
    const u = this.march.uniforms
    camera.updateMatrixWorld()
    u.uInvProj.value.copy(camera.projectionMatrixInverse)
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld)
    u.uNear.value = camera.near
    u.uFar.value = camera.far
    u.uDepth.value = depth
    u.uDepthSize.value.copy(depthSize)
    u.uFlow.value.copy(this.flow)
    u.uBoil.value = this.boil
    u.uTime.value = this.time
    u.uFrame.value = this.frame % 64
    this.frame += 1

    const prevTarget = this.renderer.getRenderTarget()
    this.quad.material = this.march
    this.renderer.setRenderTarget(this.current)
    this.quad.render(this.renderer)

    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    const r = this.resolve.uniforms
    const read = this.history[this.ping]
    const write = this.history[1 - this.ping]
    r.uCurrent.value = this.current.textures[0]
    r.uCurrentAux.value = this.current.textures[1]
    r.uHistory.value = read.texture
    r.uReset.value = this.reset ? 1 : 0
    this.quad.material = this.resolve
    this.renderer.setRenderTarget(write)
    this.quad.render(this.renderer)
    this.renderer.setRenderTarget(prevTarget)
    this.ping = 1 - this.ping
    this.prevViewProj.copy(this.viewProj)
    this.reset = false
  }

  dispose(): void {
    this.current?.dispose()
    for (const t of this.history) t.dispose()
    this.quad.dispose()
    this.march.dispose()
    this.resolve.dispose()
    this.weather.dispose()
    this.sdf.texture.dispose()
    this.noise.shape.dispose()
    this.noise.detail.dispose()
  }
}
