// scene3-memory.js — B612 剧本第 3+4 场·回忆层演出(2026-09-07,书页一+书页二)
// 玩家坠入 B612 回忆(幽灵视角):王子在星球上讲述家与日常。
// 顺序引导(2026-09-07 主人定:一次一站,金色光标指引,走完才亮下一站):
//   STEP 0: 三座小火山 → 台词
//   STEP 1: 面包树苗 → 对话 6 句
//   STEP 2: 小椅子 → 日落演出(天幕烧红 6s) → 台词 4 句
//   STEP 3: 玫瑰坛 → 玫瑰花开+离别(10 句) + 字幕
// 完成条件:四站全走完 → 白光收回 → 发 'story:page1done' 回黑夜现实。
// 艺术基调:回忆层整体比现实层暖一度——记忆是发光的。
import * as THREE from 'three';
import { Z } from '../shared/z-layers.mjs';
import { ctx } from '../ctx.js';
import { SCENE3, SCENE4, tt, whoSpk } from '../shared/story-text.mjs';
import { homeCheckpoint } from '../shared/journey-guidance.mjs';
import { taskCheckpoint } from '../shared/journey-logic.mjs';

let built = false;
let arrivalDone = false;
let curStep = -1; // -1=到达演出未播;0..3=当前站索引;4=全部完成
let stepMarker = null;
let exitStarted = false;
let smokeSprites = [];
let bgDusk = null;
let interactionBusy = false;
let visit = 0;
let memorySun = null;
let focusedStep = -1;
let markedVolcanoes = [];
const OWNER = 'home-memory';

const VOLCANOES = [
  { x: -4.6, z: -5.2, s: 1.15, active: true },
  { x: -0.8, z: -6.6, s: 0.9, active: true },
  { x: 3.8, z: -5.4, s: 1.0, active: false },
];

// 站位表(顺序引导)
const STEPS = [
  { x: -4.6, z: -5.2, r: 2.4 }, // 0: 火山
  { x: 3.4, z: -2.6, r: 2.2 }, // 1: 面包树苗
  { x: -3.6, z: -0.6, r: 2.2 }, // 2: 小椅子·日落
  { x: 2.46, z: -1.56, r: 2.5 }, // 3: 原模型玫瑰随整场2倍放大
];
const STATION_HINTS = [
  {
    zh: '两座有烟，一座安静。走近光点，点「听火山的故事」，再找出安静的那座。',
    en: 'Two smoke; one is quiet. Follow the light, hear their story, then find the quiet one.',
  },
  {
    zh: '小小的芽长大后会很不同。走近幼苗，点「辨认幼苗」，留意花苞与叶片。',
    en: 'Small sprouts grow very differently. Approach and identify their buds and leaves.',
  },
  {
    zh: '在这颗小星球上，挪动几步就能追上日落。走近椅子，点「追着日落走」。',
    en: 'A few steps can bring another sunset. Approach the chair and follow the sunset.',
  },
  {
    zh: '她让这颗星球变得不同。走近玫瑰，点「聆听她的告别」，留下你想记住的细节。',
    en: 'She made this planet special. Approach the rose, hear her farewell and keep a detail.',
  },
];
const STATION_ACTIONS = [
  { zh: '听火山的故事', en: 'Hear their story' },
  { zh: '辨认幼苗', en: 'Identify sprouts' },
  { zh: '追着日落走', en: 'Follow the sunset' },
  { zh: '聆听她的告别', en: 'Hear her farewell' },
];

function world() {
  return ctx.scene.worldManager ? ctx.scene.worldManager.getWorld('b612') : null;
}

