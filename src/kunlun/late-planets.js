// late-planets.js — B612 剧本第 8、9 场 · 328 商人 / 329 点灯人 / 330 地理学家(2026-10-04 剧本补全)
// 三颗星同一套流程(与 scene7-vanity 同规):
//   进星(上一颗已完成)→ chainA(登场)→ 小玩法(陪他做一件「大人的正经事」)→ chainB(收束)
//   → 星屑拾取(3m,光柱信标)→ setChapter(n) → 旅途卡翻到下一站(ui/voyage.js)。
// 小玩法都很短,而且都「做不对也不会卡住」——它们是让玩家亲手感受那件事有多荒唐,不是考试:
//   328 陪商人数星星:点天上的星,账上 +1,数到第七颗「锁进抽屉」;
//   329 陪点灯人点灯:一分钟一天,天黑点灯、天亮熄灯,跟上六次;
//   330 给地理学家讲 B612:三座火山都记下了,讲到花,他不录——于是有了「朝生暮死」那段。
// 回忆里的大人用纸剪影立在道具旁(画布绘制,零模型依赖)。台词单一源 shared/story-text.mjs。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { tt, whoSpk } from '../shared/story-text.mjs';
import { SCENE8_BUSINESS, SCENE8_LAMP, SCENE9_GEO } from '../shared/story-text.mjs';
import { PLANETS, PICK_RADIUS, DOOR_RADIUS } from '../shared/planet-logic.mjs';
import { Z } from '../shared/z-layers.mjs';
import { createBeaconKeeper, pulseBeacon } from '../shared/beacon-manager.js';
import { createVisitClock } from '../shared/visit-timers.mjs';
import { setLampLit } from './planet-props.js';

const STAGES = {
  king328: { idx: 3, text: SCENE8_BUSINESS, game: businessGame, figure: 'businessman' },
  king329: { idx: 4, text: SCENE8_LAMP, game: lampGame, figure: 'lamplighter' },
  king330: { idx: 5, text: SCENE9_GEO, game: geoGame, figure: 'geographer' },
};
const DONE_TOAST = {
  king328: { en: 'Page VI · the businessman is written.', zh: '书页六 · 商人,写完了。' },
  king329: { en: 'Page VI is written.', zh: '书页六,写完了。' },
  king330: { en: 'Page VII is written. Next: the Earth.', zh: '书页七,写完了。下一站:地球。' },
};
const PICKUP_TOAST = {
  en: 'His stardust is glowing behind you — walk to the light to keep it.',
  zh: '他的星屑在你身后发光——走到光柱里收下它。',
};

// —— 每颗星的状态(换星即复位未完成的那颗) ——
const st = {}; // world → { arrival, pickupArmed, starTaken, done, doorArmed, figure }(光柱信标改由 keepers 记账)
function S(world) {
  return (st[world] = st[world] || {});
}
window.__late = window.__late || {}; // 探针:window.__late[world] = 阶段名

function worldScene(world) {
  const w = ctx.scene.worldManager ? ctx.scene.worldManager.getWorld(world) : null;
  return w ? w.scene : null;
}
function obj(world, name) {
  const sc = worldScene(world);
  return sc ? sc.getObjectByName(name) : null;
}

// —— 台词队列(与 scene7-vanity 同规:lock 互斥 + spent 幂等 + 心跳守护) ——
//
// 每次"进入这颗星"是一条**世代**(2026-10-17 外部审计 C4)。原来只有 `activeWorld !== home` 这一道闸,
// 它挡得住"台词漏白到新场景",挡不住**同世界快返**:离开再走回来,那句话照样成立 ——
// 而离场时 `s.arrival` 被复位、重进又 `begin()` 一次 ⇒ 上一世的心跳与新世那一条同时在讲,
// 同一段 chainA 播两遍。机制与三条契约在 `shared/visit-timers.mjs`(单测钉死,不靠字符串)。
// 顺带:旧版这里是一只模块级 `speakTimer`,三颗星共用 ⇒ A 星的心跳会被 B 星的 finish 摘掉
// (形态同 2026-10-14 PR2 在 hot.js 抓到的那只单槽缺陷)。计时器现在归世代所有,bump 一并掐掉。
const visits = createVisitClock((w) => (ctx.scene.activeWorld || '') === w);
// M-03:心跳守护只看 `dialogOpen() === false`,而离开这颗星时 cancelWorld 关对话框同样满足它
// ⇒ 老写法会把下一句弹在新场景里(链子还顺带推进章节)。世代判定把这层一并堵死。
function speakSeq(seq, i, done, home) {
  const gen = visits.gen(home);
  let beat = null; // 先声明再赋值:openDialog 若同步回调 onDone,直接引用 const beat 会撞 TDZ
  const advance = () => {
    if (!visits.alive(home, gen)) return;
    if (i >= seq.length) {
      if (done) done();
      return;
    }
    const item = seq[i];
    let spent = false;
    const finish = function () {
      if (spent) return;
      spent = true;
      clearTimeout(beat);
      i++;
      advance();
    };
    const hold = Math.max(4600, ((item.en || '').length * 65) | 0);
    ctx.openDialog({
      speaker: tt(item.who),
      speakerType: whoSpk(item.who),
      lines: [tt(item)],
      autoHide: hold,
      lock: true,
      onDone: finish,
    });
    beat = visits.later(
      home,
      gen,
      function () {
        if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
      },
      hold + 2600
    );
  };
  advance();
}

