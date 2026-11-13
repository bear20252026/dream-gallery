// foliage-life.js — 植被「活过来」(2026-11-13 自然表面轮)
//
// 病植被全是实例化低多边形色块:树冠是纯色十二面体、草是纯色小锥,
// 完全静止 ⇒ 一眼「代码感」。本轮给它们两件事:
//   ① 风摆:顶点按「离地高度」加权随风向摆动(草整株摇、树冠晃、树干只微颤),
//      相位用**实例世界坐标**做种子 ⇒ 每株节奏不同,不是一起齐摆的机械感;
//   ② 斑驳:片元按世界坐标噪声调制反照率(±10%),色块变成有明暗的叶簇。
//
// ⚠️ 实例化网格的世界坐标必须乘 instanceMatrix(begin_vertex 之后、project_vertex
//    之前注入),直接用 modelMatrix*position 会把整块植被摆成一团。
// ⚠️ 高度基准 uBase 取「实例原点离地偏移 - 几何半高」≈ 地面,权重随高度 squasher,
//    保证根部不动、梢部摆,树不会从土里拔出来。
// ⚠️ 零新增灯光/draw call;共享 uniform 对象,一处 tick 全站生效。
// ⚠️ 无顶层副作用:attachFoliageLife(mat, opts) 由 terrain.js 调用,便于单测。

import * as THREE from 'three';

/** 全植被共享的时间 uniform(由 desert 主循环 tick) */
export const foliageUniforms = {
  uWindTime: { value: 0 },
};

const VERT_HEAD = `
uniform float uWindTime;
uniform float uSway;
uniform float uBase;
uniform float uHeight;
varying vec3 vFolWorld;
float folHash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
`;
const VERT_BODY = `
{
  #ifdef USE_INSTANCING
    vec4 folW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #else
    vec4 folW = modelMatrix * vec4(transformed, 1.0);
  #endif
  float folH = clamp((folW.y - uBase) / uHeight, 0.0, 1.0);
  float folWt = folH * folH;
  float folPh = folHash(floor(folW.xz * 0.7)) * 6.2831;
  float folGust = sin(uWindTime * 1.35 + folPh) + 0.5 * sin(uWindTime * 2.7 + folPh * 1.7);
  transformed.x += folGust * uSway * folWt;
  transformed.z += cos(uWindTime * 1.1 + folPh) * uSway * 0.6 * folWt;
  #ifdef USE_INSTANCING
    vFolWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vFolWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
}
`;

const FRAG_HEAD = `
varying vec3 vFolWorld;
uniform float uMottle;
float folHash2(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float folNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = folHash2(i), b = folHash2(i + vec2(1,0));
  float c = folHash2(i + vec2(0,1)), d = folHash2(i + vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
`;
const FRAG_COLOR = `
{
  float folN = folNoise(vFolWorld.xz * 2.3) * 0.65 + folNoise(vFolWorld.xz * 6.1) * 0.35;
  diffuseColor.rgb *= 1.0 + (folN - 0.5) * uMottle;
}
`;

/**
 * 给植被材质注入风摆与斑驳(就地改,幂等)。
 * @param {THREE.MeshStandardMaterial} mat 植被共享材质
 * @param {{sway: number, base: number, height: number, mottle: number}} opts
 *   sway — 梢部摆幅(米);base — 地面基准(实例原点偏移-几何半高);
 *   height — 权重归一高度; mottle — 反照率斑驳幅度(0.2 ≈ ±10%)
 * @returns {THREE.MeshStandardMaterial} 同一个材质
 */
export function attachFoliageLife(mat, opts) {
  if (!mat || mat.userData.foliageLife) return mat;
  mat.userData.foliageLife = true;
  const o = opts || {};
  const uSway = { value: o.sway ?? 0.05 };
  const uBase = { value: o.base ?? 0 };
  const uHeight = { value: o.height ?? 1 };
  const uMottle = { value: o.mottle ?? 0.2 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = foliageUniforms.uWindTime;
    shader.uniforms.uSway = uSway;
    shader.uniforms.uBase = uBase;
    shader.uniforms.uHeight = uHeight;
    shader.uniforms.uMottle = uMottle;
    shader.vertexShader =
      VERT_HEAD +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + VERT_BODY
      );
    shader.fragmentShader =
      FRAG_HEAD +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n' + FRAG_COLOR
      );
  };
  mat.needsUpdate = true;
  return mat;
}

/** 每帧推进风时间 */
export function tickFoliage(time) {
  foliageUniforms.uWindTime.value = time;
}