function build() {
  const w = world();
  if (!w) return;
  built = true;
  const s = w.scene;
  const groundAt = (x, z) => w.ground(x, z) + 0.03;

  // —— 三座小火山(两活一熄) ——
  VOLCANOES.forEach(function (v, i) {
    const gy = groundAt(v.x, v.z);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.55 * v.s, 1.15 * v.s, 7),
      new THREE.MeshStandardMaterial({
        color: i === 2 ? '#4a3a30' : '#5a4436',
        roughness: 0.95,
        flatShading: true,
      })
    );
    cone.position.set(v.x, gy + (1.15 * v.s) / 2, v.z);
    cone.name = 'scene3Volcano' + i;
    s.add(cone);
    if (v.active) {
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.2 * v.s, 16),
        new THREE.MeshBasicMaterial({ color: 0xff8a4a, transparent: true, opacity: 0.7 })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(v.x, gy + 1.15 * v.s + 0.1, v.z);
      s.add(glow);
    }
  });

  // —— 烟雾(两座活火山,各两缕) ——
  const smokeTex = (function () {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x2 = c.getContext('2d');
    const g = x2.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(200,195,190,0.5)');
    g.addColorStop(1, 'rgba(200,195,190,0)');
    x2.fillStyle = g;
    x2.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  VOLCANOES.forEach(function (v, i) {
    if (!v.active) return;
    const gy = groundAt(v.x, v.z);
    for (let k = 0; k < 2; k++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: smokeTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.5,
        })
      );
      sp.position.set(v.x + k * 0.25, gy + 1.2 * v.s, v.z + k * 0.15);
      sp.scale.set(0.4, 0.4, 1);
      sp.userData = {
        baseY: gy + 1.2 * v.s,
        baseX: v.x + k * 0.25,
        baseZ: v.z + k * 0.15,
        phase: k * 2.4 + i * 3.1,
      };
      sp.name = 'scene3Smoke';
      s.add(sp);
      smokeSprites.push(sp);
    }
  });

  // —— 面包树苗 ——
  const sprout = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.03, 0.34, 6),
    new THREE.MeshStandardMaterial({ color: '#5d7a3a', roughness: 0.9 })
  );
  stem.position.y = 0.17;
  sprout.add(stem);
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#6d8a42', roughness: 0.85 })
    );
    leaf.scale.set(1, 0.5, 1.6);
    leaf.position.set(
      Math.sin((i * Math.PI * 2) / 3) * 0.1,
      0.36,
      Math.cos((i * Math.PI * 2) / 3) * 0.1
    );
    leaf.rotation.y = (i * Math.PI * 2) / 3;
    sprout.add(leaf);
  }
  sprout.position.set(STEPS[1].x, groundAt(STEPS[1].x, STEPS[1].z), STEPS[1].z);
  sprout.name = 'scene3Baobab';
  s.add(sprout);

  // —— 小椅子(面朝西——日落的方向) ——
  const chair = new THREE.Group();
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.05, 0.42),
    new THREE.MeshStandardMaterial({ color: '#8a4a3a', roughness: 0.85 })
  );
  seat.position.y = 0.34;
  chair.add(seat);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.4, 0.05),
    new THREE.MeshStandardMaterial({ color: '#8a4a3a', roughness: 0.85 })
  );
  back.position.set(0, 0.55, -0.19);
  chair.add(back);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.34, 0.05),
      new THREE.MeshStandardMaterial({ color: '#6b3a2c', roughness: 0.9 })
    );
    leg.position.set(i & 1 ? 0.17 : -0.17, 0.17, i & 2 ? 0.17 : -0.17);
    chair.add(leg);
  }
  chair.position.set(STEPS[2].x, groundAt(STEPS[2].x, STEPS[2].z), STEPS[2].z);
  chair.rotation.y = 2.3;
  chair.name = 'scene3Chair';
  s.add(chair);

  // —— 回忆的暖度 ——
  if (w.scene.background && w.scene.background.isColor) {
    const bgDusk = new THREE.Color(0x241532);
    w.scene.background.lerp(bgDusk, 0.9);
  }
}