// —— 光柱信标:几何/材质/拆/呼吸都在 shared/beacon-manager.js(零 PointLight 铁律在那儿唯一表达)。
// 这里三颗星共用同一套流程,所以 keeper 按世界名分格,槽位仍叫 beacon / doorBeacon(状态字段旧名)。
const keepers = new Map(); // world → keeper
function beaconKeeper(world) {
  let k = keepers.get(world);
  if (!k) {
    k = createBeaconKeeper(() => worldScene(world));
    keepers.set(world, k);
  }
  return k;
}
function dropBeacon(world, key) {
  const k = keepers.get(world);
  return k ? k.remove(key) : false;
}
function armBeacon(world, key, objName, h) {
  const k = beaconKeeper(world);
  if (k.has(key)) return;
  const o = obj(world, objName);
  if (!o) return;
  // 星屑/石环都挂在岛组下(独立世界岛心为原点);岛顶高度 = 星屑 y - 1.15(planets.js buildIsland)
  const top = (obj(world, 'sproutMote')?.position.y || 1.15) - 1.15;
  k.arm(key, {
    x: o.position.x,
    z: o.position.z,
    baseY: top + 0.1,
    h,
    r: 0.42,
    opacity: key === 'beacon' ? 0.3 : 0.26,
    name: 'storyBeacon',
  });
}

// —— 纸剪影:回忆里的大人(画布画,Sprite 永远面向镜头) ——
function paperFigure(kind) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const x = cv.getContext('2d');
  const coat = { businessman: '#3b3f4a', lamplighter: '#5b6f8a', geographer: '#6a5238' }[kind];
  x.fillStyle = '#efe4c9';
  x.strokeStyle = '#2b2218';
  x.lineWidth = 3;
  // 外圈纸边(剪纸感)
  const body = new Path2D();
  body.moveTo(40, 110);
  body.lineTo(88, 110);
  body.lineTo(104, 236);
  body.lineTo(24, 236);
  body.closePath();
  x.fillStyle = coat;
  x.fill(body);
  x.stroke(body);
  // 头
  x.beginPath();
  x.arc(64, 82, 26, 0, Math.PI * 2);
  x.fillStyle = '#f2d7b6';
  x.fill();
  x.stroke();
  x.fillStyle = '#2b2218';
  if (kind === 'businessman') {
    // 圆顶礼帽 + 领带 + 手里的账本
    x.fillRect(38, 54, 52, 6);
    x.beginPath();
    x.arc(64, 54, 18, Math.PI, 0);
    x.fill();
    x.fillStyle = '#8a2c2c';
    x.fillRect(60, 112, 8, 40);
    x.fillStyle = '#f7efdc';
    x.fillRect(70, 150, 30, 22);
    x.strokeRect(70, 150, 30, 22);
  } else if (kind === 'lamplighter') {
    // 鸭舌帽 + 长杆
    x.beginPath();
    x.ellipse(64, 60, 28, 10, 0, Math.PI, 0);
    x.fill();
    x.fillRect(64, 58, 34, 5);
    x.strokeStyle = '#2b2218';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(104, 230);
    x.lineTo(116, 30);
    x.stroke();
    x.fillStyle = '#ffd88a';
    x.beginPath();
    x.arc(116, 28, 6, 0, Math.PI * 2);
    x.fill();
  } else {
    // 白胡子 + 圆眼镜 + 大书
    x.fillStyle = '#f7f3ea';
    x.beginPath();
    x.moveTo(44, 92);
    x.quadraticCurveTo(64, 140, 84, 92);
    x.fill();
    x.stroke();
    x.lineWidth = 2;
    x.beginPath();
    x.arc(55, 80, 6, 0, Math.PI * 2);
    x.arc(73, 80, 6, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#8a4a3a';
    x.fillRect(26, 160, 40, 30);
    x.strokeRect(26, 160, 40, 30);
  }
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthWrite: false,
    })
  );
  sp.scale.set(1.15, 2.3, 1);
  sp.name = 'paperFigure';
  return sp;
}
function placeFigure(world, kind) {
  const s = S(world);
  if (s.figure) return;
  const sc = worldScene(world);
  const mote = obj(world, 'sproutMote');
  if (!sc || !mote) return;
  const top = mote.position.y - 1.15;
  s.figure = paperFigure(kind);
  s.figure.position.set(-1.9, top + 1.15, 0.6);
  sc.add(s.figure);
}

