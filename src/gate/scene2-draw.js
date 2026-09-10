// scene2-draw.js — B612 剧本第 2 场·画羊四笔(2026-09-07,主人定方案三:灰线稿常驻+任意涂抹+定稿描线)
// 流程:crash-site 叫醒词收束 → ctx.events.emit('story:scene2') → 画板淡入 →
//   四轮「淡灰线稿常驻 → 玩家涂抹(无判定) → 停笔/点『画好了』 → 深色定稿线在涂鸦上生长 → 王子台词」
//   → 第四笔箱子后:满意对话 + 羊初声四句 → 存档 scene2 标记 → 画板淡出。
// 线稿坐标:720×460(与电影 fSketch 同系)。第一笔复用电影 TRUTH(蟒蛇吞象)描线资产。
import { ctx } from '../ctx.js';
import { Z } from '../shared/z-layers.mjs';
import { SCENE2, tt, whoSpk } from '../shared/story-text.mjs';
import { TRUTH } from './film-strokes.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOARD_Z = 60; // 盖过世界与 HUD,低于手绘对话框(80)

// 三组新手绘线稿(病羊/公羊/箱子);孩子画风格,少笔数。
// 2026-09-10 主人定「定稿更生动」:基础轮廓后接一批细节笔(delay 续奏)——
// 垂耳/闭眼/叹气/羊毛卷/羊角纹/山羊胡/落影/草叶;箱子加第三个气孔+孔里飘出的呼吸+暖光。
// delay=ms(定稿起笔时刻);无 delay 的基础笔按序 110ms 错峰,像一笔一笔画出来的。
const SHEEP_SICK = [
  { d: 'M270,300 C285,255 360,240 420,265 C455,280 455,320 425,335 C360,362 295,350 270,300', t: 900, w: 3.4 },
  { d: 'M270,300 C240,305 218,325 222,350 C224,362 238,366 248,358', t: 700, w: 3 },
  { d: 'M232,326 C220,318 210,322 208,332', t: 400, w: 2.2, soft: true },
  { d: 'M310,352 L306,395', t: 300, w: 2.6 },
  { d: 'M355,358 L355,398', t: 300, w: 2.6 },
  { d: 'M400,352 L404,392', t: 300, w: 2.6 },
  { d: 'M428,330 C446,338 450,352 440,362', t: 400, w: 2.2, soft: true },
  { d: 'M240,335 a3,3 0 1,0 .1,0', t: 250, fill: true },
  { d: 'M236,352 C242,356 250,355 254,350', t: 300, w: 1.8, soft: true },
  { d: 'M216,321 C207,332 207,345 217,354', t: 500, w: 2.2, delay: 1150 },
  { d: 'M232,331 L250,329', t: 300, w: 2, delay: 1300 },
  { d: 'M236,333 a1.3,1.3 0 1,0 .1,0', t: 220, fill: true, hl: true, delay: 1440 },
  { d: 'M298,262 a9,9 0 0,1 17,2', t: 380, w: 1.8, soft: true, delay: 1580 },
  { d: 'M338,254 a9,9 0 0,1 17,2', t: 380, w: 1.8, soft: true, delay: 1700 },
  { d: 'M380,254 a9,9 0 0,1 17,3', t: 380, w: 1.8, soft: true, delay: 1820 },
  { d: 'M258,372 C266,368 273,376 281,371', t: 420, w: 1.6, soft: true, delay: 1950 },
  { d: 'M212,404 C216,392 222,388 228,390', t: 380, w: 2, delay: 2080 },
  { d: 'M224,405 C228,395 234,392 240,393', t: 380, w: 2, delay: 2180 },
  { d: 'M244,402 C310,410 420,410 474,400', t: 600, w: 2, soft: true, delay: 2290 },
];
const RAM = [
  { d: 'M260,300 C270,255 350,240 420,262 C458,275 462,318 430,335 C365,362 285,352 260,300', t: 900, w: 3.4 },
  { d: 'M430,290 C462,282 482,268 490,248', t: 600, w: 3 },
  { d: 'M488,252 C470,215 505,198 522,220 C532,234 522,248 508,246', t: 800, w: 3.2 },
  { d: 'M470,258 C462,232 482,222 494,236', t: 500, w: 2.4, soft: true },
  { d: 'M305,352 L302,395', t: 300, w: 2.6 },
  { d: 'M355,358 L355,398', t: 300, w: 2.6 },
  { d: 'M405,352 L410,392', t: 300, w: 2.6 },
  { d: 'M336,355 L336,396', t: 300, w: 2.6 },
  { d: 'M470,285 a3,3 0 1,0 .1,0', t: 250, fill: true },
  { d: 'M461,272 L483,268', t: 300, w: 2.2, delay: 1150 },
  { d: 'M468,283 a1.3,1.3 0 1,0 .1,0', t: 220, fill: true, hl: true, delay: 1290 },
  { d: 'M490,296 C494,306 492,315 486,321', t: 420, w: 2, delay: 1430 },
  { d: 'M494,238 C504,227 515,226 520,232', t: 500, w: 1.7, soft: true, delay: 1560 },
  { d: 'M298,266 a9,9 0 0,1 18,3', t: 380, w: 1.8, soft: true, delay: 1690 },
  { d: 'M334,256 a9,9 0 0,1 18,3', t: 380, w: 1.8, soft: true, delay: 1810 },
  { d: 'M262,304 C253,310 253,320 262,326', t: 420, w: 2, delay: 1940 },
  { d: 'M296,398 L288,408', t: 260, w: 2, delay: 2070 },
  { d: 'M326,400 L318,410', t: 260, w: 2, delay: 2160 },
  { d: 'M300,402 C360,411 440,411 496,401', t: 600, w: 2, soft: true, delay: 2250 },
];
const BOX = [
  { d: 'M250,270 L470,270 L470,390 L250,390 Z', t: 1100, w: 3.6 },
  { d: 'M250,270 L300,225 L520,225 L470,270', t: 800, w: 3.2 },
  { d: 'M470,270 L520,225 L520,345 L470,390', t: 800, w: 3.2 },
  { d: 'M300,300 a5,5 0 1,0 .1,0', t: 250, fill: true },
  { d: 'M340,300 a5,5 0 1,0 .1,0', t: 250, fill: true },
  { d: 'M270,340 C320,332 400,332 450,340', t: 500, w: 1.8, soft: true },
  { d: 'M270,362 C320,354 400,354 450,362', t: 500, w: 1.8, soft: true },
  { d: 'M366,328 a118,64 0 1,0 .1,0', t: 900, glow: true, delay: 0 },
  { d: 'M374,300 a5,5 0 1,0 .1,0', t: 250, fill: true, delay: 1250 },
  { d: 'M305,290 C300,280 306,272 301,263', t: 500, w: 1.6, soft: true, delay: 1390 },
  { d: 'M345,290 C341,281 346,273 342,265', t: 500, w: 1.6, soft: true, delay: 1510 },
  { d: 'M494,386 C498,372 505,367 512,369', t: 420, w: 2, delay: 1640 },
  { d: 'M506,388 C511,376 518,372 524,374', t: 420, w: 2, delay: 1750 },
  { d: 'M262,398 C330,406 430,406 486,398', t: 600, w: 2, soft: true, delay: 1870 },
];

