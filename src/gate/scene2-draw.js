// scene2-draw.js — B612 剧本第 2 场·画羊四笔(2026-09-07,主人定方案三:灰线稿常驻+任意涂抹+定稿描线)
// 流程:crash-site 叫醒词收束 → ctx.events.emit('story:scene2') → 画板淡入 →
//   四轮「淡灰线稿常驻 → 玩家涂抹(无判定) → 停笔/点『画好了』 → 深色定稿线在涂鸦上生长 → 王子台词」
//   → 第四笔箱子后:满意对话 + 羊初声四句 → 存档 scene2 标记 → 画板淡出。
// 线稿坐标:720×460(与电影 fSketch 同系)。第一笔复用电影 TRUTH(蟒蛇吞象)描线资产。
import { ctx } from '../ctx.js';
import { Z } from '../shared/z-layers.mjs';
import { SCENE2, tt, whoSpk } from '../shared/story-text.mjs';
import { replyChoices } from '../shared/dialog-replies.mjs';
import { TRUTH } from './film-strokes.mjs';
import { SHEEP_SICK, RAM, BOX } from '../shared/scene2-sketches.mjs';
import { shiftDayTo } from '../scene/time-shift.js';
import { DAY_HOURS } from '../shared/dayphase-logic.mjs';
import { smoothPath, savePortfolioDrawing, ROUND_IDS } from '../shared/portfolio-logic.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOARD_Z = 60; // 盖过世界与 HUD,低于手绘对话框(80)

// 三组线稿(病羊/公羊/箱子)在 shared/scene2-sketches.mjs(作品集也要用同一份)

const ROUNDS = [
  { strokes: TRUTH, line: SCENE2.round1 },
  { strokes: SHEEP_SICK, line: SCENE2.round2 },
  { strokes: RAM, line: SCENE2.round3 },
  { strokes: BOX, line: SCENE2.round4 },
];

let active = false;
let root = null;
let guideStyle = null; // 画板期间的指引卡抑制样式
let layerGuide = null,
  layerInk = null,
  layerPlayer = null;
let svg = null;
let roundIdx = 0;
let drawing = false;
let curStroke = null;
let curPts = [];
let roundStrokes = []; // 本轮玩家亲手画的笔迹(定稿时收进作品集)
const MAX_KEEP_STROKES = 80;
let submitTimer = null;
let busy = false;

// 剧情重置入口(?storyreset,2026-09-10):清剧本进度标记,重走画羊→回忆夜全链。
// 验收/演示用——正式玩家的存档不受影响(不带参数时本模块零行为)。
if (new URLSearchParams(location.search).has('storyreset')) {
  ctx.store.unmark('scene2');
  ctx.store.unmark('page1');
  ctx.store.unmark('page2');
  ctx.store.setNum('planetsChapter', 0); // 章节同步归零:325 剧情可重走
  ctx.store.setJson('journeyMemories', []);
  ctx.store.setJson('journeyTaskCheckpoint', null);
  ctx.store.setNum('homeMemoryStep', 0);
  ctx.store.setNum('kingMemoryStep', 0);
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
    // 挂起:回主世界时再开。自愈轮询(2026-09-26 探针实锤):world:changed 是瞬事件,
    // 发射可能早于挂起判定 —— 只靠事件会永久悬挂(画板永远不来,叫醒词说完黑站)。
    if (!pendingOpen) {
      pendingOpen = true;
      const iv = setInterval(function () {
        if (!pendingOpen) {
          clearInterval(iv);
          return;
        }
        if ((ctx.scene.activeWorld || 'main') === 'main') {
          clearInterval(iv);
          pendingOpen = false;
          open();
        }
      }, 1000);
    }
    return;
  }
  active = true;
  roundIdx = 0;
  // 行动指引(2026-09-27「剧情发展指引不清」补齐):画板铺满屏时玩家若没看顶行小字会黑站
  // toast 再直说一次做什么+怎么提交,板上 hint 文案不变
  try {
    ctx.ui.modeToast &&
      ctx.ui.modeToast(tt(SCENE2.hint) + '——' + tt(SCENE2.doneBtn) + '在右下角', 6000);
  } catch (e) {}
  // 台词⇔时间(2026-09-27):画羊是晨光里的事,羊随后问"天亮了吗" —— 先把天光快切到早晨,
  // 转夜时 scene3-night 再滑向深夜,晨→夜弧线完整
  try {
    shiftDayTo(DAY_HOURS.MORNING, 3500);
  } catch (e) {
    console.debug('[scene2] 晨光快切失败(保持当前天光):', e);
  }
  // 画板期间抑制初见指引卡(它在屏幕中央 64% 处,正好压住画纸中心)
  document.body.classList.add('scene2BoardActive');
  guideStyle = document.createElement('style');
  guideStyle.textContent = 'body.scene2BoardActive #guideCard{display:none!important}';
  document.head.appendChild(guideStyle);
  root = document.createElement('div');
  root.id = 'scene2Board';
  root.style.cssText =
    'position:fixed;inset:0;z-index:' +
    BOARD_Z +
    ';display:flex;align-items:center;justify-content:center;flex-direction:column;' +
    'background:radial-gradient(120% 90% at 50% 40%, #f8f1df 0%, #f3ead2 55%, #eadfc2 100%);opacity:0;transition:opacity 1.2s ease';
  svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 720 460');
  svg.style.cssText = 'width:min(92vw,150vh);max-height:82vh;touch-action:none;cursor:crosshair';
  layerGuide = document.createElementNS(SVG_NS, 'g');
  layerInk = document.createElementNS(SVG_NS, 'g');
  layerPlayer = document.createElementNS(SVG_NS, 'g');
  svg.append(layerGuide, layerPlayer, layerInk);
  root.appendChild(svg);
  el(
    'div',
    'position:absolute;top:3.5vh;left:0;right:0;text-align:center;color:#8a7a62;font-size:14px;letter-spacing:2px',
    root
  ).textContent = tt(SCENE2.hint);
  const roundTag = el(
    'div',
    'position:absolute;top:3.5vh;right:3vw;color:#a04a35;font-size:13px;letter-spacing:3px',
    root
  );
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
  // 画纸等待玩家，不再在零输入六秒后替玩家作画。可主动点“画好了”接受线稿。
  root.appendChild(doneBtn);
  document.body.appendChild(root);
  requestAnimationFrame(() => (root.style.opacity = '1'));
  round();
}

