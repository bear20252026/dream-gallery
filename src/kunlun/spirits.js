// spirits.js — 六颗星屑收集系统(2026-07-26 主人定,借鉴 Poolrooms 光珀机制)
// 触发:天穹进度 100% 后,残镜浮现第二卷文字 → 六枚星屑逐颗解锁(金光柱指引)
// 流程:走近当前星屑光柱 → 点「拾取」→ 专属文案+TTS+边缘色光 → 解锁下一颗 → 六齐触发终章
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { bigText } from '../ui/kit.js';
import { chime as blipChime } from '../shared/audio-blip.js';
const bag = hotBegin('spirits');
const { s, onTick } = ctx;

// ===================== 六星屑数据(文案=主人终版) =====================
const KX = 800,
  KZ = 600; // B612坐标(与 desert.js 一致)
const SPIRITS = [
  {
    key: 'sprout',
    name: '春生之芽',
    en: 'Sprout of Spring',
    emotion: '希望',
    color: '#7ddb7a',
    pos: [KX - 150, KZ],
    place: 'B612东麓·初阳坡',
    popup: '你找到了「春生之芽」。',
    tts: '春生之芽。它藏在B612最早照到阳光的那道石缝里。你曾在无数个清晨醒来，却很少留意窗台上那盆植物长出了第几片新叶。但希望从来不需要被注视——它只管生长。就像你决定上传第一张照片时那样。',
  },
  {
    key: 'flame',
    name: '夏炽之焰',
    en: 'Flame of Summer',
    emotion: '热爱',
    color: '#ff5a4a',
    pos: [KX - 60, KZ - 20],
    place: 'B612之巅·望天石下',
    popup: '你找到了「夏炽之焰」。',
    tts: '夏炽之焰。它沉睡在B612最高处的一块岩石之下。你或许已经忘了那个夏天——汗流浃背却不肯放下相机的那天。但B612记得。记得你胸口那团滚烫的、想把一切都记录下来的冲动。那就是星屑最初的形状。',
  },
  {
    key: 'leaf',
    name: '秋思之叶',
    en: 'Leaf of Autumn',
    emotion: '眷恋',
    color: '#e8a03c',
    pos: [KX + 80, KZ - 140],
    place: 'B612北麓·枯草坡',
    popup: '你找到了「秋思之叶」。',
    tts: '秋思之叶。它飘落在B612北坡的一片枯草地上。你大概已经不太记得，最后一次见到那个人是什么季节。但每一次秋风吹起来的时候，你心里都会泛起同样的涟漪。眷恋是另一种记忆——它不用照片，只用心跳。',
  },
  {
    key: 'snow',
    name: '冬藏之雪',
    en: 'Snow of Winter',
    emotion: '沉静',
    color: '#dfeaf5',
    pos: [KX - 60, KZ + 170],
    place: 'B612深处·暗河源头',
    popup: '你找到了「冬藏之雪」。',
    tts: '冬藏之雪。它沉在B612深处一条暗河的源头。你生命中有过一些时刻，什么话都不想说，什么人都不愿见。但那些沉默并不是空白——它们是雪的质地。安静、缓慢、却厚重。等你回头再碰它时，已经化成了水，滋养了下一季。',
  },
  {
    key: 'dawn',
    name: '朝露之珠',
    en: 'Bead of Dawn',
    emotion: '新生',
    color: '#7cc8e8',
    pos: [KX - 110, KZ - 80],
    place: 'B612东崖·草叶尖端',
    popup: '你找到了「朝露之珠」。',
    tts: '朝露之珠。它凝结在B612东崖的一片草叶尖端。黎明前的光总是最轻的。你那些重新开始的念头——换了新工作、搬了新城市、删了旧照片——都像朝露。它们只出现一次，只在最安静的时刻。但你抓住了。',
  },
  {
    key: 'dusk',
    name: '暮光之尘',
    en: 'Dust of Dusk',
    emotion: '释然',
    color: '#f0a860',
    pos: [KX + 170, KZ + 60],
    place: 'B612西麓·霞光台',
    popup: '你找到了「暮光之尘」。',
    tts: '暮光之尘。它悬浮在B612西侧的一片晚霞里。你曾经有多少次看见夕阳，却没有停下来看它？那些错过的黄昏都变成了尘埃——飘在空中，等着有人抬头。而你终于抬头了。这就是最后一枚星屑。它告诉你：所有未完成的，都可以在日暮时被原谅。',
  },
];
const INTRO_TTS =
  '天可补，心难全。B612之下，六颗之间，散落着六枚心象星屑。它们藏于B612的六个角落，每一枚都对应一种凡人最珍贵的情感。寻回六枚，万镜画廊的真正面目，才会向你打开。';
