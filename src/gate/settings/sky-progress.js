import { Z } from '../../shared/z-layers.mjs';
// sky-progress.js — 星图进度系统:星屑收集、里程碑、星图画布、选择对话框
// 2026-11-12 世界观统一:文案整体从「女娲补天」换成小王子语汇(点亮星星/写完这本书),
// 单一源在 shared/journey-voice.mjs。**机制一字未动**:算式、11 档阈值、存档键全部保留,
// 老玩家进度原样有效。文件名与导出名(skyApi/openSky/skyVal)不改 —— 它们是跨模块契约。
import { ctx } from '../../ctx.js';
import { qsBtn, byIdCanvas } from '../../shared/dom-typed.js'; // #sfStay / #sfLeave 是上面那段模板里的 <button>,#skyCv 是 <canvas>
import { scriptLang } from '../../shared/story-text.mjs';
import {
  JOURNEY_TITLE,
  JOURNEY_MILESTONES,
  JOURNEY_FULL,
  progressTitle,
  progressSub,
  progressStats,
  lineAt,
} from '../../shared/journey-voice.mjs';

/** 当前语言取文案(zh/en 成对,与全站 tt() 同口径) */
function L(pair) {
  return scriptLang() === 'en' ? pair.en : pair.zh;
}

// ===== 星图 100 制(算式与阈值保持原样,只换文案语义) =====
// 2026-09-04:一念接入——每写一念=星屑+5(零门槛参与,与上传照片同权重)
// ⚠️ quiz 项保留:答题门虽已搁置,但老存档里可能有历史答对数,去掉会让老玩家进度回退。
//    文案层不再提"答对的题"(journey-voice 的统计行只列上传/一念)。
function skyVal() {
  const q = ctx.store.num('quiz'),
    u = ctx.store.num('up'),
    w = ctx.store.num('wishN');
  return Math.min(q + u * 5 + w * 5, 100);
}

// 里程碑 11 档:屏幕中央大字 3 秒 + TTS 旁白(每档只触发一次);100% 后出选择对话框。
// 2026-11-12 世界观统一:文案搬到 shared/journey-voice.mjs(小王子语汇),**阈值与档位一字未改**。
// 表结构仍是 [阈值, 大字, 旁白];大字/旁白是 zh/en 成对对象,取用点经 L() 按当前语言取。
// 显式标注元组类型:不标会被推成 (number|object)[] 共享联合,checkSkyMs 的 `v >= m` 报 TS2365。
/** @type {Array<[number, {zh:string,en:string}, {zh:string,en:string}]>} */
const SKY_MS = JOURNEY_MILESTONES;

// 百分比逐条小文案(星图页进度条旁显示,不播语音)。文案源同上,按 val-1 索引。
// 用取值函数而不是数组常量:语言切换后无需重建表。
function skyLineAt(val) {
  return L(lineAt(val));
}

function showMs(big, tts, isFull) {
  const d = document.createElement('div');
  d.style.cssText =
    'position:fixed;inset:0;z-index:' +
    Z.veilFx +
    ';display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .5s';
  const inner = document.createElement('div');
  inner.style.cssText =
    'max-width:86vw;text-align:center;font-size:clamp(20px,5vw,34px);letter-spacing:3px;color:#ffe9c4;text-shadow:0 0 30px rgba(255,200,100,.6),0 2px 12px rgba(0,0,0,.8);line-height:1.8';
  inner.textContent = big;
  d.appendChild(inner);
  document.body.appendChild(d);
  requestAnimationFrame(() => {
    d.style.opacity = '1';
  });
  ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak(tts);
  setTimeout(() => {
    d.style.opacity = '0';
    setTimeout(() => {
      d.remove();
      if (isFull) skyFullDialog();
    }, 600);
  }, 3000);
}

