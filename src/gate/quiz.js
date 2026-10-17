// quiz.js — 温柔度测试（DOM弹窗逻辑 + 3D墙面测试面板）
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { byIdEl, byIdBtn, qsaBtn } from '../shared/dom-typed.js';
import {
  GENTLE_QUESTIONS,
  gentlePct,
  gentleRecord,
  gentleScore,
  gentleTier,
} from '../shared/gentle-logic.mjs';
const { s, iG } = ctx;

// ===== 温柔度测试（DOM 弹窗）=====
// 2026-10-16 接线。这块面板从 2026-07-28 基线起就是死的,原因有两半,都在这儿:
// ① **没有入口** —— 全仓（含全部 HTML/CSS）没有一处给 #gtP 加过 `.show`,CSS 第 386 行写死
//    `display:none`,所以它从来没有出现过;
// ② **按钮点了必炸** —— index.html 的四个按钮写的是**裸全局名**（startGentleTest() /
//    nextGentleQ() / restartGentleTest() / closeGentleTest()）加选项里的 selectGentleO(),
//    而本模块只经 debug-hooks 的 expose() 注册 ⇒ window 上的名字带 `__` 前缀,那五个是 undefined。
//    （对照 `quizgate.js:374` 写的是 `window.startQuiz = …` 裸名,所以答题门那条链活着 ——
//    两边口径不一致就是成因。第九刀补记里还查出旧写法一处更坏的:closeGentleTest 里
//    `expose('restartGentleTest')()` 第一参数就把钩子**写成 undefined** 再去调用它。）
// 现在三件事各归其位:开 = `ctx.ui.gentleTest.open()`（菜单条目调它）;
// 关 = ctx.overlay 的 ✕ 委托（.gtClose）+ 点外圈 + Esc（弹层三铁律不再手写）;
// 答题 = 每次渲染挂在选项按钮上的监听。结果落 store 键 gentleTest,**只记录、不分支**（同 witness）。

let gCur = 0;
/** @type {Array<number|undefined>} */
let gAns = [];
/** @type {ReturnType<typeof setInterval>|null} 指数动画计数的句柄,关闭与重开都必须摘掉 */
let countTimer = null;

const gtPanel = byIdEl('gtP');
const gtStart = byIdEl('gtStart');
const gtQuiz = byIdEl('gtQuiz');
const gtResult = byIdEl('gtResult');
const gtQD = byIdEl('gtQD');
const gtProgF = byIdEl('gtProgF');
const gtScoreEl = byIdEl('gtScore');
const gtRT = byIdEl('gtRT');
const gtRD = byIdEl('gtRD');
const gtRH = byIdEl('gtRH');
const gtStartBtn = byIdBtn('gtStartBtn');
const gtNextBtn = byIdBtn('gtNext');
const gtAgainBtn = byIdBtn('gtAgainBtn');

function stopCount() {
  if (countTimer) {
    clearInterval(countTimer);
    countTimer = null;
  }
}

/** 三段屏（封面 / 作答 / 结果）的互斥显示,display 值与 CSS 原本写死的保持一致 */
function showScreen(which) {
  gtStart.style.display = which === 'start' ? 'block' : 'none';
  gtQuiz.style.display = which === 'quiz' ? 'block' : 'none';
  gtResult.style.display = which === 'result' ? 'block' : 'none';
}

function renderQuestion() {
  const q = GENTLE_QUESTIONS[gCur];
  let h = '<div class="gtQ"><div class="gtQL">' + (gCur + 1) + '. ' + q.q + '</div>';
  q.o.forEach((opt, idx) => {
    h +=
      '<button class="gtO" data-i="' +
      idx +
      '">' +
      String.fromCharCode(65 + idx) +
      '. ' +
      opt.t +
      '</button>';
  });
  h += '</div>';
  gtQD.innerHTML = h;
  // 选中态由 JS 补 class,不写进模板里:模板要留一条静态的 `class="gtO"`,
  // 否则 `dom-typed-sites` 那条「助手声称的标签 ≡ markup 真实标签」的反查认不出这个类。
  qsaBtn(gtQD, '.gtO').forEach((btn) => {
    if (Number(btn.dataset.i) === gAns[gCur]) btn.classList.add('sel');
    btn.onclick = () => {
      gAns[gCur] = Number(btn.dataset.i);
      renderQuestion();
    };
  });
  gtProgF.style.width = (gCur / GENTLE_QUESTIONS.length) * 100 + '%';
  gtNextBtn.style.display = gAns[gCur] === undefined ? 'none' : 'block';
}