// —— 金色光标 ——
function placeMarker(x, z, registerGoal = true) {
  if (registerGoal) {
    ctx.ui.journey?.setPhase(OWNER, {
      world: 'b612',
      chapter: { zh: 'B612 · 家的回忆', en: 'B612 · memories of home' },
      step: curStep + 1,
      total: 4,
      hint: STATION_HINTS[curStep],
    });
    ctx.ui.journey?.setGoal(OWNER, {
      world: 'b612',
      x,
      z,
      en:
        [
          'Visit the volcanoes',
          'Observe the little sprout',
          'Follow the sunset',
          'Remember the rose',
        ][Math.max(0, curStep)] || 'Memories of home',
      zh:
        ['走近三座火山', '走近面包树苗', '走近看日落的小椅子', '走近玫瑰，听她告别'][
          Math.max(0, curStep)
        ] || '家的回忆',
      action: STATION_ACTIONS[curStep],
      onActivate: () => {
        if (!chainBusy && !interactionBusy && curStep >= 0 && curStep < STEPS.length)
          doStep(curStep);
      },
    });
  }
  if (registerGoal && focusedStep !== curStep) {
    focusedStep = curStep;
    world()?.meta.focusTarget?.(x, z);
  }
  if (!stepMarker) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x2 = c.getContext('2d');
    const g = x2.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,215,130,0.95)');
    g.addColorStop(0.5, 'rgba(255,200,80,0.4)');
    g.addColorStop(1, 'rgba(255,200,80,0)');
    x2.fillStyle = g;
    x2.fillRect(0, 0, 64, 64);
    stepMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    stepMarker.scale.set(1.4, 1.4, 1);
    stepMarker.name = 'scene3Marker';
    world().scene.add(stepMarker);
  }
  stepMarker.visible = true;
  stepMarker.position.set(
    x,
    (world().ground(x, z) ?? 0) + 1.2 + Math.sin(Date.now() * 0.002) * 0.15,
    z
  );
}
function hideMarker() {
  if (stepMarker) stepMarker.visible = false;
  ctx.ui.journey?.clearGoal(OWNER);
}

// —— 日落烧幕(2026-09-27 台词⇔天光):定稿本"天幕烧红"此前只有台词没有演出 ——
// 小椅子站开场即漫起,本站播完即退;与 king325 的 sunsetShow 同一 z 层(不同时共存)
let duskVeil = null;
function showDuskVeil() {
  if (!duskVeil) {
    duskVeil = document.createElement('div');
    duskVeil.style.cssText =
      'position:fixed;inset:0;z-index:' +
      Z.storyVeil +
      ';pointer-events:none;' +
      'background:radial-gradient(120% 90% at 50% 100%, rgba(255,140,50,.45), rgba(255,90,40,.22) 45%, rgba(40,20,60,.12));' +
      'opacity:0;transition:opacity 2s ease';
    document.body.appendChild(duskVeil);
  }
  requestAnimationFrame(function () {
    if (duskVeil) duskVeil.style.opacity = '1';
  });
}
function hideDuskVeil() {
  if (!duskVeil) return;
  const v = duskVeil;
  duskVeil = null;
  v.style.opacity = '0';
  setTimeout(function () {
    v.remove();
  }, 2100);
}

// —— 台词播放(独占:一次一条,播完才前进;lock 互斥 + 心跳守护防链断) ——
let chainBusy = false;
let wd = null;
// 书页分界哨兵(2026-10-03):不是台词,是"读到书页二末尾"的进度标记。
// speakSeq 见到它只写 store 不开对话框,玩家看不到任何提示。
const PAGE_TWO_MARK = { __pageMark: 'page2done' };
function speakSeq(seq, i, done, ticket = visit) {
  if (ticket !== visit || ctx.scene.activeWorld !== 'b612') return;
  if (i >= seq.length) {
    chainBusy = false;
    if (done) done();
    return;
  }
  const item = seq[i];
  if (item && item.__pageMark) {
    try {
      ctx.store.setNum('homeMemoryStep', Math.max(2, curStep));
      ctx.store.mark('page2');
    } catch (e) {}
    speakSeq(seq, i + 1, done, ticket);
    return;
  }
  chainBusy = true;
  let spent = false; // onDone 与心跳守护只许一个推进(晚到的重复收束吞掉)
  const finish = function () {
    if (spent) return;
    spent = true;
    clearTimeout(wd);
    speakSeq(seq, i + 1, done, ticket);
  };
  ctx.openDialog({
    speaker: tt(item.who),
    speakerType: whoSpk(item.who),
    lines: [tt(item)],
    autoHide: 0,
    world: 'b612',
    lock: true,
    scope: OWNER,
    onDone: finish,
  });
  clearTimeout(wd);
  const guard = () => {
    if (ticket !== visit || spent) return;
    if (!ctx.ui.dialogOpen || !ctx.ui.dialogOpen()) finish();
    else wd = setTimeout(guard, 2600);
  };
  wd = setTimeout(guard, 7200);
}

