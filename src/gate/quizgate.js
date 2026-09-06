// quizgate.js — 入馆答题系统:悬浮答题屏(3D) + 答题面板(DOM) + 通行证状态/雾效门禁
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { getGameState } from '../core/game-state.js'; // 阶段4:quizPassed 运行期写路径收归 gameState.set(写回经 set 陷阱发事件)
const gs = getGameState();
// 热更新:先销毁旧实例(围墙/答题屏/定时器/DOM/iG/碰撞体见文末 custom),再执行新代码
// 注意:onTick 必须在 hotBegin 之后解构,拿到的才是被捕获包装的版本
const bag = hotBegin('quizgate');
const { s, iG, onTick } = ctx;

// ===================== 提示条(节流) =====================
const toastEl = document.createElement('div');
toastEl.style.cssText =
  'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#feca57;padding:10px 24px;border-radius:24px;font-size:14px;z-index:500;display:none;pointer-events:none;font-family:"Microsoft YaHei",sans-serif;letter-spacing:1px;';
document.body.appendChild(toastEl);
let toastTimer = 0,
  lastToast = 0;
window.quizToast = function (msg, force) {
  const now = Date.now();
  if (!force && now - lastToast < 2500) return;
  lastToast = now;
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.style.display = 'none'), 2600);
};

// ===================== 通行证状态 =====================
// 2026-07-31:默认允许进入建筑,答题只用于天穹进度
ctx.player.quizPassed = true; // 默认允许进入建筑
if (ctx.player.quizPassScore === undefined) ctx.player.quizPassScore = 60; // 分数线(服务端单源下发前的兜底,与 lib/quiz.js 一致)
fetch('/api/quiz/state')
  .then((r) => r.json())
  .then((d) => {
    if (d.passScore) ctx.player.quizPassScore = d.passScore; // 分数线单一源:lib/quiz.js QUIZ_PASS_SCORE 下发
  })
  .catch(() => {});

// ===================== 门禁墙已移除(2026-07-31) =====================
// 答题仅用于天穹进度,不再有物理墙阻挡进入建筑
// 保留 unlockGallery/lockGallery 函数签名(其他模块可能调用),但不再操作墙体
const gateWalls = null;
const gateBounds = [];

function unlockGallery(notify) {
  gs.set('quizPassed', true);
  drawPanel(true);
  if (notify) window.quizToast('🎉 答题通过!天穹进度已更新');
}
function lockGallery(reason) {
  gs.set('quizPassed', false);
  drawPanel(false);
  window.quizToast(reason || '答题状态已更新');
}

// 权限监视:每5秒检查一次(仅更新状态,不再有墙体操作)
setInterval(async function () {
  try {
    const r = await fetch('/api/quiz/state');
    const d = await r.json();
    if (d.passed && !gs.get('quizPassed')) gs.set('quizPassed', true);
    else if (!d.passed && gs.get('quizPassed')) gs.set('quizPassed', false);
  } catch (e) {}
}, 5000);

