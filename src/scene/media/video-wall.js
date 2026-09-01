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
// 序列流程（2026-09-01 主人定·串行交错版,async/await 线性,同一时刻只播一个）：
//   前 2 轮: 音1→屏1→音2→屏2→音3→屏3→屏4→屏5
//   第 3 轮起: 屏1→屏2→屏3→屏4→屏5 无限循环(音频永久停止)
//   音频播放能力见 gallery-audio.js(ctx.playGalleryAudio)
import * as THREE from 'three';
import { ctx } from '../../ctx.js';
import { onMediaChanged } from '../../media-push.js'; // 后台改大屏 → 重新拉配置(2026-08-29)

/**
 * CDN 根路径。音频和视频统一从 R2 加载。
 * @constant {string}
 */
const CDN = 'https://cdn.cloudbear.cloud/';

// ===================== 大屏配置(软编码,2026-08-29) =====================
// 由 /api/bigscreen 提供(服务端 gate_data.bigscreen,后台可上传/清空槽位)。
// 结构: { slot,label,group,file,src,x,y,z,sx,hls,plays } — src=CDN 完整 URL
let BIG = { main: [], v45: [] };

function reloadBigscreen() {
  return fetch('/api/bigscreen')
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d && d.ok && Array.isArray(d.slots)) {
        BIG.main = d.slots.filter(function (s) {
          return s.group === 'main';
        });
        BIG.v45 = d.slots.filter(function (s) {
          return s.group === 'v45';
        });
      }
    })
    .catch(function () {});
}
// 后台上传/清空大屏视频 → 立即重拉配置(下次循环生效)
onMediaChanged(function (d) {
  if (d && d.dir === 'videos') reloadBigscreen();
});
reloadBigscreen();

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
// 2026-09-01 串行交错版:音频由本序列统一调度(gallery-audio.js 提供播放能力),
// 音频/视频严格交替,同一时刻只播一个;不再并行双轨。
let sequenceStarted = false;
let sequenceTriggered = false;

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

// ===================== 主序列(扁平 async/await,大屏槽位软编码) =====================
// 仅视频轮播:大屏1→2→3→4→5,无限循环;空槽自动跳过
function slotSrc(arr, i) {
  return arr[i] && arr[i].src ? arr[i] : null;
}
async function playMainSlot(i) {
  const s = slotSrc(BIG.main, i);
  if (!s) return;
  if (s.hls) {
    vidMesh.visible = false;
    vidMesh3.visible = true;
    vidMesh3.position.set(s.x, s.y, s.z);
    await playVideo(vidEl, s.src);
  } else {
    vidMesh.visible = true;
    vidMesh3.visible = false;
    vidMesh.position.set(s.x, s.y, s.z);
    await playVideo(vidEl, s.src);
  }
}
async function playV45Slots() {
  for (const s of BIG.v45) {
    if (!s || !s.src) continue;
    v45Mesh.visible = true;
    await playVideo(v45El, s.src);
  }
}
async function startSequence() {
  if (sequenceStarted) return;
  sequenceStarted = true;
  await reloadBigscreen();

  // 阶段1协议配乐停掉 + 背景音乐暂停(进入串行序列,同一时刻只播一个)
  try {
    if (typeof ctx.stopAgreementMusic === 'function') ctx.stopAgreementMusic();
  } catch (e) {}
  try {
    const mA = ctx.media && ctx.media.mA;
    if (mA && !mA.paused) mA.pause();
  } catch (e) {}

  const audio =
    typeof ctx.playGalleryAudio === 'function'
      ? ctx.playGalleryAudio
      : function () {
          return Promise.resolve();
        };

  // 前 2 轮:音1→屏1→音2→屏2→音3→屏3→屏4→屏5(空槽自动跳过)
  for (let round = 0; round < 2; round++) {
    await audio(0); // 00010.aac
    await playMainSlot(0); // 大屏1号
    await audio(1); // 0009.aac
    await playMainSlot(1); // 大屏2号
    await audio(2); // 0008.aac
    await playMainSlot(2); // 大屏3号(HLS)
    await playV45Slots(); // 大屏4/5号
  }

  // 第 3 轮起:音频永久停止,仅视频 1→2→3→4→5 无限循环
  while (true) {
    await playMainSlot(0); // 大屏1号
    await playMainSlot(1); // 大屏2号
    await playMainSlot(2); // 大屏3号(HLS)
    await playV45Slots(); // 大屏4/5号
  }
}

// ===================== 导出：等待用户首次交互启动序列 =====================
function retryMedia() {
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
