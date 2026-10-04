// warp-fx.js — 世界切换「星流」过场(2026-10-04 主人反馈:跳转要有动画,不要黑屏)
// 取代 scene-manager 的 darkTeleport 黑幕:深蓝夜空里星星从中心向外拉成光丝,
// 到了再减速、淡出,露出新世界。目的地有名字时在中心浮现(「328 · 商人」)。
//
// 两种用法:
//   warpTransition(onMid, {label, color})  单次切换:淡入 → onMid(切世界)→ 淡出(scene-manager 用)
//   holdWarp({label,color}) / releaseWarp() 多跳旅行:先拉起并保持(期间 warpTransition 直接执行 onMid,
//                                            不再叠一层),全部到达后统一淡出(ui/world-travel.js 用)
// 零 three 依赖;一个 canvas,约 240 根光丝,手机也轻。
import { Z } from './z-layers.mjs';

let el = null,
  cv = null,
  g = null,
  raf = 0,
  stars = [],
  speed = 0, // 0..1 光丝速度
  alpha = 0, // 0..1 夜幕不透明度
  target = { speed: 0, alpha: 0 },
  held = 0,
  labelEl = null,
  tint = [232, 201, 138],
  last = 0,
  killTimer = 0;

const N = 240;

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function seed(s) {
  s.a = Math.random() * Math.PI * 2;
  s.d = Math.random() * 0.15 + 0.01; // 距中心(屏幕半对角线的比例)
  s.v = 0.6 + Math.random() * 0.8;
  s.w = Math.random() < 0.18 ? 1.8 : 1;
  s.gold = Math.random() < 0.35;
}
function ensure() {
  if (el) return;
  el = document.createElement('div');
  el.id = 'warpFx';
  el.style.cssText =
    'position:fixed;inset:0;z-index:' + Z.teleport + ';pointer-events:none;opacity:1';
  cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  labelEl = document.createElement('div');
  labelEl.style.cssText =
    'position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;color:#f4e8c8;' +
    'font:26px/1.4 "Kaiti SC","STKaiti","KaiTi",Georgia,serif;letter-spacing:4px;opacity:0;transition:opacity .5s;' +
    'text-shadow:0 0 18px #000a;padding:0 24px';
  el.append(cv, labelEl);
  document.body.appendChild(el);
  g = cv.getContext('2d');
  resize();
  stars = Array.from({ length: N }, () => {
    const s = {};
    seed(s);
    s.d = Math.random(); // 第一帧就铺满
    return s;
  });
  window.addEventListener('resize', resize);
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
function resize() {
  if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(window.innerWidth * dpr);
  cv.height = Math.round(window.innerHeight * dpr);
}
function teardown() {
  window.cancelAnimationFrame(raf);
  window.removeEventListener('resize', resize);
  el && el.remove();
  el = cv = g = labelEl = null;
  speed = alpha = 0;
}
function frame(now) {
  if (!g) return;
  // 夜幕/速度按真实时间缓动(低帧率设备也准时拉满);光丝位移另行封顶,防卡顿后一帧跳太远
  const dtRaw = Math.min(0.25, (now - last) / 1000);
  const dt = Math.min(0.05, dtRaw);
  last = now;
  // 朝目标值缓动(拉起快,收尾慢一点,像减速停靠)
  const k = target.alpha > alpha ? 7 : 3.2;
  alpha += (target.alpha - alpha) * Math.min(1, dtRaw * k);
  speed += (target.speed - speed) * Math.min(1, dtRaw * (target.speed > speed ? 4 : 2.6));
  const W = cv.width,
    H = cv.height,
    cx = W / 2,
    cy = H / 2,
    R = Math.hypot(cx, cy);
  g.clearRect(0, 0, W, H);
  // 夜幕:中心带一点目的地的颜色
  const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(
    0,
    `rgba(${(tint[0] * 0.28 + 20) | 0},${(tint[1] * 0.22 + 26) | 0},${(tint[2] * 0.3 + 48) | 0},${alpha})`
  );
  bg.addColorStop(0.55, `rgba(12,18,34,${alpha})`);
  bg.addColorStop(1, `rgba(5,7,14,${alpha})`);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // 光丝
  const sp = 0.05 + speed * 1.9;
  g.lineCap = 'round';
  for (const s of stars) {
    const prev = s.d;
    s.d += dt * sp * s.v * (0.25 + s.d * 1.6);
    if (s.d > 1.05) {
      seed(s);
      continue;
    }
    const tail = Math.max(prev - 0.002, s.d - (0.01 + speed * 0.16) * (0.4 + s.d));
    const ca = Math.cos(s.a),
      sa = Math.sin(s.a);
    const x1 = cx + ca * s.d * R,
      y1 = cy + sa * s.d * R,
      x0 = cx + ca * Math.max(0, tail) * R,
      y0 = cy + sa * Math.max(0, tail) * R;
    const op = Math.min(1, alpha * 1.4) * Math.min(1, s.d * 6);
    g.strokeStyle = s.gold
      ? `rgba(${tint[0]},${tint[1]},${tint[2]},${op})`
      : `rgba(255,250,236,${op})`;
    g.lineWidth = s.w * (cv.width / window.innerWidth) * (0.8 + speed * 0.9);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  if (target.alpha === 0 && alpha < 0.02) {
    teardown();
    return;
  }
  raf = requestAnimationFrame(frame);
}
let lockedLabel = null; // 旅行发起方锁定的最终目的地名(中途经停 B612 时不闪成「B612」)
let riseAt = 0;
function setLabel(label) {
  if (!labelEl) return;
  if (lockedLabel && label) label = lockedLabel;
  labelEl.textContent = label || '';
  labelEl.style.opacity = label ? '1' : '0';
}
function rise(opts) {
  clearTimeout(killTimer);
  ensure();
  const c = hexToRgb(opts && opts.color);
  if (c) tint = c;
  if (target.alpha !== 1) riseAt = performance.now();
  target = { speed: 1, alpha: 1 };
  setLabel(opts && opts.label);
}
function fall() {
  setLabel('');
  target = { speed: 0, alpha: 0 };
  // 兜底:标签页在后台时 rAF 不跑,不让遮罩永远挂着
  killTimer = setTimeout(() => {
    if (target.alpha === 0) teardown();
  }, 4000);
}

const RISE_MS = 420; // 夜幕拉满所需时间(之后才切世界,保证看不到切换那一帧)

/** 单次世界切换(scene-manager 调用)。被 holdWarp 托住时直接执行 onMid,不叠第二层 */
export function warpTransition(onMid, opts) {
  if (held > 0) {
    if (opts && opts.label) setLabel(opts.label);
    onMid && onMid();
    return;
  }
  rise(opts);
  setTimeout(() => {
    onMid && onMid();
    setTimeout(fall, 260);
  }, RISE_MS);
}

/** 多跳旅行:拉起并保持;返回 Promise,夜幕拉满后 resolve */
export function holdWarp(opts) {
  const already = held > 0;
  held++;
  if (!already) rise(opts);
  else if (opts && opts.label) setLabel(opts.label);
  // 按时间等夜幕拉满(多跳的下一跳通常已满,立即放行)
  const wait = Math.max(0, RISE_MS - (performance.now() - riseAt));
  return new Promise((r) => setTimeout(r, wait));
}
/** 旅行发起方锁定最终目的地名;传 null 解锁 */
export function lockWarpLabel(label) {
  lockedLabel = label || null;
  if (label) setLabel(label);
}
/** 结束多跳旅行:淡出(可延迟一点,让新世界先渲染一两帧) */
export function releaseWarp(delayMs = 300) {
  held = Math.max(0, held - 1);
  if (held > 0) return;
  setTimeout(() => {
    if (held === 0) fall();
  }, delayMs);
}
/** 探针 */
export function warpState() {
  return { on: !!el, held, alpha: +alpha.toFixed(2), speed: +speed.toFixed(2) };
}

/** 托住夜幕执行一次切换(scene-manager 用):拉满 → commit → 新世界渲染一两帧后淡出 */
export async function runWarp(commit, opts) {
  await holdWarp(opts);
  try {
    await commit();
  } finally {
    releaseWarp(320);
  }
}