// ===================== 悬浮答题屏(3D) =====================
const panelCv = document.createElement('canvas');
panelCv.width = 1024;
panelCv.height = 512;
const panelTex = new THREE.CanvasTexture(panelCv);
panelTex.colorSpace = THREE.SRGBColorSpace;
function drawPanel(unlocked) {
  const c = panelCv.getContext('2d');
  c.clearRect(0, 0, 1024, 512);
  // 半透明淡粉玻璃底(对角渐变)
  const g = c.createLinearGradient(0, 0, 1024, 512);
  g.addColorStop(0, 'rgba(255,200,220,0.45)');
  g.addColorStop(0.5, 'rgba(255,170,205,0.32)');
  g.addColorStop(1, 'rgba(255,210,228,0.45)');
  c.fillStyle = g;
  c.fillRect(0, 0, 1024, 512);
  // 双层边框:外白内粉,玻璃质感
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 6;
  c.beginPath();
  c.roundRect(24, 24, 976, 464, 36);
  c.stroke();
  c.strokeStyle = 'rgba(255,120,170,0.6)';
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(36, 36, 952, 440, 28);
  c.stroke();
  c.textAlign = 'center';
  if (unlocked) {
    c.fillStyle = '#2e9e6b';
    c.font = 'bold 130px "Microsoft YaHei",serif';
    c.shadowColor = 'rgba(255,255,255,0.95)';
    c.shadowBlur = 18;
    c.fillText('已 解 锁', 512, 240);
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(60,40,60,0.8)';
    c.font = '46px "Microsoft YaHei",serif';
    c.fillText('Welcome to B612', 512, 340);
  } else {
    c.fillStyle = '#ffffff';
    c.font = 'bold 108px "Microsoft YaHei",serif';
    c.shadowColor = 'rgba(255,255,255,0.9)';
    c.shadowBlur = 14;
    c.fillText('心 象 共 鸣', 512, 205);
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.font = 'bold 54px "Microsoft YaHei",serif';
    c.fillText('9 道选择 + 1 道问答 · 满分 100', 512, 300);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.font = '44px "Microsoft YaHei",serif';
    c.fillText('心 象 共 鸣 · 点击开始', 512, 385);
  }
  panelTex.needsUpdate = true;
}
drawPanel(false);
const panelMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 7),
  new THREE.MeshBasicMaterial({
    map: panelTex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.62,
    toneMapped: false,
  })
);
panelMesh.position.set(39, 8, 14);
panelMesh.rotation.y = -Math.PI / 2; // 面向-x(出生点 x=20 方向)
panelMesh.userData = { isQuizGate: true };
s.add(panelMesh);
iG.push(panelMesh);
// 玫瑰金边框(半透明) + 氛围灯 + 浮动动画
const panelFrame = new THREE.Mesh(
  new THREE.BoxGeometry(14.4, 7.4, 0.15),
  new THREE.MeshStandardMaterial({
    color: '#d98aa5',
    roughness: 0.35,
    metalness: 0.55,
    transparent: true,
    opacity: 0.5,
  })
);
panelFrame.position.set(39.12, 8, 14);
panelFrame.rotation.y = -Math.PI / 2;
s.add(panelFrame);
const panelLight = new THREE.PointLight('#ffb6c8', 3, 20, 1.5);
panelLight.position.set(36, 8, 14);
s.add(panelLight);
onTick(function () {
  const t = performance.now() * 0.001;
  panelMesh.position.y = 9 + Math.sin(t * 0.8) * 0.25;
  panelFrame.position.y = 9 + Math.sin(t * 0.8) * 0.25;
});

// ===================== 答题面板(DOM) =====================
// 女娲十问(2026-07-26《B612灵鉴》):题号过渡语,学科名保留;模块级,renderQuiz/renderResult 共用
const QZ_TITLES = [
  '第一问·观天地',
  '第二问·察万物',
  '第三问·辨时序',
  '第四问·明因果',
  '第五问·识变迁',
  '第六问·通情理',
  '第七问·分虚实',
  '第八问·知进退',
  '第九问·度深浅',
];
const css = document.createElement('style');
css.textContent = `
#quizOv{position:fixed;inset:0;z-index:400;display:none;align-items:center;justify-content:center;background:rgba(16,6,14,0.92);font-family:'Microsoft YaHei',sans-serif;overflow-y:auto}
#quizBox{width:min(680px,94vw);max-height:92vh;overflow-y:auto;background:linear-gradient(160deg,#2a1025,#3d1830);border:1px solid rgba(255,182,200,0.35);border-radius:22px;padding:28px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.6)}
#quizBox h2{color:#ffb6c8;text-align:center;margin:0 0 6px;font-size:24px;letter-spacing:3px}
#quizBox .qsub{text-align:center;color:rgba(255,255,255,.55);font-size:13px;margin-bottom:18px}
.qz-track{display:flex;gap:16px;justify-content:center;margin-top:20px}
.qz-track button{flex:1;padding:22px 10px;border:1px solid rgba(255,182,200,.4);border-radius:16px;background:rgba(255,107,107,.12);color:#fff;font-size:17px;cursor:pointer;font-family:inherit}
.qz-track button:hover{background:rgba(255,107,107,.3)}
.qz-track small{display:block;margin-top:6px;font-size:11px;color:rgba(255,255,255,.5)}
.qz-q{margin-bottom:18px;padding:14px 16px;background:rgba(255,255,255,.05);border-radius:12px}
.qz-q .qz-head{font-size:12px;color:#feca57;margin-bottom:6px}
.qz-q .qz-stem{font-size:14px;line-height:1.7;margin-bottom:10px}
.qz-opt{display:block;width:100%;text-align:left;margin:6px 0;padding:9px 12px;border:1px solid rgba(255,255,255,.15);border-radius:10px;background:rgba(255,255,255,.04);color:#eee;font-size:13px;line-height:1.6;cursor:pointer;font-family:inherit}
.qz-opt:hover{background:rgba(255,182,200,.15)}
.qz-opt.sel{background:linear-gradient(135deg,#ff6b6b,#feca57);color:#fff;border-color:transparent}
.qz-opt.right{background:#2ecc71;color:#fff}
.qz-opt.wrong{background:#c0392b;color:#fff}
#qzTa{width:100%;min-height:130px;border:1px solid rgba(255,255,255,.2);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;padding:10px;font-size:13px;line-height:1.7;font-family:inherit;resize:vertical;box-sizing:border-box}
#qzCount{text-align:right;font-size:12px;color:rgba(255,255,255,.5);margin-top:4px}
#qzCount.ok{color:#7dff9a}
.qz-main-btn{display:block;width:100%;margin-top:18px;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#ff6b6b,#feca57);color:#fff;font-size:16px;cursor:pointer;font-family:inherit}
.qz-main-btn:disabled{opacity:.4;cursor:not-allowed}
.qz-score{text-align:center;font-size:52px;font-weight:bold;margin:10px 0;color:#feca57}
.qz-pass{text-align:center;font-size:18px;margin-bottom:12px}
.qz-pass.ok{color:#7dff9a}.qz-pass.no{color:#ff8a8a}
.qz-break{text-align:center;font-size:13px;color:rgba(255,255,255,.65);line-height:1.9;margin-bottom:8px}
.qz-spin{text-align:center;padding:40px;font-size:15px;color:rgba(255,255,255,.7)}
`;
document.head.appendChild(css);