// —— 到达演出 ——
async function arrival() {
  if (arrivalDone) return;
  arrivalDone = true;
  const ticket = visit;
  const saved = homeCheckpoint(
    ctx.store.num('homeMemoryStep'),
    ctx.store.json('journeyMemories', [])
  );
  const resuming =
    saved > 0 || !!taskCheckpoint(idsForStep(saved), ctx.store.json('journeyTaskCheckpoint', null));
  ctx.ui.journey?.setPhase(OWNER, {
    world: 'b612',
    chapter: { zh: 'B612 · 家的回忆', en: 'B612 · memories of home' },
    step: Math.min(saved + 1, 4),
    total: 4,
    hint: {
      zh: '一次探索一处。对白点「继续」，观察时跟随金色光点。',
      en: 'One place at a time. Continue the dialogue, then follow the golden light.',
    },
  });
  if (!resuming) {
    const seen = await world()?.meta.showOverview?.();
    if (seen === false || ticket !== visit) return;
  }
  const ready = await ctx.ui.journey?.transition(OWNER, {
    world: 'b612',
    chapter: { zh: '回忆一 · 小王子的家', en: 'Memory I · his home' },
    title: {
      zh: resuming ? '继续家的回忆' : '来到 B612',
      en: resuming ? 'Continue the memory' : 'Arriving on B612',
    },
    hint: {
      zh: '这是小王子离开以前的家。你是旁观者，过去听不见你。按顺序探索火山、幼苗、日落和玫瑰。',
      en: 'This is his home before he left. The past cannot hear you. Explore the volcanoes, sprouts, sunsets and rose, in order.',
    },
    action: {
      zh: resuming ? '从上次完成的地方继续' : '开始这段回忆',
      en: resuming ? 'Resume the journey' : 'Begin the memory',
    },
  });
  if (ready === false || ticket !== visit) return;
  if (resuming) {
    curStep = saved;
    if (saved < 4) placeMarker(STEPS[saved].x, STEPS[saved].z);
    else checkCompletion();
    return;
  }
  speakSeq(SCENE3.arrival, 0, function () {
    curStep = 0;
    placeMarker(STEPS[0].x, STEPS[0].z);
  });
}

// —— 完成检测 ——
async function checkCompletion() {
  if (exitStarted || curStep < 4) return;
  exitStarted = true;
  ctx.ui.journey?.clearGoal(OWNER);
  const ticket = visit;
  const ready = await ctx.ui.journey?.transition(OWNER, {
    world: 'b612',
    chapter: { zh: '家的回忆 · 已完成', en: 'Memories of home · complete' },
    title: { zh: '把她的告别留在手札里', en: 'Keep her farewell' },
    hint: {
      zh: '你已走完火山、幼苗、日落和玫瑰。回到沙漠听他说完，他的旅途就从下一页开始。',
      en: 'You have seen the volcanoes, sprouts, sunsets and rose. Return to the desert and hear him out — his journey begins on the next page.',
    },
    action: { zh: '回到沙漠', en: 'Return to the desert' },
  });
  if (ready === false || ticket !== visit) return;
  const veil = document.createElement('div');
  veil.style.cssText =
    'position:fixed;inset:0;z-index:' +
    Z.storyVeil +
    ';background:#f8f1df;opacity:0;transition:opacity 1.6s ease;pointer-events:none';
  document.body.appendChild(veil);
  requestAnimationFrame(function () {
    veil.style.opacity = '1';
  });
  setTimeout(function () {
    if (ticket !== visit || ctx.scene.activeWorld !== 'b612') {
      veil.remove();
      return;
    }
    try {
      ctx.store.mark('page1');
      ctx.events.emit('story:page1done');
    } catch (e) {}
    ctx.scene.leaveWorld();
    setTimeout(function () {
      veil.style.opacity = '0';
      setTimeout(function () {
        veil.remove();
      }, 1700);
    }, 600);
  }, 1700);
}

