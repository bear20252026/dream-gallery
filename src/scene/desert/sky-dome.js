// sky-dome.js — 沙漠渐变天穹(2026-11-12 画质:治「光照平、没氛围」)
//
// 病根:沙漠天空原先是 `s.background = 单色`。一整块纯色没有任何垂直渐变,
// 也没有太阳方位的辉光差 ⇒ 画面像贴了张米色墙纸,这是「没氛围」的最大来源。
// (主世界 scene/sky-shader.js 那套云影天空是**蓝色调**且已停用,fbm 五层噪声偏重,
//  不适合沙漠的暖色美术方向,故这里另做一版轻量的。)
//
// 本版只做三件事,都是「氛围」的骨架:
//   ① 垂直渐变:地平线暖(接雾色) → 天顶冷。有渐变才有天空的「高度」。
//   ② 太阳方位辉光:日落时暖光集中在太阳那一侧的低空,而不是全天均匀染色。
//   ③ 下缘沉入雾色:与远景雾无缝相接,不出现穹顶硬边。
//
// ⚠️ 色彩空间:管线末端有 OutputPass 做 Tone Mapping + sRGB 转换
//    (scene/postprocessing.js),所以本着色器**输出线性色**,自己绝不再做
//    pow(1/2.2) 或 Reinhard —— 否则会被二次转换,天空整体发灰发暗。
//    THREE.Color 由 setHex 构造时已转到线性工作空间,直接当 uniform 传即可。
// ⚠️ 零新增灯光:只有一张网格 + 一个 ShaderMaterial,不动全站灯光预算。
// ⚠️ 无顶层副作用:网格在工厂函数里建,便于单测直接 import 纯函数。

import * as THREE from 'three';

/** 天顶色(sRGB 定义,THREE.Color 会转线性):夜深蓝黑 / 日落暮紫 / 白昼沙蓝 */
export const ZENITH_NIGHT = 0x05060f;
export const ZENITH_SUNSET = 0x4a3a63;
export const ZENITH_DAY = 0xa9b8c6; // 暖灰蓝(原 0x9db4cc 偏冷,与暖沙地面脱节)

/** 太阳辉光的染色:夜冷月光 / 日落橙 / 白昼暖白 */
export const GLOW_NIGHT = 0x223055;
export const GLOW_SUNSET = 0xff8844;
export const GLOW_DAY = 0xfff0d0;

/**
 * 辉光强度(纯函数):日落最强,白昼中等,夜里只留一点月华。
 * @param {{wNight:number, wDusk:number, wDay:number}} w 三档权重(和为 1)
 * @returns {number}
 */
export function skyGlowStrength(w) {
  const n = Number(w && w.wNight) || 0;
  const d = Number(w && w.wDusk) || 0;
  const y = Number(w && w.wDay) || 0;
  return n * 0.12 + d * 1.0 + y * 0.35;
}

/**
 * 建天穹。半径 1200 < 相机 far 2000(scene.js),BackSide 从内侧看。
 * @param {THREE.Scene} s
 * @returns {{mesh:THREE.Mesh, update:Function, dispose:Function}}
 */
export function createDesertSky(s) {
  const uniforms = {
    uHorizon: { value: new THREE.Color(0xc8b88a) },
    uZenith: { value: new THREE.Color(ZENITH_DAY) },
    uSunTint: { value: new THREE.Color(GLOW_DAY) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlow: { value: 0.35 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false, // 天穹自己就是「远景」,不能再被雾吃一遍
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vDir;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uSunTint;
      uniform vec3 uSunDir;
      uniform float uGlow;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        // ① 垂直渐变:pow<1 让暖色集中在低空,天顶更快转冷 ⇒ 天空有「高度」
        float t = pow(clamp(h, 0.0, 1.0), 0.42);
        vec3 col = mix(uHorizon, uZenith, t);
        // ③ 地平线以下沉入雾色,避免穹顶下缘硬边
        col = mix(uHorizon * 0.82, col, smoothstep(-0.22, 0.02, h));
        // ② 太阳方位辉光:窄瓣(pow6)+ 宽瓣(pow2),且只在地平线附近强
        float sd = max(0.0, dot(d, normalize(uSunDir)));
        float glow = pow(sd, 6.0) * 0.55 + pow(sd, 2.0) * 0.18;
        glow *= 1.0 - smoothstep(0.0, 0.55, abs(h)) * 0.65;
        col += uSunTint * glow * uGlow;
        gl_FragColor = vec4(col, 1.0); // 线性输出,交给 OutputPass
      }
    `,
  });
  const geo = new THREE.SphereGeometry(1200, 32, 16);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1; // 先画天穹,其余几何盖在它上面
  s.add(mesh);

  const _zen = new THREE.Color();
  const _glow = new THREE.Color();
  const _sun = new THREE.Vector3();
  const cZN = new THREE.Color(ZENITH_NIGHT);
  const cZS = new THREE.Color(ZENITH_SUNSET);
  const cZD = new THREE.Color(ZENITH_DAY);
  const cGN = new THREE.Color(GLOW_NIGHT);
  const cGS = new THREE.Color(GLOW_SUNSET);
  const cGD = new THREE.Color(GLOW_DAY);

  /**
   * 逐帧驱动(由 dayNight 末尾调用,保证不被覆盖)。
   * @param {object} o
   * @param {THREE.Color} o.fogColor 地平线色 = 当前雾色(保证远景与天空无缝)
   * @param {THREE.Vector3} o.sunDir 太阳方向(无需归一)
   * @param {{wNight:number,wDusk:number,wDay:number}} o.weights 昼夜三档权重
   * @param {THREE.Camera} [o.camera] 相机(天穹跟随其位置,永不穿帮)
   */
  function update(o) {
    const w = o.weights;
    // 地平线直接引用雾色对象:dayNight 已先写好它,这里零拷贝自动同步
    if (o.fogColor) uniforms.uHorizon.value = o.fogColor;
    _zen.setRGB(
      cZN.r * w.wNight + cZS.r * w.wDusk + cZD.r * w.wDay,
      cZN.g * w.wNight + cZS.g * w.wDusk + cZD.g * w.wDay,
      cZN.b * w.wNight + cZS.b * w.wDusk + cZD.b * w.wDay
    );
    uniforms.uZenith.value.copy(_zen);
    _glow.setRGB(
      cGN.r * w.wNight + cGS.r * w.wDusk + cGD.r * w.wDay,
      cGN.g * w.wNight + cGS.g * w.wDusk + cGD.g * w.wDay,
      cGN.b * w.wNight + cGS.b * w.wDusk + cGD.b * w.wDay
    );
    uniforms.uSunTint.value.copy(_glow);
    uniforms.uGlow.value = skyGlowStrength(w);
    if (o.sunDir) {
      _sun.copy(o.sunDir);
      if (_sun.lengthSq() > 1e-8) uniforms.uSunDir.value.copy(_sun.normalize());
    }
    if (o.camera) mesh.position.copy(o.camera.position);
  }

  function dispose() {
    s.remove(mesh);
    geo.dispose();
    mat.dispose();
  }

  return { mesh, update, dispose };
}
