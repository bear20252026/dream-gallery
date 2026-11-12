// particle-sprite.js — 沙漠粒子的柔和圆形贴图(2026-11-12 画质)
//
// 病根:沙漠所有 Points 用的 PointsMaterial **都没有 map**。Three.js 在无贴图时
// 把每个粒子画成一个**实心方块**(gl_PointCoord 全填),于是天空里飘着一堆米色方片、
// 星点是方的、光尘是方的 —— 这是「很强的代码感」最直接的视觉来源。
// 项目里 kunlun/letgo.js 早就用了径向渐变贴图的正确做法,沙漠这边一直没跟上。
//
// 本模块生成一张共享的径向渐变贴图,给沙漠各粒子系统复用:
//   · 一张贴图全站共享,不是每个系统各建一张(省显存)
//   · 边缘 alpha 平滑归零 ⇒ 粒子是柔和圆点,叠加时自然发亮而不是硬边方块
//
// ⚠️ 无顶层副作用:贴图在首次调用时才建(需要 document),便于单测 import。
// ⚠️ 只影响外观,不改粒子数量/尺寸/运动,零玩法回归风险。

import * as THREE from 'three';

/** 共享贴图缓存(整个沙漠只建一张) */
let shared = null;

/**
 * 取柔和圆点贴图(懒建、共享)。
 * @param {number} [size=64] 贴图边长(像素)
 * @returns {THREE.Texture|null} 无 document 环境返回 null(调用方需容忍)
 */
export function softDotTexture(size = 64) {
  if (shared) return shared;
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return null;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  // 中心实、外缘透明:0.55 处仍有 0.5 alpha ⇒ 圆点饱满但不糊
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.78)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  // 贴图只承载 alpha 形状,颜色由各材质 color 决定 ⇒ 保持线性,不做 sRGB 转换
  tex.needsUpdate = true;
  shared = tex;
  return tex;
}

/**
 * 给一个 PointsMaterial 挂上柔和圆点(就地改,不新建材质)。
 * @param {THREE.PointsMaterial} mat
 * @returns {THREE.PointsMaterial} 同一个材质,便于链式
 */
export function softenPoints(mat) {
  const tex = softDotTexture();
  if (tex && mat) {
    mat.map = tex;
    mat.alphaTest = 0.01; // 丢掉全透明外缘,避免透明排序把方块轮廓留下
    mat.needsUpdate = true;
  }
  return mat;
}