const ov = document.createElement('div');
ov.id = 'quizOv';
const box = document.createElement('div');
box.id = 'quizBox';
ov.appendChild(box);
document.body.appendChild(ov);

// ===================== B612灵鉴 V1:答题动态背景(灰暗天空+金色裂纹,作答越深入裂纹越亮,满分金光填满现B612) =====================
const sky = document.createElement('canvas');
sky.style.cssText =
  'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
ov.insertBefore(sky, box);
box.style.position = 'relative';
box.style.zIndex = '1';
const skyX = sky.getContext('2d');
let skyRatio = 0,
  skyPts = [],
  skyBranches = [],
  skyAnim = 0;
function skySeedPts() {
  skyPts = [];
  skyBranches = [];
  const w = sky.width,
    h = sky.height,
    steps = 36;
  let x = w / 2;
  for (let i = 0; i <= steps; i++) {
    const y = -10 + ((h + 20) * i) / steps;
    x += (Math.random() - 0.5) * w * 0.09;
    x = Math.max(w * 0.18, Math.min(w * 0.82, x));
    skyPts.push([x, y]);
    // 雷霆分叉:主干的 16% 节点长出不规则支脉
    if (i > 6 && i < steps - 4 && Math.random() < 0.16) {
      let bx = x,
        by = y;
      const bp = [[bx, by]],
        dir = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < 6; j++) {
        bx += dir * (w * 0.02 + Math.random() * w * 0.05);
        by += (h / steps) * (0.4 + Math.random() * 0.8);
        bp.push([bx, by]);
      }
      skyBranches.push(bp);
    }
  }
}
// 一段雷霆:外层光晕→金芯→白炽内芯(圆头圆角,无几何拼接感)
function bolt(c, pts, w0, r) {
  c.strokeStyle = `rgba(255,190,90,${0.1 + r * 0.25})`;
  c.lineWidth = w0 * 5;
  c.shadowColor = 'rgba(255,200,100,0.8)';
  c.shadowBlur = 18 + r * 40;
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) c.lineTo(x, y);
  c.stroke();
  c.strokeStyle = `rgba(255,214,130,${0.35 + r * 0.6})`;
  c.lineWidth = w0 * 1.6;
  c.shadowBlur = 8 + r * 18;
  c.stroke();
  if (r > 0.4) {
    c.strokeStyle = `rgba(255,246,220,${(r - 0.4) * 1.1})`;
    c.lineWidth = w0 * 0.6;
    c.shadowBlur = 4;
    c.stroke();
  }
}
function drawSky() {
  const w = (sky.width = sky.clientWidth || innerWidth),
    h = (sky.height = sky.clientHeight || innerHeight);
  if (!skyPts.length) skySeedPts();
  const r = skyRatio,
    c = skyX;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1b1820');
  g.addColorStop(1, '#0c0a10');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // 雷光映云(大范围暖晕,进度越高越亮)
  if (r > 0.02) {
    const rg = c.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.4, h * 0.75);
    rg.addColorStop(0, `rgba(255,200,110,${r * 0.1})`);
    rg.addColorStop(1, 'rgba(255,200,110,0)');
    c.fillStyle = rg;
    c.fillRect(0, 0, w, h);
  }
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  bolt(c, skyPts, 3 + r * 4, r); // 主雷:随进度变粗变亮
  for (const bp of skyBranches) bolt(c, bp, 1.5 + r * 2, r * 0.8); // 支脉
  c.restore();
  if (r >= 0.98) {
    // 金光填满→B612山巅剪影
    const rg = c.createRadialGradient(w / 2, h * 0.35, 10, w / 2, h * 0.35, h * 0.9);
    rg.addColorStop(0, 'rgba(255,215,140,0.85)');
    rg.addColorStop(1, 'rgba(255,190,90,0)');
    c.fillStyle = rg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1c1420';
    c.beginPath();
    c.moveTo(0, h);
    const peaks = [
      [0, 0.78],
      [0.12, 0.62],
      [0.22, 0.74],
      [0.35, 0.5],
      [0.5, 0.7],
      [0.62, 0.55],
      [0.75, 0.72],
      [0.88, 0.6],
      [1, 0.76],
    ];
    for (const [px, py] of peaks) c.lineTo(px * w, py * h);
    c.lineTo(w, h);
    c.closePath();
    c.fill();
  }
}
function skyTo(target, animate) {
  cancelAnimationFrame(skyAnim);
  if (!animate) {
    skyRatio = target;
    drawSky();
    return;
  }
  const from = skyRatio,
    t0 = performance.now();
  (function step() {
    const p = Math.min((performance.now() - t0) / 1200, 1);
    skyRatio = from + (target - from) * p;
    drawSky();
    if (p < 1) skyAnim = requestAnimationFrame(step);
  })();
}
window.addEventListener('resize', drawSky);
// 退出按钮(所有页面可随时关闭答题面板)
const quizCloseBtn = document.createElement('button');
quizCloseBtn.id = 'quizCloseBtn';
quizCloseBtn.textContent = '✕ 退出';
quizCloseBtn.style.cssText =
  'position:absolute;top:14px;right:14px;z-index:401;padding:8px 16px;border-radius:20px;border:1px solid rgba(255,182,200,.5);background:rgba(0,0,0,.55);color:#fff;font-size:13px;cursor:pointer;font-family:"Microsoft YaHei",sans-serif';