const ROUNDS = [
  { strokes: TRUTH, line: SCENE2.round1 },
  { strokes: SHEEP_SICK, line: SCENE2.round2 },
  { strokes: RAM, line: SCENE2.round3 },
  { strokes: BOX, line: SCENE2.round4 },
];

let active = false;
let root = null;
let guideStyle = null; // 画板期间的指引卡抑制样式
let layerGuide = null, layerInk = null, layerPlayer = null;
let svg = null;
let roundIdx = 0;
let drawing = false;
let curStroke = null;
let submitTimer = null;
let busy = false;

// 剧情重置入口(?storyreset,2026-09-10):清剧本进度标记,重走画羊→回忆夜全链。
// 验收/演示用——正式玩家的存档不受影响(不带参数时本模块零行为)。
if (new URLSearchParams(location.search).has('storyreset')) {
  ctx.store.unmark('scene2');
  ctx.store.unmark('page1');
}

function el(tag, css, parent) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  (parent || root).appendChild(e);
  return e;
}
function $(id) {
  return document.getElementById(id);
}

export function initScene2() {
  ctx.events.on('story:scene2', open);
  // 事件到达时若不在主世界(画板属于沙漠现实层),挂起到回主世界再开
  ctx.events.on('world:changed', function (e) {
    if (pendingOpen && e && e.to === 'main') {
      pendingOpen = false;
      open();
    }
  });
}
initScene2();

