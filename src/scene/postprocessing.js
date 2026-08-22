// postprocessing.js — 后处理渲染管线(2026-08-22 大厂标准)
// Bloom + FXAA + ACES Tone Mapping
// 用法: import { initPostProcessing, renderPostProcessing } from './scene/postprocessing.js'
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

let composer = null;

/**
 * 初始化后处理管线
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @returns {EffectComposer}
 */
export function initPostProcessing(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());

  composer = new EffectComposer(renderer);

  // 1. 基础渲染
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. Bloom(辉光): 钻石灯/风铃/灵蕴光柱
  //    threshold=0.8: 只有高亮区域发光; strength=0.3: 柔和不刺眼; radius=0.5: 中等扩散
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.3, // strength
    0.5, // radius
    0.8 // threshold
  );
  composer.addPass(bloomPass);

  // 3. FXAA(抗锯齿): 低成本后处理抗锯齿
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.set(1 / size.x, 1 / size.y);
  composer.addPass(fxaaPass);

  // 4. OutputPass: 色彩空间转换(sRGB) + Tone Mapping
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // 配置 Tone Mapping
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  return composer;
}

/**
 * 渲染一帧(替代 rnd.render)
 * @param {number} [dt] - 帧间隔(秒),预留
 */
export function renderPostProcessing(dt) {
  if (composer) {
    composer.render();
  }
}

/**
 * 窗口大小变化时调用
 * @param {number} width
 * @param {number} height
 */
export function resizePostProcessing(width, height) {
  if (composer) {
    composer.setSize(width, height);
    // 更新 FXAA 分辨率
    const fxaaPass = composer.passes.find((p) => p.uniforms && p.uniforms.resolution);
    if (fxaaPass) {
      fxaaPass.uniforms['resolution'].value.set(1 / width, 1 / height);
    }
  }
}

/**
 * 获取 composer 实例(调试用)
 */
export function getComposer() {
  return composer;
}