const FINAL_POPUP = '六星屑齐聚。万镜画廊的门，重新打开了。';
const FINAL_TTS =
  '六星屑齐聚。你已穿越B612的春夏秋冬，拾回了希望、热爱、眷恋、沉静、新生与释然。你以为你一直在补天。其实，你一直在补自己。从今往后，愿你继续记住。';

// ===================== 状态 =====================
// 乱序提前拾取(2026-07-27,设计文档):玩家可先拾取未揭示的星屑,系统按收集进度调序,结局不变。
// 库存 spiritsKeys=已收集 key 数组(顺序无关);兼容数量键由 store.addSpirit 同步写(2026-07-28 收编 store.js)。
// 旧档迁移(顺序收集时代只有数量键)也在 store.getSpirits 内完成。
function gotKeys() {
  return ctx.store.getSpirits();
}
function got() {
  return gotKeys().length;
}
function isDone() {
  return got() >= 6;
}
function nextIdx() {
  const k = gotKeys();
  return SPIRITS.findIndex((sp) => !k.includes(sp.key));
} // 首个未收集=当前揭示目标
function questActive() {
  // B612 星球章节模式(2026-09-05):planets.js 接管章节流,门槛恒开(天穹100%前置退役)
  if (ctx.kunlun.planetsMode) return true;
  // 天穹 100% 后开启(里程碑已触发过 100 档,或进度值已达 100)
  if (ctx.store.num('skyMs') >= 100) return true;
  const q = ctx.store.num('quiz'),
    u = ctx.store.num('up');
  return Math.min(q + u * 5, 100) >= 100;
}

// ===================== 光柱(仅当前目标可见;无 PointLight,手机灯光账户不动) =====================
// 夏炽之焰位置(2026-07-27 地形探测修正):原位 [KX,KZ] 峰顶 2m 内坡度 6.8m(刃脊,根本上不去),
// 移至 [KX-60,KZ-20] 峰肩(海拔 55.6m,坡度 1.7m,可站立可达),「B612之巅·望天石下」意境不变。
function pillarTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,214,130,0.9)');
  g.addColorStop(0.7, 'rgba(255,214,130,0.35)');
  g.addColorStop(1, 'rgba(255,214,130,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 16, 128);
  return new THREE.CanvasTexture(c);
}
let pillar = null,
  pillarRing = null,
  pickBtn = null;
// 指引 HUD(2026-07-27,参考 Level 37 的 q-arrow 模式):屏顶旋转箭头 + 名字/地点/距离
let hud = null,
  hudArrow = null,
  hudText = null;
// 悬浮名牌(设计文档:近距离光柱顶部浮现星屑名称;这里 60m 内常显,远近都看得见目标)
let nameSpr = null,
  nameCanvas = null,
  nameCtx = null,
  nameTex = null;