function beginTest() {
  stopCount();
  gCur = 0;
  gAns = [];
  showScreen('quiz');
  renderQuestion();
}

function nextQuestion() {
  if (gAns[gCur] === undefined) return;
  gCur++;
  if (gCur >= GENTLE_QUESTIONS.length) showResult();
  else renderQuestion();
}

function showResult() {
  stopCount();
  showScreen('result');
  const score = gentleScore(gAns);
  const pct = gentlePct(score);
  const tier = gentleTier(pct);
  gtRH.textContent = tier.mark;
  gtRT.textContent = tier.title;
  gtRD.textContent = tier.desc;
  ctx.store.setJson('gentleTest', gentleRecord(gAns, Date.now()));
  // 指数计数动画:按**墙钟**算,不按"每 tick +2"算。
  // 2026-10-16 实机量过:旧写法(setInterval 30ms / n+=2)在本机 SwiftShader 下要 21 秒才数到 100
  // —— 主线程被渲染循环占住时 tick 会饿,而"数得慢"与"数不完"在玩家看来是同一件事。
  // 现在无论隔多久才拿到一次 tick,第一次就落在 1.2s 之后的真值上(即直接收敛)。
  gtScoreEl.textContent = '0';
  const t0 = Date.now();
  countTimer = setInterval(() => {
    const shown = Math.min(pct, Math.round((Date.now() - t0) / 12)); // 12ms/分 ⇒ 1.2s 数完 100
    gtScoreEl.textContent = String(shown);
    if (shown >= pct) stopCount();
  }, 30);
}

const gtOverlay = ctx.overlay.register(gtPanel, {
  display: 'flex',
  x: '.gtClose',
  onOpen: () => gtPanel.classList.add('show'),
  onClose: () => {
    gtPanel.classList.remove('show');
    stopCount();
  },
});
gtStartBtn.onclick = beginTest;
gtNextBtn.onclick = nextQuestion;
gtAgainBtn.onclick = () => {
  stopCount();
  showScreen('start');
};
ctx.ui.gentleTest = {
  open() {
    stopCount();
    showScreen('start');
    gtOverlay.open();
    // 面板要鼠标:与章节地图同一口径,否则指针锁着点不到选项
    if (document.pointerLockElement) document.exitPointerLock();
  },
  close() {
    gtOverlay.close();
  },
  isOpen() {
    return gtOverlay.isOpen();
  },
};