ov.appendChild(quizCloseBtn);
// 三铁律注册即得(2026-07-28 深化⑤):✕/Esc 任何阶段可关;点外圈答题中(stage=quiz)拦截
const quizOvApi = ctx.overlay.register(ov, {
  x: '#quizCloseBtn',
  canClose(reason) {
    return reason === 'outside' ? ov.dataset.stage !== 'quiz' : true;
  },
});

let sessionId = null,
  mcData = [],
  chosen = [],
  qaMinLen = 25,
  quizTrack = '';
let judgedQ = {},
  rightCount = 0; // 逐题批改:题号→已判,答对数(驱动金色裂纹)

window.startQuiz = function () {
  // 2026-07-26 机制调整:已解锁也可继续答题——答题积攒天穹星屑,入口永不关闭
  ov.dataset.stage = 'pick';
  skyTo(0.06); // 开卷:灰暗天空现出一道细金裂纹
  box.innerHTML = `<h2>心 象 共 鸣</h2>
<div class="qsub">Before you arrived, six questions were carved into the stone of B612. Every answer you give lights up another line. Begin.</div>
<div class="qz-track">
<button data-t="shen" style="border-color:rgba(255,214,130,.7);background:rgba(230,170,60,.14)">神 话 卷<small>B612 · 判后附正解与解析</small></button>
<button data-t="li">理 科 卷<small>语文 · 数学 · 英语 · 物理 · 化学 · 生物</small></button>
<button data-t="wen">文 科 卷<small>语文 · 数学 · 英语 · 历史 · 政治 · 地理</small></button>
</div>`;
  quizOvApi.open();
  box.querySelectorAll('.qz-track button').forEach((b) => {
    b.addEventListener('click', () => beginQuiz(b.dataset.t));
  });
};

