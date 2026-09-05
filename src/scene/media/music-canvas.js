// music-canvas.js — 2D 音乐演奏器(棕色地板表面,触碰发声,五声音阶)
import * as THREE from 'three';
import { ctx } from '../../ctx.js';
// 惰性读取:scene.js 已在 main.js 第 6 行执行完毕,vault 已填充;
// 不做顶层解构,在函数体内读 ctx.scene.*,防御打包器重排。

// 创建与地板对齐的Canvas纹理
const mcCanvas = document.createElement('canvas');
mcCanvas.width = 1024;
mcCanvas.height = 1024;
const mcCtx = mcCanvas.getContext('2d');
mcCtx.clearRect(0, 0, 1024, 1024);
const mcTex = new THREE.CanvasTexture(mcCanvas);
mcTex.minFilter = THREE.LinearFilter;
const mcPlaneMat = new THREE.MeshBasicMaterial({
  map: mcTex,
  transparent: true,
  opacity: 1.0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
let mcPlane = null;
setTimeout(function () {
  mcPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(ctx.scene.bW * 0.97, ctx.scene.bD * 0.97),
    mcPlaneMat
  );
  mcPlane.rotation.x = -Math.PI / 2;
  mcPlane.position.y = 0.04;
  mcPlane.position.z = (ctx.scene.OT + ctx.scene.OBR) / 2;
  ctx.scene.s.add(mcPlane);
});

// 音乐演奏器状态
let mxCtx = null,
  mxGain = null,
  mxAnalyser = null,
  mxReverb = null;
let musicActive = false,
  mxNotes = new Map();
const PENTA_C = [0, 2, 4, 7, 9];
let mxQuantize = true,
  mxRoot = 48;

function initMusicAudio() {
  if (mxCtx) return;
  mxCtx = new (window.AudioContext || window.webkitAudioContext)();
  mxGain = mxCtx.createGain();
  mxGain.gain.value = 0.3;
  mxAnalyser = mxCtx.createAnalyser();
  mxAnalyser.fftSize = 2048;
  mxReverb = createMusicReverb();
  mxGain.connect(mxReverb);
  mxReverb.connect(mxAnalyser);
  mxAnalyser.connect(mxCtx.destination);
}
function createMusicReverb() {
  const len = mxCtx.sampleRate * 1.5;
  const impulse = mxCtx.createBuffer(2, len, mxCtx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  const conv = mxCtx.createConvolver();
  conv.buffer = impulse;
  const dry = mxCtx.createGain();
  dry.gain.value = 0.6;
  const wet = mxCtx.createGain();
  wet.gain.value = 0.4;
  const out = mxCtx.createGain();
  out.connect(dry);
  out.connect(wet);
  wet.connect(conv);
  conv.connect(out);
  dry.connect(out);
  return out;
}
function quantizeNote(freq) {
  if (!mxQuantize) return freq;
  const note = Math.round(69 + 12 * Math.log2(freq / 440));
  const oct = Math.floor((note - mxRoot) / 12) * 12 + mxRoot;
  const deg = (note - oct + 12) % 12;
  let closest = 0,
    minD = 99;
  for (const s of PENTA_C) {
    const d = Math.abs(s - deg);
    if (d < minD) {
      minD = d;
      closest = s;
    }
  }
  return 440 * Math.pow(2, (oct + closest - 69) / 12);
}
function getNoteName(f) {
  const n = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return n[((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12];
}
function startMusicNote(ux, uy) {
  initMusicAudio();
  const freq = quantizeNote(130.81 * Math.pow(2, ux * 4));
  const vol = Math.max(0.1, 1 - uy);
  const osc = mxCtx.createOscillator();
  const g = mxCtx.createGain();
  const f2 = mxCtx.createOscillator();
  const g2 = mxCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  f2.type = 'sine';
  f2.frequency.value = freq * 2;
  g2.gain.value = 0.15;
  g.gain.value = 0;
  if (Number.isFinite(mxCtx.currentTime))
    g.gain.linearRampToValueAtTime(vol, mxCtx.currentTime + 0.02);
  osc.connect(g);
  f2.connect(g2);
  g2.connect(g);
  g.connect(mxGain);
  osc.start();
  f2.start();
  const id = Date.now() + Math.random();
  mxNotes.set(id, { osc, f2, g, vol, freq, ux, uy, t: Date.now() });
  musicActive = true;
  return id;
}
function updateMusicNote(id, ux, uy) {
  const v = mxNotes.get(id);
  if (!v) return;
  v.freq = quantizeNote(130.81 * Math.pow(2, ux * 4));
  v.vol = Math.max(0.1, 1 - uy);
  v.osc.frequency.setTargetAtTime(v.freq, mxCtx.currentTime, 0.05);
  v.f2.frequency.setTargetAtTime(v.freq * 2, mxCtx.currentTime, 0.05);
  v.g.gain.setTargetAtTime(v.vol * 0.3, mxCtx.currentTime, 0.03);
  v.ux = ux;
  v.uy = uy;
}
function stopMusicNote(id) {
  const v = mxNotes.get(id);
  if (!v) return;
  if (Number.isFinite(mxCtx.currentTime))
    v.g.gain.linearRampToValueAtTime(0, mxCtx.currentTime + 0.3);
  setTimeout(() => {
    try {
      v.osc.stop();
      v.f2.stop();
    } catch (e) {}
  }, 350);
  mxNotes.delete(id);
  if (mxNotes.size === 0) musicActive = false;
}

// 绘制音乐网格到Canvas
let mxHueShift = 0;
let mxIdleFrames = 0;
let mxFFT = null;
export function drawMusicCanvas() {
  if (mxNotes.size === 0 && !musicActive) {
    if (mxIdleFrames > 60) return;
    mxIdleFrames++;
  } else mxIdleFrames = 0;
  const W = 1024,
    H = 1024,
    c = mcCtx;
  c.fillStyle = 'rgba(0,0,0,0.08)';
  c.fillRect(0, 0, W, H);
  mxHueShift += 0.3;
  for (let i = 0; i <= 24; i++) {
    const y = H * (i / 24);
    c.strokeStyle = `hsla(${(i * 15 + mxHueShift) % 360},60%,50%,0.15)`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  mxNotes.forEach((v, k) => {
    const x = v.ux * W,
      y = v.uy * H;
    const hue = (Math.log2(v.freq / 130.81) * 30 + mxHueShift) % 360;
    c.beginPath();
    c.arc(x, y, 18 + Math.sin(Date.now() * 0.005 + k) * 3, 0, Math.PI * 2);
    const g = c.createRadialGradient(x, y, 0, x, y, 25);
    g.addColorStop(0, `hsla(${hue},80%,70%,0.6)`);
    g.addColorStop(1, `hsla(${hue},80%,50%,0)`);
    c.fillStyle = g;
    c.fill();
    c.beginPath();
    c.arc(x, y, 6, 0, Math.PI * 2);
    c.fillStyle = `hsla(${hue},90%,85%,0.9)`;
    c.fill();
    c.fillStyle = `hsla(${hue},70%,80%,0.8)`;
    c.font = '14px sans-serif';
    c.textAlign = 'center';
    c.fillText(getNoteName(v.freq), x, y - 22);
  });
  if (musicActive && mxAnalyser) {
    if (!mxFFT) mxFFT = new Uint8Array(mxAnalyser.frequencyBinCount);
    const data = mxFFT;
    mxAnalyser.getByteFrequencyData(data);
    const barW = W / 64;
    for (let i = 0; i < 64; i++) {
      const h = (data[i * 4] / 255) * 80;
      const hue = (i * 5 + mxHueShift) % 360;
      c.fillStyle = `hsla(${hue},70%,60%,0.4)`;
      c.fillRect(i * barW, H - h, barW - 2, h);
    }
  }
  mcTex.needsUpdate = true;
}

// 点击音乐平面
const mxTouches = new Map();
function onMusicClick(cx, cy, isStart) {
  // 多世界切割(2026-09-06):音乐平面属主世界,小世界里不再隔空发声
  if ((ctx.scene.activeWorld || 'main') !== 'main') return false;
  if (!mcPlane) return;
  const { cam, ray, mP2 } = ctx.scene;
  mP2.x = (cx / innerWidth) * 2 - 1;
  mP2.y = -(cy / innerHeight) * 2 + 1;
  ray.setFromCamera(mP2, cam);
  const hits = ray.intersectObject(mcPlane);
  if (hits.length === 0) return false;
  const uv = hits[0].uv;
  const ux = uv.x,
    uy = 1 - uv.y;
  if (isStart) {
    const id = startMusicNote(ux, uy);
    mxTouches.set(cx + '_' + cy, id);
    if (!onMusicClick.greeted) {
      onMusicClick.greeted = true;
      ctx.ui.modeToast && ctx.ui.modeToast('昆仑会唱歌。你听到了吗？');
    }
    return id;
  } else {
    mxNotes.forEach((v, k) => {
      if (Math.abs(v.ux - ux) < 0.1 && Math.abs(v.uy - uy) < 0.1) {
        updateMusicNote(k, ux, uy);
      }
    });
  }
  return true;
}
function onMusicUp(cx, cy) {
  const key = cx + '_' + cy;
  const id = mxTouches.get(key);
  if (id) {
    stopMusicNote(id);
    mxTouches.delete(key);
  }
  mxNotes.forEach((v, k) => stopMusicNote(k));
  mxTouches.clear();
}

// 触摸事件
document.addEventListener(
  'touchstart',
  (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      onMusicClick(t.clientX, t.clientY, true);
    }
  },
  { passive: false, capture: true }
);
document.addEventListener(
  'touchmove',
  (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      onMusicClick(t.clientX, t.clientY, false);
    }
  },
  { passive: false }
);
document.addEventListener('touchend', (e) => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    onMusicUp(t.clientX, t.clientY);
  }
});

// 鼠标支持
let mxMouseId = null;
document.addEventListener(
  'mousedown',
  (e) => {
    if (e.button !== 0 || 'ontouchstart' in window) return;
    const id = onMusicClick(e.clientX, e.clientY, true);
    if (id) {
      mxMouseId = id;
      e.stopPropagation();
    }
  },
  true
);
document.addEventListener('mousemove', (e) => {
  if (mxMouseId !== null) onMusicClick(e.clientX, e.clientY, false);
});
document.addEventListener('mouseup', () => {
  if (mxMouseId !== null) {
    stopMusicNote(mxMouseId);
    mxMouseId = null;
  }
});

ctx.media.drawMusicCanvas = drawMusicCanvas;