let pendingOpen = false;
function open() {
  if (active || ctx.store.flag('scene2')) return;
  if ((ctx.scene.activeWorld || 'main') !== 'main') {
    pendingOpen = true; // 挂起:回主世界时由 world:changed 拉起
    return;
  }
  active = true;
  roundIdx = 0;
  // 画板期间抑制初见指引卡(它在屏幕中央 64% 处,正好压住画纸中心)
  document.body.classList.add('scene2BoardActive');
  guideStyle = document.createElement('style');
  guideStyle.textContent = 'body.scene2BoardActive #guideCard{display:none!important}';
  document.head.appendChild(guideStyle);
  root = document.createElement('div');
  root.id = 'scene2Board';
  root.style.cssText =
    'position:fixed;inset:0;z-index:' + BOARD_Z + ';display:flex;align-items:center;justify-content:center;flex-direction:column;' +
    'background:radial-gradient(120% 90% at 50% 40%, #f8f1df 0%, #f3ead2 55%, #eadfc2 100%);opacity:0;transition:opacity 1.2s ease';
  svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 720 460');
  svg.style.cssText = 'width:min(92vw,150vh);max-height:82vh;touch-action:none;cursor:crosshair';
  layerGuide = document.createElementNS(SVG_NS, 'g');
  layerInk = document.createElementNS(SVG_NS, 'g');
  layerPlayer = document.createElementNS(SVG_NS, 'g');
  svg.append(layerGuide, layerPlayer, layerInk);
  root.appendChild(svg);
  el('div', 'position:absolute;top:3.5vh;left:0;right:0;text-align:center;color:#8a7a62;font-size:14px;letter-spacing:2px', root)
    .textContent = tt(SCENE2.hint);
  const roundTag = el('div', 'position:absolute;top:3.5vh;right:3vw;color:#a04a35;font-size:13px;letter-spacing:3px', root);
  roundTag.id = 'scene2Round';
  const doneBtn = el(
    'button',
    'position:absolute;right:3vw;bottom:5vh;padding:11px 30px;border-radius:24px;border:1px solid rgba(120,90,50,.55);' +
      'background:rgba(255,250,235,.9);color:#4e4237;font-size:15px;letter-spacing:3px;cursor:pointer;font-family:inherit',
    root
  );
  doneBtn.id = 'scene2Done';
  doneBtn.onclick = function () {
    submit(); // 画好了:停笔定稿(玩家可画可不画,零输入也能推进)
  };
  // 停笔 6s 自动提交(画板不给卡死机会;玩家随时可点「画好了」提前)
  submitTimer = setTimeout(function () {
    if (document.getElementById('scene2Done')) submit();
  }, 6000);
  root.appendChild(doneBtn);
  document.body.appendChild(root);
  requestAnimationFrame(() => (root.style.opacity = '1'));
  round();
}

function setRoundUi() {
  $('scene2Round').textContent = (roundIdx + 1) + ' / 4';
  $('scene2Done').textContent = tt(SCENE2.doneBtn);
}

function clearPaper() {
  layerGuide.innerHTML = '';
  layerPlayer.innerHTML = '';
  layerInk.innerHTML = '';
  playerStrokesClear();
}