// 野灵感应微光(乱序拾取用,见 buildPillar 底部)
let wildSpr = null;
function groundY(x, z) {
  try {
    return ctx.media.desert.getH(x, z);
  } catch (e) {
    return 0;
  }
}
function buildPillar() {
  const tex = pillarTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 14, 12, 1, true), mat);
  pillarRing = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.6, 40),
    new THREE.MeshBasicMaterial({
      color: '#ffd88a',
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  pillarRing.rotation.x = -Math.PI / 2;
  s.add(pillar);
  s.add(pillarRing);
  pillar.visible = pillarRing.visible = false; // 幽灵光柱修复(2026-09-04 审计):未激活前不可见,placePillar 点亮
  // 悬浮名牌(3D 世界内,贴在光柱上方)
  nameCanvas = document.createElement('canvas');
  nameCanvas.width = 256;
  nameCanvas.height = 64;
  nameCtx = nameCanvas.getContext('2d');
  nameTex = new THREE.CanvasTexture(nameCanvas);
  nameSpr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: nameTex, transparent: true, depthWrite: false })
  );
  nameSpr.scale.set(7, 1.75, 1);
  nameSpr.visible = false;
  s.add(nameSpr); // 可见性由主循环按距离控制
  // 指引 HUD(DOM,屏顶居中,纯展示不拦截触摸)
  hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;top:52px;left:50%;transform:translateX(-50%);z-index:55;display:none;flex-direction:column;align-items:center;pointer-events:none;font-family:inherit';
  hudArrow = document.createElement('div');
  hudArrow.textContent = '▲';
  hudArrow.style.cssText =
    'font-size:18px;line-height:20px;color:#ffd88a;text-shadow:0 0 10px rgba(255,200,100,.85),0 1px 4px rgba(0,0,0,.8)';
  hudText = document.createElement('div');
  hudText.style.cssText =
    'margin-top:2px;font-size:11px;letter-spacing:2px;color:rgba(255,232,190,.9);text-shadow:0 1px 4px rgba(0,0,0,.75);white-space:nowrap';
  hud.appendChild(hudArrow);
  hud.appendChild(hudText);
  document.body.appendChild(hud);
  // 拾取按钮(走近才出现)
  pickBtn = document.createElement('button');
  pickBtn.textContent = '拾 取';
  pickBtn.style.cssText =
    'position:fixed;left:50%;bottom:160px;transform:translateX(-50%);z-index:60;display:none;padding:12px 30px;border-radius:24px;border:1px solid rgba(255,214,130,.7);background:rgba(40,26,12,.8);color:#ffe9c4;font-size:16px;letter-spacing:4px;cursor:pointer;font-family:inherit';
  document.body.appendChild(pickBtn);
  pickBtn.onclick = collect;
  // 野灵感应微光(乱序提前拾取):未揭示的星屑在 25m 内浮现柔光团——玩家路过能"感应"到这里有东西
  const wcv = document.createElement('canvas');
  wcv.width = wcv.height = 64;
  const wctx2 = wcv.getContext('2d');
  const wg = wctx2.createRadialGradient(32, 32, 2, 32, 32, 30);
  wg.addColorStop(0, 'rgba(255,255,255,0.9)');
  wg.addColorStop(1, 'rgba(255,255,255,0)');
  wctx2.fillStyle = wg;
  wctx2.fillRect(0, 0, 64, 64);
  wildSpr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(wcv),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  wildSpr.scale.set(3, 3, 1);
  wildSpr.visible = false;
  s.add(wildSpr);
}
function drawName(i) {
  const sp = SPIRITS[i],
    x = nameCtx;
  x.clearRect(0, 0, 256, 64);
  x.font = 'bold 30px KaiTi,serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = 'rgba(0,0,0,.9)';
  x.shadowBlur = 8;
  x.fillStyle = sp.color;
  x.fillText('✦ ' + sp.name + ' ✦', 128, 32);
  nameTex.needsUpdate = true;
}
function placePillar(i) {
  if (i < 0) return;
  const sp = SPIRITS[i];
  const y = groundY(sp.pos[0], sp.pos[1]);
  // 实心山铁律:星屑必须落在地表之上(2026-07-27)
  if (ctx.media.desert.assertAboveGround)
    ctx.media.desert.assertAboveGround(sp.pos[0], y + 0.15, sp.pos[1], '星屑·' + sp.name);
  pillar.position.set(sp.pos[0], y + 7, sp.pos[1]);
  pillarRing.position.set(sp.pos[0], y + 0.15, sp.pos[1]);
  nameSpr.position.set(sp.pos[0], y + 16, sp.pos[1]);
  drawName(i);
  const col = new THREE.Color(sp.color);
  pillar.material.color = col;
  pillarRing.material.color = col;
  pillar.visible = pillarRing.visible = true;
}

