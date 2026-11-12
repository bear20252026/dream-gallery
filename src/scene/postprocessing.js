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
  // ⚠️ 后处理必须按**物理缓冲尺寸**(CSS 尺寸 × pixelRatio)算,不能用 getSize() 的 CSS 像素。
  // 2026-11-12 画质修复:原先 FXAA 的 resolution 用 1/CSS宽,而实际缓冲是 CSS×dpr,
  // 采样步长错了一个 dpr 倍 ⇒ 抗锯齿失效、画面发虚(主人报「糊、锯齿、发虚」的直接原因之一)。
  const dpr = renderer.getPixelRatio();

  composer = new EffectComposer(renderer);
  // composer 自建 renderTarget 时按 renderer 当前 dpr,但**后续 setPixelRatio 不会自动跟随**;
  // 这里显式同步一次,并由 syncPostProcessingPixelRatio() 在画质档变化时再同步。
  composer.setPixelRatio(dpr);

  // 1. 基础渲染
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. Bloom(辉光): 钻石灯/风铃/灵蕴光柱
  //    threshold=0.8: 只有高亮区域发光; strength=0.3: 柔和不刺眼; radius=0.5: 中等扩散
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x * dpr, size.y * dpr),
    0.3, // strength
    0.5, // radius
    0.8 // threshold
  );
  composer.addPass(bloomPass);

  // 3. FXAA(抗锯齿): 低成本后处理抗锯齿。resolution 必须是**物理像素**的倒数。
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.set(1 / (size.x * dpr), 1 / (size.y * dpr));
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
  if (!composer) return;
  composer.setSize(width, height);
  // FXAA 分辨率按物理像素算(width/height 是 CSS 尺寸,需乘 composer 当前 dpr)
  const dpr = composer.getPixelRatio ? composer.getPixelRatio() : 1;
  const fxaaPass = composer.passes.find((p) => p.uniforms && p.uniforms.resolution);
  if (fxaaPass) {
    fxaaPass.uniforms['resolution'].value.set(1 / (width * dpr), 1 / (height * dpr));
  }
}

/**
 * 画质档变化时同步像素比(2026-11-12 画质修复)。
 * ⚠️ 必须有人调它:loop-manager 每次 rnd.setPixelRatio() 之后,composer 的 renderTarget
 * 仍停在旧 dpr ⇒ 后处理缓冲与画布分辨率错位,画面发虚/锯齿。这是原先「越降档越糊」的根因。
 * @param {number} dpr 渲染器新的 pixelRatio
 * @param {number} width CSS 宽
 * @param {number} height CSS 高
 */
export function syncPostProcessingPixelRatio(dpr, width, height) {
  if (!composer) return;
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);
  const fxaaPass = composer.passes.find((p) => p.uniforms && p.uniforms.resolution);
  if (fxaaPass) {
    fxaaPass.uniforms['resolution'].value.set(1 / (width * dpr), 1 / (height * dpr));
  }
}

/**
 * 氛围参数调节(2026-11-12 光效增强):暴露 Bloom 与曝光,供画质档/场景氛围调用。
 * 只改数值不改管线结构;低画质档可据此关掉 Bloom 省电。
 * @param {{bloomStrength?:number, bloomRadius?:number, bloomThreshold?:number, exposure?:number}} opts
 */
export function setAtmosphere(opts) {
  const o = opts || {};
  if (!composer) return;
  const bloom = composer.passes.find(
    (p) => p && p.strength !== undefined && p.radius !== undefined
  );
  if (bloom) {
    if (typeof o.bloomStrength === 'number') bloom.strength = o.bloomStrength;
    if (typeof o.bloomRadius === 'number') bloom.radius = o.bloomRadius;
    if (typeof o.bloomThreshold === 'number') bloom.threshold = o.bloomThreshold;
  }
  if (typeof o.exposure === 'number' && composer.renderer) {
    composer.renderer.toneMappingExposure = o.exposure;
  }
}

/**
 * 获取 composer 实例(调试用)
 */
export function getComposer() {
  return composer;
}
