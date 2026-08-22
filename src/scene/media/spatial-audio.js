// spatial-audio.js — 3D 空间音频管理器
// 基于 Three.js AudioListener + PositionalAudio
// 实现距离衰减 + 左右声道定位
// 2026-08-22 P3-3 音频空间化
import * as THREE from 'three';
import { ctx } from '../../ctx.js';

/** @type {THREE.AudioListener|null} */
let listener = null;
/** @type {Map<string, THREE.PositionalAudio>} */
const sources = new Map();

/**
 * 初始化 AudioListener，挂载到相机
 * 应在 scene.js 创建相机后、main.js 启动循环前调用
 */
export function initSpatialAudio() {
  if (listener) return listener;
  listener = new THREE.AudioListener();
  // 相机可能尚未就绪，延迟挂载
  if (ctx.scene.cam) {
    ctx.scene.cam.add(listener);
  }
  // 每帧更新监听器位置（第三人称模式下相机位置不同于玩家位置）
  ctx.onTick(() => {
    if (!listener) return;
    // AudioListener 自动从父对象（相机）读取位置/朝向
    // 无需手动设置
  });
  return listener;
}

/**
 * 获取 AudioListener 实例
 * @returns {THREE.AudioListener|null}
 */
export function getListener() {
  return listener;
}

/**
 * 创建 PositionalAudio 并挂载到 3D 物体
 * @param {THREE.Object3D} parent - 挂载的 3D 物体
 * @param {Object} opts - 配置选项
 * @param {number} opts.refDistance - 参考距离（在此距离内音量不衰减，默认 5）
 * @param {number} opts.maxDistance - 最大距离（超过此距离音量为 0，默认 50）
 * @param {number} opts.rolloffFactor - 衰减因子（默认 1）
 * @param {string} opts.id - 音频源标识（用于后续控制）
 * @returns {THREE.PositionalAudio}
 */
export function createPositionalAudio(parent, opts = {}) {
  if (!listener) {
    console.warn('[spatial-audio] AudioListener 未初始化');
    return null;
  }
  const pa = new THREE.PositionalAudio(listener);
  pa.setRefDistance(opts.refDistance ?? 5);
  pa.setMaxDistance(opts.maxDistance ?? 50);
  pa.setRolloffFactor(opts.rolloffFactor ?? 1);
  pa.setDistanceModel('inverse');
  if (parent) parent.add(pa);
  if (opts.id) sources.set(opts.id, pa);
  return pa;
}

/**
 * 加载音频文件到 PositionalAudio
 * @param {THREE.PositionalAudio} pa - PositionalAudio 实例
 * @param {string} url - 音频文件 URL
 * @returns {Promise<void>}
 */
export async function loadAudio(pa, url) {
  const loader = new THREE.AudioLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (buffer) => {
        pa.setBuffer(buffer);
        resolve();
      },
      undefined,
      (err) => {
        console.warn('[spatial-audio] 加载失败:', url, err);
        reject(err);
      }
    );
  });
}

/**
 * 从 HTML5 Audio 创建 PositionalAudio（用于流式音频如 TTS）
 * 利用 THREE.Audio 的 setMediaElementSource 方法
 * @param {THREE.Object3D} parent - 挂载的 3D 物体
 * @param {HTMLAudioElement} audioEl - HTML5 Audio 元素
 * @param {Object} opts - 配置选项
 * @returns {THREE.PositionalAudio}
 */
export function createFromMediaElement(parent, audioEl, opts = {}) {
  if (!listener) {
    console.warn('[spatial-audio] AudioListener 未初始化');
    return null;
  }
  const pa = new THREE.PositionalAudio(listener);
  pa.setRefDistance(opts.refDistance ?? 5);
  pa.setMaxDistance(opts.maxDistance ?? 50);
  pa.setRolloffFactor(opts.rolloffFactor ?? 1);
  pa.setDistanceModel('inverse');
  pa.setMediaElementSource(audioEl);
  if (parent) parent.add(pa);
  if (opts.id) sources.set(opts.id, pa);
  return pa;
}

/**
 * 按 ID 获取已注册的 PositionalAudio
 * @param {string} id
 * @returns {THREE.PositionalAudio|undefined}
 */
export function getSource(id) {
  return sources.get(id);
}

/**
 * 移除并释放 PositionalAudio
 * @param {string} id
 */
export function removeSource(id) {
  const pa = sources.get(id);
  if (!pa) return;
  pa.stop();
  if (pa.parent) pa.parent.remove(pa);
  pa.disconnect();
  sources.delete(id);
}

/**
 * 设置全局距离模型参数
 * @param {Object} params
 * @param {number} params.refDistance
 * @param {number} params.maxDistance
 * @param {number} params.rolloffFactor
 */
export function setGlobalParams(params) {
  for (const pa of sources.values()) {
    if (params.refDistance != null) pa.setRefDistance(params.refDistance);
    if (params.maxDistance != null) pa.setMaxDistance(params.maxDistance);
    if (params.rolloffFactor != null) pa.setRolloffFactor(params.rolloffFactor);
  }
}

/**
 * 创建空间化的 Web Audio 节点链
 * 将 Web Audio API 的 OscillatorNode/GainNode 连接到 Three.js 的 PannerNode
 * 用于 windchime.js、fireplace.js 等使用 Web Audio API 合成的音效
 * @param {THREE.Object3D} parent - 挂载的 3D 物体
 * @param {Object} opts - 配置选项
 * @param {number} opts.refDistance - 参考距离（默认 8）
 * @param {number} opts.maxDistance - 最大距离（默认 30）
 * @returns {{ panner: PannerNode, context: AudioContext, connect: Function }|null}
 */
export function createSpatialWebAudioNode(parent, opts = {}) {
  if (!listener) {
    console.warn('[spatial-audio] AudioListener 未初始化');
    return null;
  }
  const ac = listener.context;
  const panner = ac.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = opts.refDistance ?? 8;
  panner.maxDistance = opts.maxDistance ?? 30;
  panner.rolloffFactor = 1;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 0;
  panner.coneOuterGain = 0;
  panner.connect(ac.destination);

  // 每帧更新 panner 位置（从 parent 的世界坐标）
  const stopTicker = ctx.onTick(() => {
    if (!parent) return;
    const wp = parent.getWorldPosition(_tmpVec3);
    panner.positionX.setValueAtTime(wp.x, ac.currentTime);
    panner.positionY.setValueAtTime(wp.y, ac.currentTime);
    panner.positionZ.setValueAtTime(wp.z, ac.currentTime);
  });

  return {
    panner,
    context: ac,
    /** 连接音频节点到 panner */
    connect(node) {
      node.connect(panner);
    },
    /** 断开并清理 */
    dispose() {
      stopTicker();
      panner.disconnect();
    },
  };
}

const _tmpVec3 = new THREE.Vector3();

// 导出到 ctx 供其他模块访问
export function exposeToCtx() {
  ctx.scene.listener = listener;
  ctx.media.spatialAudio = {
    init: initSpatialAudio,
    getListener,
    create: createPositionalAudio,
    load: loadAudio,
    createFromMediaElement,
    createSpatialWebAudioNode,
    getSource,
    removeSource,
    setGlobalParams,
  };
}