// ===================== 反馈:边缘色光 + 水晶叮声(音高逐颗上行) =====================
function edgeFlash(color) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;inset:0;z-index:388;pointer-events:none;box-shadow:inset 0 0 120px 30px ${color};opacity:0;transition:opacity .4s`;
  document.body.appendChild(d);
  requestAnimationFrame(() => {
    d.style.opacity = '0.9';
    setTimeout(() => {
      d.style.opacity = '0';
      setTimeout(() => d.remove(), 500);
    }, 900);
  });
}
// 叮声实现统一在 shared/audio-blip.js(B1 整改);音阶 E4 F4 G4 A4 B4 C5 上行
const chime = (i) =>
  blipChime([659, 698, 784, 880, 988, 1047][i] || 880, { peak: 0.25, decay: 1.6 });

// ===================== 收集流程 =====================
let collecting = false,
  pickIdx = -1; // pickIdx:主循环判定的"脚下这颗"(含未揭示的乱序拾取)
function collect(extKey, extLine) {
  if (collecting) return;
  // 2026-09-05:planets.js 星球岛星屑拾取走外部调用(extKey+星球版台词),沙漠光柱系统休眠
  const ti = extKey
    ? SPIRITS.findIndex((sp) => sp.key === extKey)
    : pickIdx >= 0
      ? pickIdx
      : nextIdx();
  if (ti < 0) return;
  collecting = true;
  pickIdx = -1;
  pickBtn.style.display = 'none';
  if (pillar) pillar.visible = pillarRing.visible = false;
  if (nameSpr) nameSpr.visible = false;
  if (wildSpr) wildSpr.visible = false;
  const sp = SPIRITS[ti];
  const line = extLine || sp;
  const keys = ctx.store.addSpirit(sp.key); // 写入库存数组+同步兼容数量键
  const n = keys.length;
  chime(n - 1);
  edgeFlash(sp.color);
  bigText(line.popup, { hold: 2600 });
  ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak(line.tts, 'spirits'); // B6 收集音色
  ctx.ui.modeToast &&
    ctx.ui.modeToast(
      (line.toast || sp.name + ' · ' + sp.emotion + ' · 已收入罗盘') + '（' + n + '/6）'
    );
  setTimeout(() => {
    collecting = false;
    if (n >= 6) {
      finale();
    } else if (!ctx.kunlun.planetsMode) placePillar(nextIdx()); // 乱序拾取后:揭示目标=下一颗未收集(系统调序,结局不变)
    refreshSpiritsPage();
  }, 2000);
}
function finale() {
  ctx.store.mark('spiritsDone');
  // 六道光束冲天(3 秒壮观特效)——星球章节模式下岛在天空,沙漠光束改由 planets.js 终幕接管
  if (ctx.kunlun.planetsMode) {
    bigText(FINAL_POPUP, { hold: 2600 });
    ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak(FINAL_TTS);
    refreshSpiritsPage();
    return;
  }
  const beams = [];
  for (const sp of SPIRITS) {
    const y = groundY(sp.pos[0], sp.pos[1]);
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1.0, 60, 10, 1, true),
      new THREE.MeshBasicMaterial({
        map: pillarTexture(),
        color: sp.color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    b.position.set(sp.pos[0], y + 30, sp.pos[1]);
    s.add(b);
    beams.push(b);
  }
  const t0 = performance.now();
  (function fade() {
    const p = Math.min((performance.now() - t0) / 3000, 1);
    beams.forEach((b) => (b.material.opacity = 0.9 * (1 - p)));
    if (p < 1) requestAnimationFrame(fade);
    else
      beams.forEach((b) => {
        s.remove(b);
        b.geometry.dispose();
        b.material.dispose();
      });
  })();
  bigText(FINAL_POPUP, { hold: 2600 });
  ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak(FINAL_TTS);
  refreshSpiritsPage();
}

// ===================== 主循环:激活检测 + 走近提示 + 呼吸动画 =====================
let started = false,
  nearT = 0,
  hudT = 0;
onTick(function () {
  if (ctx.kunlun.planetsMode) return; // 星球章节模式:沙漠光柱/HUD/野灵系统休眠(planets.js 接管)
  if (!questActive()) return;
  if (!started) {
    started = true;
    if (got() < 6) {
      placePillar(nextIdx());
      if (!ctx.store.flag('spiritsIntro')) {
        ctx.store.mark('spiritsIntro');
        bigText('残镜之上，浮现出第二卷文字——', { hold: 2600 });
        ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak(INTRO_TTS);
      }
    }
    refreshSpiritsPage();
    return;
  }
  if (got() >= 6 || !pillar.visible) {
    pickBtn.style.display = 'none';
    hud.style.display = 'none';
    nameSpr.visible = false;
    if (wildSpr) wildSpr.visible = false;
    return;
  }
  // 呼吸:光柱明暗+底座环旋转
  const t = performance.now() * 0.001;
  pillar.material.opacity = 0.75 + Math.sin(t * 2) * 0.25;
  pillarRing.rotation.z += 0.01;
  if (!ctx.player.pl) return;
  const ti = nextIdx();
  if (ti < 0) return;
  // 指引 HUD + 悬浮名牌(8Hz 节流,与参考实现一致;飞行/展厅内不打扰)
  if (t - hudT > 0.12) {
    hudT = t;
    const sp = SPIRITS[ti];
    const hx = sp.pos[0] - ctx.player.pl.p.x,
      hz = sp.pos[1] - ctx.player.pl.p.z;
    const dist = Math.hypot(hx, hz);
    const tAng = Math.atan2(hx, hz),
      fAng = Math.atan2(-Math.sin(ctx.player.pl.y), -Math.cos(ctx.player.pl.y));
    let rel = tAng - fAng;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    hudArrow.style.transform = 'rotate(' + ((-rel * 180) / Math.PI).toFixed(1) + 'deg)';
    hudArrow.style.color = sp.color;
    hudText.textContent = sp.name + ' · ' + sp.place + ' · ' + Math.round(dist) + 'm';
    hud.style.display = ctx.kunlun.flightLock ? 'none' : 'flex';
    nameSpr.visible = dist < 60; // 名牌只在 60m 内浮现(远处靠光柱+HUD)
  }
  // 走近提示拾取(3m 内任意未收集星屑——含未揭示的,乱序提前拾取;系统调序,结局不变)
  const keys = gotKeys();
  let pi = -1;
  for (let j = 0; j < 6; j++) {
    if (keys.includes(SPIRITS[j].key)) continue;
    const ddx = ctx.player.pl.p.x - SPIRITS[j].pos[0],
      ddz = ctx.player.pl.p.z - SPIRITS[j].pos[1];
    if (ddx * ddx + ddz * ddz < 9) {
      pi = j;
      break;
    }
  }
  if (pi >= 0) {
    pickIdx = pi;
    if (!nearT) {
      pickBtn.style.display = 'block';
      pickBtn.textContent = '拾 取 · ' + SPIRITS[pi].name;
    }
  } else {
    pickIdx = -1;
    pickBtn.style.display = 'none';
  }
  nearT = pi >= 0 ? 1 : 0;
  // 野灵感应微光:25m 内最近的未揭示星屑浮现柔光团(不剧透名字,只提示"这里有东西")
  let wi = -1,
    wd = 25;
  for (let j = 0; j < 6; j++) {
    if (j === ti || keys.includes(SPIRITS[j].key)) continue;
    const d = Math.hypot(
      SPIRITS[j].pos[0] - ctx.player.pl.p.x,
      SPIRITS[j].pos[1] - ctx.player.pl.p.z
    );
    if (d < wd) {
      wd = d;
      wi = j;
    }
  }
  if (wildSpr) {
    if (wi >= 0 && !ctx.kunlun.flightLock) {
      wildSpr.position.set(
        SPIRITS[wi].pos[0],
        groundY(SPIRITS[wi].pos[0], SPIRITS[wi].pos[1]) + 1.5,
        SPIRITS[wi].pos[1]
      );
      wildSpr.material.color.set(SPIRITS[wi].color);
      const pu = 2.4 + Math.sin(t * 3) * 0.5;
      wildSpr.scale.set(pu, pu, 1);
      wildSpr.visible = true;
    } else wildSpr.visible = false;
  }
});

// ===================== 罗盘页数据(供 settings.js 六星屑页读取) =====================
function spiritsState() {
  const keys = gotKeys(),
    ti = nextIdx();
  return SPIRITS.map((sp, i) => ({
    name: sp.name,
    en: sp.en,
    emotion: sp.emotion,
    color: sp.color,
    place: sp.place,
    state: keys.includes(sp.key) ? 'got' : i === ti && questActive() ? 'open' : 'locked',
  }));
}
function refreshSpiritsPage() {
  if (window.__refreshSpirits) window.__refreshSpirits();
}
// 小地图星屑标记(player.js drawMap 读取):返回当前目标 {x,z,name,color},无目标返回 null
function spiritMark() {
  // 星球章节模式:交给 planets.js(星门/当前岛星屑)
  if (ctx.kunlun.planetsMode && ctx.kunlun.planetsMark) return ctx.kunlun.planetsMark();
  if (!questActive()) return null;
  const ti = nextIdx();
  if (ti < 0) return null;
  const sp = SPIRITS[ti];
  return { x: sp.pos[0], z: sp.pos[1], name: sp.name, color: sp.color };
}

buildPillar();
Object.assign(ctx.kunlun, {
  spiritsState,
  isDone: () => isDone(),
  spiritsGot: got,
  spiritsTTS: SPIRITS.map((sp) => sp.tts),
  spiritMark,
  spiritsCollectExternal: collect, // planets.js 星球岛星屑拾取入口(2026-09-05)
  spiritsNextKey: () => (nextIdx() >= 0 ? SPIRITS[nextIdx()].key : null),
}); // spiritsTTS 供 finale.js 星屑归位重听
bag.custom.push(() => {
  if (pickBtn) pickBtn.remove();
  if (hud) hud.remove();
});
hotEnd('spirits');
if (import.meta.hot) import.meta.hot.accept();
