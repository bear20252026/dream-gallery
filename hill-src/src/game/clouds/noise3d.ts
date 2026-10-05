import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

/**
 * Tileable 3D cloud noise, generated on the GPU one slice at a time into 3D render targets.
 *
 * Worley "domes" (1 - F1²) are rounded bumps with sharp creases between cells: displacing a
 * cloud surface by them gives the cauliflower lobes of cumulus.
 *
 * shape  (128³ RGBA8): R = Perlin-Worley (coverage variation), G = domes at 4 cells,
 *                      B = domes at 8+16 cells, A = low-frequency Perlin fBm.
 * detail (64³ R8):     domes at 4+8 cells (tiled much smaller in world space).
 */
const GEN_VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const GEN_COMMON = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform float uZ;
layout(location = 0) out vec4 outColor;
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// Worley with a periodic lattice (period in cells); returns 1 at feature points (billowy).
float worley(vec3 p, float period) {
  vec3 id = floor(p);
  vec3 f = fract(p);
  float d = 1.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(x, y, z);
    vec3 cell = mod(id + o, period);
    vec3 r = o + hash33(cell) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - sqrt(d);
}
float worleyDome(vec3 p, float period) {
  vec3 id = floor(p);
  vec3 f = fract(p);
  float d = 1.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(x, y, z);
    vec3 cell = mod(id + o, period);
    vec3 r = o + hash33(cell) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - clamp(d * 1.25, 0.0, 1.0);
}
vec3 grad(vec3 cell) { return normalize(hash33(cell) * 2.0 - 1.0); }
float perlin(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad(mod(i + vec3(0, 0, 0), period)), f - vec3(0, 0, 0));
  float n100 = dot(grad(mod(i + vec3(1, 0, 0), period)), f - vec3(1, 0, 0));
  float n010 = dot(grad(mod(i + vec3(0, 1, 0), period)), f - vec3(0, 1, 0));
  float n110 = dot(grad(mod(i + vec3(1, 1, 0), period)), f - vec3(1, 1, 0));
  float n001 = dot(grad(mod(i + vec3(0, 0, 1), period)), f - vec3(0, 0, 1));
  float n101 = dot(grad(mod(i + vec3(1, 0, 1), period)), f - vec3(1, 0, 1));
  float n011 = dot(grad(mod(i + vec3(0, 1, 1), period)), f - vec3(0, 1, 1));
  float n111 = dot(grad(mod(i + vec3(1, 1, 1), period)), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float perlinFbm(vec3 p, float period, int octaves) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    s += perlin(p, period) * a;
    n += a;
    p *= 2.0;
    period *= 2.0;
    a *= 0.5;
  }
  return s / n;
}
float worleyFbm(vec3 p, float period) {
  return worley(p, period) * 0.625 + worley(p * 2.0, period * 2.0) * 0.25 + worley(p * 4.0, period * 4.0) * 0.125;
}
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
`

const SHAPE_FRAG = /* glsl */ `${GEN_COMMON}
void main() {
  vec3 p = vec3(vUv, uZ);
  float pf = perlinFbm(p * 4.0, 4.0, 5) * 0.5 + 0.5;
  float wf = worleyFbm(p * 4.0, 4.0);
  float pw = clamp(remap(pf, wf - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  float big = worleyDome(p * 4.0, 4.0);
  float mid = worleyDome(p * 8.0, 8.0) * 0.68 + worleyDome(p * 16.0, 16.0) * 0.32;
  float low = perlinFbm(p * 2.0 + 17.0, 2.0, 3) * 0.5 + 0.5;
  outColor = vec4(pw, big, mid, low);
}
`

const DETAIL_FRAG = /* glsl */ `${GEN_COMMON}
void main() {
  vec3 p = vec3(vUv, uZ);
  float w = worleyDome(p * 4.0, 4.0) * 0.62 + worleyDome(p * 8.0, 8.0) * 0.38;
  outColor = vec4(w, 0.0, 0.0, 1.0);
}
`

function generate(renderer: THREE.WebGLRenderer, size: number, frag: string, format: THREE.PixelFormat): THREE.Data3DTexture {
  const target = new THREE.WebGL3DRenderTarget(size, size, size, { format, type: THREE.UnsignedByteType, depthBuffer: false })
  const tex = target.texture
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  const material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: GEN_VERT, fragmentShader: frag, uniforms: { uZ: { value: 0 } }, depthTest: false, depthWrite: false })
  const quad = new FullScreenQuad(material)
  const prev = renderer.getRenderTarget()
  for (let layer = 0; layer < size; layer += 1) {
    material.uniforms.uZ.value = (layer + 0.5) / size
    renderer.setRenderTarget(target, layer)
    quad.render(renderer)
  }
  renderer.setRenderTarget(prev)
  quad.dispose()
  material.dispose()
  return tex as unknown as THREE.Data3DTexture
}

export type CloudNoise = { shape: THREE.Data3DTexture; detail: THREE.Data3DTexture }

export function createCloudNoise(renderer: THREE.WebGLRenderer): CloudNoise {
  return {
    shape: generate(renderer, 128, SHAPE_FRAG, THREE.RGBAFormat),
    detail: generate(renderer, 64, DETAIL_FRAG, THREE.RedFormat),
  }
}