// 兼容旧浏览器/应用内置浏览器的超时实现(AbortSignal.timeout 在低版本 WebView 不存在)
function fetchTimeout(url, ms, opts) {
  return Promise.race([
    fetch(url, opts),
    new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时,请检查网络')), ms)),
  ]);
}

async function beginQuiz(track) {
  quizTrack = track;
  ov.dataset.stage = 'quiz';
  box.innerHTML = '<div class="qz-spin">正在出卷…</div>';
  try {
    const r = await fetchTimeout('/api/quiz/start?track=' + track, 10000);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '出卷失败(' + r.status + ')');
    sessionId = d.sessionId;
    mcData = d.mc;
    chosen = new Array(d.mc.length).fill('');
    renderQuiz(d);
  } catch (e) {
    box.innerHTML = `<div class="qz-spin">出卷失败:${escH(e.message)}<br><br><button class="qz-main-btn" onclick="startQuiz()">返回重试</button></div>`;
  }
}

function renderQuiz(d) {
  judgedQ = {};
  rightCount = 0;
  window._qzHalfTold = false; // 逐题批改状态(2026-07-26):每题判过即锁,答对一题裂纹亮一丝;半程反馈复位
  let html = `<h2>答 题 中</h2><div class="qsub">9 道选择题(每题 9 分)+ 1 道问答题(19 分) · 点选即批改,判过不可改</div>`;
  d.mc.forEach((m, i) => {
    html += `<div class="qz-q"><div class="qz-head">${QZ_TITLES[i] || '第 ' + (i + 1) + ' 题'} · ${m.subject}</div><div class="qz-stem">${escH(m.q)}</div>`;
    for (const L of ['A', 'B', 'C', 'D']) {
      html += `<button class="qz-opt" data-q="${i}" data-l="${L}">${L}. ${escH(m.options[L])}</button>`;
    }
    html += '</div>';
  });
  html += `<div class="qz-q"><div class="qz-head">第十问·证我心 · 19 分(不少于 25 字,禁止复制粘贴)</div><div class="qz-stem">${escH(d.qa.q)}</div>
<textarea id="qzTa" placeholder="在此输入你的论述…"></textarea><div id="qzCount">0 / 200 字</div></div>
<button class="qz-main-btn" id="qzSubmit" disabled>提交试卷</button>`;
  box.innerHTML = html;
  box.scrollTop = 0;
  box.querySelectorAll('.qz-opt').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const q = +btn.dataset.q;
      if (judgedQ[q]) return; // 已批改,锁定不可改
      judgedQ[q] = true;
      chosen[q] = btn.dataset.l;
      box
        .querySelectorAll(`.qz-opt[data-q="${q}"]`)
        .forEach((b) => b.classList.toggle('sel', b === btn));
      checkReady();
      // 逐题批改:服务端判定,只回对错;答对一题,裂纹亮一丝
      try {
        const r = await fetch('/api/quiz/judge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, qIndex: q, letter: btn.dataset.l }),
        });
        const d = await r.json();
        if (!r.ok) throw 0;
        btn.classList.add(d.right ? 'right' : 'wrong');
        // 神话卷:判后亮出正解并附解析(仅此卷;文理卷仍不显示)
        if (d.correctLetter) {
          const qBox = btn.closest('.qz-q');
          if (qBox) {
            qBox.querySelectorAll('.qz-opt').forEach((b) => {
              if (b.dataset.l === d.correctLetter) b.classList.add('right');
            });
            if (d.explain) {
              const ex = document.createElement('div');
              ex.style.cssText =
                'font-size:12px;color:rgba(255,220,160,.85);line-height:1.7;margin-top:8px;border-top:1px dashed rgba(255,220,160,.3);padding-top:6px';
              ex.textContent = '解析：' + d.explain;
              qBox.appendChild(ex);
            }
          }
        }
        if (d.right) {
          rightCount++;
          skyTo(0.06 + 0.5 * (rightCount / 10), true);
        }
        // C3 半程轻反馈(2026-07-28,设计文档钦定防流失):答满 5 题提示一次,不打断节奏
        if (!window._qzHalfTold && Object.keys(judgedQ).filter((k) => judgedQ[k]).length >= 5) {
          window._qzHalfTold = true;
          ctx.modeToast && ctx.modeToast('你已经完成了一半的心象共鸣。');
        }
      } catch (e) {
        judgedQ[q] = false;
      } // 网络异常:解锁允许重判
    });
  });
  const ta = box.querySelector('#qzTa');
  // 禁止复制/粘贴/剪切(问答题必须手打)
  ['paste', 'copy', 'cut', 'drop', 'contextmenu'].forEach((ev) =>
    ta.addEventListener(ev, (e) => e.preventDefault())
  );
  ta.addEventListener('keydown', (e) => {
    // e.key 可能是 undefined(输入法 composition / 合成事件),先判空
    if (!e.key) return;
    if ((e.ctrlKey || e.metaKey) && ['v', 'x', 'c'].includes(e.key.toLowerCase()))
      e.preventDefault();
  });
  ta.addEventListener('input', () => {
    window._qzTaVal = ta.value; // 实时保存作答,防止 DOM 变化导致提交时取空
    const len = [...ta.value].length;
    const cnt = box.querySelector('#qzCount');
    cnt.textContent = len + ' / 200 字';
    cnt.className = len >= qaMinLen ? 'ok' : '';
    cnt.id = 'qzCount';
    checkReady();
  });
  box.querySelector('#qzSubmit').addEventListener('click', submitQuiz);
}

