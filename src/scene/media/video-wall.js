// video-wall.js — 北墙视频墙 + 画廊音乐系统
// 设计原则：所有 Audio/Video 在用户首次交互时懒创建，序列严格事件驱动
//
// @module video-wall
// 导出到 ctx：
//   ctx.startVidSeq()   — 启动音视频序列（需用户手势）
//   ctx.media.vidEl     — 1号大屏视频元素
//   ctx.media.v45El     — 4/5号小屏视频元素
//   ctx.media.vidMesh   — 1号大屏网格
//   ctx.media.v45Mesh   — 4/5号小屏网格
//
// 序列流程（async/await 线性）：
//   playMusic(0,0) → playVideo(V1) → playMusic(1,2) → playVideo(V2) → playVideo(V3) → for V45 playVideo → loop
import * as THREE from 'three';
import { ctx } from '../../ctx.js';

/**
 * CDN 根路径。音频和视频统一从 R2 加载。
 * @constant {string}
 */
const CDN = 'https://cdn.cloudbear.cloud/';

// ===================== 视频源 =====================
/**
 * 主屏视频列表（1号/2号/3号HLS）
 * @type {{src:string, x:number, y:number, z:number, sx:number, mesh3:boolean, plays:number}[]}
 */
const VID_ALL = [
  {
    src: CDN + 'videos/户外大屏/户外大屏1号.mp4',
    x: 67.51,
    y: 46.6,
    z: 15.97,
    sx: 2.5,
    mesh3: false,
    plays: 1,
  },
  {
    src: CDN + 'videos/户外大屏/户外大屏2号.mp4',
    x: 67.51,
    y: 46.6,
    z: 15.97,
    sx: 2.5,
    mesh3: false,
    plays: 2,
  },
  {
    src: CDN + 'videos/户外大屏/hls/户外大屏3号.m3u8',
    x: -0.67,
    y: 46.6,
    z: 99.99,
    sx: 1,
    mesh3: true,
    plays: 1,
  },
];
const V45 = [
  { src: CDN + 'videos/户外大屏/户外大屏4号.mp4', x: 0.58, y: 46.6, z: -100.02, sx: 2.5, plays: 1 },
  { src: CDN + 'videos/户外大屏/户外大屏5号.mp4', x: 0.58, y: 46.6, z: -100.02, sx: 2.5, plays: 2 },
];

// ===================== 视频 DOM 元素（创建时无 src，避免自动加载） =====================
const vidEl = document.createElement('video');
vidEl.loop = false;
vidEl.crossOrigin = 'anonymous';
vidEl.playsInline = true;
vidEl.setAttribute('webkit-playsinline', 'true');
vidEl.preload = 'none'; // 不自动加载，用户交互后才加载

const vidTex = new THREE.VideoTexture(vidEl);
vidTex.colorSpace = THREE.SRGBColorSpace;
const vidMat = new THREE.MeshBasicMaterial({
  map: vidTex,
  side: THREE.FrontSide,
  toneMapped: false,
});

function vidUpright2(mesh) {
  const back = new THREE.Mesh(mesh.geometry, vidMat);
  back.rotation.y = Math.PI;
  mesh.add(back);
}

const vidMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 90), vidMat);
vidMesh.position.set(67.51, 46.6, 15.97);
vidMesh.rotation.y = Math.PI * 1.5;
vidMesh.visible = true;
const vidMesh3 = new THREE.Mesh(new THREE.PlaneGeometry(60, 90), vidMat);
vidMesh3.position.set(-0.67, 46.6, 99.99);
vidMesh3.rotation.y = Math.PI;
vidMesh3.scale.x = 2.8;
vidMesh3.visible = false;
vidUpright2(vidMesh);
vidUpright2(vidMesh3);

const v45El = document.createElement('video');
v45El.loop = false;
v45El.crossOrigin = 'anonymous';
v45El.playsInline = true;
v45El.setAttribute('webkit-playsinline', 'true');
v45El.preload = 'none';

const v45Tex = new THREE.VideoTexture(v45El);
v45Tex.colorSpace = THREE.SRGBColorSpace;
const v45Mat = new THREE.MeshBasicMaterial({
  map: v45Tex,
  side: THREE.FrontSide,
  toneMapped: false,
});
const v45Mesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 90), v45Mat);
v45Mesh.position.set(0.58, 46.6, -100.02);
v45Mesh.rotation.y = 0;
v45Mesh.scale.x = 2.5;
v45Mesh.visible = false;
(function () {
  const back = new THREE.Mesh(v45Mesh.geometry, v45Mat);
  back.rotation.y = Math.PI;
  v45Mesh.add(back);
})();

