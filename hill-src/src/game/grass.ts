import * as THREE from 'three'
import { CONFIG } from './config'
import { GLSL_MEADOW, GLSL_NOISE, GLSL_WIND } from './glsl'
import { rng } from './noise'
import { HEIGHT_TEX, type Terrain } from './terrain'

/**
 * Painted meadow after Ghibli backgrounds. Close to the eye: long, thin leaf blades that curve and
 * taper to a fine point, each with a lit and a shaded half. Further out: camera-facing cards
 * painted with fans of such blades (mip-mapped, so distant grass reads as soft brushwork instead
 * of triangles). In between: single-species drifts of buttercups, daisies and lilac vetch.
 *
 * Instances are world anchored (each maps to a world cell relative to the camera's cell and is
 * jittered by a hash of that cell) so nothing swims as the player walks; rings cross-fade by
 * height. Every layer takes the hill's normal and the turf's colour field, so the slope still reads
 * as one lit mass with a cool shadow flank, and wind gusts comb visible waves through it.
 */
type Kind = 'blade' | 'tuft' | 'flower'
type LodSpec = {
  kind: Kind
  cell: number
  fadeIn: [number, number]
  fadeOut: [number, number]
  rows: number
  width: number
  height: number
  rootDark: number
  /** Far flower ring: only the cores of the drifts, with bigger heads. */
  far?: boolean
}

const LODS: LodSpec[] = [
  { kind: 'blade', cell: 0.1, fadeIn: [-1, 0], fadeOut: [10, 13], rows: 5, width: 0.05, height: 1, rootDark: 0.66 },
  { kind: 'tuft', cell: 0.3, fadeIn: [10, 13], fadeOut: [34, 40], rows: 3, width: 0.55, height: 1.0, rootDark: 0.7 },
  { kind: 'tuft', cell: 0.72, fadeIn: [34, 40], fadeOut: [100, 118], rows: 2, width: 1.1, height: 1.08, rootDark: 0.8 },
  { kind: 'flower', cell: 0.42, fadeIn: [-1, 0], fadeOut: [16, 22], rows: 1, width: 0.045, height: 1, rootDark: 1 },
  { kind: 'flower', cell: 0.8, fadeIn: [16, 22], fadeOut: [44, 54], rows: 1, width: 0.07, height: 1, rootDark: 1, far: true },
]