function checkReady() {
  const ta = box.querySelector('#qzTa');
  const ready = chosen.every((c) => c) && ta && [...ta.value].length >= qaMinLen;
  box.querySelector('#qzSubmit').disabled = !ready;
}

async function submitQuiz() {
  box.innerHTML = '<div class="qz-spin">阅卷中,问答题正在 AI 批改…</div>';
  try {
    const r = await fetch('/api/quiz/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        track: quizTrack,
        answers: chosen,
        qaText:
          (box.querySelector('#qzTa') && box.querySelector('#qzTa').value) || window._qzTaVal || '',
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '提交失败');
    renderResult(d);
  } catch (e) {
    box.innerHTML = `<div class="qz-spin">提交失败:${escH(e.message)}<br><br><button class="qz-main-btn" onclick="startQuiz()">重新挑战</button></div>`;
  }
}

function renderResult(d) {
  ov.dataset.stage = 'result';
  skyTo(Math.max(0.15, (d.total || 0) / 100), true); // 成绩定纹:满分→金光填满,B612山巅显现
  const passCls = d.passed ? 'ok' : 'no';
  // 三档反馈(2026-07-26《B612灵鉴》):满分全通 / ≥60 放行 / <60 邀请函仍可进(镜框回应慢一些)
  const passTxt =
    d.total === 100
      ? '十问皆通。你接住了 B612 留给你的每一问。星屑已被认可，展厅的门为你而开。——Welcome home.'
      : d.passed
        ? '十问过其六，星屑已生。虽未尽通，但B612从不拒真心。推门进去吧——你带来的记忆，足够点亮一面墙。'
        : '十问未尽，星屑未满。但山不拒来者——接受下方的邀请函，你仍然可以进去看看。只是初次挂画时，镜框回应得会慢一些。多凝视几秒就好。';
  const qaInfo =
    d.qaBy === 'ai'
      ? `AI 阅卷评语:${escH(d.qaComment || '—')}`
      : (d.qaBreakdown || [])
          .map(
            (b) =>
              `${b.name} <b>${b.got}</b>/${b.max}<span style="opacity:.55"> (${escH(b.note)})</span>`
          )
          .join('<br>');
  let html = `<h2>成 绩 单</h2>
<div class="qz-score">${d.total}</div>
<div class="qz-pass ${passCls}">${passTxt}</div>
<div class="qz-break">选择题 ${d.mcScore} / 81 分 · 问答题 ${d.qaScore} / 19 分<br>${qaInfo}</div>`;
  d.review.forEach((rv, i) => {
    const mark = rv.right
      ? '<span style="color:#7dff9a">✓ 答对</span>'
      : '<span style="color:#ff8a8a">✗ 答错</span>';
    html += `<div class="qz-q"><div class="qz-head">${QZ_TITLES[i] || '第 ' + (i + 1) + ' 题'} · ${rv.subject} · ${mark}</div>`;
    if (rv.correctLetter)
      html += `<div style="font-size:12px;color:rgba(255,220,160,.85);line-height:1.7;margin-top:4px">正解 ${rv.correctLetter}${rv.explain ? ' · ' + escH(rv.explain) : ''}</div>`;
    html += '</div>';
  });
  // 神话卷:问答题附出题意图与参考方向
  if (d.qaExplain)
    html += `<div class="qz-q" style="border:1px dashed rgba(255,214,130,.4)"><div class="qz-head">第十问 · 解析</div><div style="font-size:12px;color:rgba(255,220,160,.85);line-height:1.8">${escH(d.qaExplain)}</div></div>`;
  // 答题攒天穹(2026-07-26 主人新规则):答对一道选择题 +1(任何卷);问答题只要写了字 +1
  const gain =
    d.review.filter((r) => r.right).length + ((window._qzTaVal || '').trim().length > 0 ? 1 : 0);
  if (gain > 0) {
    const prev = ctx.store.num('quiz');
    const nq = prev + gain;
    ctx.store.setNum('quiz', nq);
    window.quizToast && window.quizToast('星屑 +' + gain + '（已入天穹）', true);
    // TTS 频次:首次必播,之后每答对 5 题播一次(避免疲劳)
    if (ctx.ui.kunlunSpeak && (nq === 1 || Math.floor(prev / 5) < Math.floor(nq / 5)))
      ctx.ui.kunlunSpeak('星屑归位。');
    ctx.kunlun.checkSkyMs && ctx.kunlun.checkSkyMs();
  }
  if (d.passed) {
    html += `<button class="qz-main-btn" id="qzEnter">进 入 画 廊</button>`;
  } else if (d.invite) {
    // 未达 60:特别邀请函(2026-07-25 主人定)——尊敬的访客仍可获得进入权限
    html += `<div class="qz-q" style="text-align:center;padding:18px 14px;border:1px dashed rgba(255,214,170,.5);border-radius:14px;margin-top:10px">
      <div style="font-size:15px;line-height:2;color:#ffe2c4">💌<br>尊敬的访客:<br>虽未及线,雅意已达。<br>特奉「特别邀请函」一封,仍可入画廊一观。</div>
      <button class="qz-main-btn" id="qzInvite">接 受 邀 请 函</button>
    </div>
    <button class="qz-main-btn" style="background:rgba(255,255,255,.12)" onclick="startQuiz()">重新挑战</button>`;
  } else {
    html += `<button class="qz-main-btn" onclick="startQuiz()">重新挑战</button>`;
  }
  box.innerHTML = html;
  box.scrollTop = 0;
  if (d.total === 100)
    ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak('十问皆通。欢迎你，藏梦人。'); // 满分:B612亲迎
  else if (d.passed) ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak('十问过其六，星屑已生。推门进去吧。'); // ≥60:B612放行
  if (d.passed) {
    unlockGallery(true);
    box.querySelector('#qzEnter').addEventListener('click', () => {
      quizOvApi.close();
    });
  } else if (d.invite) {
    const btn = box.querySelector('#qzInvite');
    if (btn)
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '正在送达…';
        try {
          const r = await fetch('/api/quiz/invite', { method: 'POST' });
          const dd = await r.json();
          if (!r.ok || !dd.passed) throw new Error(dd.error || '失败');
          unlockGallery(true);
          ctx.ui.kunlunSpeak &&
            ctx.ui.kunlunSpeak('十问未尽，星屑未满。但山不拒来者。进去看看吧。');
          box.innerHTML = '<div class="qz-spin">🎉 邀请函已生效,欢迎进入画廊</div>';
          setTimeout(() => {
            quizOvApi.close();
          }, 900);
        } catch (e) {
          btn.disabled = false;
          btn.textContent = '接 受 邀 请 函';
          window.quizToast && window.quizToast('网络开了个小差,请再点一次');
        }
      });
  }
}

function escH(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

// 热更新自定义清理:碰撞体/iG 可交互组/弹层注册/head 样式(s.add 场景对象与 body DOM 由 hot.js 自动捕获)
bag.custom.push(() => {
  ctx.scene.removeBounds && ctx.scene.removeBounds(gateBounds); // B4:经门面移除,不再直改场景内部数组
  for (const m of [panelMesh]) {
    if (!m) continue;
    const i = iG.indexOf(m);
    if (i >= 0) iG.splice(i, 1);
  }
  quizOvApi.unregister();
  window.removeEventListener('resize', drawSky);
  cancelAnimationFrame(skyAnim);
  css.remove();
});
hotEnd('quizgate');
if (import.meta.hot) import.meta.hot.accept();