// ===================== 小玩法面板 =====================
const CSS = `
#planetGame{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:${Z.planetGame};width:min(440px,calc(100vw - 24px));
 box-sizing:border-box;background:#ece1c5f2;color:#44382e;border-radius:6px 22px 6px 22px;padding:16px 18px 14px;box-shadow:0 18px 60px #0007;
 font-family:"Kaiti SC","STKaiti","KaiTi",Georgia,serif;text-align:center}
body[data-dialog-open] #planetGame{visibility:hidden}
body[data-planet-game] #storyCompass{display:none!important}
#planetGame h3{margin:0;font-size:19px;letter-spacing:2px;font-weight:normal}
#planetGame .pg-hint{font-size:13.5px;line-height:1.6;color:#79674e;margin:6px 0 10px}
#planetGame .pg-sky{position:relative;height:150px;border-radius:12px;background:#121a30;overflow:hidden;transition:background 1s}
#planetGame .pg-star{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border:0;background:none;cursor:pointer;color:#fff3c8;font-size:22px;
 text-shadow:0 0 10px #ffe9a0;transition:transform .6s,opacity .6s}
#planetGame .pg-star.got{opacity:0;transform:translateY(80px) scale(.3)}
#planetGame .pg-sum{margin-top:10px;font:15px/1.4 Georgia,serif;letter-spacing:1px}
#planetGame .pg-sum b{font-size:19px}
#planetGame .pg-lamp{position:absolute;left:50%;top:34px;width:34px;height:34px;margin-left:-17px;border-radius:50%;background:#5a5648;transition:background .25s,box-shadow .25s}
#planetGame .pg-lamp::after{content:"";position:absolute;left:15px;top:34px;width:4px;height:78px;background:#3a3a44}
#planetGame .pg-lamp.on{background:#ffe9b0;box-shadow:0 0 28px 10px #ffd88a99}
#planetGame .pg-phase{position:absolute;top:8px;left:12px;font-size:13px;letter-spacing:2px;color:#fff8}
#planetGame .pg-say{position:absolute;bottom:8px;left:0;right:0;font-size:14px;color:#ffe9b0;min-height:1.2em}
#planetGame .pg-dots{margin:10px 0 2px;letter-spacing:6px;font-size:14px;color:#b8a587}
#planetGame .pg-dots i{font-style:normal;color:#c98a4b}
#planetGame button.pg-btn{font:inherit;cursor:pointer;color:#fff0cc;background:#6b5634;border:1px solid #af9361;border-radius:22px;padding:10px 22px;min-height:46px;font-size:16px;letter-spacing:2px;margin-top:10px}
#planetGame .pg-ledger{list-style:none;margin:0;padding:0;text-align:left}
#planetGame .pg-ledger li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px dashed #b8a587}
#planetGame .pg-ledger button{font:inherit;cursor:pointer;flex:1;text-align:left;background:none;border:0;color:#44382e;font-size:16px;min-height:40px;padding:0}
#planetGame .pg-ledger span{font-size:13px;color:#5f7b4a;white-space:nowrap}
#planetGame .pg-ledger span.no{color:#a24a2a;text-decoration:none}
@media(max-width:600px){
 body[data-planet-game] #j,body[data-planet-game] #jumpBtnGlide,body[data-planet-game] #viewBtn,body[data-planet-game] #homeBtn,
 body[data-planet-game] #worldNav,body[data-planet-game] #storyCompass{visibility:hidden!important}
}`;
let gameEl = null;
function openPanel(title, hint) {
  closePanel();
  if (!document.getElementById('planetGameCss')) {
    const s = document.createElement('style');
    s.id = 'planetGameCss';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  gameEl = document.createElement('div');
  gameEl.id = 'planetGame';
  gameEl.setAttribute('role', 'group');
  const h = document.createElement('h3');
  h.textContent = tt(title);
  const p = document.createElement('div');
  p.className = 'pg-hint';
  p.textContent = tt(hint);
  gameEl.append(h, p);
  document.body.appendChild(gameEl);
  document.body.dataset.planetGame = '1';
  return gameEl;
}
function closePanel() {
  if (gameEl) gameEl.remove();
  gameEl = null;
  delete document.body.dataset.planetGame;
}
function div(cls, parent, text) {
  const e = document.createElement('div');
  e.className = cls;
  if (text != null) e.textContent = text;
  parent.appendChild(e);
  return e;
}

// —— 328 陪商人数星星:账从 501,622,724 起,点一颗加一,第七颗正好是原著那个数 ——
const STAR_SPOTS = [
  [14, 30],
  [32, 62],
  [48, 22],
  [62, 70],
  [78, 34],
  [88, 72],
  [24, 84],
];
function businessGame(world, done) {
  const g = SCENE8_BUSINESS.game;
  const gen = visits.gen(world); // 本世的号:完成延时只在这一世里有效
  const el = openPanel(g.title, g.hint);
  const sky = div('pg-sky', el);
  const sum = div('pg-sum', el);
  let total = 501622724,
    got = 0;
  const show = () => {
    sum.replaceChildren();
    sum.append(tt(g.total) + '  ');
    const b = document.createElement('b');
    b.textContent = total.toLocaleString('en-US');
    sum.append(b);
  };
  show();
  STAR_SPOTS.forEach(([lx, ty], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pg-star';
    b.textContent = '✦';
    b.style.left = lx + '%';
    b.style.top = ty + '%';
    b.setAttribute('aria-label', 'star ' + (i + 1));
    b.onclick = () => {
      if (b.classList.contains('got')) return;
      b.classList.add('got');
      got++;
      total++;
      show();
      window.__late[world] = 'game:' + got;
      if (got === STAR_SPOTS.length) {
        sum.textContent = tt(g.done) + ' · ' + total.toLocaleString('en-US') + ' 🔒';
        visits.later(
          world,
          gen,
          () => {
            closePanel();
            done();
          },
          1800
        );
      }
    };
    sky.appendChild(b);
  });
}

// —— 329 陪点灯人点灯:2.4 秒一个白天/黑夜;天黑点灯、天亮熄灯,跟上六次 ——
function lampGame(world, done) {
  const g = SCENE8_LAMP.game;
  const gen = visits.gen(world);
  const el = openPanel(g.title, g.hint);
  const sky = div('pg-sky', el);
  const phaseEl = div('pg-phase', sky);
  const lamp = div('pg-lamp', sky);
  const say = div('pg-say', sky);
  const dots = div('pg-dots', el);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pg-btn';
  el.appendChild(btn);
  const head = obj(world, 'lampHead');
  if (head) head.userData.manual = true;
  // 路灯控制权的**唯一**归还路径。旧写法只在"亲手跟上六次"那条通关分支里置回 false,
  // 中途离开这颗星就永久残留 true ⇒ 点灯人自己的开熄灯行为被接管(他不再跟着天亮天黑动)。
  if (head)
    visits.onLeave(world, gen, () => {
      head.userData.manual = false;
    });
  let night = false,
    lit = false,
    good = 0,
    answered = false,
    finished = false;
  const NEED = 6;
  const paint = () => {
    sky.style.background = night ? '#121a30' : '#9cc4e4';
    phaseEl.textContent = tt(night ? g.night : g.day);
    lamp.classList.toggle('on', lit);
    btn.textContent = tt(lit ? g.out : g.light);
    dots.replaceChildren();
    for (let i = 0; i < NEED; i++) {
      if (i < good) {
        const k = document.createElement('i');
        k.textContent = '●';
        dots.appendChild(k);
      } else dots.append('○');
    }
    setLampLit(head, lit);
  };
  const greet = g.good.en.split(' / '),
    greetZh = g.good.zh.split('/');
  btn.onclick = () => {
    if (finished) return;
    lit = !lit;
    // 天黑时点亮、天亮时熄灭,并且这一轮还没算过 → 记一次
    if (!answered && lit === night) {
      answered = true;
      good++;
      say.textContent = tt({
        en: night ? greet[1] : greet[0],
        zh: (night ? greetZh[1] : greetZh[0]).trim(),
      });
      window.__late[world] = 'game:' + good;
    }
    paint();
    if (good >= NEED) {
      finished = true;
      clearInterval(timer);
      visits.later(
        world,
        gen,
        () => {
          if (head) head.userData.manual = false;
          closePanel();
          done();
        },
        1400
      );
    }
  };
  const flip = () => {
    // 判活看**本轮那块面板**还在不在 DOM 里,不是看模块级的全局 `gameEl`:
    // 旧写法离开再重进时 `gameEl` 已经被新面板重新赋值 ⇒ 这个 interval 永远停不下来,
    // 和新那一轮的 flip 一起 paint、一起 setLampLit(head) ⇒ 路灯双频乱闪、玩家跟不上(2026-10-17 C4)。
    if (finished || !el.isConnected) return clearInterval(timer);
    if (ctx.ui.dialogOpen?.()) return; // 对白中天不动
    night = !night;
    answered = false; // 每个白天/黑夜各算一次,要亲手按
    say.textContent = '';
    paint();
  };
  paint();
  const timer = visits.every(world, gen, flip, 2400);
  flip();
}

// —— 330 给地理学家讲 B612:火山都记下;讲到花,他不录,接「朝生暮死」 ——
function geoGame(world, done) {
  const g = SCENE9_GEO.game;
  const gen = visits.gen(world);
  const el = openPanel(g.title, g.hint);
  const list = document.createElement('ul');
  list.className = 'pg-ledger';
  el.appendChild(list);
  let left = g.items.length;
  g.items.forEach((it) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = tt(it);
    b.dataset.item = it.key;
    li.appendChild(b);
    list.appendChild(li);
    b.onclick = () => {
      if (b.disabled) return;
      b.disabled = true;
      left--;
      const tag = document.createElement('span');
      tag.textContent = tt(it.ok ? g.recorded : g.refused);
      if (!it.ok) tag.className = 'no';
      li.appendChild(tag);
      window.__late[world] = 'game:' + (g.items.length - left);
      const next = () => {
        if (left > 0) return;
        visits.later(
          world,
          gen,
          () => {
            closePanel();
            done();
          },
          1200
        );
      };
      if (it.ok) next();
      else {
        window.__late[world] = 'flower';
        speakSeq(SCENE9_GEO.flower, 0, next, world);
      }
    };
  });
}

