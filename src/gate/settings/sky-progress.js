// sky-progress.js — 天穹进度系统:灵蕴收集、里程碑、天穹画布、选择对话框
import { ctx } from '../../ctx.js';

// ===== 天穹 100 制与里程碑文案系统(2026-07-26 主人定) =====
function skyVal() {
  const q = ctx.store.num('quiz'),
    u = ctx.store.num('up');
  return Math.min(q + u * 5, 100);
}

// 里程碑 11 档:屏幕中央大字 3 秒 + TTS 旁白(每档只触发一次);100% 后出选择对话框
const SKY_MS = [
  [5, '第一道裂痕的边缘，亮起了微光。', '第一道裂痕的边缘，亮起了微光。昆仑等这一刻，等了很久。'],
  [10, '天穹记住了你的声音。', '天穹记住了你的声音。你答对的每一道题，都在为它缝上第一针。'],
  [20, '第一缕天光，透了进来。', '第一缕天光，透了进来。你带来的灵蕴，已经开始修补这片天空。'],
  [35, '昆仑的山风，忽然温柔了。', '昆仑的山风，忽然温柔了。它认出了你——那个愿意凝视的人。'],
  [
    50,
    '裂痕收窄了一半。天穹记得你的每一幅画。',
    '裂痕收窄了一半。天穹记得你的每一幅画，也记得你每一次低头沉思的片刻。',
  ],
  [65, '残镜在回应你。你听见了吗？', '残镜在回应你。你听见了吗？那是三千年来的第一声回响。'],
  [
    80,
    '还差最后一块。你听见女娲的回音了吗？',
    '还差最后一块。你听见女娲的回音了吗？她说，她一直在等一个人，等一个愿意把记忆带上昆仑的人。',
  ],
  [90, '天穹即将合拢。最后十步。', '天穹即将合拢。最后十步。你走过的每一步，昆仑都替你记得。'],
  [95, '再挂一幅。就一幅。', '再挂一幅。就一幅。那片天，在等你把它补完。'],
  [
    98,
    '你几乎能触到那片完整的天了。',
    '你几乎能触到那片完整的天了。它就在你眼前，只差最后一丝灵蕴。',
  ],
  [
    100,
    '天穹已合。你做到了。',
    '天穹已合。你做到了。你带来的每一片灵蕴，都回到了它该在的地方。你答过的每一道题，都是你对天地的回答。你挂过的每一幅画，都是人间留给昆仑的证明。三千年了。你是第一个走完这条路的人。但昆仑不闭门。新的裂痕总会生出——新的记忆也在等你。你愿意回来吗，藏梦人？',
  ],
];

// 百分比逐条小文案(天穹页进度条旁显示,不播语音)
const SKY_LINES = [
  '第一片灵蕴归位。天穹轻轻动了一下。',
  '裂隙的边缘，有了温度。',
  '昆仑开始记得你了。',
  '女娲的碎片，正在醒来。',
  '第一道裂痕的边缘，亮起了微光。',
  '灵蕴在山巅汇聚。',
  '天穹在低声回应。',
  '你走过的每一步都算数。',
  '镜面泛起第一层光晕。',
  '天穹记住了你的声音。',
  '裂缝的边缘开始发光。',
  '第二片天光正在形成。',
  '残镜的镜面更亮了一寸。',
  '昆仑的风停了下来，在听。',
  '你答过的每一题都在天穹上留下一笔。',
  '灵蕴正在向裂痕汇聚。',
  '天穹的裂缝边缘有了金色。',
  '你挂的画在昆仑生了根。',
  '万镜画廊的灯，亮了一盏。',
  '第一缕天光，透了进来。',
  '天穹的呼吸变得均匀了。',
  '你上传的每一张照片都在发光。',
  '昆仑记住了你的雅号。',
  '灵蕴织入天隙的声音，像风穿过古琴。',
  '四分之一的裂痕已经愈合。',
  '西王母的残镜上，开始浮现你的名字。',
  '万镜画廊的千面镜，都在朝你的方向转动。',
  '你带来的灵蕴正在唤醒昆仑。',
  '天穹的脉动与你同步。',
  '裂痕收窄了一角。',
  '灵蕴之光照亮了第一片云。',
  '昆仑的山巅有了暖意。',
  '天柱的根基在稳固。',
  '你凝视过的每一幅画都在帮你。',
  '昆仑的山风，忽然温柔了。',
  '裂缝不再扩大。',
  '灵蕴之石的光，穿透了云层。',
  '万镜画廊的灯，亮了一半。',
  '天穹在轻声说你的名字。',
  '裂痕收窄了四成。',
  '你带来的记忆正在编织天序。',
  '昆仑的雪开始融化。',
  '天穹的裂痕边缘有了完整的金色。',
  '残镜的光从昆仑照到了人间。',
  '灵蕴的河流正在填满天隙。',
  '你挂的每一幅画都变成了一颗星。',
  '天穹的脉络重新接通。',
  '灵蕴已经覆盖了大半裂痕。',
  '只剩一半了。',
  '裂痕收窄了一半。天穹记得你的每一幅画。',
  '你答的每一题都是天衣的一针。',
  '灵蕴的节奏越来越快。',
  '天穹的裂缝在颤抖——是愈合的颤抖。',
  '万镜画廊的镜面映出了蓝天。',
  '灵蕴已经覆盖了天穹的一半以上。',
  '你在昆仑走过的路，已经开始发光。',
  '天穹裂痕的宽度在缩小。',
  '灵蕴的碎片正在彼此靠近。',
  '天穹的缝合线越来越密。',
  '六成。天穹记住了你的每一滴凝视。',
  '裂痕的边缘开始自行愈合。',
  '灵蕴的波纹正在天穹上扩散。',
  '万镜画廊的灯，亮了大半。',
  '天穹在为你让路。',
  '残镜在回应你。你听见了吗？',
  '灵蕴的流动变得顺畅。',
  '裂痕的深度在变浅。',
  '天穹的补丁正在融为一体。',
  '你在昆仑刻下的印记，正在发光。',
  '裂痕已经从天空退到了边缘。',
  '灵蕴的光芒越来越亮。',
  '天穹的呼吸变得轻盈。',
  '女娲的回音越来越近。',
  '灵蕴正在涌入最后一处缺口。',
  '四分之三的裂痕已经消失。',
  '天穹的脉络正在重建。',
  '灵蕴的河流即将汇入天海。',
  '你带来的记忆之光，正在缝合最后的天隙。',
  '只剩最后一段了。',
  '还差最后一块。你听见女娲的回音了吗？',
  '灵蕴正在完成最后的编织。',
  '天穹的裂缝只剩一道细纹。',
  '你上传的每一张照片都在天穹上闪光。',
  '万镜画廊的灯，几乎全亮了。',
  '灵蕴的光芒直冲九霄。',
  '天穹的裂痕正在最后合拢。',
  '昆仑之巅的残镜映出了完整的天。',
  '你在天穹上留下了永恒的印记。',
  '只剩最后几道细纹了。',
  '天穹即将合拢。最后十步。',
  '你的记忆正在成为天穹的一部分。',
  '灵蕴的光芒温柔而坚定。',
  '天穹的最后几针正在缝入。',
  '万镜画廊的镜面，映出了你的面孔。',
  '再挂一幅。就一幅。',
  '天穹几乎完整了。',
  '灵蕴正在完成最后的缝合。',
  '你几乎能触到那片完整的天了。',
  '最后一片灵蕴，正在归位。',
  '天穹已合。你做到了。',
];