// ===================== 场景挂载（延迟到 scene 就绪） =====================
setTimeout(function () {
  if (!ctx.scene.s) return;
  // 视频1/2/3
  ctx.scene.s.add(vidMesh);
  ctx.scene.s.add(vidMesh3);
  const vL1 = new THREE.PointLight('#ff69b4', 8, 30, 1.5);
  vL1.position.set(67.51, 90.6, 16.47);
  ctx.scene.s.add(vL1);
  const vL2 = new THREE.PointLight('#ff69b4', 8, 30, 1.5);
  vL2.position.set(67.51, 2.6, 16.47);
  ctx.scene.s.add(vL2);
  // 视频4/5
  ctx.scene.s.add(v45Mesh);
  const v45L1 = new THREE.PointLight('#ff69b4', 10, 40, 1.5);
  v45L1.position.set(0.58, 90.6, -99.52);
  ctx.scene.s.add(v45L1);
  const v45L2 = new THREE.PointLight('#ff69b4', 10, 40, 1.5);
  v45L2.position.set(0.58, 2.6, -99.52);
  ctx.scene.s.add(v45L2);
  // 标记星
  const starG = new THREE.OctahedronGeometry(1.5, 0);
  const starM = new THREE.MeshStandardMaterial({
    color: '#ffd700',
    emissive: '#ffaa00',
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.9,
  });
  const starMesh = new THREE.Mesh(starG, starM);
  starMesh.position.set(67.51, 56.6, 35.97);
  ctx.scene.s.add(starMesh);
  const starL = new THREE.PointLight('#ffd700', 6, 20, 1.5);
  starL.position.set(67.51, 56.6, 35.97);
  ctx.scene.s.add(starL);
  ctx.onTick(function () {
    starMesh.rotation.y += 0.02;
    starMesh.rotation.x += 0.01;
  });
}, 0);

vidMesh.userData = { isVideoWall: true };
v45Mesh.userData = { isVideo45: true };

// ===================== 播放序列控制器 =====================
let mi = 0; // 音乐索引（playMusic 内部使用）
let mAud = null; // 懒创建
let sequenceStarted = false;
let sequenceTriggered = false;

const MQ = [CDN + 'music/00002.m4a', CDN + 'music/00003.m4a', CDN + 'music/00004.m4a'];

function _getMAud() {
  if (!mAud) {
    mAud = new Audio();
    mAud.volume = 0.5;
  }
  return mAud;
}

/**
 * 播放指定区间的音频曲目。返回 Promise 在全部播完后 resolve。
 * 用 currentTime 500ms 轮询检测真实播放，10s 超时自动跳过。
 * @param {number} startIdx - MQ 起始索引
 * @param {number} endIdx - MQ 结束索引（含）
 * @returns {Promise<void>}
 */
function playMusic(startIdx, endIdx) {
  return new Promise(function (resolve) {
    var a = _getMAud();
    if (a._mEndedFn) {
      a.removeEventListener('ended', a._mEndedFn);
      a._mEndedFn = null;
    }
    if (a._mPollId) {
      clearInterval(a._mPollId);
      a._mPollId = null;
    }
    mi = startIdx;
    var segEnd = endIdx + 1;
    var playing = false;

    function nextTrack() {
      if (a._mPollId) {
        clearInterval(a._mPollId);
        a._mPollId = null;
      }
      a.pause();
      mi++;
      if (mi >= segEnd) {
        a.removeEventListener('ended', a._mEndedFn);
        a._mEndedFn = null;
        resolve(); // ← 所有曲目播完，Promise resolve
        return;
      }
      startPlayback();
    }

    function startPlayback() {
      a.pause();
      a.src = MQ[mi];
      playing = false;
      var deadline = Date.now() + 10000;
      if (a._mPollId) clearInterval(a._mPollId);
      a._mPollId = setInterval(function () {
        if (a.currentTime > 0.1) {
          playing = true;
          clearInterval(a._mPollId);
          a._mPollId = null;
        } else if (Date.now() > deadline && !playing) {
          clearInterval(a._mPollId);
          a._mPollId = null;
          console.warn('[music] 超时跳过:', a.src);
          nextTrack();
        }
      }, 500);
      a.play().catch(function (e) {
        console.warn('[music] play():', e.name);
      });
    }

    a._mEndedFn = nextTrack;
    a.addEventListener('ended', nextTrack);
    startPlayback();
  }).then(function () {
    ctx.events.emit('music:ended', { startIdx, endIdx });
  });
}