function skyFullDialog() {
  if (document.getElementById('skyFullDlg')) return;
  const d = document.createElement('div');
  d.id = 'skyFullDlg';
  d.style.cssText =
    'position:fixed;inset:0;z-index:' +
    Z.veilLock +
    ';display:flex;align-items:center;justify-content:center;background:rgba(12,6,12,.55)';
  d.innerHTML =
    '<div style="background:linear-gradient(160deg,rgba(38,22,34,.98),rgba(24,14,26,.98));border:1px solid rgba(255,214,170,.4);border-radius:18px;padding:24px 26px;text-align:center;color:#ffe9c4;max-width:88vw">' +
    '<div style="font-size:15px;letter-spacing:2px;line-height:2;margin-bottom:14px">' +
    (scriptLang() === 'en' ? 'The map is lit. What would you like to do next?' : '星图已亮。接下来，你想——') +
    '</div>' +
    '<button id="sfStay" style="padding:10px 18px;margin:0 6px;border:none;border-radius:12px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;cursor:pointer">留下继续布展</button>' +
    '<button id="sfLeave" style="padding:10px 18px;margin:0 6px;border:1px solid rgba(255,255,255,.3);border-radius:12px;background:transparent;color:#dcc;cursor:pointer">带着新的记忆回来看看</button></div>';
  document.body.appendChild(d);
  const sfApi = ctx.overlay.register(d, { touchOnly: true });
  qsBtn(d, '#sfStay').onclick = () => {
    sfApi.unregister();
    d.remove();
    ctx.ui.modeToast && ctx.ui.modeToast('B612谢过你。');
  };
  qsBtn(d, '#sfLeave').onclick = () => {
    sfApi.unregister();
    d.remove();
    ctx.ui.modeToast && ctx.ui.modeToast('B612留着你的光。');
  };
}

function checkSkyMs() {
  const v = skyVal(),
    had = ctx.store.num('skyMs');
  for (let i = SKY_MS.length - 1; i >= 0; i--) {
    const [m, big, tts] = SKY_MS[i];
    if (v >= m && had < m) {
      ctx.store.setNum('skyMs', m);
      showMs(L(big), L(tts), m === 100); // 双语对象按当前语言取(2026-11-12)
      if (m === 100 && ctx.scene.kintsugiOn) ctx.scene.kintsugiOn();
      // C4 星图圆满徽章(2026-11-12):进度达 100% 点亮。延后到里程碑大字/朗读之后,不抢戏。
      if (m === 100)
        setTimeout(() => ctx.ui.announceAchievements && ctx.ui.announceAchievements(), 5200);
      return;
    }
  }
}

ctx.kunlun.checkSkyMs = checkSkyMs;

// 金缮天花板(2026-07-28 C1):启动时已达成直接点亮
if ((ctx.store.num('skyMs') >= 100 || skyVal() >= 100) && ctx.scene.kintsugiOn)
  ctx.scene.kintsugiOn();