function showMs(big, tts, isFull) {
  const d = document.createElement('div');
  d.style.cssText =
    'position:fixed;inset:0;z-index:390;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .5s';
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
    'position:fixed;inset:0;z-index:391;display:flex;align-items:center;justify-content:center;background:rgba(12,6,12,.55)';
  d.innerHTML =
    '<div style="background:linear-gradient(160deg,rgba(38,22,34,.98),rgba(24,14,26,.98));border:1px solid rgba(255,214,170,.4);border-radius:18px;padding:24px 26px;text-align:center;color:#ffe9c4;max-width:88vw">' +
    '<div style="font-size:15px;letter-spacing:2px;line-height:2;margin-bottom:14px">天穹已合。接下来，你想——</div>' +
    '<button id="sfStay" style="padding:10px 18px;margin:0 6px;border:none;border-radius:12px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;cursor:pointer">留下继续布展</button>' +
    '<button id="sfLeave" style="padding:10px 18px;margin:0 6px;border:1px solid rgba(255,255,255,.3);border-radius:12px;background:transparent;color:#dcc;cursor:pointer">带着新的记忆回来看看</button></div>';
  document.body.appendChild(d);
  const sfApi = ctx.overlay.register(d, { touchOnly: true });
  d.querySelector('#sfStay').onclick = () => {
    sfApi.unregister();
    d.remove();
    ctx.ui.modeToast && ctx.ui.modeToast('昆仑谢过你。');
  };
  d.querySelector('#sfLeave').onclick = () => {
    sfApi.unregister();
    d.remove();
    ctx.ui.modeToast && ctx.ui.modeToast('昆仑留着你的光。');
  };
}

function checkSkyMs() {
  const v = skyVal(),
    had = ctx.store.num('skyMs');
  for (let i = SKY_MS.length - 1; i >= 0; i--) {
    const [m, big, tts] = SKY_MS[i];
    if (v >= m && had < m) {
      ctx.store.setNum('skyMs', m);
      showMs(big, tts, m === 100);
      if (m === 100 && ctx.scene.kintsugiOn) ctx.scene.kintsugiOn();
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
  const cv = document.getElementById('skyCv');
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
  document.getElementById('skyTx').textContent =
    val >= 100 ? '天穹已合' : '灵蕴归位率 ' + val + ' / 100';
  document.getElementById('skySub').textContent =
    val >= 100
      ? '天穹已合。灵蕴长存。'
      : val >= 81
        ? '最后的天隙正在缝合……'
        : val >= 51
          ? '天穹正在愈合……'
          : val >= 21
            ? '裂痕正在收窄……'
            : '灵蕴正在苏醒……';
  document.getElementById('skyLine').textContent = val >= 1 && val < 100 ? SKY_LINES[val - 1] : '';
  document.getElementById('skyStats').textContent =
    '答对选择题：' + ctx.store.num('quiz') + ' 题 · 上传照片：' + ctx.store.num('up') + ' 张';
  document.getElementById('skyFull').style.display = val >= 100 ? 'block' : 'none';
}

// ===== 天穹独立三级页 =====
const skyOv = document.createElement('div');
skyOv.id = 'skyOv';
skyOv.style.cssText =
  'position:fixed;inset:0;z-index:380;display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
const skyCard = document.createElement('div');
skyCard.style.cssText =
  'width:min(380px,92vw);max-height:82vh;overflow-y:auto;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:18px;color:#fff;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.55)';
skyCard.innerHTML =
  '<div style="display:flex;align-items:center;margin-bottom:4px"><b style="letter-spacing:2px;font-size:15px">天穹</b><span id="skyX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px">✕</span></div>';
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