let guidePaths = [];
function round() {
  busy = false;
  drawing = true;
  setRoundUi();
  // 每轮重挂 6s 自动提交(零输入也不卡死;玩家随时可点「画好了」提前)
  if (submitTimer) clearTimeout(submitTimer);
  submitTimer = setTimeout(function () {
    if (document.getElementById('scene2Done')) submit();
  }, 6000);
  // 常驻淡灰线稿:定稿路径先以浅灰完整铺底(暖光垫底层不进线稿)
  guidePaths = [];
  ROUNDS[roundIdx].strokes.forEach((st) => {
    if (st.glow) return;
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', st.d);
    p.setAttribute('stroke', '#c9bda8');
    p.setAttribute('stroke-width', (st.w || 3) * 0.85);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-linecap', 'round');
    p.style.opacity = 0.55;
    layerGuide.appendChild(p);
    guidePaths.push(p);
  });
  bindDraw();
}

function playerStrokesClear() {
  if (submitTimer) clearTimeout(submitTimer);
  submitTimer = null;
  curStroke = null;
  layerPlayer.innerHTML = '';
}

// —— 玩家涂抹(pointer 统一鼠标/触屏) ——
let ptActive = false;
function bindDraw() {
  const toSvg = (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  svg.onpointerdown = function (e) {
    if (!drawing || busy) return;
    // 落笔即取消挂起的定稿倒计时(2026-09-10 主人报「无法画羊」):
    // 否则上一笔收笔的 1.6s 倒计时会在第二笔画到一半时炸响,把羊拦腰收走
    if (submitTimer) {
      clearTimeout(submitTimer);
      submitTimer = null;
    }
    ptActive = true;
    const p = toSvg(e);
    curStroke = document.createElementNS(SVG_NS, 'path');
    curStroke.setAttribute('d', 'M' + p.x.toFixed(1) + ',' + p.y.toFixed(1));
    curStroke.setAttribute('stroke', '#4e4237');
    curStroke.setAttribute('stroke-width', 2.6);
    curStroke.setAttribute('fill', 'none');
    curStroke.setAttribute('stroke-linecap', 'round');
    curStroke.style.opacity = 0.85;
    layerPlayer.appendChild(curStroke);
    svg.setPointerCapture(e.pointerId);
  };
  svg.onpointermove = function (e) {
    if (!ptActive || !curStroke) return;
    const p = toSvg(e);
    const d = curStroke.getAttribute('d');
    curStroke.setAttribute('d', d + ' L' + p.x.toFixed(1) + ',' + p.y.toFixed(1));
  };
  svg.onpointerup = svg.onpointercancel = function () {
    if (!ptActive) return;
    ptActive = false;
    scheduleSubmit();
  };
}

function scheduleSubmit() {
  if (submitTimer) clearTimeout(submitTimer);
  submitTimer = setTimeout(submit, 1600); // 停笔 1.6s 自动定稿
}

// —— 定稿:玩家笔迹淡为浅底,深色定稿线逐笔生长(基础笔 110ms 错峰起笔,
//      细节笔按 delay 续奏——像有人当场把羊一笔一笔描活);收笔整幅轻呼吸一次 ——
async function submit() {
  console.log('[scene2] submit r=' + (roundIdx + 1));
  if (busy) return;
  busy = true;
  drawing = false;
  layerPlayer.style.transition = 'opacity 1.1s ease';
  layerPlayer.style.opacity = 0.16; // 玩家涂鸦淡成浅底,一直留在纸上
  const anims = [];
  ROUNDS[roundIdx].strokes.forEach((st, i) => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', st.d);
    if (st.fill || st.glow) {
      p.setAttribute('fill', st.hl ? '#f7f0dd' : st.glow ? 'rgba(213,176,110,.30)' : '#4e4237');
      p.setAttribute('stroke', 'none');
    } else {
      p.setAttribute('stroke', st.soft ? 'rgba(84,70,58,.4)' : '#4e4237');
      p.setAttribute('stroke-width', st.w || 3.1);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
    }
    p.style.opacity = 0;
    (st.glow ? layerGuide : layerInk).appendChild(p); // 暖光垫底,墨线在上
    anims.push(grow(p, st.t || 500, st.fill || st.glow, st.delay != null ? st.delay : i * 110));
  });
  await Promise.all(anims).catch(() => {});
  // 收笔呼吸:整幅轻轻鼓一下(画箱子的这一幅=看不见的羊在里面呼吸)
  try {
    layerInk.style.transformBox = 'fill-box';
    layerInk.style.transformOrigin = 'center';
    layerInk.animate(
      [
        { transform: 'scale(1) rotate(0deg)' },
        { transform: 'scale(1.02) rotate(.4deg)' },
        { transform: 'scale(1) rotate(0deg)' },
      ],
      { duration: 900, easing: 'ease-in-out' }
    );
  } catch (e) {}
  await new Promise((r) => setTimeout(r, 500));
  const line = ROUNDS[roundIdx].line;
  console.log('[scene2] 提交定稿 r=' + (roundIdx + 1));
  speakOne(line, function () {
    console.log('[scene2] 台词收束 r=' + (roundIdx + 1) + ' → 下一轮');
    roundIdx++;
    if (roundIdx < ROUNDS.length) {
      clearPaper();
      round();
    } else {
      finale();
    }
  });
}