// ===== 天穹画布 =====
function drawSky() {
  const cv = byIdCanvas('skyCv');
  if (!cv) return;
  const c = cv.getContext('2d'),
    W = 150,
    R = 62,
    cx = 75,
    cy = 75;
  const val = skyVal(),
    ratio = Math.min(1, val / 100);
  c.clearRect(0, 0, W, W);
  let dg = c.createRadialGradient(cx - 14, cy - 16, 6, cx, cy, R);
  dg.addColorStop(0, '#2c2138');
  dg.addColorStop(1, '#120c1a');
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.fillStyle = dg;
  c.fill();
  if (ratio > 0) {
    c.save();
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    c.closePath();
    const g = c.createRadialGradient(cx, cy, 4, cx, cy, R);
    g.addColorStop(0, 'rgba(255,226,150,0.98)');
    g.addColorStop(0.7, 'rgba(238,178,70,0.72)');
    g.addColorStop(1, 'rgba(220,150,40,0.45)');
    c.fillStyle = g;
    c.shadowColor = 'rgba(255,200,100,0.75)';
    c.shadowBlur = 16;
    c.fill();
    c.restore();
    const ea = -Math.PI / 2 + Math.PI * 2 * ratio;
    c.beginPath();
    c.arc(cx, cy, R * 0.99, ea - 0.12, ea + 0.12);
    c.strokeStyle = 'rgba(255,244,210,0.9)';
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.stroke();
  }
  c.fillStyle = 'rgba(255,230,170,0.85)';
  for (let i = 0; i < 5; i++) {
    const a = i * 1.93 + 0.7,
      r2 = R * (0.36 + (0.5 * ((i * 37) % 10)) / 10);
    c.beginPath();
    c.arc(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, 1.4, 0, Math.PI * 2);
    c.fill();
  }
  c.lineCap = 'round';
  let a = 0.6;
  c.beginPath();
  c.moveTo(cx, cy);
  for (let r = 8; r < R; r += 9) {
    a += Math.sin(r * 3.7) * 0.5;
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  c.strokeStyle = 'rgba(216,179,108,0.35)';
  c.lineWidth = 4;
  c.stroke();
  c.strokeStyle = 'rgba(14,8,18,0.95)';
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.strokeStyle = 'rgba(216,179,108,0.55)';
  c.lineWidth = 1.5;
  c.stroke();
  c.beginPath();
  c.arc(cx, cy, R + 4, 0, Math.PI * 2);
  c.strokeStyle = 'rgba(216,179,108,0.18)';
  c.lineWidth = 1;
  c.stroke();
  c.beginPath();
  c.arc(cx, cy, R, -Math.PI / 2 - 0.9, -Math.PI / 2 - 0.3);
  c.strokeStyle = 'rgba(255,240,200,0.6)';
  c.lineWidth = 2.5;
  c.lineCap = 'round';
  c.stroke();
  // 2026-11-12 世界观统一:标题/副标题/小文案/统计行全部走 journey-voice 单一源。
  // 统计行不再列"答对选择题"——答题门已搁置,不描述玩家做不到的事(算式仍保留 quiz 项以兼容老档)。
  document.getElementById('skyTx').textContent = L(progressTitle(val));
  document.getElementById('skySub').textContent = L(progressSub(val));
  document.getElementById('skyLine').textContent = val >= 1 && val < 100 ? skyLineAt(val) : '';
  document.getElementById('skyStats').textContent = L(
    progressStats(ctx.store.num('up'), ctx.store.num('wishN'))
  );
  document.getElementById('skyFull').style.display = val >= 100 ? 'block' : 'none';
}

// ===== 天穹独立三级页 =====
const skyOv = document.createElement('div');
skyOv.id = 'skyOv';
skyOv.style.cssText =
  'position:fixed;inset:0;z-index:' +
  Z.skyProgress +
  ';display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
const skyCard = document.createElement('div');
skyCard.style.cssText =
  'width:min(380px,92vw);max-height:82vh;overflow-y:auto;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:18px;color:#fff;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.55)';
skyCard.innerHTML =
  '<div style="display:flex;align-items:center;margin-bottom:4px"><b style="letter-spacing:2px;font-size:15px" id="skyPageTitle">' +
  L(JOURNEY_TITLE) +
  '</b><span id="skyX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px">✕</span></div>';
skyOv.appendChild(skyCard);
document.body.appendChild(skyOv);
export const skyApi = ctx.overlay.register(skyOv, { x: '#skyX' });
export function openSky() {
  skyApi.open();
  // skyBox 由 settings.js 动态创建，需在 openSky 时获取（模块顶层获取为 null）
  const skyBoxEl = document.getElementById('skyBox');
  if (!skyBoxEl) return;
  skyBoxEl.style.display = 'block';
  skyBoxEl.style.marginTop = '0';
  skyCard.appendChild(skyBoxEl);
  drawSky();
}
