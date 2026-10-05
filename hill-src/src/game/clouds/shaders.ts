import { GLSL_NOISE, GLSL_SKY } from '../glsl'

export const QUAD_VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

/** Camera ray reconstruction shared by the raymarch, resolve and composite passes. */
export const GLSL_CAMERA = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uNear;
uniform float uFar;
vec3 rayDir(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
}
// Perspective depth-buffer value -> distance along the (normalised) ray.
float depthToDistance(float d, vec3 rd) {
  float z = (uNear * uFar) / (uFar - d * (uFar - uNear));
  vec3 fwd = normalize((uCamWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  return z / max(dot(rd, fwd), 1e-4);
}
`

export const RAYMARCH_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;
${GLSL_CAMERA}
uniform sampler2D uWeather;
uniform sampler3D uShape;
uniform sampler3D uDetail;
uniform sampler3D uTowerSdf;
uniform vec3 uSdfMin;
uniform vec3 uSdfInvSize;
uniform sampler2D uDepth;
uniform vec2 uDepthSize;
uniform vec3 uSunDir;
uniform vec3 uSunLight;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uHaze;
uniform float uSeaBase;
uniform float uCeiling;
uniform float uInvSpan;
uniform float uSkipRadius;
uniform vec2 uFlow;
uniform float uBoil;
uniform float uTime;
uniform float uFrame;
uniform int uSteps;
uniform int uLightSteps;
uniform float uStepScale;
${GLSL_NOISE}
${GLSL_SKY}

// Opaque, crisp-edged anime cumulus; SIGMA_L sets how deep lobes shade each other.
const float SIGMA = 0.075;
const float SIGMA_L = 0.01;
// Largest outward displacement of tower / sea surfaces (keeps empty-space skipping conservative).
const float TOWER_PAD = 250.0;
const float SEA_PAD = 125.0;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float towerDist(vec3 p) {
  vec3 uvw = (p - uSdfMin) * uSdfInvSize;
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 20000.0;
  return textureLod(uTowerSdf, uvw, 0.0).r;
}
// Flowing swell on top of the static sea.
float seaSwell(vec2 xz) {
  return (vnoise((xz - uFlow * 0.8) * 0.0017) - 0.5) * 40.0 + (vnoise((xz - uFlow * 1.3) * 0.006 + 7.0) - 0.5) * 12.0;
}
// Thin wind-driven mist hugging the foot of the hill, just above the local sea top.
float mistDensity(vec3 p, float seaTop) {
  float r = length(p.xz);
  float band = smoothstep(seaTop - 30.0, seaTop + 6.0, p.y) * (1.0 - smoothstep(seaTop + 18.0, seaTop + 80.0, p.y));
  float ring = smoothstep(120.0, 240.0, r) * (1.0 - smoothstep(650.0, 1150.0, r));
  if (band * ring <= 0.0) return 0.0;
  vec2 q = p.xz - uFlow * 2.4;
  float n = vnoise(q * 0.011 + vec2(p.y * 0.03, 0.0)) * 0.62 + vnoise(q * 0.034 + vec2(3.0, p.y * 0.05)) * 0.38;
  return band * ring * smoothstep(0.42, 0.78, n) * 0.3;
}

// Signed distance (m, < 0 inside) to the displaced cloud surface: towers merged with the sea.
// Beyond the displacement pad it returns a conservative bound. tw = tower factor.
float surfaceSd(vec3 p, bool detail, out float tw, out float seaTop) {
  vec4 w = textureLod(uWeather, p.xz * uInvSpan + 0.5, 0.0);
  float hump = w.g;
  seaTop = w.r;
  float ds = p.y - (w.r + seaSwell(p.xz) * (1.0 - hump * 0.5));
  float dt = towerDist(p);
  tw = smoothstep(300.0, -150.0, dt);
  float sd = smin(dt, ds, 140.0);
  float pad = mix(mix(80.0, SEA_PAD, hump), TOWER_PAD, tw);
  if (sd > pad) return sd - pad;
  // Near the hill the sea is seen up close: a little lumpier.
  float nearF = (1.0 - tw) * (1.0 - smoothstep(700.0, 2600.0, length(p.xz)));
  // Rounded lobes: towers boil upward, the sea rolls downwind.
  vec3 flow = vec3(uFlow.x, 0.0, uFlow.y);
  vec3 rise = vec3(0.0, uBoil * 2.4, 0.0);
  vec3 sp = (p - flow * (1.0 - tw * 0.85) - rise * tw) * mix(1.0 / 1150.0, 1.0 / 1600.0, tw);
  vec4 sn = textureLod(uShape, sp, 0.0);
  // Rounded cauliflower lobes of several sizes and very little fine cotton (painted look).
  float a0 = mix(mix(18.0, 34.0, hump), 90.0, tw);
  // Upper parts of the towers bulge harder (cauliflower heads); the sum stays under TOWER_PAD.
  float topF = tw * smoothstep(seaTop + 500.0, seaTop + 2100.0, p.y);
  float a1 = mix(mix(68.0, 110.0, hump), 185.0 + 70.0 * topF, tw) * (1.0 - nearF * 0.3);
  float a2 = mix(mix(24.0, 36.0, hump), 70.0, tw) * (1.0 + nearF * 0.4);
  float disp = (sn.r - 0.5) * a0 + (sn.g - 0.55) * a1 + (sn.b - 0.55) * a2;
  if (detail) {
    vec3 dp = (p - flow * 1.6 - rise * 1.7 * tw - vec3(uTime * 0.9, -uTime * 0.5, 0.0)) * (1.0 / 240.0);
    disp += (textureLod(uDetail, dp, 0.0).r - 0.55) * mix(mix(5.0, 9.0, nearF), 8.0, tw);
  }
  return sd - disp;
}

// Cloud body density 0..1 with a crisp edge; the mist band is returned separately.
float cloudDensity(vec3 p, bool detail, out float tw, out float s, out float mist) {
  float seaTop;
  s = surfaceSd(p, detail, tw, seaTop);
  mist = tw > 0.5 ? 0.0 : mistDensity(p, seaTop);
  float soft = mix(5.0, 9.0, tw);
  return clamp(-s / soft, 0.0, 1.0) * smoothstep(uSeaBase, uSeaBase + 150.0, p.y);
}

float lightOpticalDepth(vec3 p) {
  float od = 0.0;
  float stepL = 18.0;
  vec3 q = p;
  float tw, seaTop;
  for (int j = 0; j < 8; j++) {
    if (j >= uLightSteps) break;
    q += uSunDir * stepL;
    // Occupancy box-filtered over the step: the cloud edge is crisp, but the light through it
    // must vary continuously or the terminator breaks into posterised steps.
    od += clamp(0.5 - surfaceSd(q, false, tw, seaTop) / stepL, 0.0, 1.0) * stepL;
    stepL *= 2.0;
  }
  return od;
}

// Painted cumulus: the colour of the cloud skin at surface point ps. Where the path to the sun
// leaves the cloud at once the skin is flat cream-white; a soft painted terminator follows where
// that path starts to cross cloud, so every lobe (and each lobe under an overhang) carries its own
// light and shade. Shade is flat sky blue, deepening where cloud overhead hides the sky.
vec3 shadeSkin(vec3 ps, float cosT) {
  float od = lightOpticalDepth(ps) * SIGMA_L;
  float sunVis = exp(-od);
  // Direct light plus a soft multiple-scattering share: gentle gradients across lit faces.
  float lit = smoothstep(0.16, 0.92, sunVis * 0.72 + exp(-od * 0.3) * 0.28);
  float odUp = 0.0;
  float stepU = 40.0;
  vec3 q = ps;
  float tw, seaTop;
  for (int j = 0; j < 3; j++) {
    q.y += stepU;
    odUp += clamp(0.5 - surfaceSd(q, false, tw, seaTop) / stepU, 0.0, 1.0) * stepU;
    stepU *= 2.5;
  }
  vec3 shade = mix(uAmbBottom, uAmbTop, exp(-odUp * 0.004));
  vec3 col = mix(shade, uSunLight, lit);
  // A breath of lavender where light turns to shade.
  col += vec3(0.03, 0.0, 0.05) * (lit * (1.0 - lit) * 4.0);
  // Silver lining: with the sun behind the cloud its thin sunlit edges glow.
  col += uSunLight * pow(max(cosT, 0.0), 8.0) * sunVis * 0.5;
  return col;
}

void main() {
  vec3 rd = rayDir(vUv);
  vec3 ro = uCamPos;
  // Farthest depth in this low-res texel's footprint: thin foreground (the ribbon, strings, grass
  // tips) must not stop the rays. The composite hides cloud that lies behind each full-res
  // pixel's own surface, so the clouds behind thin objects stay correct on both sides.
  vec2 fp = vec2(dFdx(vUv).x, dFdy(vUv).y) * uDepthSize;
  float depth = 0.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    ivec2 dpx = ivec2(clamp(vUv * uDepthSize + vec2(x, y) * fp * 0.36, vec2(0.0), uDepthSize - 1.0));
    depth = max(depth, texelFetch(uDepth, dpx, 0).r);
  }
  float sceneDist = depth >= 0.99999 ? 1e9 : depthToDistance(depth, rd);
  float tEnter = 0.0;
  float tExit = 60000.0;
  if (abs(rd.y) > 1e-5) {
    float t0 = (uSeaBase - ro.y) / rd.y;
    float t1 = (uCeiling - ro.y) / rd.y;
    tEnter = max(0.0, min(t0, t1));
    tExit = min(tExit, max(t0, t1));
  }
  tExit = min(tExit, sceneDist);
  vec3 L = vec3(0.0);
  float T = 1.0;
  float distAcc = 0.0;
  float wAcc = 0.0;
  // Interleaved gradient noise, rotated each frame (temporal accumulation averages it out).
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * vec2(47.0, 17.0), vec2(0.06711056, 0.00583715))));
  float cosT = dot(rd, uSunDir);
  vec3 mistCol = mix(uAmbTop, uSunLight, 0.62);
  vec3 skin = mistCol;
  bool wasIn = false;
  float tOut = tEnter;
  float t = tEnter;
  bool started = false;
  bool exhausted = true;
  for (int i = 0; i < 220; i++) {
    if (i >= uSteps) break;
    if (t >= tExit || T < 0.012) {
      exhausted = false;
      break;
    }
    vec3 p = ro + rd * t;
    // Empty-space skipping against the tower SDF and the sea's max-filtered top.
    float dTower = towerDist(p) - TOWER_PAD;
    float seaAbove = p.y - (textureLod(uWeather, p.xz * uInvSpan + 0.5, 0.0).b + SEA_PAD);
    if (dTower > 0.0 && seaAbove > 0.0) {
      float seaStep = min(uSkipRadius / max(length(rd.xz), 1e-3), rd.y < -1e-4 ? seaAbove / -rd.y : 1e9);
      t += max(min(dTower, seaStep), 10.0) * (started ? 1.0 : 0.6 + 0.4 * jitter);
      wasIn = false;
      tOut = t;
      continue;
    }
    float dt = clamp(t * 0.006, 7.0, 120.0) * uStepScale;
    if (!started) {
      started = true;
      t += dt * jitter;
      p = ro + rd * t;
    }
    float tw, s, mist;
    float dens = cloudDensity(p, true, tw, s, mist);
    float ext = max(dens, mist * 0.6);
    if (ext > 0.002) {
      vec3 S = mistCol;
      if (dens > 0.002) {
        // Entering cloud: find the skin between the last outside point and here, and paint it
        // once (stable under the per-frame jitter; reused until the ray leaves this cloud).
        if (!wasIn) {
          float a = tOut;
          float b = t;
          for (int k = 0; k < 5; k++) {
            float m = 0.5 * (a + b);
            float twm, stm;
            if (surfaceSd(ro + rd * m, true, twm, stm) > 0.0) a = m;
            else b = m;
          }
          skin = shadeSkin(ro + rd * b, cosT);
          wasIn = true;
        }
        S = mix(mistCol, skin, clamp(dens / max(ext, 1e-4), 0.0, 1.0));
      } else {
        wasIn = false;
        tOut = t;
      }
      float Tr = exp(-ext * SIGMA * dt);
      L += T * S * (1.0 - Tr);
      distAcc += t * T * (1.0 - Tr);
      wAcc += T * (1.0 - Tr);
      T *= Tr;
    } else if (s > dt) {
      // Outside the displaced surface: approach it faster.
      wasIn = false;
      t += min(s * 0.6, 600.0);
      tOut = t;
      continue;
    } else {
      wasIn = false;
      tOut = t;
    }
    t += dt;
  }
  // Rays that graze a lobe's thin fringe can spend the whole budget there and would show the sky
  // through the cloud behind (blue cracks along lobe outlines on low step counts). Finish them
  // with a few long, cheap steps.
  if (exhausted && T > 0.03) {
    float stride = max(clamp(t * 0.006, 7.0, 120.0) * uStepScale * 4.0, 160.0);
    for (int k = 0; k < 18; k++) {
      if (t >= tExit || T < 0.03) break;
      vec3 p = ro + rd * t;
      float dTower = towerDist(p) - TOWER_PAD;
      float seaAbove = p.y - (textureLod(uWeather, p.xz * uInvSpan + 0.5, 0.0).b + SEA_PAD);
      if (dTower > 0.0 && seaAbove > 0.0) {
        float seaStep = min(uSkipRadius / max(length(rd.xz), 1e-3), rd.y < -1e-4 ? seaAbove / -rd.y : 1e9);
        t += max(min(dTower, seaStep), stride);
        continue;
      }
      float tw, s, mist;
      float dens = cloudDensity(p, false, tw, s, mist);
      if (dens > 0.002) {
        vec3 S = shadeSkin(p, cosT);
        float Tr = exp(-dens * SIGMA * stride);
        L += T * S * (1.0 - Tr);
        distAcc += t * T * (1.0 - Tr);
        wAcc += T * (1.0 - Tr);
        T *= Tr;
      }
      t += s > stride ? max(s * 0.6, stride) : stride;
    }
  }
  // The cloud sea is endless: any sky ray below the horizon ends in cloud. Grazing rays that ran
  // out of steps or skimmed between far bumps are closed with the lit sea colour.
  if (rd.y < 0.0 && sceneDist > 1e8 && T > 0.0) {
    vec3 seaCol = wAcc > 0.05 ? L / wAcc : mix(uAmbTop, uSunLight, 0.8);
    float tEnd = exhausted ? t : max(t, 20000.0);
    L += T * seaCol;
    distAcc += tEnd * T;
    wAcc += T;
    T = 0.0;
  }
  float dist = wAcc > 1e-4 ? distAcc / wAcc : 40000.0;
  // Aerial perspective: low, distant cloud (the far sea) melts into the horizon haze while the
  // high tower faces stay crisp.
  float haze = 1.0 - exp(-dist * mix(1.0 / 11000.0, 1.0 / 24000.0, smoothstep(-0.02, 0.1, rd.y)));
  vec3 hazeCol = mix(uHaze, skyColor(normalize(vec3(rd.x, max(rd.y, 0.0) * 0.4 + 0.01, rd.z))), 0.7);
  L = mix(L, hazeCol * (1.0 - T), haze * 0.9);
  outColor = vec4(L, T);
  // Half-float target: keep the sky's 'infinite' distance representable (matches the composite).
  outAux = vec4(min(dist, 60000.0), min(sceneDist, 60000.0), 0.0, 1.0);
}
`

export const RESOLVE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${GLSL_CAMERA}
uniform sampler2D uCurrent;
uniform sampler2D uCurrentAux;
uniform sampler2D uHistory;
uniform mat4 uPrevViewProj;
uniform vec2 uTexel;
uniform float uBlend;
uniform float uReset;
void main() {
  vec4 cur = texture(uCurrent, vUv);
  float dist = texture(uCurrentAux, vUv).r;
  vec3 rd = rayDir(vUv);
  vec3 wp = uCamPos + rd * min(dist, 40000.0);
  vec4 pc = uPrevViewProj * vec4(wp, 1.0);
  vec2 prevUv = pc.xy / pc.w * 0.5 + 0.5;
  vec4 mn = cur;
  vec4 mx = cur;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    if (x == 0 && y == 0) continue;
    vec4 s = texture(uCurrent, vUv + vec2(x, y) * uTexel);
    mn = min(mn, s);
    mx = max(mx, s);
  }
  vec4 hist = clamp(texture(uHistory, prevUv), mn, mx);
  bool valid = uReset < 0.5 && pc.w > 0.0 && all(greaterThan(prevUv, vec2(0.0))) && all(lessThan(prevUv, vec2(1.0)));
  outColor = valid ? mix(hist, cur, uBlend) : cur;
}
`
