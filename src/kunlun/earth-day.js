// earth-day.js — B612 剧本第 10 场 · 书页八 · 地球之日(2026-10-04 剧本补全)
// 330 地理学家说「去地球吧」→ 旅途卡「第八天 · 地球」把玩家带回沙漠 → 在沙漠里走一遍他刚到地球的那一天:
//   ① 蛇(坠机点旁,金色的一环)  ② 三瓣小花  ③ 山与回声(西北沙丘顶)
//   ④ 玫瑰园(五千朵一模一样)   ⑤ 狐狸 · 苹果树下(坐近三次,压缩成同一个傍晚)
//   ⑥ 回到玫瑰园(园心现出玻璃罩里的「他的那朵」——千百朵里只有她不一样)  ⑦ 回到狐狸身边 · 那个秘密
// 走完 → 存档 earthDay → ending-journey 接上「今夜,去找井」。
// 每站同一套指引:光柱 + 悬浮箭 + 罗盘目标(可「走过去」);走到 4m 内开讲。进度存 earthStep,断点续上。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { tt, whoSpk } from '../shared/story-text.mjs';
import { SCENE10, EARTH_UI } from '../shared/story-text-late.mjs';
import { spawnFloatArrow, tickArrow, removeFloatArrow } from '../scene/guide-arrow.js';
import { shiftDayTo } from '../scene/time-shift.js';
import { createGLTFLoader } from '../scene/gltf-loader.js';
import { earthDue, EARTH_STOPS, EARTH_DONE } from '../shared/earth-day-logic.mjs';

const OWNER = 'earth-day';
const REACH = 4; // 走到站点 4m 内开讲
const ROSES = { x: -80, z: 20 };
const POS = {
  snake: { x: -24, z: 90 },
  flower: { x: -38, z: 64 },
  echo: { x: -98, z: 122 },
  roses: ROSES,
  fox: null, // 狐狸站坐标由 scene10-fox 给(foxApi.site / seat)
  rosesAgain: ROSES,
  foxAgain: null,
};

let mode = 'idle'; // idle | walking | talking | fox | done
let built = false;
let beacon = null,
  arrow = null;
let props = {}; // name → Object3D
let globe = null;
let speakTimer = null;
let started = false;

function scene() {
  return ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('main').scene : ctx.scene.s;
}
function gh(x, z) {
  return ctx.media && ctx.media.desert ? ctx.media.desert.getH(x, z) : 0;
}
function step() {
  return ctx.store.num('earthStep') || 0;
}
function stopKey() {
  return EARTH_STOPS[Math.min(step(), EARTH_STOPS.length - 1)];
}
function posOf(key) {
  if (key === 'fox') return ctx.scene.foxApi ? ctx.scene.foxApi.seat() : { x: -52, z: 39 };
  if (key === 'foxAgain') return ctx.scene.foxApi ? ctx.scene.foxApi.site() : { x: -46, z: 34 };
  return POS[key];
}

