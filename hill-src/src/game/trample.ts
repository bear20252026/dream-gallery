import * as THREE from 'three'

/** Half-width in metres of the square the map covers, centred on the summit (the walkable hill fits inside). */
export const TRAMPLE_EXTENT = 64
const SIZE = 512 // 0.25 m per texel
const MAX_WALKERS = 8

/** Someone standing or walking on the meadow: feet position, heading, and how briskly (0..1). */
export type Walker = { x: number; z: number; dx: number; dz: number; moving: number }

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform vec4 uWalk[${MAX_WALKERS}];
uniform float uKeep;
uniform float uFall;
uniform float uExtent;
varying vec2 vUv;
void main() {
  vec4 prev = texture2D(uPrev, vUv);
  // Old prints fade: the grass springs back over several seconds.
  float s = max(prev.r * uKeep - uFall, 0.0);
  vec2 dir = prev.gb;
  vec2 xz = (vUv - 0.5) * 2.0 * uExtent;
  for (int i = 0; i < ${MAX_WALKERS}; i++) {
    vec4 w = uWalk[i];
    float m = length(w.zw);
    vec2 f = m > 1e-3 ? w.zw / m : vec2(0.0);
    // Walking, the footprint runs a little ahead and wider, so the blades part before the traveller;
    // standing, the grass lies around the feet like a nest.
    vec2 d = xz - (w.xy + f * 0.35 * m);
    float r = length(d);
    float R = 0.85 + 0.3 * m;
    float k = 1.0 - smoothstep(0.2 * R, R, r);
    if (k > s) {
      vec2 lay = (r > 1e-3 ? d / r : f) * 0.8 + f * 0.9 * m;
      float l = length(lay);
      if (l > 1e-3) dir = lay / l;
      s = k;
    }
  }
  gl_FragColor = vec4(s, dir, 1.0);
}
`

/**
 * Where travellers have pressed the meadow down: a top-down map the grass shader reads.
 * r = how pressed (0..1); g, b = the direction the blades lie. Two half-float targets ping-pong:
 * each frame reads the last one, lets it fade, and presses in everyone's feet.
 */
export class Trample {
  /** Shared with every grass material; `uTrample` is swapped to the newest map each frame. */
  readonly uniforms = {
    uTrample: { value: null as THREE.Texture | null },
    uTrampleExtent: { value: TRAMPLE_EXTENT },
  }
  private read: THREE.WebGLRenderTarget
  private write: THREE.WebGLRenderTarget
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material: THREE.ShaderMaterial
  private readonly walk = Array.from({ length: MAX_WALKERS }, () => new THREE.Vector4(1e5, 1e5, 0, 0))

  constructor() {
    const target = () =>
      new THREE.WebGLRenderTarget(SIZE, SIZE, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      })
    this.read = target()
    this.write = target()
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uWalk: { value: this.walk },
        uKeep: { value: 1 },
        uFall: { value: 0 },
        uExtent: { value: TRAMPLE_EXTENT },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    quad.frustumCulled = false
    this.scene.add(quad)
    this.uniforms.uTrample.value = this.read.texture
  }

  /** Fade the old prints by `dt` seconds and press in the walkers' feet. */
  update(gl: THREE.WebGLRenderer, dt: number, walkers: readonly Walker[]): void {
    for (let i = 0; i < MAX_WALKERS; i += 1) {
      const w = walkers[i]
      if (w) this.walk[i].set(w.x, w.z, w.dx * w.moving, w.dz * w.moving)
      else this.walk[i].set(1e5, 1e5, 0, 0)
    }
    const u = this.material.uniforms
    u.uPrev.value = this.read.texture
    u.uKeep.value = Math.exp(-dt / 6)
    u.uFall.value = dt * 0.02
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(this.write)
    gl.render(this.scene, this.camera)
    gl.setRenderTarget(prev)
    const t = this.read
    this.read = this.write
    this.write = t
    this.uniforms.uTrample.value = this.read.texture
  }

  dispose(): void {
    this.read.dispose()
    this.write.dispose()
    this.material.dispose()
  }
}
