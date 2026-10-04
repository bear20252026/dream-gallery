// kunlun/scene10-fox.js — 站五·狐狸(2026-10-03)
// 剧本定稿第 10 场「站五·狐狸(苹果树下)」/ 原著 Ch.21。
//
// 为什么这一站值得单独做:
//   狐狸是全书**唯一主动请求玩家的角色**("Please-- tame me!")。她不要你救她、
//   不要你理解她,只要你**每天同一个时辰来**。这条要求天然是一种机制:
//   玩家必须做出承诺,然后回来兑现。它是全书关于"责任"这一主题的机制化。
//
// 驯养仪式的设计(对应原著"三次靠近,一次比一次近"):
//   不是任务清单的三格进度条,而是**空间** —— 狐狸在苹果树下,三个坐席由远到近。
//   玩家走过去坐下,狐狸才留下。这是"仪式"的可玩化。
//   时间闸:每天有一个约定时辰(默认黄昏)。时辰外狐狸不在,这是原著"三点起我就开始幸福"的机制。
//   诚实处理:约定时辰可由玩家在面板上改;错过当天不惩罚,但**手札会如实记录**。
//   玩家若不想等真实时间,可在面板上"今天就办"—— 手札会记下是哪种。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { eventBus } from '../core/event-bus.js';
import { createGLTFLoader } from '../scene/gltf-loader.js';
import {
  groundShift,
  lowestGround,
  STAGE,
  STAGE_SINK,
  STANDING,
  CLOUDS,
  CLOUD_LIFT,
  SEAT_LANTERN,
} from '../shared/fox-ground-logic.mjs';
import { Z } from '../shared/z-layers.mjs';
import { tt, SCENE_FOX, FOX_UI } from '../shared/story-text.mjs';

const OWNER = 'fox-scene';
const MODEL = '/models/hall/b612-world/fox-scene.glb'; // 0.42MB(源 1.37MB,meshopt+webp)
const STORE_RITE = 'foxRite'; // { days, lastDay, hour, honest }
const HOURS = 17; // 默认约定时辰:17 点(黄昏)

// 三个坐席:由远到近,坐标相对场景中心(模型已在 GLB 里摆好,这里只做世界落位)
const SEATS = [
  { x: -6.4, z: 5.2, label: { zh: '第一处 · 远一些', en: 'First — a little far' } },
  { x: -3.6, z: 3.0, label: { zh: '第二处 · 近一些', en: 'Second — closer' } },
  { x: -1.2, z: 1.4, label: { zh: '第三处 · 挨着它', en: 'Third — beside it' } },
];
const SITE = { x: -46, z: 34 }; // 落位:画廊区玫瑰馆(144,-60)与坠机点(-9,76)之间,不压任何既有场景

const STYLE = `
#foxPanel{position:fixed;right:90px;bottom:118px;width:min(330px,calc(100vw - 120px));z-index:${Z.questBook};
  display:none;padding:18px 20px;border-radius:4px 20px 4px 20px;
  background:linear-gradient(150deg,rgba(28,30,26,.96),rgba(40,33,24,.96));
  border:1px solid #9a8659;color:#ecdcb8;box-sizing:border-box;
  font-family:"Kaiti SC","STKaiti","KaiTi",serif}
#foxPanel .fx-kicker{font-size:10px;letter-spacing:3px;color:#c6ae7d}
#foxPanel .fx-title{font-size:19px;line-height:1.5;margin:6px 0 8px;color:#fff1ce}
#foxPanel .fx-hint{font-size:13px;line-height:1.75;color:#c5bba8}
#foxPanel .fx-seats{display:flex;gap:7px;margin:12px 0 4px}
#foxPanel .fx-seat{flex:1;height:5px;border-radius:3px;background:#0e1014;border:1px solid #3b3529}
#foxPanel .fx-seat.on{background:linear-gradient(90deg,#c8a45c,#f0d898)}
#foxPanel .fx-hour{font:12px/1.6 sans-serif;color:#b9ab8c;margin:8px 0 0}
#foxPanel .fx-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
#foxPanel button{font:inherit;cursor:pointer;color:#fff0cc;background:#6a5636;border:1px solid #ad9163;
  border-radius:20px;padding:9px 14px;min-height:44px}
#foxPanel button:hover{background:#8a6d3c}
#foxPanel button:disabled{opacity:.45;cursor:default}
body[data-dialog-open] #foxPanel{visibility:hidden}
@media(max-width:600px){#foxPanel{right:70px;bottom:122px;width:calc(100vw - 88px);padding:14px 15px}
#foxPanel .fx-title{font-size:16px}}
`;