// —— 台词(同 scene7 范式:autoHide 按长度 + 心跳 + spent 幂等) ——
function speakSeq(seq, i, done) {
  if (i >= seq.length) {
    done && done();
    return;
  }
  const item = seq[i];
  let spent = false;
  const finish = () => {
    if (spent) return;
    spent = true;
    clearTimeout(speakTimer);
    speakSeq(seq, i + 1, done);
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
  clearTimeout(speakTimer);
  speakTimer = setTimeout(() => {
    if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
  }, hold + 2600);
}

// —— 布景(全部 MeshBasic/Lambert 低模,零新资产) ——
function mat(c) {
  return new THREE.MeshLambertMaterial({ color: c });
}
function build() {
  if (built) return;
  built = true;
  const sc = scene();
  // ① 蛇:一环金影,色如月光
  {
    const g = new THREE.Group();
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.07, 8, 28, Math.PI * 1.75),
      new THREE.MeshBasicMaterial({ color: 0xe9cf7a })
    );
    coil.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xf2dc94 })
    );
    head.position.set(0.42, 0.18, 0);
    g.add(coil, head);
    g.position.set(POS.snake.x, gh(POS.snake.x, POS.snake.z) + 0.08, POS.snake.z);
    sc.add(g);
    props.snake = g;
  }
  // ② 三瓣小花(一朵毫不起眼的花)
  {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 6), mat(0x6f8a4a));
    stem.position.y = 0.25;
    g.add(stem);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xe8dcc0));
      p.scale.set(1, 0.4, 1.8);
      const a = (i / 3) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.1, 0.52, Math.sin(a) * 0.1);
      p.rotation.y = -a;
      g.add(p);
    }
    g.position.set(POS.flower.x, gh(POS.flower.x, POS.flower.z), POS.flower.z);
    sc.add(g);
    props.flower = g;
  }
  // ③ 山顶的小石堆(回声从这里出去)
  {
    const g = new THREE.Group();
    [0.5, 0.36, 0.24].forEach((r, i) => {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(0x9a8a72));
      s.position.y = 0.3 + i * 0.5;
      s.rotation.set(i, i * 2, 0);
      g.add(s);
    });
    g.position.set(POS.echo.x, gh(POS.echo.x, POS.echo.z), POS.echo.z);
    sc.add(g);
    props.echo = g;
  }
  // ④ 玫瑰园:几百朵一模一样(实例化,两次绘制)
  {
    const N = 360;
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xb31b2e), N);
    const stems = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.015, 0.02, 0.55, 5),
      mat(0x4f6f3a),
      N
    );
    const m = new THREE.Matrix4();
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) {
      const r = 4.9 + Math.sqrt(rnd()) * 5; // 外圈远景:低模花头(内圈是真玫瑰)
      const a = rnd() * Math.PI * 2;
      const x = ROSES.x + Math.cos(a) * r,
        z = ROSES.z + Math.sin(a) * r;
      const y = gh(x, z);
      m.makeTranslation(x, y + 0.6, z);
      heads.setMatrixAt(i, m);
      m.makeTranslation(x, y + 0.28, z);
      stems.setMatrixAt(i, m);
    }
    heads.instanceMatrix.needsUpdate = stems.instanceMatrix.needsUpdate = true;
    heads.frustumCulled = stems.frustumCulled = false;
    heads.name = 'earthRoses';
    sc.add(heads, stems);
    props.roses = heads;
    props.rosesLow = [heads, stems];
    // 2026-10-04 主人提供真玫瑰模型:内圈换成实例化的真玫瑰,外圈留低模花头当远景(手机也扛得住)
    loadRealRoses(sc);
  }
}

