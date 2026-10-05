/** Shared GLSL snippets. Uniform names are fixed so every material can include them. */

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += vnoise(p) * a;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s / 0.875;
}
`

/**
 * Wind field shared by grass, flowers and distant meadow shading. Needs uniforms
 * uTime (s), uWindDir (vec2, blowing toward), uWindSpeed (m/s), uWindScroll (m the air has carried the
 * gust pattern, integrated on the CPU) and uWindGust (eased scene-wide gust 0..1).
 * Returns x = gust strength 0..1 (fronts rolling downwind), y = sway -1..1 (irregular ripples inside
 * them, about 10 m apart, travelling with the air). Continuous in space and time: nothing jumps.
 */
export const GLSL_WIND = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindSpeed;
uniform float uWindScroll;
uniform float uWindGust;
vec2 windAt(vec2 xz) {
  vec2 side = vec2(-uWindDir.y, uWindDir.x);
  // Wind-frame coordinates of the fixed point xz; only 'a' moves, by the integrated scroll.
  float a = dot(xz, uWindDir) - uWindScroll;
  float c = dot(xz, side);
  float bands = vnoise(vec2(a * 0.045, c * 0.02 + uTime * 0.02)) * 0.65
              + vnoise(vec2(a * 0.11 + 3.1, c * 0.05 - uTime * 0.03)) * 0.35;
  float gust = smoothstep(0.3, 0.85, bands) * (0.75 + 0.25 * uWindGust);
  float sway = sin(a * 0.6 + vnoise(vec2(a * 0.07, c * 0.11)) * 5.0);
  return vec2(gust, sway);
}
`

/**
 * Stylised anime sky: saturated ultramarine zenith, paler lavender-blue horizon and a soft sun
 * glow. uSunDir must be declared by the includer.
 */
export const GLSL_SKY = /* glsl */ `
vec3 skyColor(vec3 dir) {
  float y = dir.y;
  float up = clamp(y, 0.0, 1.0);
  vec3 zenith = vec3(0.030, 0.062, 0.52);
  vec3 mid = vec3(0.075, 0.135, 0.66);
  vec3 horizon = vec3(0.42, 0.55, 0.92);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.32, up));
  col = mix(col, zenith, smoothstep(0.25, 0.95, up));
  // Below the horizon everything fades into the bright haze over the cloud sea.
  col = mix(col, vec3(0.58, 0.66, 0.92), smoothstep(0.0, -0.25, y));
  float s = max(dot(dir, uSunDir), 0.0);
  col += vec3(1.0, 0.92, 0.8) * (pow(s, 6.0) * 0.28 + pow(s, 64.0) * 0.6);
  col += vec3(1.0, 0.98, 0.9) * smoothstep(0.9994, 0.9998, s) * 40.0;
  return col;
}
`

/**
 * Painted meadow palette shared by the turf and every grass layer (needs GLSL_NOISE), so near
 * blades, distant tufts and the ground under them always read as one luminous green mass.
 */
export const GLSL_MEADOW = /* glsl */ `
vec3 meadowColor(vec2 xz) {
  float big = fbm3(xz * 0.016);
  float mid = fbm3(xz * 0.075 + 3.1);
  vec3 lush = vec3(0.13, 0.31, 0.04);
  vec3 sunny = vec3(0.31, 0.42, 0.07);
  vec3 deep = vec3(0.065, 0.2, 0.05);
  vec3 col = mix(lush, sunny, smoothstep(0.5, 0.8, big) * 0.75);
  return mix(col, deep, smoothstep(0.44, 0.22, mid) * 0.42);
}
// Faces turned from the sun lean to a cool blue-green, like the reference's shaded flank.
vec3 meadowShade(vec3 col, float ndl) {
  return mix(col * vec3(0.52, 0.74, 1.28), col, smoothstep(-0.08, 0.45, ndl));
}
`