function setRoundUi() {
  ctx.ui.journey?.clearGoal('desert-wake');
  ctx.ui.journey?.setPhase('drawing', {
    world: 'main',
    chapter: { zh: '沙漠 · 给小王子画羊', en: 'Desert · draw him a sheep' },
    step: roundIdx + 1,
    total: 4,
    hint: {
      zh: '在淡灰线稿上画，点右下角「画好了」。对白点「继续」，没有倒计时。',
      en: 'Draw over the grey lines, then tap Done. Continue the dialogue when you are ready.',
    },
  });
  $('scene2Round').textContent = roundIdx + 1 + ' / 4';
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
  // 每轮都由玩家确认；没有阅读或绘画倒计时。
  if (submitTimer) clearTimeout(submitTimer);
  submitTimer = null;
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
    p.setAttribute('stroke-linejoin', 'round');
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
  roundStrokes = [];
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
    curPts = [[p.x, p.y]];
    curStroke = document.createElementNS(SVG_NS, 'path');
    curStroke.setAttribute('d', smoothPath(curPts));
    curStroke.setAttribute('stroke', '#4e4237');
    curStroke.setAttribute('stroke-width', 2.6);
    curStroke.setAttribute('fill', 'none');
    curStroke.setAttribute('stroke-linecap', 'round');
    curStroke.setAttribute('stroke-linejoin', 'round');
    curStroke.style.opacity = 0.85;
    layerPlayer.appendChild(curStroke);
    svg.setPointerCapture(e.pointerId);
  };
  svg.onpointermove = function (e) {
    if (!ptActive || !curStroke) return;
    const p = toSvg(e);
    const last = curPts[curPts.length - 1];
    // 小于 1.5 单位的抖动不记点:线更顺,存进作品集也更小
    if (Math.hypot(p.x - last[0], p.y - last[1]) < 1.5) return;
    curPts.push([p.x, p.y]);
    curStroke.setAttribute('d', smoothPath(curPts));
  };
  svg.onpointerup = svg.onpointercancel = function () {
    if (!ptActive) return;
    ptActive = false;
    if (curStroke && roundStrokes.length < MAX_KEEP_STROKES)
      roundStrokes.push(curStroke.getAttribute('d'));
    scheduleSubmit();
  };
}

function scheduleSubmit() {
  if (submitTimer) clearTimeout(submitTimer);
  submitTimer = null; // 收笔后仍可继续画，点“画好了”才定稿。
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
  // 作品集(2026-10-03):玩家这一幅的笔迹 + 对应的原著线稿,收进「未完成的画」画册
  try {
    savePortfolioDrawing(ctx.store, ROUND_IDS[roundIdx], roundStrokes);
  } catch (e) {
    console.debug('[scene2] 作品集保存失败(不影响剧情):', e);
  }
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
      p.setAttribute('stroke-linejoin', 'round');
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
    autoHide: 0,
    world: 'main',
    scope: 'desert-drawing',
    lock: true,
    onDone: finish,
  });
  // 心跳守护:onDone 意外丢失(对话框被外力关掉)时兜底推进,链不悬死
  clearTimeout(wd);
  wd = setTimeout(function () {
    if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
  }, stay + 2600);
}
let wd = null;

function grow(p, t, isFill, delay) {
  if (isFill) {
    return p
      .animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: t * 2,
        delay: delay || 0,
        fill: 'forwards',
      })
      .finished.catch(() => {});
  }
  const L = p.getTotalLength();
  p.style.strokeDasharray = L;
  p.style.strokeDashoffset = L;
  p.style.opacity = 1;
  return p
    .animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], {
      duration: t,
      delay: delay || 0,
      easing: 'cubic-bezier(.42,.08,.58,.92)',
      fill: 'forwards',
    })
    .finished.catch(() => {});
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
    autoHide: 0,
    world: 'main',
    scope: 'desert-drawing',
    lock: true,
    onDone: finish,
  });
  clearTimeout(wd);
  wd = setTimeout(function () {
    if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
  }, stay + 2600);
}
// —— 第四笔后:满意对话 + 玩家开口(REPLIES.drawn) + 羊初声 → 存档 → 画板淡出 → 广播完成 ——
function finale() {
  // 满意对话的末行(王子「瞧!他睡着了……」)单独拎出挂选项:话音刚落,轮到玩家开口
  const afterRest = SCENE2.after.slice(0, -1);
  const lastAfter = SCENE2.after[SCENE2.after.length - 1];
  speakSeq(afterRest, 0, function () {
    const finishDrawn = function () {
      speakSeq(SCENE2.voice, 0, function () {
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
    };
    ctx.openDialog({
      speaker: tt(lastAfter.who),
      speakerType: whoSpk(lastAfter.who),
      lines: [tt(lastAfter)],
      autoHide: 0,
      world: 'main',
      scope: 'desert-drawing',
      lock: true,
      // 轮到玩家开口(2026-09-26 主人令「不仅仅是在放台词」)
      choices: replyChoices(ctx, 'drawn', finishDrawn),
    });
  });
}