// —— 真模型:玫瑰园(garden-rose 4 千面 × 实例化)+ 园心玻璃罩里的「他的那朵」(rose-dome + hero-rose) ——
const MODEL_DIR = '/models/hall/b612-world/';
function lowQuality() {
  try {
    return !!ctx.store.json('lowQuality', false) || window.innerWidth < 700;
  } catch (e) {
    return false;
  }
}
/** 把一个 glTF 场景里的每个网格烘成「根坐标系」几何,供 InstancedMesh 复用 */
function bakeParts(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    parts.push({ geo, mat: o.material });
  });
  return parts;
}
function loadRealRoses(sc) {
  const loader = createGLTFLoader();
  loader.load(
    MODEL_DIR + 'garden-rose.glb',
    (g) => {
      const parts = bakeParts(g.scene);
      const box = new THREE.Box3().setFromObject(g.scene);
      const unit = 0.66 / Math.max(0.01, box.max.y - box.min.y); // 一朵约 0.66m 高
      const N = lowQuality() ? 120 : 190;
      const meshes = parts.map(({ geo, mat }) => {
        const im = new THREE.InstancedMesh(geo, mat, N);
        im.frustumCulled = false;
        im.name = 'earthRoseReal';
        return im;
      });
      const m = new THREE.Matrix4(),
        q = new THREE.Quaternion(),
        e = new THREE.Euler(),
        v = new THREE.Vector3(),
        sv = new THREE.Vector3();
      let seed = 11;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < N; i++) {
        const r = 1.5 + Math.sqrt(rnd()) * 3.7; // 内圈真玫瑰(园心留一圈空地给玻璃罩)
        const a = rnd() * Math.PI * 2;
        const x = ROSES.x + Math.cos(a) * r,
          z = ROSES.z + Math.sin(a) * r;
        const k = unit * (0.85 + rnd() * 0.3);
        e.set((rnd() - 0.5) * 0.18, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.18);
        m.compose(v.set(x, gh(x, z) - box.min.y * k, z), q.setFromEuler(e), sv.set(k, k, k));
        meshes.forEach((im) => im.setMatrixAt(i, m));
      }
      meshes.forEach((im) => {
        im.instanceMatrix.needsUpdate = true;
        sc.add(im);
      });
      props.roses = meshes[0];
    },
    undefined,
    (err) => console.warn('[earth-day] 玫瑰模型未载入,保留低模:', err && err.message)
  );
  // 园心:玻璃罩 + 罩里的那一朵(第二次来才现身)
  const hero = new THREE.Group();
  hero.name = 'earthHeroRose';
  hero.position.set(ROSES.x, gh(ROSES.x, ROSES.z), ROSES.z);
  hero.visible = false;
  sc.add(hero);
  globe = hero;
  loader.load(MODEL_DIR + 'rose-dome.glb', (g) => {
    const d = g.scene;
    const b = new THREE.Box3().setFromObject(d);
    const k = 1.0 / Math.max(0.01, b.max.y - b.min.y); // 罩高约 1m
    d.scale.setScalar(k);
    const c = b.getCenter(new THREE.Vector3());
    d.position.set(-c.x * k, -b.min.y * k, -c.z * k);
    d.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.depthWrite = false;
        o.material.opacity = Math.min(o.material.opacity, 0.3);
        o.renderOrder = 2; // 透明罩最后画,里面的玫瑰看得见
      }
    });
    hero.add(d);
  });
  loader.load(MODEL_DIR + 'hero-rose.glb', (g) => {
    const r = g.scene;
    const b = new THREE.Box3().setFromObject(r);
    const k = 0.74 / Math.max(0.01, b.max.y - b.min.y);
    r.scale.setScalar(k);
    const c = b.getCenter(new THREE.Vector3());
    r.position.set(-c.x * k, -b.min.y * k + 0.02, -c.z * k);
    hero.add(r);
  });
}

// —— 指引:光柱 + 悬浮箭 + 罗盘目标 ——
function clearGuide() {
  const sc = scene();
  if (beacon) {
    sc.remove(beacon);
    beacon.geometry.dispose();
    beacon.material.dispose();
    beacon = null;
  }
  if (arrow) removeFloatArrow(sc, arrow);
  arrow = null;
}
function guideTo(key) {
  clearGuide();
  const p = posOf(key);
  if (!p) return;
  const sc = scene();
  const y = gh(p.x, p.z);
  beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.42, 4, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    })
  );
  beacon.position.set(p.x, y + 2, p.z);
  beacon.userData.baseOpacity = 0.3;
  beacon.name = 'earthBeacon';
  sc.add(beacon);
  arrow = spawnFloatArrow(sc, p.x, y + 5, p.z, { name: 'earthArrow' });
  const label = EARTH_UI.stops[key];
  ctx.ui.journey?.setPhase?.(OWNER, {
    world: 'main',
    chapter: EARTH_UI.chapter,
    step: step() + 1,
    total: EARTH_STOPS.length,
    hint: key === 'rosesAgain' ? EARTH_UI.findRose : EARTH_UI.hint,
  });
  ctx.ui.journey?.setGoal?.(OWNER, { world: 'main', x: p.x, z: p.z, ...label });
}