// ===================== 每颗星的流程 =====================
function begin(world) {
  const cfg = STAGES[world];
  const s = S(world);
  const gen = visits.gen(world); // 本次进入的世代号
  placeFigure(world, cfg.figure);
  window.__late[world] = 'chainA';
  visits.later(
    world,
    gen,
    function () {
      speakSeq(
        cfg.text.chainA,
        0,
        function () {
          if (ctx.scene.activeWorld !== world) return;
          window.__late[world] = 'game';
          cfg.game(world, function () {
            if (ctx.scene.activeWorld !== world) return;
            window.__late[world] = 'chainB';
            speakSeq(
              cfg.text.chainB,
              0,
              function () {
                window.__late[world] = 'pickup';
                s.pickupArmed = true;
                ctx.ui.journey?.clearGoal?.('late-planets'); // 罗盘改指星屑(planets.js 目标解析的兜底)
                armBeacon(world, 'beacon', 'sproutMote', 3.0);
                ctx.ui.modeToast?.(tt(PICKUP_TOAST), 6000);
              },
              world
            );
          });
        },
        world
      );
    },
    1400
  );
}
function pick(world) {
  const cfg = STAGES[world];
  const s = S(world);
  s.starTaken = true;
  s.done = true;
  s.doorArmed = true;
  dropBeacon(world, 'beacon');
  const p = PLANETS[cfg.idx];
  ctx.kunlun.hidePlanetMote && ctx.kunlun.hidePlanetMote(p.key);
  ctx.ui.modeToast?.(tt({ en: 'Stardust · ' + p.en, zh: p.popup }));
  ctx.kunlun.setChapter && ctx.kunlun.setChapter(cfg.idx + 1);
  ctx.ui.journey?.clearGoal?.('late-planets');
  window.__late[world] = 'done';
  visits.later(
    world,
    visits.gen(world),
    function () {
      ctx.ui.modeToast?.(tt(DONE_TOAST[world]));
      armBeacon(world, 'doorBeacon', 'sproutDoor', 3.4);
    },
    1600
  );
  if (ctx.ui.voyage) ctx.ui.voyage.offer(3600);
}
function near(world, name, r2) {
  const o = obj(world, name);
  const pl = ctx.player && ctx.player.pl;
  if (!o || !pl) return false;
  const dx = pl.p.x - o.position.x,
    dz = pl.p.z - o.position.z;
  return dx * dx + dz * dz < r2;
}