let built = false;
let root = null;
let seatMesh = null; // 光点:当前该去的坐席
let light = null;
let panel = null;
let style = null;
let unsub = [];
let active = false;
let current = 0; // 已完成的仪式次数 0..3
let hour = HOURS;
let honest = true; // 是否承诺"明天同一时辰再来"
let foxNode = null;
let princeNode = null;
// 地球之日(2026-10-04 剧本定稿「压缩版」):同一个傍晚坐三次,不按真实日期卡;
// 仪式完成只说秘密的第一句(「回去再看一眼玫瑰」),秘密本身等玩家从玫瑰园回来再说(secret())。
let earth = null; // { onRite } | null

function groundH(x, z) {
  return ctx.media && ctx.media.desert ? ctx.media.desert.getH(x, z) : 0;
}
function whoSpk(w) {
  return (w && w.spk) || '';
}

// —— 存档 ——
function readRite() {
  try {
    return ctx.store.json(STORE_RITE, null) || { days: 0, hour: HOURS, honest: true };
  } catch (e) {
    return { days: 0, hour: HOURS, honest: true };
  }
}
function writeRite(v) {
  try {
    ctx.store.setJson(STORE_RITE, v);
  } catch (e) {}
}
/** 今天的日期键(本地时区)。用于"每天一次"的判断。 */
function dayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
/** 现在是否在约定时辰的一小时内(原著:四点来,三点起就开始幸福)。 */
function inHour() {
  return new Date().getHours() === hour;
}

// —— Grounding (2026-10-04): the diorama's own origin left it hovering above the sand ——
/** Move `o` by `dy` metres in world space (its parents may be scaled or rotated). */
function liftWorld(o, dy) {
  if (!dy) return;
  const wp = o.getWorldPosition(new THREE.Vector3());
  wp.y += dy;
  o.parent.worldToLocal(wp);
  o.position.copy(wp);
  o.updateMatrixWorld(true);
}
function groundDiorama(m) {
  root.updateMatrixWorld(true);
  const box = (o) => new THREE.Box3().setFromObject(o);
  // 1) the rocky stage sinks to just under the lowest sand in its footprint (moves the whole model with it)
  const stage = m.getObjectByName(STAGE);
  if (stage) {
    const b = box(stage);
    const low = lowestGround(groundH, { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
    liftWorld(m, groundShift(b.min.y, low, -STAGE_SINK));
  }
  // 2) the fox, the prince, the grass and the wheat stand on the sand under each of them
  for (const name of STANDING) {
    const o = m.getObjectByName(name);
    if (!o) continue;
    const b = box(o);
    const c = b.getCenter(new THREE.Vector3());
    liftWorld(o, groundShift(b.min.y, groundH(c.x, c.z)));
  }
  // 3) the cloud strip comes down to a low mist bank instead of hanging 4 m up
  const clouds = m.getObjectByName(CLOUDS);
  if (clouds) {
    const b = box(clouds);
    const c = b.getCenter(new THREE.Vector3());
    liftWorld(clouds, groundShift(b.min.y, groundH(c.x, c.z), CLOUD_LIFT));
  }
}

// —— 3D ——
function build() {
  if (built) return;
  built = true;
  root = new THREE.Group();
  root.name = 'foxScene';
  root.position.set(SITE.x, groundH(SITE.x, SITE.z), SITE.z);
  ctx.scene.s.add(root);

  createGLTFLoader().load(
    MODEL,
    (g) => {
      const m = g.scene;
      // 源模型是厘米级(Z-up 导出),按包围盒归一到米并落地。
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.z) || 1;
      const k = 14 / span; // 场景横向约 14m
      m.scale.setScalar(k);
      m.position.y -= box.min.y;
      // 若模型是躺着导出的(Y 为最长轴),立起来
      const b2 = new THREE.Box3().setFromObject(m);
      const s2 = b2.getSize(new THREE.Vector3());
      if (s2.y > Math.max(s2.x, s2.z)) {
        m.rotation.x = -Math.PI / 2;
        m.position.y -= new THREE.Box3().setFromObject(m).min.y;
      }
      root.add(m);
      groundDiorama(m);
      // 找狐狸与王子节点(用于"狐狸在/不在"的表现)
      foxNode = m.getObjectByName('Zorro_5') || null;
      princeNode = m.getObjectByName('Principito_4') || null;
      placeSeat();
    },
    undefined,
    (e) => console.error('[fox-scene] 布景模型加载失败:', e.message)
  );

  // 当前坐席光点
  seatMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9 })
  );
  root.add(seatMesh);
  light = new THREE.PointLight(0xffcf82, 0, 7);
  root.add(light);
}

function placeSeat() {
  if (!seatMesh) return;
  const s = SEATS[Math.min(current, SEATS.length - 1)];
  // a low lantern on the sand, not an orb hanging in the air
  const y = groundH(SITE.x + s.x, SITE.z + s.z) - root.position.y + SEAT_LANTERN;
  seatMesh.position.set(s.x, y, s.z);
  if (light) light.position.set(s.x, y + 0.5, s.z);
}