// ===== 3D墙面温柔度测试面板（E厅西墙 x=-8, z=-7.5，面朝东）=====
(function () {
  // 问卷数据 = shared/gentle-logic.mjs 那一份(与上面的 DOM 弹窗同源,免得题面/分值两边漂)。
  const qs = GENTLE_QUESTIONS;
  const W = 1024,
    H = 1536;
  let curQ = -1,
    totalS = 0,
    selIdx = -1;
  /** @type {number[]} 记下选中的选项下标,收卷时交给 gentleRecord(与 DOM 那条落同一行记录) */
  let picked = [];

  // Canvas（高分辨率）
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');

  // 绘制函数（兼容版，不用roundRect）
  function drawPanel() {
    try {
      // 背景
      x.fillStyle = '#1a0a12';
      x.fillRect(0, 0, W, H);
      // 边框
      x.strokeStyle = 'rgba(255,130,170,0.4)';
      x.lineWidth = 6;
      x.strokeRect(16, 16, W - 32, H - 32);

      if (curQ === -1) {
        // 标题页
        x.fillStyle = '#ffb6c8';
        x.font = 'bold 72px serif';
        x.textAlign = 'center';
        x.fillText('\u2665', W / 2, 260);
        x.fillStyle = '#ffd0d8';
        x.font = 'bold 56px "Noto Serif SC",serif';
        x.fillText('温柔度测试', W / 2, 380);
        x.fillStyle = 'rgba(255,180,200,0.6)';
        x.font = '28px Arial';
        x.fillText('GENTLENESS TEST', W / 2, 440);
        x.fillStyle = 'rgba(255,200,220,0.7)';
        x.font = '32px serif';
        x.fillText('每个人心中都住着一片花园', W / 2, 600);
        x.fillText('你的温柔，是花开的声音', W / 2, 660);
        x.fillStyle = 'rgba(255,180,200,0.4)';
        x.font = '26px Arial';
        x.fillText('共5题 \u00b7 测出你的温柔指数', W / 2, 800);
        // 开始按钮区域
        x.fillStyle = 'rgba(255,100,150,0.2)';
        x.fillRect(260, 960, 504, 120);
        x.strokeStyle = 'rgba(255,130,170,0.5)';
        x.lineWidth = 4;
        x.strokeRect(260, 960, 504, 120);
        x.fillStyle = '#ff8fab';
        x.font = 'bold 36px serif';
        x.fillText('点击开始', W / 2, 1040);
      } else if (curQ < qs.length) {
        // 题目页
        const q = qs[curQ];
        x.fillStyle = 'rgba(255,180,200,0.4)';
        x.font = '24px Arial';
        x.textAlign = 'center';
        x.fillText('第 ' + (curQ + 1) + ' / ' + qs.length + ' 题', W / 2, 76);
        // 进度条
        x.fillStyle = 'rgba(255,130,170,0.15)';
        x.fillRect(80, 110, W - 160, 8);
        x.fillStyle = 'rgba(255,130,170,0.6)';
        x.fillRect(80, 110, (W - 160) * ((curQ + (selIdx >= 0 ? 1 : 0)) / qs.length), 8);
        // 题目
        x.fillStyle = '#ffd0d8';
        x.font = 'bold 36px "Noto Serif SC",serif';
        x.textAlign = 'left';
        wrapText(x, q.q, 80, 220, W - 160, 52);
        // 选项
        x.textAlign = 'left';
        for (let i = 0; i < q.o.length; i++) {
          const y = 480 + i * 230;
          x.fillStyle = selIdx === i ? 'rgba(255,100,150,0.3)' : 'rgba(255,130,170,0.08)';
          x.fillRect(70, y - 20, W - 140, 180);
          x.strokeStyle = selIdx === i ? 'rgba(255,130,170,0.6)' : 'rgba(255,130,170,0.2)';
          x.lineWidth = 3;
          x.strokeRect(70, y - 20, W - 140, 180);
          x.fillStyle = selIdx === i ? '#ff8fab' : 'rgba(255,180,200,0.6)';
          x.font = 'bold 40px Arial';
          x.fillText(String.fromCharCode(65 + i), 110, y + 50);
          x.fillStyle = selIdx === i ? '#ffe8f0' : '#ffe0e8';
          x.font = '30px serif';
          wrapText(x, q.o[i].t, 180, y + 16, W - 280, 44);
        }
        // 下一题按钮
        if (selIdx >= 0) {
          x.fillStyle = 'rgba(255,100,150,0.25)';
          x.fillRect(320, 1420, 384, 88);
          x.strokeStyle = 'rgba(255,130,170,0.5)';
          x.lineWidth = 3;
          x.strokeRect(320, 1420, 384, 88);
          x.fillStyle = '#ff8fab';
          x.font = 'bold 30px serif';
          x.textAlign = 'center';
          x.fillText(curQ < qs.length - 1 ? '下一题' : '查看结果', W / 2, 1476);
        }
      } else {
        // 结果页
        const pct = gentlePct(totalS);
        x.fillStyle = 'rgba(255,180,200,0.5)';
        x.font = '24px Arial';
        x.textAlign = 'center';
        x.fillText('你的温柔指数', W / 2, 120);
        x.fillStyle = '#ff8fab';
        x.font = 'bold 160px Arial';
        x.fillText(pct + '', W / 2, 320);
        x.fillStyle = 'rgba(255,180,200,0.5)';
        x.font = '32px Arial';
        x.fillText('分', W / 2 + 100, 320);
        x.fillStyle = '#ffd0d8';
        x.font = 'bold 40px serif';
        // 判词表在 shared/gentle-logic.mjs;画布这一路取短版(descShort),
        // 因为画布只有 1024px 宽,长版会被 wrapText 拆到选项区外面 —— 这是两边唯一的真实差别
        const tier = gentleTier(pct);
        const ev = tier.title,
          ed = tier.descShort,
          eh = tier.mark;
        x.fillText(eh, W / 2, 400);
        x.fillStyle = '#ffb6c8';
        x.font = 'bold 36px serif';
        x.fillText(ev, W / 2, 520);
        x.fillStyle = 'rgba(255,200,220,0.75)';
        x.font = '28px serif';
        wrapText(x, ed, 100, 600, W - 200, 48);
        // 再测一次
        x.fillStyle = 'rgba(255,100,150,0.2)';
        x.fillRect(260, 1240, 504, 110);
        x.strokeStyle = 'rgba(255,130,170,0.4)';
        x.lineWidth = 4;
        x.strokeRect(260, 1240, 504, 110);
        x.fillStyle = '#ff8fab';
        x.font = 'bold 32px serif';
        x.fillText('再测一次', W / 2, 1310);
      }
      tex.needsUpdate = true;
    } catch (e) {
      console.error('drawPanel error:', e);
    }
  }

  // 文字换行辅助
  function wrapText(ctx, text, x, y, maxW, lineH) {
    const words = text.split('');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxW && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n];
        y += lineH;
      } else line = testLine;
    }
    ctx.fillText(line, x, y);
  }

  // 处理点击（UV坐标）
  function handleClick(uv) {
    const cx = uv.x * W,
      cy = (1 - uv.y) * H;
    // 点击视觉反馈：emissive闪烁
    const oldE = mat.emissiveIntensity;
    mat.emissiveIntensity = 0.5;
    setTimeout(() => {
      mat.emissiveIntensity = oldE;
    }, 150);

    if (curQ === -1) {
      // 标题页：点击开始按钮区域（260,960 ~ 764,1080）
      if (cx > 260 && cx < 764 && cy > 960 && cy < 1080) {
        curQ = 0;
        selIdx = -1;
        totalS = 0;
        picked = [];
        drawPanel();
      }
    } else if (curQ < qs.length) {
      // 选项点击区域
      if (selIdx < 0) {
        for (let i = 0; i < 4; i++) {
          const y = 480 + i * 230;
          if (cx > 70 && cx < W - 70 && cy > y - 20 && cy < y + 160) {
            selIdx = i;
            picked[curQ] = i;
            totalS += qs[curQ].o[i].s;
            drawPanel();
            return;
          }
        }
      }
      // 下一题按钮（320,1420 ~ 704,1508）
      if (selIdx >= 0 && cx > 320 && cx < 704 && cy > 1420 && cy < 1508) {
        curQ++;
        selIdx = -1;
        // 收卷写在「进入结果页」这一次转换上,不写在 drawPanel 里
        // (drawPanel 会被每次点击重跑,把落库塞进渲染就等于每画一次写一次)
        if (curQ >= qs.length) ctx.store.setJson('gentleTest', gentleRecord(picked, Date.now()));
        drawPanel();
      }
    } else {
      // 结果页：再测一次（260,1240 ~ 764,1350）
      if (cx > 260 && cx < 764 && cy > 1240 && cy < 1350) {
        curQ = -1;
        selIdx = -1;
        totalS = 0;
        picked = [];
        drawPanel();
      }
    }
  }

  // 创建面板（2.5x3.5m 大图，填满墙面）
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.4,
    metalness: 0.1,
    emissive: '#ff8fab',
    emissiveIntensity: 0.08,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), mat);
  mesh.position.set(-8, 2.2, -7.5);
  mesh.rotation.y = Math.PI / 2;
  s.add(mesh);
  const pl = new THREE.PointLight('#ff8fab', 2, 4, 1.5);
  pl.position.set(-7.5, 2.2, -7.5);
  s.add(pl);

  // 标记为问卷面板
  mesh.userData = { isWallQuiz: true, handleClick: handleClick };
  iG.push(mesh);

  // 初始绘制
  drawPanel();
})();