// —— 走到一站:讲这一站 → 记一步 → 指下一站 ——
function advance() {
  ctx.store.setNum('earthStep', step() + 1);
  if (step() >= EARTH_DONE) return finish();
  mode = 'walking';
  guideTo(stopKey());
}
function arrive(key) {
  clearGuide();
  ctx.ui.journey?.clearGoal?.(OWNER);
  mode = 'talking';
  window.__earth = key;
  const after = () => advance();
  switch (key) {
    case 'snake':
      return speakSeq(SCENE10.snake, 0, after);
    case 'flower':
      return speakSeq(SCENE10.flower, 0, after);
    case 'echo':
      return speakSeq(SCENE10.echo, 0, after);
    case 'roses':
      return speakSeq(SCENE10.roses, 0, after);
    case 'fox':
      mode = 'fox';
      if (!ctx.scene.foxApi) return after();
      return ctx.scene.foxApi.open({ earth: true, onRite: after });
    case 'rosesAgain':
      if (globe) globe.visible = true;
      return speakSeq(SCENE10.rosesAgain, 0, after);
    case 'foxAgain':
      if (!ctx.scene.foxApi) return after();
      return ctx.scene.foxApi.secret(after);
    default:
      return after();
  }
}
function finish() {
  mode = 'done';
  clearGuide();
  ctx.ui.journey?.clearGoal?.(OWNER);
  ctx.ui.journey?.setPhase?.(OWNER, null);
  ctx.store.mark('earthDay');
  ctx.ui.modeToast?.(tt(EARTH_UI.done), 6000);
  ctx.events?.emit?.('story:earthdone');
  window.__earth = 'done';
}
function begin() {
  if (started) return;
  started = true;
  build();
  if (step() === 0) shiftDayTo(16.5, 5000); // 地球的傍晚:金色的光(找井时 ending-journey 再转入夜)
  mode = 'walking';
  guideTo(stopKey());
  if (step() === 0) ctx.ui.modeToast?.(tt(EARTH_UI.hint), 6500);
}

function busy() {
  return (
    !!ctx.ui.dialogOpen?.() ||
    !!ctx.scene.worldManager?.transitioning ||
    !!document.body.dataset.voyage ||
    !!document.getElementById('scene2Board')
  );
}
function flags() {
  return {
    page1: !!ctx.store.flag('page1'),
    chapter: ctx.store.num('planetsChapter'),
    earthDay: !!ctx.store.flag('earthDay'),
    endingStep: ctx.store.num('endingStep'),
  };
}

export function createEarthDay() {
  let acc = 0,
    unsub = [];
  return {
    name: 'earthDay',
    layer: 'gameplay',
    phase: 'simulate',
    order: 11,
    init() {
      const onStart = () => {
        started = false;
      };
      ctx.events?.on?.('story:earthday', onStart);
      unsub.push(() => ctx.events?.off?.('story:earthday', onStart));
      ctx.scene.earthDayApi = {
        state: () => ({ mode, step: step(), stop: stopKey(), due: earthDue(flags()) }),
        /** 探针:直接到某一站(不改存档以外的东西) */
        jump(n) {
          ctx.store.setNum('earthStep', n);
          started = false;
          mode = 'idle';
        },
        pos: (k) => posOf(k || stopKey()),
      };
    },
    update(dt) {
      acc += dt;
      const t = performance.now() * 0.001;
      if (arrow) tickArrow(arrow, t);
      if (beacon) beacon.material.opacity = 0.3 * (0.8 + Math.sin(t * 1.9) * 0.25);
      if (acc < 0.1) return;
      acc = 0;
      const inMain = (ctx.scene.activeWorld || 'main') === 'main';
      if (!inMain) {
        // 离开沙漠:收起指引,回来再接上(对白中断的那一站从头讲)
        if (mode === 'walking' || mode === 'talking' || mode === 'fox') {
          clearGuide();
          started = false;
          mode = 'idle';
        }
        return;
      }
      if (mode === 'done') return;
      if (!earthDue(flags())) return;
      if (!started) {
        if (busy()) return;
        begin();
        return;
      }
      if (mode !== 'walking' || busy()) return;
      const key = stopKey();
      const p = posOf(key);
      const pl = ctx.player && ctx.player.pl;
      if (!p || !pl) return;
      const r = key === 'fox' || key === 'foxAgain' ? 7 : REACH;
      if (Math.hypot(pl.p.x - p.x, pl.p.z - p.z) < r) arrive(key);
    },
    dispose() {
      clearTimeout(speakTimer);
      clearGuide();
      unsub.forEach((f) => f());
      ctx.scene.earthDayApi = null;
    },
  };
}