// —— 面板 ——
function render() {
  if (!panel) return;
  panel.replaceChildren();
  const mk = (tag, cls, txt) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (txt != null) el.textContent = tt(txt);
    panel.appendChild(el);
    return el;
  };
  mk('div', 'fx-kicker', { zh: '回忆 · 第十场', en: 'Memory · the tenth' });
  mk('h2', 'fx-title', FOX_UI.title);
  mk('p', 'fx-hint', current < 3 ? FOX_UI.rule : FOX_UI.patience);

  const seats = mk('div', 'fx-seats');
  for (let i = 0; i < 3; i++) {
    const d = document.createElement('div');
    d.className = 'fx-seat' + (i < current ? ' on' : '');
    d.title = tt(SEATS[i].label);
    seats.appendChild(d);
  }
  const rite = readRite();
  if (!earth)
    mk(
      'p',
      'fx-hour',
      `${tt({ zh: '仪式', en: 'Rite' })} ${rite.days || 0} / 3 · ${tt({ zh: '约定时辰', en: 'Hour' })} ${rite.hour}:00`
    );

  const btns = mk('div', 'fx-btns');
  if (current < 3) {
    // 唯一动作:走过去坐下(必须真的走近,E 键)
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = tt(FOX_UI.approach);
    b.dataset.foxAction = 'sit';
    b.onclick = () => sitDown();
    btns.appendChild(b);
    // 诚实开关:承诺明天同一时辰 / 今天就办完
    const h = document.createElement('button');
    if (earth) h.style.display = 'none';
    h.type = 'button';
    h.textContent = inHour() ? tt(FOX_UI.arrived) : `${rite.hour}:00 ${tt(FOX_UI.approach)}`;
    h.dataset.foxAction = 'hour';
    h.disabled = true;
    btns.appendChild(h);
  } else {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = tt(FOX_UI.riteDone);
    b.dataset.foxAction = 'done';
    b.onclick = () => close(true);
    btns.appendChild(b);
  }
  panel.style.display = 'block';
}

// —— 台词 ——
// ⚠️ 串台词必须严格照抄 scene7-tippler.js / scene6-king.js 的范式(逐字对齐):
//   autoHide 按文本长度算 + 心跳守护 + spent 幂等。
// 两个踩过的坑:
//   ① autoHide:0 → 每一句都要手动点,漏点就断链(第一版这么写,20 项里 4 项假阴性)。
//   ② 多传 world/scope → 对话被 lock 判定拒收,链在第 3 句停住(第二版,实测只走 3 句)。
//      现与 tippler 逐字一致:不传 world、不传 scope。
let speakTimer = null;
function speak(seq, then) {
  if (!seq || !seq.length) {
    then && then();
    return;
  }
  let i = 0;
  const next = () => {
    if (!active) return;
    if (i >= seq.length) {
      clearTimeout(speakTimer);
      then && then();
      return;
    }
    const item = seq[i++];
    let spent = false;
    const finish = function () {
      if (spent) return;
      spent = true;
      clearTimeout(speakTimer);
      next();
    };
    const dur = Math.max(4600, ((item.en || '').length * 65) | 0);
    ctx.openDialog({
      speaker: tt(item.who),
      speakerType: whoSpk(item.who),
      lines: [tt(item)],
      autoHide: dur,
      lock: true,
      onDone: finish,
    });
    clearTimeout(speakTimer);
    speakTimer = setTimeout(function () {
      if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
    }, dur + 2600);
  };
  next();
}

// —— 驯养仪式:一次 = 走到当前坐席并坐下 ——
function sitDown() {
  const s = SEATS[Math.min(current, SEATS.length - 1)];
  const pl = ctx.player && ctx.player.pl;
  if (!pl) return;
  const d = Math.hypot(pl.p.x - (SITE.x + s.x), pl.p.z - (SITE.z + s.z));
  if (d > 3.0) {
    ctx.ui.modeToast?.(tt(FOX_UI.approach), 1800);
    return;
  }
  // 走到这里 = 玩家履行了承诺。狐狸的反应按原著:越近越安静。
  const rite = readRite();
  const today = dayKey();
  if (!earth && rite.lastDay === today) {
    // 同一天不重复计数(原著:你最好在同一个时辰来)
    ctx.ui.modeToast?.(tt(FOX_UI.arrived), 2200);
    return;
  }
  writeRite({ days: Math.min(3, (rite.days || 0) + 1), lastDay: today, hour, honest });
  current = earth ? Math.min(3, current + 1) : Math.min(3, (rite.days || 0) + 1);
  placeSeat();
  render();
  if (current < 3) {
    const ns = SEATS[current];
    ctx.ui.journey?.setGoal?.(OWNER, {
      world: 'main',
      x: SITE.x + ns.x,
      z: SITE.z + ns.z,
      label: tt(ns.label),
      ...ns.label,
    });
  }
  eventBus.emit('fox:rite', { days: current });
  if (earth) {
    // 压缩版:每坐近一次,狐狸只说新的一段;三次坐完 → 「回去再看一眼玫瑰」
    const opts = earth;
    speak([SCENE_FOX.rite[current - 1]], () => {
      if (current < 3) return;
      speak([SCENE_FOX.secret[0]], () => {
        close(true);
        opts.onRite && opts.onRite();
      });
    });
    return;
  }
  speak(SCENE_FOX.rite.slice(0, current + 1), () => {
    if (current >= 3) {
      // 仪式完成 → 狐狸交出秘密(全书题眼)
      speak(SCENE_FOX.secret, () => {
        ctx.ui.journey?.remember?.('foxSecret', null);
        close(true);
      });
    }
  });
}

