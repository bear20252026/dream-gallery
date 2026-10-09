// ending-audio.js — 结局线的剧情机制音(2026-10-09 自 ending-journey.js 切出,逐字迁移)
// 水声导航 + 水滴 + 会笑的小铃铛。av-switch 'story' 豁免;自持 AudioContext 状态。
// 纯叶子:无 DOM、无场景依赖;trunk 经 isWaterActive() 查水声是否在响(原 `if (water)`)。
import { avAllowed } from '../core/av-switch.js';

let ac = null;
let water = null;
let bellTimer = null;

function audio() {
  if (!avAllowed('story')) return null;
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  } catch (e) {
    return null;
  }
}
export function startWater() {
  const a = audio();
  if (!a || water) return;
  try {
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.8;
    const g = a.createGain();
    g.gain.value = 0;
    const pan = a.createStereoPanner ? a.createStereoPanner() : null;
    src.connect(bp);
    bp.connect(g);
    if (pan) {
      g.connect(pan);
      pan.connect(a.destination);
    } else g.connect(a.destination);
    src.start();
    water = { src, bp, g, pan };
  } catch (e) {
    water = null;
  }
}
export function setWater(level, clarity, pan) {
  if (!water || !ac) return;
  const t = ac.currentTime;
  water.g.gain.setTargetAtTime(level * (0.25 + 0.75 * clarity) * 0.18, t, 0.25);
  if (water.pan) water.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.2);
  water.bp.frequency.setTargetAtTime(450 + clarity * 800, t, 0.4);
}
export function stopWater() {
  if (!water || !ac) return;
  const w = water;
  water = null;
  try {
    w.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.4);
    setTimeout(() => {
      try {
        w.src.stop();
      } catch (e) {}
    }, 1600);
  } catch (e) {}
}
export function isWaterActive() {
  return !!water;
}
export function drip(level, pan) {
  const a = audio();
  if (!a) return;
  try {
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    const p = a.createStereoPanner ? a.createStereoPanner() : null;
    o.type = 'sine';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02 + level * 0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g);
    if (p) {
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(a.destination);
    } else g.connect(a.destination);
    o.start(t);
    o.stop(t + 0.35);
  } catch (e) {}
}
// 会笑的小铃铛:五声音阶高音区,随机轻响
const BELLS = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093];
export function bellOnce(gain) {
  const a = audio();
  if (!a) return;
  try {
    const t = a.currentTime;
    const f = BELLS[(Math.random() * BELLS.length) | 0];
    [1, 2.01].forEach((k, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sine';
      o.frequency.value = f * k;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((gain || 0.025) * (i ? 0.35 : 1), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(g);
      g.connect(a.destination);
      o.start(t);
      o.stop(t + 2.5);
    });
  } catch (e) {}
}
export function bellsOn(rateMs, gain) {
  bellsOff();
  const tick = () => {
    bellOnce(gain);
    bellTimer = setTimeout(tick, rateMs * (0.5 + Math.random()));
  };
  bellTimer = setTimeout(tick, 400);
}
export function bellsOff() {
  clearTimeout(bellTimer);
  bellTimer = null;
}