// —— 各站触发动作 ——
function doStep(stepIdx) {
  interactionBusy = true;
  const ticket = visit;
  ctx.ui.journey?.setPhase(OWNER, {
    world: 'b612',
    chapter: { zh: 'B612 · 家的回忆', en: 'B612 · memories of home' },
    step: stepIdx + 1,
    total: 4,
    hint: {
      zh: '先听这一段，再完成当前观察。下一处会在完成后亮起。',
      en: 'Hear this part, then observe. The next place opens after you finish.',
    },
  });
  const seqs = [
    [SCENE3.volcanoes],
    SCENE3.baobab,
    SCENE3.sunset,
    // 玫瑰站(2026-09-27 补齐定稿全本 v2 第4场开篇):先诘问 7 句 + 眼泪字幕 + 初醒,
    // 再进原有的相见/追悔/离别(此前从"你多美啊"开场,开篇整段缺失)
    // 2026-10-03:在 regret(追悔)前插 mark —— 剧本书页二=玫瑰相见,书页三=离别,
    // 分界正是这里。此前整段共用一个 page1 标记,玩家永远看不到书页二/三(见 story-progress.mjs)。
    SCENE4.interrogation.concat(
      [SCENE4.tearsCaption],
      SCENE4.arrival,
      [PAGE_TWO_MARK],
      SCENE4.regret,
      SCENE4.farewell,
      [SCENE4.farewellCaption]
    ),
  ];
  if (stepIdx >= 0 && stepIdx < seqs.length) {
    if (stepIdx === 2) showDuskVeil(); // 日落站:天幕先烧起来,再数四十四次
    const beginObservation = function () {
      const restored = taskCheckpoint(
        idsForStep(stepIdx),
        ctx.store.json('journeyTaskCheckpoint', null)
      );
      if (stepIdx === 0 && restored) VOLCANOES.slice(0, restored.step).forEach(markVolcano);
      const next = () => {
        if (ticket !== visit || ctx.scene.activeWorld !== 'b612') return;
        interactionBusy = false;
        if (stepIdx === 2) {
          hideDuskVeil();
          removeMemorySun();
        }
        clearVolcanoMarks();
        curStep++;
        ctx.store.setNum('homeMemoryStep', curStep);
        if (curStep < STEPS.length) placeMarker(STEPS[curStep].x, STEPS[curStep].z);
        else hideMarker();
        checkCompletion();
      };
      const ids = ['volcano', 'baobab', 'sunset', 'rose'];
      interactionBusy = true;
      if (!ctx.ui.journey) {
        next();
        return;
      }
      ctx.ui.journey
        .beginTask(OWNER, ids[stepIdx], {
          onTarget(point, index) {
            if (ticket !== visit) return;
            // 光点随当前观察点移动；玩家改变的是观看位置，不是过去的星球。
            placeMarker(point.x, point.z, false);
          },
          onObserve(point, index) {
            if (ticket !== visit) return;
            if (stepIdx === 0) markVolcano(point);
            if (stepIdx === 2) showMemorySun(index);
          },
        })
        .then((result) => {
          if (result) next();
        });
    };
    const savedTask = ctx.store.json('journeyTaskCheckpoint', null);
    if (savedTask?.id === idsForStep(stepIdx) && savedTask.world === 'b612') beginObservation();
    else speakSeq(seqs[stepIdx], 0, beginObservation);
  }
}
function idsForStep(step) {
  return ['volcano', 'baobab', 'sunset', 'rose'][step];
}
function markVolcano(point) {
  const w = world();
  if (!w) return;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.8, 24),
    new THREE.MeshBasicMaterial({
      color: 0xe8c27a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(point.x, w.ground(point.x, point.z) + 0.06, point.z);
  ring.name = 'homeVolcanoObserved';
  w.scene.add(ring);
  markedVolcanoes.push(ring);
}
function clearVolcanoMarks() {
  for (const ring of markedVolcanoes) {
    ring.parent?.remove(ring);
    ring.geometry.dispose();
    ring.material.dispose();
  }
  markedVolcanoes = [];
}

function showMemorySun(index) {
  const sc = world()?.scene;
  if (!sc) return;
  if (!memorySun) {
    memorySun = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0xf7bd79, fog: false })
    );
    memorySun.name = 'homeMemorySun';
    sc.add(memorySun);
  }
  const pl = ctx.player.pl;
  memorySun.position.set(-12 + index * 1.5, pl.p.y + 0.15 - index * 0.2, -5 + index * 4);
  memorySun.material.color.set([0xf7bd79, 0xed955b, 0xda6b55][index] || 0xda6b55);
  pl.y = Math.atan2(-(memorySun.position.x - pl.p.x), -(memorySun.position.z - pl.p.z));
  pl.pi = Math.max(
    -0.65,
    Math.min(
      0.4,
      Math.atan2(
        memorySun.position.y - pl.p.y,
        Math.hypot(memorySun.position.x - pl.p.x, memorySun.position.z - pl.p.z)
      )
    )
  );
  if (ctx.player.viewMode === 1 && ctx.player.orbit) ctx.player.orbit.yaw = pl.y;
}
function removeMemorySun() {
  if (!memorySun) return;
  memorySun.parent?.remove(memorySun);
  memorySun.geometry.dispose();
  memorySun.material.dispose();
  memorySun = null;
}

