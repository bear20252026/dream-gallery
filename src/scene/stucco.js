// stucco.js — 建筑外墙灰泥细节(2026-11-13 建筑表面轮)
//
// 病外墙是平涂 MeshStandardMaterial,最大面积的「代码感」色块之一。
// 注入两层程序化细节(片元内计算,零外部资产/零新增 draw call/零新增灯光):
//   ① 灰泥颗粒:双尺度值噪声调制反照率(±6%)与粗糙度,去掉塑料平涂;
//   ② 抹刀痕:低频拉伸噪声,模拟抹灰的不均匀手感。
// 世界坐标取法照 paper-floor/foliage-life 先例;实例化墙体乘 instanceMatrix。
// ⚠️ 无顶层副作用;幂等;换色(housecolor)改的是 color,与本注入相乘,互不冲突。

import * as THREE from 'three';
import { registerScaled, registerRecompile } from './desert/detail-quality.js'; // 画质档联动(2026-11-13)

/** 灰泥强度(按画质档缩放) */
export const stuccoUniforms = { uStucco: { value: 1 } };

const VERT_HEAD = `
varying vec3 vStuWorld;
`;
const VERT_BODY = `
{
  #ifdef USE_INSTANCING
    vStuWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vStuWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
}
`;
const FRAG_HEAD = `
varying vec3 vStuWorld;
uniform float uStucco;
float stuHash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float stuNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = stuHash(i), b = stuHash(i + vec2(1,0));
  float c = stuHash(i + vec2(0,1)), d = stuHash(i + vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
`;
const FRAG_COLOR = `
{
  // 墙面用 (x+y) 与 (z+y) 两对坐标,保证任意朝向的墙都有纹理(不依赖 UV)
  vec2 su = vec2(vStuWorld.x + vStuWorld.y, vStuWorld.z + vStuWorld.y);
  // 低画质档:编译期砍掉细颗粒(3 次 noise → 2 次),保留抹刀痕的大手感
  #ifdef DETAIL_LOW
    float grain = stuNoise(su * 6.0);
  #else
    float grain = stuNoise(su * 6.0) * 0.6 + stuNoise(su * 18.0) * 0.4;
  #endif
  float trowel = stuNoise(vec2(su.x * 0.7, su.y * 2.2));
  diffuseColor.rgb *= 1.0 + ((grain - 0.5) * 0.12 + (trowel - 0.5) * 0.08) * uStucco;
}
`;
const FRAG_ROUGH = `
{
  vec2 su = vec2(vStuWorld.x + vStuWorld.y, vStuWorld.z + vStuWorld.y);
  #ifndef DETAIL_LOW
    float grain = stuNoise(su * 12.0);
    roughnessFactor = clamp(roughnessFactor + (grain - 0.5) * 0.1 * uStucco, 0.0, 1.0);
  #endif
}
`;

/**
 * 给墙体材质注入灰泥细节(就地改,幂等)。
 * @param {THREE.MeshStandardMaterial} mat 墙体共享材质
 * @returns {THREE.MeshStandardMaterial} 同一个材质
 */
export function attachStucco(mat) {
  if (!mat || mat.userData.stucco) return mat;
  mat.userData.stucco = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStucco = stuccoUniforms.uStucco;
    shader.vertexShader =
      VERT_HEAD +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + VERT_BODY
      );
    shader.fragmentShader =
      FRAG_HEAD +
      shader.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n' + FRAG_ROUGH
        );
  };
  mat.needsUpdate = true;
  registerScaled(stuccoUniforms.uStucco, 1);
  registerRecompile(mat);
  return mat;
}
