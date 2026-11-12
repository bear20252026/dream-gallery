// sand-detail.js — 沙地程序化细节(2026-11-12 画质:治「地面像熔化塑料」)
//
// 病原先地形材质是裸 MeshStandardMaterial:顶点色只给大尺度色块,表面没有任何
// 微观纹理 ⇒ 最大面积的视觉表面是一整片光滑塑料,这是「代码感」的另一半来源
// (天空与粒子已修,地面是最后一块)。
//
// 本模块给 terrainMat 注入三层程序化细节(全在片元着色器里算,**零外部资产、
// 零新增 draw call、零新增灯光**):
//   ① 风成波痕:沿风向的正弦脊线 + 噪声扭曲,给沙面「被风吹过」的方向性;
//   ② 沙粒:低频值噪声调制反照率与粗糙度,去掉塑料高光;
//   ③ 云影:极慢漂移的大尺度明暗,让地面有「天光在动」的空气感。
//
// ⚠️ 注入方式照仓库先例 scene/paper-floor.js(onBeforeCompile 替换 #include):
//    · 世界坐标 varying 从 vertex 的 begin_vertex 后取(modelMatrix * transformed),
//      区块网格自带旋转,不能直接用 position 当世界坐标;
//    · 细节按**相机距离淡出**(35m 起、90m 归零),防止远处摩尔纹闪烁;
//    · 幅度克制(反照率 ±7% 左右),只去塑料感,不改大尺度配色。
// ⚠️ 无顶层副作用:attachSandDetail(mat) 由 terrain.js 调用,便于单测 import。

import * as THREE from 'three';

/** 细节强度总开关(0=关,1=满;供画质档/调试用) */
export const sandDetailUniforms = {
  uSandTime: { value: 0 },
  uSandDetail: { value: 1 },
};

const VERT_HEAD = `
varying vec3 vSandWorld;
`;
const VERT_BODY = `
vSandWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_HEAD = `
varying vec3 vSandWorld;
uniform float uSandTime;
uniform float uSandDetail;
float sandHash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float sandNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = sandHash(i), b = sandHash(i + vec2(1,0));
  float c = sandHash(i + vec2(0,1)), d = sandHash(i + vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
`;
// 反照率细节:波痕 + 沙粒 + 云影,乘在 vertexColor 之后、光照之前
const FRAG_COLOR = `
{
  vec2 wp = vSandWorld.xz;
  float camD = distance(cameraPosition, vSandWorld);
  float fade = (1.0 - smoothstep(35.0, 90.0, camD)) * uSandDetail;
  // ① 风成波痕:风向约 (0.8,0.6)。波长 ~0.9m(首版 1.7m 实测像灯芯绒布纹,
  //    收细 + 加强扭曲后才像沙脊);扭曲用两个尺度,脊线不机械平行
  float warp = sandNoise(wp * 0.5) * 3.5 + sandNoise(wp * 1.7) * 1.2;
  float ripple = sin(dot(wp, vec2(0.8, 0.6)) * 7.0 + warp);
  ripple = ripple * 0.5 + 0.5;
  // ② 沙粒:两个尺度的值噪声,去塑料高光
  float grain = sandNoise(wp * 2.1) * 0.6 + sandNoise(wp * 7.3) * 0.4;
  // ③ 云影:大尺度、极慢漂移
  float cloud = sandNoise(wp * 0.02 + vec2(uSandTime * 0.016, uSandTime * 0.010));
  float m = 1.0 + fade * (
      (ripple - 0.5) * 0.10
    + (grain - 0.5) * 0.12
    + (cloud - 0.5) * 0.16
  );
  diffuseColor.rgb *= m;
}
`;
// 粗糙度细节:波痕脊线略光滑、谷略糙,高光随纹理碎掉
const FRAG_ROUGH = `
{
  vec2 wp = vSandWorld.xz;
  float camD = distance(cameraPosition, vSandWorld);
  float fade = (1.0 - smoothstep(35.0, 90.0, camD)) * uSandDetail;
  // 与反照率段同一组波痕参数(两处必须一致,否则高光与纹理错位)
  float warp = sandNoise(wp * 0.5) * 3.5 + sandNoise(wp * 1.7) * 1.2;
  float ripple = sin(dot(wp, vec2(0.8, 0.6)) * 7.0 + warp) * 0.5 + 0.5;
  float grain = sandNoise(wp * 7.3);
  roughnessFactor = clamp(roughnessFactor + fade * ((ripple - 0.5) * 0.10 + (grain - 0.5) * 0.08), 0.0, 1.0);
}
`;

/**
 * 给地形材质注入沙地细节(就地改,幂等:重复调用不叠加)。
 * @param {THREE.MeshStandardMaterial} mat 地形共享材质
 * @returns {THREE.MeshStandardMaterial} 同一个材质
 */
export function attachSandDetail(mat) {
  if (!mat || mat.userData.sandDetail) return mat;
  mat.userData.sandDetail = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSandTime = sandDetailUniforms.uSandTime;
    shader.uniforms.uSandDetail = sandDetailUniforms.uSandDetail;
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
  // 注入后必须重编译,否则已编译程序不会带上新代码
  mat.needsUpdate = true;
  return mat;
}

/** 每帧推进云影时间(由 desert 的逐帧更新调用) */
export function tickSandDetail(time) {
  sandDetailUniforms.uSandTime.value = time;
}