ctx.events.on('world:changed', ({ from, to }) => {
  if (from !== 'b612' || to === 'b612') return;
  visit++;
  clearTimeout(wd);
  ctx.ui.cancelDialogScope?.(OWNER);
  ctx.ui.journey?.cancel(OWNER);
  chainBusy = false;
  interactionBusy = false;
  hideMarker();
  hideDuskVeil();
  removeMemorySun();
  clearVolcanoMarks();
  if (!ctx.store.flag('page1')) {
    curStep = -1;
    exitStarted = false;
    focusedStep = -1;
    arrivalDone = false;
    scene3MemoryTickStart = 0;
  }
});

let scene3MemoryTickStart = 0;
window.__homeMemory = { state: () => ({ step: curStep, chainBusy, interactionBusy }) };

// —— 主循环 ——
ctx.onTick(function scene3MemoryTick(dt) {
  if ((ctx.scene.activeWorld || 'b612') !== 'b612') return;
  if (ctx.store.flag('page1')) return;
  if (!world()?.meta.surface) {
    ctx.ui.journey?.setPhase(OWNER, {
      world: 'b612',
      chapter: { zh: 'B612 · 小王子的家', en: 'B612 · his home' },
      hint: {
        zh: '正在展开原来的小星球，请稍候……',
        en: 'Unfolding the little planet. Please wait…',
      },
    });
    return;
  }
  if (!built) {
    build();
    return;
  }
  // 到达演出(1.2s 延迟)
  if (curStep < 0) {
    if (!scene3MemoryTickStart) scene3MemoryTickStart = performance.now();
    if (performance.now() - scene3MemoryTickStart > 1200) {
      arrival();
    }
    return;
  }

  // 对话链播放中 → 不检测新站
  if (chainBusy || interactionBusy || ctx.overlay.anyOpen() || ctx.ui.dialogOpen?.()) return;
  if (curStep >= 4) {
    checkCompletion();
    return;
  }

  // 金色光标呼吸
  if (curStep >= 0 && curStep < STEPS.length) {
    placeMarker(STEPS[curStep].x, STEPS[curStep].z);
  }

  // 烟雾飘动
  for (const sp of smokeSprites) {
    sp.position.y += dt * 0.15;
    if (sp.position.y > sp.userData.baseY + 1.5) sp.position.y = sp.userData.baseY;
  }
});
