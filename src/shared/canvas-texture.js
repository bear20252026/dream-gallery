// shared/canvas-texture.js — "离屏画布 → 绘制 → CanvasTexture" 统一工厂(2026-08-30 B1 架构整改)
// 原 gallery 四处(signs/mode/markers/paintings)各自手写
// createElement/width/height/getContext/new CanvasTexture 五步样板;现在只写绘制逻辑。
import * as THREE from 'three';

/**
 * 创建画布纹理
 * @param {number} w    画布宽 px
 * @param {number} h    画布高 px
 * @param {(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement) => void} draw 全部绘制逻辑(第 2 个实参就是这块画布本身,:17 实际会传)
 * @returns {THREE.CanvasTexture}
 */
export function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), cv);
  return new THREE.CanvasTexture(cv);
}