function open(opts) {
  if (active) return;
  active = true;
  earth = opts && opts.earth ? opts : null;
  const rite = readRite();
  current = earth ? 0 : Math.min(3, rite.days || 0);
  hour = rite.hour || HOURS;
  build();
  placeSeat();
  if (seatMesh) seatMesh.visible = true;
  render();
  ctx.ui.journey?.setPhase?.(OWNER, {
    world: 'main',
    chapter: tt(FOX_UI.title),
    step: current + 1,
    total: 3,
    hint: tt(FOX_UI.rule),
  });
  // 罗盘指向当前坐席
  ctx.ui.journey?.setGoal?.(OWNER, {
    world: 'main',
    x: SITE.x + SEATS[Math.min(current, 2)].x,
    z: SITE.z + SEATS[Math.min(current, 2)].z,
    label: tt(SEATS[Math.min(current, 2)].label),
    ...SEATS[Math.min(current, 2)].label,
  });
  speak(SCENE_FOX.greet.concat(SCENE_FOX.meaning), () => {});
}

/** 地球之日:从玫瑰园回来道别,狐狸送出秘密(全书题眼) */
function secret(onDone) {
  if (active) return;
  active = true;
  build();
  speak(SCENE_FOX.secret.slice(1), () => {
    active = false;
    ctx.ui.journey?.remember?.('foxSecret', null);
    onDone && onDone();
  });
}

function close(done) {
  if (!active) return;
  active = false;
  clearTimeout(speakTimer); // 台词链的心跳也要停,否则会在场景关闭后继续开对白
  ctx.ui.journey?.clearGoal?.(OWNER);
  if (panel) panel.style.display = 'none';
  if (seatMesh) seatMesh.visible = false;
  if (light) light.intensity = 0;
  if (done) ctx.ui.journey?.setPhase?.(OWNER, null);
}

// 导出为系统(装配进组合根)
export function createFoxScene() {
  return {
    name: 'foxScene',
    layer: 'gameplay',
    phase: 'simulate',
    order: 9,
    init() {
      style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);
      panel = document.createElement('section');
      panel.id = 'foxPanel';
      document.body.appendChild(panel);
      build();
      if (seatMesh) seatMesh.visible = false;
      // E 坐下 / Esc 离开
      const onKey = (e) => {
        if (!e || !e.key) return;
        const k = e.key.toLowerCase();
        if (k === 'e' && active) sitDown();
        if (k === 'escape' && active) close(false);
      };
      document.addEventListener('keydown', onKey);
      unsub.push(() => document.removeEventListener('keydown', onKey));
      // 靠近站点自动开场
      unsub.push(
        eventBus.on('world:changed', ({ to }) => {
          if (to !== 'main' && active) close(false);
        })
      );
      // 对手柄/触屏:暴露一个可点的入口(探针与无键盘设备用)
      ctx.scene.foxApi = {
        open,
        sit: sitDown,
        secret,
        site: () => ({ ...SITE }),
        seat: () => {
          const s = SEATS[Math.min(current, 2)];
          return { x: SITE.x + s.x, z: SITE.z + s.z };
        },
        isActive: () => active,
        debug: () => ({ active, current, hour, loaded: !!foxNode, pos: SITE }),
      };
    },
    update(dt) {
      if (!active || !seatMesh) return;
      // 光点呼吸
      const t = performance.now() * 0.002;
      const k = 0.75 + Math.sin(t) * 0.25;
      seatMesh.scale.setScalar(k);
      seatMesh.material.opacity = 0.55 + k * 0.35;
      if (light) light.intensity = 1.6 * k;
    },
    dispose() {
      close(false);
      unsub.forEach((f) => f && f());
      unsub = [];
      style?.remove();
      panel?.remove();
      if (root) {
        ctx.scene.s.remove(root);
        root = null;
        foxNode = null;
        princeNode = null;
        built = false;
      }
      ctx.scene.foxApi = null;
    },
  };
}
