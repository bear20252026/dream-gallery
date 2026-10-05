import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { CONFIG, type QualityPreset } from './config'
import { Clouds } from './clouds/clouds'
import { GLSL_CAMERA, QUAD_VERT } from './clouds/shaders'
import { GLSL_SKY } from './glsl'

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${GLSL_CAMERA}
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform sampler2D uClouds;
uniform sampler2D uCloudAux;
uniform vec2 uCloudSize;
uniform vec3 uSunDir;
uniform float uExposure;
uniform float uSaturation;
uniform float uFade;
${GLSL_SKY}

// Khronos PBR Neutral: keeps authored hues, rolls highlights softly to white.
vec3 neutralTonemap(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// Depth-aware bilinear upsample: only blend low-res cloud texels that saw the same surface.
// Also returns the texels' mean in-scattering distance for the occlusion test in main().
vec4 cloudsAt(vec2 uv, float sceneDist, out float cloudDist) {
  vec2 st = uv * uCloudSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec4 acc = vec4(0.0);
  float distAcc = 0.0;
  float wsum = 0.0;
  vec4 best = vec4(0.0, 0.0, 0.0, 1.0);
  float bestDist = 60000.0;
  float bestRel = 1e9;
  float ls = log2(max(sceneDist, 0.05));
  for (int y = 0; y < 2; y++)
  for (int x = 0; x < 2; x++) {
    vec2 c = (clamp(i + vec2(x, y), vec2(0.0), uCloudSize - 1.0) + 0.5) / uCloudSize;
    float bw = (x == 0 ? 1.0 - f.x : f.x) * (y == 0 ? 1.0 - f.y : f.y);
    vec2 aux = texture(uCloudAux, c).rg;
    float d = aux.g;
    float rel = abs(log2(max(d, 0.05)) - ls);
    vec4 s = texture(uClouds, c);
    float w = bw * exp(-rel * 3.0);
    acc += s * w;
    distAcc += aux.r * w;
    wsum += w;
    if (rel < bestRel) { bestRel = rel; best = s; bestDist = aux.r; }
  }
  if (wsum > 1e-4 && bestRel < 0.7) {
    cloudDist = distAcc / wsum;
    return acc / wsum;
  }
  // Silhouette pixels (e.g. sky right next to the ruin) may have no matching texel in the 2x2
  // footprint: take the closest-depth texel from a wider 4x4 neighbourhood instead.
  for (int y = -1; y < 3; y++)
  for (int x = -1; x < 3; x++) {
    vec2 c = (clamp(i + vec2(x, y), vec2(0.0), uCloudSize - 1.0) + 0.5) / uCloudSize;
    vec2 aux = texture(uCloudAux, c).rg;
    float rel = abs(log2(max(aux.g, 0.05)) - ls) + length(vec2(x, y) - f) * 0.05;
    if (rel < bestRel) { bestRel = rel; best = texture(uClouds, c); bestDist = aux.r; }
  }
  cloudDist = bestDist;
  return best;
}

// Cubic B-spline reconstruction of the low-res clouds from 4 bilinear taps, so crisp cloud edges
// stop following the texel grid. Only for pure-sky footprints (the bilinear aux taps would show any
// texel that saw geometry), so nothing bleeds across a silhouette.
bool cloudsSmooth(vec2 uv, out vec4 col) {
  vec2 st = uv * uCloudSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 p0 = (i - 0.5 + w1 / g0) / uCloudSize;
  vec2 p1 = (i + 1.5 + w3 / g1) / uCloudSize;
  vec2 p01 = vec2(p0.x, p1.y);
  vec2 p10 = vec2(p1.x, p0.y);
  float skyAll = min(min(texture(uCloudAux, p0).g, texture(uCloudAux, p10).g), min(texture(uCloudAux, p01).g, texture(uCloudAux, p1).g));
  if (skyAll < 59000.0) return false;
  col = g0.y * (g0.x * texture(uClouds, p0) + g1.x * texture(uClouds, p10)) + g1.y * (g0.x * texture(uClouds, p01) + g1.x * texture(uClouds, p1));
  return true;
}

void main() {
  vec3 rd = rayDir(vUv);
  float depth = texture(uDepth, vUv).r;
  bool sky = depth >= 0.99999;
  float sceneDist = sky ? 60000.0 : depthToDistance(depth, rd);
  // The scene target is cleared to transparent black, so MSAA resolves partly covered edge pixels
  // (grass against the sky) into premultiplied colour plus coverage alpha. The resolved depth is a
  // single sample, so such pixels are blended over the sky by coverage instead of being snapped to
  // either side, which used to leave dark dashes along every silhouette.
  vec4 sc = texture(uScene, vUv);
  float cov = clamp(sc.a, 0.0, 1.0);
  float cloudDist;
  vec4 cl = cloudsAt(vUv, sceneDist, cloudDist);
  // Low-res texels look past thin foreground; cloud that lies behind this pixel's surface is hidden.
  float keep = sky ? 1.0 : 1.0 - smoothstep(0.9, 1.15, cloudDist / max(sceneDist, 0.05));
  cl = vec4(cl.rgb * keep, mix(1.0, cl.a, keep));
  vec3 col;
  if (sky) {
    vec4 cs;
    if (cloudsSmooth(vUv, cs)) cl = cs;
    vec3 bg = skyColor(rd) * cl.a + cl.rgb;
    col = cov > 0.002 ? sc.rgb + bg * (1.0 - cov) : bg;
  } else {
    vec3 surf = (sc.rgb / max(cov, 1e-3)) * cl.a + cl.rgb;
    col = surf;
    if (cov < 0.998) {
      float bgDist;
      vec4 cb = cloudsAt(vUv, 60000.0, bgDist);
      col = mix(skyColor(rd) * cb.a + cb.rgb, surf, cov);
    }
  }
  col = neutralTonemap(col * uExposure);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, uSaturation), 0.0);
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.32;
  col *= uFade;
  vec3 srgb = toSrgb(col) + (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(srgb, 1.0);
}
`

/**
 * Frame pipeline: scene (HDR, MSAA, depth) -> volumetric clouds at reduced resolution ->
 * composite with sky, depth-aware cloud upsampling, tone mapping and grading, straight to screen.
 */
export class Pipeline {
  readonly clouds: Clouds
  exposure = 1
  saturation = 1.08
  fade = 1
  private sceneTarget!: THREE.WebGLRenderTarget
  private readonly composite: THREE.ShaderMaterial
  private readonly quad: FullScreenQuad
  private readonly drawSize = new THREE.Vector2()
  private readonly floatTargets: boolean
  /** Whether the scene target is multisampled at the current preset (alpha-to-coverage works). */
  get multisampled(): boolean {
    return this.floatTargets && this.preset.msaa > 0
  }

  constructor(private readonly gl: THREE.WebGLRenderer, private preset: QualityPreset) {
    this.floatTargets = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float')
    this.clouds = new Clouds(gl, preset)
    this.composite = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uScene: { value: null },
        uDepth: { value: null },
        uClouds: { value: null },
        uCloudAux: { value: null },
        uCloudSize: { value: new THREE.Vector2(1, 1) },
        uSunDir: { value: CONFIG.sunDir.clone() },
        uExposure: { value: 1 },
        uSaturation: { value: 1 },
        uFade: { value: 1 },
      },
    })
    this.quad = new FullScreenQuad(this.composite)
    this.resize()
  }

  setQuality(preset: QualityPreset): void {
    this.preset = preset
    this.clouds.setQuality(preset)
    this.drawSize.set(0, 0)
    this.resize()
  }

  resize(): void {
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2())
    if (size.equals(this.drawSize) && this.sceneTarget) return
    this.drawSize.copy(size)
    this.sceneTarget?.dispose()
    const depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType)
    this.sceneTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: this.floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: this.floatTargets ? this.preset.msaa : 0,
      depthTexture,
      depthBuffer: true,
    })
    this.clouds.setSize(size.x, size.y)
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.resize()
    const gl = this.gl
    gl.setRenderTarget(this.sceneTarget)
    // Transparent black: MSAA then resolves partial edge coverage into alpha for the composite.
    gl.setClearAlpha(0)
    gl.clear()
    gl.render(scene, camera)
    gl.setClearAlpha(1)
    this.clouds.render(camera, this.sceneTarget.depthTexture!, this.drawSize)
    const u = this.composite.uniforms
    u.uInvProj.value.copy(camera.projectionMatrixInverse)
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld)
    u.uNear.value = camera.near
    u.uFar.value = camera.far
    u.uScene.value = this.sceneTarget.texture
    u.uDepth.value = this.sceneTarget.depthTexture
    u.uClouds.value = this.clouds.output
    u.uCloudAux.value = this.clouds.aux
    u.uCloudSize.value.copy(this.clouds.size)
    u.uExposure.value = this.exposure
    u.uSaturation.value = this.saturation
    u.uFade.value = this.fade
    gl.setRenderTarget(null)
    this.quad.render(gl)
  }

  dispose(): void {
    this.sceneTarget?.dispose()
    this.clouds.dispose()
    this.quad.dispose()
    this.composite.dispose()
  }
}
