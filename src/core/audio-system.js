// core/audio-system.js — 3D 空间音频积木(阶段2 垂直切片,2026-08-28)
// 取代旧 spatial-audio.js:不再往冻结的 ctx.scene / ctx.media 写属性,改为经 deps 注入。
// 依赖:scene(THREE.Scene, 可选)、getCamera()(返回当前相机 Object3D)、eventBus。
// 每帧 panner 位置更新收进 update(dt),不再用 ctx.onTick。
// 旧消费者(windchime.js)经 module 级 getAudioSystem() 桥接,阶段3 迁移时摘除。
import * as THREE from 'three';
import { defineSystem, LAYERS, PHASES } from './system.js';

// module 级单例:旧代码桥接用(阶段3 迁完即删)
let _api = null;
export function getAudioSystem() {
  return _api;
}

export function createAudioSystem(deps = {}) {
  const { eventBus } = deps;
  const getCamera = deps.getCamera || (() => (deps.camera || null));

  /** @type {THREE.AudioListener|null} */
  let listener = null;
  /** @type {Map<string, THREE.PositionalAudio>} */
  const sources = new Map();
  // 每帧需更新的 Web Audio 空间节点(由 createSpatialWebAudioNode 注册)
  const webNodes = [];
  const _tmpVec3 = new THREE.Vector3();

  function ensureListener() {
    if (listener) return listener;
    listener = new THREE.AudioListener();
    attachListener();
    return listener;
  }

  // 相机可能在 init 时尚未就绪,update 每帧尝试挂载一次,挂上即止
  function attachListener() {
    if (!listener || listener.parent) return;
    const cam = getCamera();
    if (cam) cam.add(listener);
  }

  function getListener() {
    return listener;
  }

  function createPositionalAudio(parent, opts = {}) {
    if (!listener) {
      console.warn('[audio-system] AudioListener 未初始化');
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

  async function loadAudio(pa, url) {
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
          console.warn('[audio-system] 加载失败:', url, err);
          reject(err);
        }
      );
    });
  }

  function createFromMediaElement(parent, audioEl, opts = {}) {
    if (!listener) {
      console.warn('[audio-system] AudioListener 未初始化');
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

  function getSource(id) {
    return sources.get(id);
  }

  function removeSource(id) {
    const pa = sources.get(id);
    if (!pa) return;
    pa.stop();
    if (pa.parent) pa.parent.remove(pa);
    pa.disconnect();
    sources.delete(id);
  }

  function setGlobalParams(params) {
    for (const pa of sources.values()) {
      if (params.refDistance != null) pa.setRefDistance(params.refDistance);
      if (params.maxDistance != null) pa.setMaxDistance(params.maxDistance);
      if (params.rolloffFactor != null) pa.setRolloffFactor(params.rolloffFactor);
    }
  }

  function createSpatialWebAudioNode(parent, opts = {}) {
    if (!listener) {
      console.warn('[audio-system] AudioListener 未初始化');
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

    const node = {
      panner,
      context: ac,
      connect(nodeToConnect) {
        nodeToConnect.connect(panner);
      },
      dispose() {
        const i = webNodes.indexOf(node);
        if (i >= 0) webNodes.splice(i, 1);
        panner.disconnect();
      },
    };
    webNodes.push({ parent, panner, ac, dispose: node.dispose });
    return node;
  }

  const api = {
    init: ensureListener,
    getListener,
    create: createPositionalAudio,
    load: loadAudio,
    createFromMediaElement,
    createSpatialWebAudioNode,
    getSource,
    removeSource,
    setGlobalParams,
  };

  function init() {
    ensureListener();
    _api = api;
    eventBus && eventBus.emit('audio:ready', { listener });
  }

  function update() {
    // 相机就绪后挂载监听;之后每帧刷新 Web Audio 空间节点位置
    attachListener();
    const ac = listener && listener.context;
    if (!ac) return;
    for (const n of webNodes) {
      if (!n.parent) continue;
      const wp = n.parent.getWorldPosition(_tmpVec3);
      n.panner.positionX.setValueAtTime(wp.x, ac.currentTime);
      n.panner.positionY.setValueAtTime(wp.y, ac.currentTime);
      n.panner.positionZ.setValueAtTime(wp.z, ac.currentTime);
    }
  }

  function dispose() {
    for (const n of webNodes) n.dispose && n.dispose();
    webNodes.length = 0;
    sources.clear();
    listener = null;
    _api = null;
  }

  return defineSystem({
    name: 'audio',
    layer: LAYERS.engine,
    phase: PHASES.animate,
    order: 0,
    deps,
    init,
    update,
    dispose,
  });
}