// 单条王子台词:按句长自动停留(长句更久),点按可提前收束;心跳守护防链断
function speakOne(line, done) {
  const stay = Math.max(4600, (line.en || '').length * 90);
  let spent = false; // onDone 与心跳守护只许一个推进(晚到的重复收束吞掉)
  const finish = function () {
    if (spent) return;
    spent = true;
    clearTimeout(wd);
    done();
  };
  ctx.openDialog({
    speaker: tt(SCENE2.who.prince),
    speakerType: whoSpk(SCENE2.who.prince),
    lines: [tt(line)],
    autoHide: stay,
    lock: true,
    onDone: finish,
  });
  // 心跳守护:onDone 意外丢失(对话框被外力关掉)时兜底推进,链不悬死
  clearTimeout(wd);
  wd = setTimeout(function () {
    if (!ctx.dialogOpen || !ctx.dialogOpen()) finish();
  }, stay + 2600);
}
let wd = null;

function grow(p, t, isFill, delay) {
  if (isFill) {
    return p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: t * 2, delay: delay || 0, fill: 'forwards' })
      .finished.catch(() => {});
  }
  const L = p.getTotalLength();
  p.style.strokeDasharray = L;
  p.style.strokeDashoffset = L;
  p.style.opacity = 1;
  return p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], {
    duration: t,
    delay: delay || 0,
    easing: 'cubic-bezier(.42,.08,.58,.92)',
    fill: 'forwards',
  }).finished.catch(() => {});
}

// —— 台词队列:逐条手绘对话框,点按或按句长自动下一条;lock 互斥 + 心跳守护 ——
function speakSeq(seq, i, done) {
  if (!active) return done && done();
  if (i >= seq.length) return done && done();
  const item = seq[i];
  const stay = Math.max(4600, ((item.en || '').length * 65) | 0); // 长句更久,点按可提前
  let spent = false; // onDone 与心跳守护只许一个推进(晚到的重复收束吞掉)
  const finish = function () {
    if (spent) return;
    spent = true;
    clearTimeout(wd);
    speakSeq(seq, i + 1, done);
  };
  ctx.openDialog({
    speaker: tt(item.who),
    speakerType: whoSpk(item.who),
    lines: [tt(item)],
    autoHide: stay,
    lock: true,
    onDone: finish,
  });
  clearTimeout(wd);
  wd = setTimeout(function () {
    if (!ctx.dialogOpen || !ctx.dialogOpen()) finish();
  }, stay + 2600);
}
// —— 第四笔后:满意对话 + 羊初声 → 存档 → 画板淡出 → 广播完成(转夜等后续场景就绪) ——
function finale() {
  speakSeq(SCENE2.after.concat(SCENE2.voice), 0, function () {
    try {
      ctx.store.mark('scene2');
      ctx.events.emit('story:scene2done'); // scene3-night 收到后才转夜+羊箱计数
    } catch (e) {
      console.error('[scene2] 收束异常:', e.message);
    }
    root.style.opacity = '0';
    setTimeout(function () {
      root.remove();
      root = null;
      active = false;
      document.body.classList.remove('scene2BoardActive'); // 指引卡解禁
      if (guideStyle) {
        guideStyle.remove();
        guideStyle = null;
      }
    }, 1300);
  });
}