let prevWorld = '';
let tickN = 0,
  chapterCached = -1;
ctx.onTick(function latePlanetsTick() {
  const active = ctx.scene.activeWorld || '';
  if (prevWorld !== active && STAGES[prevWorld]) {
    const s = S(prevWorld);
    // **离开这颗星 = 换一世**:掐掉它所有还在飞的计时器并跑 teardown(交还路灯控制权)。
    // 无条件做,不管这颗星是否已完成 —— 已完成那颗也可能有上一世的尾巴(如 pick 的 1600ms toast)。
    // 旧写法只有 `clearTimeout(speakTimer)` 一只全局槽,既管不了玩法内部的计时器,也会误摘别的星的心跳。
    visits.bump(prevWorld);
    if (!s.done) {
      // 中途离开:下次进来从头讲(短场,不存档)
      s.arrival = false;
      s.pickupArmed = false;
      dropBeacon(prevWorld, 'beacon');
      closePanel();
    }
    dropBeacon(prevWorld, 'doorBeacon');
    chapterCached = -1;
  }
  prevWorld = active;
  const cfg = STAGES[active];
  if (!cfg) return;
  const s = S(active);
  const t = Date.now() * 0.001;
  const kb = keepers.get(active);
  if (kb) for (const key of kb.keys()) pulseBeacon(kb.get(key), t);
  // 回程石环(章节完成后常驻):走进 3m → 回 B612(与 325~327 同规)
  if (s.doorArmed && near(active, 'sproutDoor', DOOR_RADIUS * DOOR_RADIUS)) {
    s.doorArmed = false;
    dropBeacon(active, 'doorBeacon');
    const wm = ctx.scene.worldManager;
    if (!wm) return;
    // back() 是 async:失败静默返回 false,原 try/catch 包不住,不恢复门/信标玩家被困小岛
    // (2026-10-09 空 catch 治理,scene6-king 同批)
    Promise.resolve(wm.back())
      .then((ok) => {
        if (!ok) {
          s.doorArmed = true;
          armBeacon(active, 'doorBeacon', 'sproutDoor', 3.4);
          console.warn('[late-planets] 回程传送未成,石环已重置');
        }
      })
      .catch(() => {});
    return;
  }
  tickN = (tickN + 1) % 30;
  if (chapterCached < 0 || tickN === 0) chapterCached = ctx.store.num('planetsChapter');
  if (chapterCached > cfg.idx) {
    // 重访:纯观赏,剪影仍在,回程石环就位
    if (!s.done) {
      s.done = true;
      s.doorArmed = true;
      placeFigure(active, cfg.figure);
    }
    return;
  }
  if (chapterCached < cfg.idx) return; // 前一颗还没走完(导航与旅途卡不会送人来,双保险)
  if (s.pickupArmed && !s.starTaken) {
    if (near(active, 'sproutMote', PICK_RADIUS * PICK_RADIUS)) pick(active);
    return;
  }
  if (s.arrival) return;
  if (ctx.scene.worldManager?.transitioning || document.body.dataset.voyage) return;
  s.arrival = true;
  ctx.ui.journey?.setGoal?.('late-planets', {
    world: active,
    x: 0,
    z: 0,
    zh: '聆听' + PLANETS[cfg.idx].name.replace('之星', '') + '与小王子的对话',
    en: 'Listen to ' + PLANETS[cfg.idx].en + ' and the little prince',
  });
  begin(active);
});

// 探针钩子(只读 + 测试用跳步)
window.__latePlanets = {
  state: (w) =>
    Object.assign(
      { stage: window.__late[w], gen: visits.gen(w), pending: visits.pending(w) },
      S(w)
    ),
};