/** Leaf blade: `rows` quads up a strip (x = side -0.5..0.5, y = t) closed by one tip vertex. */
function bladeGeometry(rows: number): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  for (let k = 0; k < rows; k += 1) pos.push(-0.5, k / rows, 0, 0.5, k / rows, 0)
  pos.push(0, 1, 0)
  for (let k = 0; k < rows; k += 1) {
    const a = k * 2
    if (k < rows - 1) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    else idx.push(a, a + 1, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

/** Tuft card: a vertical strip of `rows` quads so it can bend (x = side, y = t). */
function cardGeometry(rows: number): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  for (let k = 0; k <= rows; k += 1) pos.push(-0.5, k / rows, 0, 0.5, k / rows, 0)
  for (let k = 0; k < rows; k += 1) {
    const a = k * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

/** Flower: a thin stem (z = 0, y = t) and a head quad facing the camera (z = 1, x/y = corner). */
function flowerGeometry(): THREE.BufferGeometry {
  const pos = [-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0, -0.5, -0.5, 1, 0.5, -0.5, 1, -0.5, 0.5, 1, 0.5, 0.5, 1]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6])
  return g
}

function annulus(cell: number, r0: number, r1: number): Float32Array {
  const n = Math.ceil(r1 / cell) + 2
  const inner = Math.max(0, r0 - cell * 2)
  const outer = r1 + cell * 2
  const out: number[] = []
  for (let iz = -n; iz <= n; iz += 1) {
    for (let ix = -n; ix <= n; ix += 1) {
      const d = Math.hypot(ix, iz) * cell
      if (d >= inner && d <= outer) out.push(ix, iz)
    }
  }
  return new Float32Array(out)
}

/**
 * Four painted tufts in a 2x2 atlas: fans of curved, tapering blades rooted at the bottom centre.
 * R = shade (dark roots to light tips, varied per blade), G = per-blade tint, A = coverage. It is
 * uploaded premultiplied so the mip levels average colour correctly at the soft blade edges.
 */
function tuftAtlas(): THREE.Texture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S * 2
  canvas.height = S * 2
  const g = canvas.getContext('2d')
  if (!g) throw new Error('2D canvas unavailable')
  const rand = rng(1337)
  for (let v = 0; v < 4; v += 1) {
    const ox = (v % 2) * S
    const oy = Math.floor(v / 2) * S
    g.save()
    g.beginPath()
    g.rect(ox, oy, S, S)
    g.clip()
    const lean = (rand() - 0.5) * 0.5
    const count = 11 + Math.floor(rand() * 5)
    for (let i = 0; i < count; i += 1) {
      const u = rand() - 0.5
      const x0 = ox + S * (0.5 + u * 0.46)
      const y0 = oy + S + 3
      const len = S * (0.5 + rand() * 0.46) * (1 - Math.abs(u) * 0.5)
      const ang = lean + u * 1.25 + (rand() - 0.5) * 0.35
      const curl = (rand() - 0.5) * 1.1 + Math.sign(ang) * 0.35
      const w0 = S * (0.026 + rand() * 0.02)
      // Quadratic curve from the root to the tip, bending further toward its lean.
      const cx = x0 + Math.sin(ang) * len * 0.5
      const cy = y0 - Math.cos(ang) * len * 0.5
      const tx = x0 + Math.sin(ang + curl) * len
      const ty = y0 - Math.cos(ang + curl) * len * 0.96
      const left: [number, number][] = []
      const right: [number, number][] = []
      const N = 18
      for (let j = 0; j <= N; j += 1) {
        const s = j / N
        const px = (1 - s) * (1 - s) * x0 + 2 * (1 - s) * s * cx + s * s * tx
        const py = (1 - s) * (1 - s) * y0 + 2 * (1 - s) * s * cy + s * s * ty
        const dx = 2 * (1 - s) * (cx - x0) + 2 * s * (tx - cx)
        const dy = 2 * (1 - s) * (cy - y0) + 2 * s * (ty - cy)
        const dl = Math.hypot(dx, dy) || 1
        const w = w0 * Math.pow(1 - s, 0.8) * (0.8 + 0.2 * Math.min(1, s * 5)) * 0.5
        left.push([px - (dy / dl) * w, py + (dx / dl) * w])
        right.push([px + (dy / dl) * w, py - (dx / dl) * w])
      }
      g.beginPath()
      g.moveTo(left[0][0], left[0][1])
      for (const [x, y] of left) g.lineTo(x, y)
      for (let j = right.length - 1; j >= 0; j -= 1) g.lineTo(right[j][0], right[j][1])
      g.closePath()
      const shade0 = Math.round((0.28 + rand() * 0.14) * 255)
      const shade1 = Math.round((0.82 + rand() * 0.18) * 255)
      const tint = Math.floor(rand() * 255)
      const grad = g.createLinearGradient(x0, y0, tx, ty)
      grad.addColorStop(0, `rgb(${shade0},${tint},0)`)
      grad.addColorStop(1, `rgb(${shade1},${tint},0)`)
      g.fillStyle = grad
      g.fill()
    }
    g.restore()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.premultiplyAlpha = true
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

const GRASS_VARYINGS = /* glsl */ `
varying vec3 vGrassCol;
varying float vPress;
varying float vT;
varying float vSide;
varying vec3 vBladeN;
varying vec3 vBladeSide;
varying float vBack;
varying vec2 vTuftUv;
varying vec2 vFlowerUv;
varying float vPart;
varying float vKind;
uniform vec3 uSunDirG;
uniform float uRootDark;
`

const GRASS_PARS = /* glsl */ `
attribute vec2 aGrid;
uniform vec2 uCamCell;
uniform float uCell;
uniform vec4 uFade;
uniform float uWidth;
uniform float uHeight;
uniform vec3 uCamPos;
uniform sampler2D uHeightTex;
uniform float uHeightExtent;
uniform sampler2D uTrample;
uniform float uTrampleExtent;
${GRASS_VARYINGS}
${GLSL_NOISE}
${GLSL_MEADOW}
${GLSL_WIND}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 gPos;
vec3 gNrm;
void grassPlace() {
  vec2 cell = uCamCell + aGrid;
  vec2 xz = (cell + hash22(cell)) * uCell;
  vec4 ht = texture2D(uHeightTex, xz / (2.0 * uHeightExtent) + 0.5);
  vec3 tn = normalize(vec3(ht.g, sqrt(max(1.0 - ht.g * ht.g - ht.b * ht.b, 0.01)), ht.b));
  float dist = length(xz - uCamPos.xz);
  float fade = smoothstep(uFade.x, uFade.y, dist) * (1.0 - smoothstep(uFade.z, uFade.w, dist));
  float rnd = hash12(cell * 1.37 + 5.1);
  float rnd2 = hash12(cell * 0.73 - 2.9);
  // Patchy lushness (tall drifts, shorter lawns) and half-metre clumps.
  float lush = vnoise(xz * 0.09) * 0.65 + vnoise(xz * 0.31 + 4.0) * 0.35;
  float clump = vnoise(xz * 1.7 + 11.0);
  float h = mix(0.28, 0.72, pow(rnd, 1.3)) * mix(0.55, 1.35, smoothstep(0.2, 0.8, lush)) * mix(0.72, 1.18, clump);
  h *= uHeight * ht.a * fade;
  float t = position.y;
  // Blades lean along a slowly turning field, so the meadow reads as combed brush strokes.
  float ang = (vnoise(xz * 0.21 + 7.0) - 0.5) * 4.0 + (rnd2 - 0.5) * 1.8;
  vec2 w = windAt(xz);
  // Where travellers walk the meadow is pressed down and lies their way; it springs back as the
  // print fades (see trample.ts). Pressed blades barely tremble.
  vec4 tr = texture2D(uTrample, xz / (2.0 * uTrampleExtent) + 0.5);
  float press = clamp(tr.r * 1.2, 0.0, 1.0);
  press *= press * (3.0 - 2.0 * press);
  // Gust fronts and their ripples roll across the meadow; on top of that every blade trembles at
  // its own rate and phase (livelier inside a gust), so neighbours never move in lockstep.
  float live = (0.25 + 0.75 * w.x) * (1.0 - 0.85 * press);
  float flick = sin(uTime * (4.6 + rnd * 2.8) + rnd2 * 6.2832) * live;
  float wob = sin(uTime * (3.1 + rnd2 * 2.2) + rnd * 6.2832) * live;
  float bend = 0.22 + rnd * 0.28 + w.x * 0.5 + w.y * 0.1 * (0.35 + w.x) + flick * 0.04;
  vec2 bdir = normalize(uWindDir * (0.5 + w.x * 0.9) + vec2(cos(ang), sin(ang)) * 0.55);
  bend = mix(bend, 1.72, press);
  if (dot(tr.gb, tr.gb) > 1e-4) {
    vec2 lay = mix(bdir, normalize(tr.gb), smoothstep(0.0, 0.45, press));
    if (dot(lay, lay) > 1e-6) bdir = normalize(lay);
  }
  vec3 bdir3 = vec3(bdir.x, 0.0, bdir.y);
  vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), tn, 0.35));
  vec3 base = vec3(xz.x, ht.r - 0.03, xz.y);
  vec3 p = base + up * h * t * (1.0 - 0.28 * bend * bend * t * t) + bdir3 * h * bend * t * t * 0.62;
  p.xz += vec2(-bdir.y, bdir.x) * wob * 0.05 * h * t * t;
  // Pressed flat: the whole blade sinks toward the ground.
  p.y = base.y + (p.y - base.y) * (1.0 - 0.45 * press);
  vT = t;
  vPress = press;
  vSide = 0.0;
  vBladeN = tn;
  vBladeSide = vec3(1.0, 0.0, 0.0);
  vBack = 0.0;
  vTuftUv = vec2(0.0);
  vFlowerUv = vec2(0.0);
  vPart = 0.0;
  vKind = 0.0;
#if defined(KIND_BLADE)
  // Leaf blade: widest just above the root, tapering smoothly to a fine curled point.
  float wd = uWidth * mix(0.7, 1.3, rnd2) * pow(1.0 - t, 0.75) * (0.78 + 0.22 * smoothstep(0.0, 0.2, t));
  float twist = (rnd - 0.5) * 1.4 + t * (rnd2 - 0.5) * 0.9;
  vec2 side = vec2(-bdir.y, bdir.x) * cos(twist) + bdir * sin(twist);
  p.xz += side * position.x * wd;
  vec3 side3 = vec3(side.x, 0.0, side.y);
  vec3 tang = normalize(up * (1.0 - 0.84 * bend * bend * t * t) + bdir3 * bend * t * 1.24);
  vBladeN = normalize(cross(side3, tang));
  vBladeSide = side3;
  vSide = position.x * 2.0;
  // Sun shining through the blade toward the eye.
  vBack = pow(max(dot(normalize(p - uCamPos), uSunDirG), 0.0), 3.0) * t;
#elif defined(KIND_TUFT)
  // Painted tuft card turned to the camera about the vertical, randomly mirrored, one of four.
  vec2 toCam = normalize(uCamPos.xz - xz + 1e-4);
  float wd = uWidth * mix(0.8, 1.2, rnd2) * mix(0.85, 1.15, lush);
  p.xz += vec2(-toCam.y, toCam.x) * position.x * wd;
  p.y -= 0.02;
  float vi = floor(rnd2 * 3.999);
  vec2 off = vec2(mod(vi, 2.0), 1.0 - floor(vi / 2.0)) * 0.5;
  float ux = rnd > 0.5 ? position.x + 0.5 : 0.5 - position.x;
  vTuftUv = off + (vec2(ux, t) * 0.96 + 0.02) * 0.5;
#elif defined(KIND_FLOWER)
  // Single-species drifts of small flowers: dense cores fading out at their edges, and only a
  // sparse scatter of singles between them. Heads ride just above the grass.
  float patchN = vnoise(xz * 0.11 + 21.0) * 0.7 + vnoise(xz * 0.43 - 3.0) * 0.3;
  float drift = smoothstep(0.5, 0.74, patchN) * step(0.3, lush);
#ifdef FLOWER_FAR
  float present = step(rnd, drift * 0.8 - 0.12);
#else
  float present = step(rnd, mix(0.03, 0.72, drift));
#endif
  // Buttercup, daisy or lilac vetch, mostly one kind per drift.
  float sp = vnoise(xz * 0.05 + 40.0) + (hash12(cell * 4.7 + 1.3) - 0.5) * 0.3;
  vKind = sp < 0.42 ? 0.0 : (sp < 0.66 ? 1.0 : 2.0);
  float hh = h * mix(1.0, 1.25, rnd2) * present;
  if (position.z < 0.5) {
    p = base + up * hh * t * (1.0 - 0.2 * bend * bend * t * t) + bdir3 * hh * bend * t * t * 0.45;
    vec2 toCam = normalize(uCamPos.xz - xz + 1e-4);
    p.xz += vec2(-toCam.y, toCam.x) * position.x * 0.007 * present;
    vPart = 0.0;
  } else {
    vec3 head = base + up * hh * (1.0 - 0.2 * bend * bend) + bdir3 * hh * bend * 0.45;
    vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float r = uWidth * mix(0.75, 1.3, rnd2) * present * fade;
    p = head + (camR * position.x + camU * position.y) * r * 2.0;
    vFlowerUv = position.xy * 2.0;
    vPart = 1.0;
  }
#endif
  gPos = p;
  gNrm = tn;
  // Every layer shares the turf's colour field; roots darken up close and tips catch the sun.
  vec3 ground = meadowColor(xz);
  vec3 body = ground * mix(0.9, 1.1, rnd);
#if defined(KIND_BLADE)
  vec3 tip = ground * 1.3 + mix(vec3(0.05, 0.07, 0.0), vec3(0.1, 0.1, 0.01), rnd2);
  vec3 col = mix(body * uRootDark, body, smoothstep(0.0, 0.45, t));
  col = mix(col, tip, smoothstep(0.5, 1.0, t) * mix(0.55, 1.0, lush));
#else
  vec3 col = body;
#endif
  col = meadowShade(col, dot(tn, uSunDirG));
  // Wind waves: gusts comb the grass over and flash its paler side.
  col *= 1.0 + w.x * 0.24;
  col += vec3(0.04, 0.05, 0.0) * w.x * t;
  vGrassCol = col;
}
`

const GRASS_FRAG = /* glsl */ `
#if defined(KIND_BLADE)
  {
    // Folded leaf: the half turned to the sun is lighter, with a faint midrib between.
    vec3 nb = normalize(vBladeN) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 nh = normalize(nb + normalize(vBladeSide) * sign(vSide) * 0.8);
    float fold = mix(0.8, 1.16, smoothstep(-0.3, 0.5, dot(nh, uSunDirG)));
    fold *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.16, abs(vSide)));
    diffuseColor.rgb = vGrassCol * fold + vec3(0.1, 0.13, 0.0) * vBack;
  }
#elif defined(KIND_TUFT)
  {
    vec4 tx = texture2D(uTuft, vTuftUv);
    float a = tx.a;
    // Coverage thins out in the lower mips; restore it so distant tufts stay full.
    vec2 dx = dFdx(vTuftUv * 512.0);
    vec2 dy = dFdy(vTuftUv * 512.0);
    a *= 1.0 + max(0.0, 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8))) * 0.3;
  #ifdef GRASS_A2C
    a = clamp((a - 0.5) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
    if (a < 0.02) discard;
  #else
    if (a < 0.5) discard;
    a = 1.0;
  #endif
    float shade = tx.r / max(tx.a, 1e-3);
    float tint = tx.g / max(tx.a, 1e-3);
    vec3 col = vGrassCol * mix(uRootDark, 1.24, shade) * mix(0.92, 1.08, tint);
    col += vec3(0.045, 0.06, 0.0) * smoothstep(0.65, 1.0, shade);
    diffuseColor = vec4(col, a);
  }
#elif defined(KIND_FLOWER)
  if (vPart > 0.5) {
    float r = length(vFlowerUv);
    float ang = atan(vFlowerUv.y, vFlowerUv.x);
    float petals = vKind > 0.5 && vKind < 1.5 ? 8.0 : 5.0;
    float edge = vKind > 1.5 ? mix(0.72, 1.0, pow(abs(cos(ang * petals * 0.5)), 0.5)) : mix(0.55, 1.0, pow(abs(cos(ang * petals * 0.5)), 0.7));
    float aa = fwidth(r) * 1.2;
    float a = 1.0 - smoothstep(edge - aa, edge + aa, r);
  #ifdef GRASS_A2C
    if (a < 0.02) discard;
  #else
    if (a < 0.5) discard;
    a = 1.0;
  #endif
    vec3 petal = vKind > 1.5 ? vec3(0.6, 0.36, 0.86) : (vKind > 0.5 ? vec3(0.95, 0.94, 0.88) : vec3(1.0, 0.74, 0.07));
    vec3 eye = vKind > 1.5 ? vec3(0.95, 0.82, 0.5) : (vKind > 0.5 ? vec3(1.0, 0.72, 0.06) : vec3(0.88, 0.52, 0.03));
    vec3 col = mix(eye, petal, smoothstep(0.24, 0.34, r));
    col *= mix(0.82, 1.0, smoothstep(0.2, 0.8, r / edge));
    diffuseColor = vec4(col, a);
  } else {
    diffuseColor.rgb = vGrassCol * 0.85;
  }
#endif
  // Flattened grass shows the paler, sunlit side of its blades, so a trodden path reads from afar.
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.08, 1.07, 0.9), vPress * 0.75);
`

export class Grass {
  readonly group = new THREE.Group()
  private readonly meshes: { mesh: THREE.Mesh; spec: LodSpec; uniforms: Record<string, THREE.IUniform> }[] = []
  private readonly tuftTexture = tuftAtlas()
  private alphaToCoverage: boolean

  constructor(
    private readonly terrain: Terrain,
    density: number,
    alphaToCoverage = false,
    /** The trodden-grass map (see trample.ts); without one the meadow is never pressed. */
    private readonly trample: Record<string, THREE.IUniform> = { uTrample: { value: null }, uTrampleExtent: { value: 64 } },
  ) {
    this.group.name = 'grass'
    this.alphaToCoverage = alphaToCoverage
    this.build(density)
  }

  /** Rebuild for a quality preset; alpha-to-coverage softens tuft and flower edges under MSAA. */
  setDensity(density: number, alphaToCoverage = this.alphaToCoverage): void {
    for (const m of this.meshes) {
      m.mesh.geometry.dispose()
      ;(m.mesh.material as THREE.Material).dispose()
      this.group.remove(m.mesh)
    }
    this.meshes.length = 0
    this.alphaToCoverage = alphaToCoverage
    this.build(density)
  }

  private build(density: number): void {
    const k = 1 / Math.sqrt(Math.max(0.2, density))
    for (const spec0 of LODS) {
      const spec = { ...spec0, cell: spec0.cell * k, width: spec0.kind === 'flower' ? spec0.width : spec0.width * Math.sqrt(k) }
      const shape = spec.kind === 'blade' ? bladeGeometry(spec.rows) : spec.kind === 'tuft' ? cardGeometry(spec.rows) : flowerGeometry()
      const geo = new THREE.InstancedBufferGeometry()
      geo.index = shape.index
      geo.setAttribute('position', shape.getAttribute('position'))
      const grid = annulus(spec.cell, Math.max(0, spec.fadeIn[0]), spec.fadeOut[1])
      geo.setAttribute('aGrid', new THREE.InstancedBufferAttribute(grid, 2))
      geo.instanceCount = grid.length / 2
      const uniforms: Record<string, THREE.IUniform> = {
        ...this.terrain.uniforms,
        ...this.trample,
        uCamCell: { value: new THREE.Vector2() },
        uCell: { value: spec.cell },
        uFade: { value: new THREE.Vector4(spec.fadeIn[0], spec.fadeIn[1], spec.fadeOut[0], spec.fadeOut[1]) },
        uWidth: { value: spec.width },
        uHeight: { value: spec.height },
        uRootDark: { value: spec.rootDark },
        uCamPos: { value: new THREE.Vector3() },
        uHeightTex: { value: this.terrain.heightTexture },
        uHeightExtent: { value: HEIGHT_TEX.extent },
        uSunDirG: { value: CONFIG.sunDir.clone() },
        uTuft: { value: this.tuftTexture },
      }
      const a2c = this.alphaToCoverage && spec.kind !== 'blade'
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
      material.defines = { [`KIND_${spec.kind.toUpperCase()}`]: '', ...(a2c ? { GRASS_A2C: '' } : {}), ...(spec.far ? { FLOWER_FAR: '' } : {}) }
      material.alphaToCoverage = a2c
      if (a2c) {
        // The fragment alpha drives coverage, but the scene target's alpha is read as coverage by the
        // composite: colour replaces as usual while alpha accumulates (half-float, unclamped), so a
        // sample with anything behind it stays opaque and only silhouettes against the sky blend.
        material.blending = THREE.CustomBlending
        material.blendEquation = THREE.AddEquation
        material.blendSrc = THREE.OneFactor
        material.blendDst = THREE.ZeroFactor
        material.blendSrcAlpha = THREE.OneFactor
        material.blendDstAlpha = THREE.OneFactor
      }
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${GRASS_PARS}`)
          .replace('#include <beginnormal_vertex>', 'grassPlace();\nvec3 objectNormal = gNrm;')
          .replace('#include <begin_vertex>', 'vec3 transformed = gPos;')
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${GRASS_VARYINGS}\nuniform sampler2D uTuft;`)
          .replace('#include <color_fragment>', GRASS_FRAG)
          // Grass borrows the hill normal: both faces must light the same, so no back-face flip.
          .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      }
      material.customProgramCacheKey = () => `grass-v4-${spec.kind}${spec.far ? '-far' : ''}${a2c ? '-a2c' : ''}`
      const mesh = new THREE.Mesh(geo, material)
      mesh.frustumCulled = false
      mesh.receiveShadow = true
      mesh.castShadow = false
      mesh.name = `grass-${spec.kind}-${this.meshes.length}`
      this.group.add(mesh)
      this.meshes.push({ mesh, spec, uniforms })
    }
  }

  setSunDir(dir: THREE.Vector3): void {
    for (const m of this.meshes) (m.uniforms.uSunDirG.value as THREE.Vector3).copy(dir)
  }

  update(camera: THREE.Camera): void {
    const p = camera.position
    for (const m of this.meshes) {
      ;(m.uniforms.uCamCell.value as THREE.Vector2).set(Math.floor(p.x / m.spec.cell), Math.floor(p.z / m.spec.cell))
      ;(m.uniforms.uCamPos.value as THREE.Vector3).copy(p)
    }
  }

  /** Number of grass and flower instances drawn per frame (for diagnostics). */
  get instanceCount(): number {
    return this.meshes.reduce((s, m) => s + (m.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount, 0)
  }
}