/**
 * 播放单个视频，返回 Promise 在视频结束后 resolve。
 * 保持静音播放（浏览器限制），20s 超时兜底。
 * @param {HTMLVideoElement} el - 视频元素
 * @param {string} src - 视频 CDN URL
 * @returns {Promise<void>}
 */
function playVideo(el, src) {
  return new Promise(function (resolve) {
    el.pause();
    el.muted = true;
    el.src = src;
    el.load();
    var started = false;
    var dead = Date.now() + 20000;

    if (el._vEndedFn) {
      el.removeEventListener('ended', el._vEndedFn);
      el._vEndedFn = null;
    }
    if (el._vPollId) {
      clearInterval(el._vPollId);
      el._vPollId = null;
    }

    function onEnd() {
      if (el._vPollId) {
        clearInterval(el._vPollId);
        el._vPollId = null;
      }
      el.pause();
      el.removeEventListener('ended', el._vEndedFn);
      el._vEndedFn = null;
      ctx.events.emit('video:ended', { src: src.substring(src.lastIndexOf('/') + 1) });
      resolve(); // ← 视频播完，Promise resolve
    }

    el._vEndedFn = onEnd;
    el.addEventListener('ended', onEnd);

    var canPlayFn = function () {
      el.removeEventListener('canplaythrough', canPlayFn);
      el.play().catch(function (e) {
        console.warn('[video] play():', e.name);
        el.muted = true;
        el.play().catch(function () {});
      });
    };
    el.addEventListener('canplaythrough', canPlayFn);

    el._vPollId = setInterval(function () {
      if (el.currentTime > 0.1) started = true;
      if (Date.now() > dead && !started && el.paused) {
        clearInterval(el._vPollId);
        el._vPollId = null;
        console.warn('[video] 超时跳过:', el.src);
        onEnd();
      }
    }, 500);
  });
}

// ===================== 主序列(扁平 async/await) =====================
async function startSequence() {
  if (sequenceStarted) return;
  sequenceStarted = true;

  while (true) {
    // 步骤1: 00002.m4a
    await playMusic(0, 0);

    // 步骤2: video1
    vidMesh.visible = true;
    vidMesh3.visible = false;
    vidMesh.position.set(67.51, 46.6, 15.97);
    await playVideo(vidEl, VID_ALL[0].src);

    // 步骤3: 00003+00004
    await playMusic(1, 2);

    // 步骤4: video2
    vidMesh.visible = true;
    vidMesh.position.set(67.51, 46.6, 15.97);
    await playVideo(vidEl, VID_ALL[1].src);

    // 步骤5: video3 (HLS)
    vidMesh.visible = false;
    vidMesh3.visible = true;
    vidMesh3.position.set(-0.67, 46.6, 99.99);
    await playVideo(vidEl, VID_ALL[2].src);

    // 步骤6: video4/5
    v45Mesh.visible = true;
    for (var vi = 0; vi < V45.length; vi++) {
      await playVideo(v45El, V45[vi].src);
    }
  }
}

// ===================== 导出：等待用户首次交互启动序列 =====================
function retryMedia() {
  // 音频:初始状态未播 → 重试
  if (mAud && mAud.paused && mAud.currentTime === 0) {
    mAud.play().catch(function () {});
  }
  // 主视频:静音播放中但被浏览器静音 → 用户手势后开声
  if (vidEl.src && vidEl.muted && !vidEl.paused) {
    vidEl.muted = false;
    vidEl.volume = 0.5;
  }
  // 4/5号视频同理
  if (v45El.src && v45El.muted && !v45El.paused && v45Mesh.visible) {
    v45El.muted = false;
    v45El.volume = 0.5;
  }
}
function triggerSequence() {
  if (!sequenceTriggered) {
    sequenceTriggered = true;
    ctx.events.emit('gallery:ready');
    startSequence();
  } else {
    // 序列已启动但可能被拦截:用户交互时重试播放
    retryMedia();
  }
}

// 供 prologue.js 调用（在用户点"我愿意"后调用，确保在用户手势回调链内）
ctx.startVidSeq = triggerSequence;

// 用户点击页面兜底重试(仅序列已启动后生效;协议/序章阶段 sequenceTriggered=false 不触发)
document.addEventListener('click', function () {
  if (sequenceTriggered) retryMedia();
});
document.addEventListener('touchstart', function () {
  if (sequenceTriggered) retryMedia();
});

// ===================== 导出 DOM 到 ctx.media（供其他模块使用） =====================
Object.assign(ctx.media, { vidEl, vidTex, vidMesh, v45El, v45Tex, v45Mesh });
