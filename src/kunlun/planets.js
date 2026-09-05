// planets.js — B612 六星章节(2026-09-05,小王子改编·方案A·贴原著)
// 画廊中庭石制星门 → fadeTeleport 至六座悬浮小行星岛(每章一座):
//   325 国王(王座)/326 爱虚荣的人(高镜)/327 酒鬼(酒瓶)/328 商人(账桌+星环)
//   /329 点灯人(自亮灭路灯)/330 地理学家(书堆星图)
// 岛上拾星屑 → ctx.kunlun.spiritsCollectExternal(复用 spirits 的反馈/库存/终章)
// 回程门回画廊,星门换色指向下一章;groundOverride 链式注册(多浮空岛地面)。
// 门槛解除: spirits questActive 在 planetsMode 下恒真(天穹100%前置退役)。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { initSceneManager } from '../core/scene-manager.js';
const bag = hotBegin('planets');
const { s, onTick } = ctx;

// 独立世界灯光工厂:GLB 内含 PBR 材质,必须有足够强的光才能渲染出颜色(否则全黑)
function addWorldLights(scene) {
  scene.add(new THREE.AmbientLight(0xfff8f0, 1.8));
  const key = new THREE.DirectionalLight(0xfff4e0, 4.0);
  key.position.set(8, 12, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fb0d8, 1.5);
  fill.position.set(-6, 4, -5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd9a0, 1.0);
  rim.position.set(0, 3, -8);
  scene.add(rim);
  // 半球光:天空蓝+地面暖,让模型底部也不死黑
  scene.add(new THREE.HemisphereLight(0x8fb0d8, 0x8b7654, 1.2));
}
// 星空粒子背景(每个世界独立实例)
function addStarfield(scene) {
  const geo = new THREE.BufferGeometry();
  const n = 3000;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 500;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.9 })
  );
  scene.add(stars);
  return stars;
}

// 独立世界容器:main 保留现有画廊,B612 独立注册;六星世界在 PLANETS 数据定义后按序注册。
const worldManager = initSceneManager({
  renderer: ctx.scene.rnd,
  camera: ctx.scene.cam,
  mainScene: s,
  player: ctx.player,
});
const b612World = worldManager.registerWorld('b612', {
  scene: new THREE.Scene(),
  meta: { title: 'B612' },
});
b612World.scene.background = new THREE.Color(0x0a0a1e);
addWorldLights(b612World.scene);
addStarfield(b612World.scene);

const assetLoader = new GLTFLoader();
assetLoader.setMeshoptDecoder(MeshoptDecoder);
function loadWorldAsset(url, world, opts = {}) {
  assetLoader.load(
    url,
    (gltf) => {
      const model = gltf.scene;
      model.name = opts.name || url.split('/').pop();
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z) || 1;
      const scale = (opts.maxSize || max) / max;
      model.scale.setScalar(scale);
      model.position.set(
        (opts.x || 0) - center.x * scale,
        (opts.y || 0) - box.min.y * scale,
        (opts.z || 0) - center.z * scale
      );
      if (opts.rotationY) model.rotation.y = opts.rotationY;
      world.scene.add(model);
      if (opts.onLoad) opts.onLoad(model);
    },
    undefined,
    (err) => console.warn('[planets] world asset unavailable:', url, err.message)
  );
}
/* ===================== 六星章节数据(key 与 spirits SPIRITS 同序同键) ===================== */
// 剧情权限:完成当前星球后解锁下一颗;已解锁世界之间互相直达。顺序=原著行星(方案A)。
const WORLD_UNLOCK = [
  { world: 'king326', key: 'flame', num: '326', name: '虚荣之星', done: 'flameDone' },
  { world: 'king327', key: 'leaf', num: '327', name: '酒鬼之星', done: 'leafDone' },
  { world: 'king328', key: 'snow', num: '328', name: '商人之星', done: 'snowDone' },
  { world: 'king329', key: 'dawn', num: '329', name: '点灯人之星', done: 'dawnDone' },
  { world: 'king330', key: 'dusk', num: '330', name: '地理学家之星', done: 'duskDone' },
];
function unlockedWorldIds() {
  return ['main', 'b612', 'king'].concat(
    WORLD_UNLOCK.slice(0, Math.max(0, chapter - 1)).map((w) => w.world)
  );
}
const R = 13; // 岛半径
const PLANETS = [
  {
    key: 'sprout',
    num: '325',
    name: '国王之星',
    color: '#d9a441',
    veil: 'rgba(180,140,70,.14)',
    pos: [120, 58, -70],
    place: '325 号小行星 · 国王',
    tts: '国王的星球一无所有,他却统治一切。他命令太阳落下——只在日落允许的时刻。他说:审判自己,比审判别人难得多。能做到的人,寥寥无几。',
    popup: '拾获星屑 · 国王',
    en: 'The King',
  },
  {
    key: 'flame',
    num: '326',
    name: '虚荣之星',
    color: '#e8b8c8',
    veil: 'rgba(220,160,190,.13)',
    pos: [-240, 66, -150],
    place: '326 号小行星 · 爱虚荣的人',
    tts: '他听不见别的,只听得见赞美。你鼓一次掌,他敬一次礼。掌声给了他一顶帽子似的快乐,却从没给过他一个朋友。',
    popup: '拾获星屑 · 爱虚荣的人',
    en: 'The Conceited Man',
  },
  {
    key: 'leaf',
    num: '327',
    name: '酒鬼之星',
    color: '#9ab87a',
    veil: 'rgba(120,160,90,.14)',
    pos: [330, 74, 110],
    place: '327 号小行星 · 酒鬼',
    tts: '酒鬼坐在空荡荡的星球上喝酒。喝酒为了什么?为了忘记。忘记什么?忘记羞愧。羞愧什么?羞愧喝酒。有些被忘掉的,其实一直等着被找回来。',
    popup: '拾获星屑 · 酒鬼',
    en: 'The Tippler',
  },
  {
    key: 'snow',
    num: '328',
    name: '商人之星',
    color: '#c8a86a',
    veil: 'rgba(170,130,60,.15)',
    pos: [-400, 82, 90],
    place: '328 号小行星 · 商人',
    tts: '商人一辈子在数星星,数了五亿零一百万颗,把数字锁进抽屉,说星星都归他了。可他从来没有抬头看过它们一眼。拥有和看见,原来是两件事。',
    popup: '拾获星屑 · 商人',
    en: 'The Businessman',
  },
  {
    key: 'dawn',
    num: '329',
    name: '点灯人之星',
    color: '#a8c8e0',
    veil: 'rgba(140,170,210,.14)',
    pos: [200, 90, 330],
    place: '329 号小行星 · 点灯人',
    tts: '点灯人的星球一分钟自转一圈。他点亮,熄灭,再点亮,不敢停。他是唯一不为自己忙的人——小王子说,那是唯一可以交朋友的人。',
    popup: '拾获星屑 · 点灯人',
    en: 'The Lamplighter',
  },
  {
    key: 'dusk',
    num: '330',
    name: '地理学家之星',
    color: '#d0b090',
    veil: 'rgba(190,160,120,.15)',
    pos: [-190, 96, 400],
    place: '330 号小行星 · 地理学家',
    tts: '地理学家写厚厚的书,却从不出门。他说,花是转瞬即逝的,不能写进书里。小王子忽然心疼起来——他的玫瑰,也是转瞬即逝的。最后一根光柱,在天上。',
    popup: '拾获星屑 · 地理学家',
    en: 'The Geographer',
  },
];

/* ===================== 状态 ===================== */
let chapter = ctx.store.num('planetsChapter'); // 0..6(6=全部完成)
if (chapter > 6) chapter = 6;
ctx.kunlun.planetsMode = true; // spirits.js:沙漠光柱系统休眠,questActive 恒真

/* ===================== groundOverride 链式注册(浮空岛地面) ===================== */
const prevOverride = ctx.kunlun.groundOverride; // 可能是 eternal 的链(导入顺序在其后)
ctx.kunlun.groundOverride = function (x, z) {
  const active = ctx.scene.activeWorld;
  if (active === 'b612') return 0;
  if (active && /^king\d+$/.test(active)) {
    const num = active.replace('king', '');
    const cfg = PLANETS.find((p) => p.num === num);
    if (cfg) return R * 0.42;
    return 0;
  }
  for (let i = 0; i < PLANETS.length; i++) {
    const isl = PLANETS[i];
    const dx = x - isl.pos[0],
      dz = z - isl.pos[2];
    if (dx * dx + dz * dz < R * R) return isl.pos[1] + R * 0.42; // 球顶表面(压扁后)
  }
  return prevOverride ? prevOverride.call(this, x, z) : undefined;
};
bag.custom.push(function () {
  ctx.kunlun.groundOverride = prevOverride; // HMR 解链
});

/* ===================== 材质工具(零 PointLight:顶亮底暗顶点色) ===================== */
function planetMesh(topHex, botHex) {
  const g = new THREE.SphereGeometry(R, 40, 24);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(topHex),
    bot = new THREE.Color(botHex),
    c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) / R) * 0.5 + 0.5, 0, 1);
    c.copy(bot).lerp(top, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
}
function box(w, h, d, hex) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color: hex })
  );
}
function cyl(rt, rb, h, hex) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, 14),
    new THREE.MeshBasicMaterial({ color: hex })
  );
}
function numSprite(txt, color) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const x = cv.getContext('2d');
  x.font = 'bold 40px Georgia,serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = color;
  x.fillText(txt, 64, 32);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthWrite: false,
    })
  );
  sp.scale.set(5, 2.5, 1);
  return sp;
}

/* ===================== 岛屿建造(体块道具,每章一件) ===================== */
const islands = [];
function buildIsland(cfg, idx) {
  const grp = new THREE.Group();
  grp.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
  // 星球体(顶亮底暗)
  const shade = new THREE.Color(cfg.color).multiplyScalar(0.3);
  const body = planetMesh(cfg.color, '#' + shade.getHexString());
  body.scale.y = 0.42;
  grp.add(body);
  // 星环细环(与商人章呼应的通用语言)
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(R + 1.2, 0.06, 8, 64),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.35 })
  );
  rim.rotation.x = Math.PI / 2 - 0.16;
  rim.position.y = 0.4;
  grp.add(rim);
  // 章节编号
  const num = numSprite(cfg.num, cfg.color);
  num.position.set(0, R * 0.42 + 3.2, 0);
  grp.add(num);
  const topY = R * 0.42; // 独立世界岛心为原点,球顶高度

  // ---- 章节道具 ----
  const props = new THREE.Group();
  props.position.y = topY;
  if (idx === 0) {
    // 国王:王座+披风
    const seat = box(1.6, 0.9, 1.4, 0x7a5a34);
    seat.position.set(0, 0.45, 0);
    const back = box(1.6, 2.6, 0.3, 0x6b4c2c);
    back.position.set(0, 1.7, -0.65);
    const armL = box(0.25, 0.7, 1.3, 0x7a5a34);
    armL.position.set(-0.85, 0.85, 0);
    const armR = armL.clone();
    armR.position.x = 0.85;
    const cape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 1.5, 2.6, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9a2c2c, side: THREE.DoubleSide })
    );
    cape.position.set(0, 1.4, -1.5);
    props.add(seat, back, armL, armR, cape);
  } else if (idx === 1) {
    // 虚荣:高镜
    const frame = box(1.5, 3.4, 0.14, 0x8a6a4a);
    frame.position.set(0, 1.7, 0);
    const glass = box(1.2, 3.0, 0.05, 0xd8e4ea);
    glass.position.set(0, 1.7, 0.06);
    const foot = box(1.1, 0.3, 0.7, 0x6b4c2c);
    foot.position.set(0, 0.15, 0);
    props.add(frame, glass, foot);
  } else if (idx === 2) {
    // 酒鬼:三只歪酒瓶
    for (let i = 0; i < 3; i++) {
      const bottle = new THREE.Group();
      const bd = cyl(0.22, 0.26, 0.9, 0x3a5a3a);
      bd.position.y = 0.45;
      const neck = cyl(0.07, 0.14, 0.4, 0x3a5a3a);
      neck.position.y = 1.05;
      bottle.add(bd, neck);
      bottle.position.set(Math.cos(i * 2.1) * 1.3, 0, Math.sin(i * 2.1) * 1.3);
      bottle.rotation.z = (i - 1) * 0.5;
      props.add(bottle);
    }
  } else if (idx === 3) {
    // 商人:账桌+纸+头顶三道星环(数过的星星锁进环)
    const desk = box(2.2, 0.12, 1.1, 0x6b4c2c);
    desk.position.set(0, 1.0, 0);
    const legL = box(0.14, 1.0, 0.9, 0x5a3f24);
    legL.position.set(-0.9, 0.5, 0);
    const legR = legL.clone();
    legR.position.x = 0.9;
    const paper = box(0.6, 0.02, 0.8, 0xefe5cc);
    paper.position.set(0.2, 1.08, 0.1);
    paper.rotation.y = 0.4;
    props.add(desk, legL, legR, paper);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.2 + i * 0.5, 0.04, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xd8c8a0, transparent: true, opacity: 0.4 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 2.4 + i * 0.12;
      props.add(ring);
    }
  } else if (idx === 4) {
    // 点灯人:路灯(真亮灭,2.4s 周期)
    const post = cyl(0.09, 0.12, 3.4, 0x3a3a44);
    post.position.set(0, 1.7, 0);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0 })
    );
    head.position.set(0, 3.6, 0);
    props.add(post, head);
    props.userData.lampHead = head; // 主循环交替亮灭
  } else {
    // 地理学家:书堆+星球仪+摊开的地图
    const b1 = box(1.1, 0.22, 0.8, 0x8a4a3a);
    b1.position.set(0, 0.11, 0);
    const b2 = box(1.0, 0.2, 0.72, 0x3a5a7a);
    b2.position.set(0.06, 0.32, 0.05);
    b2.rotation.y = 0.3;
    const b3 = box(0.9, 0.18, 0.66, 0x5a6b3a);
    b3.position.set(-0.04, 0.51, -0.03);
    b3.rotation.y = -0.2;
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x7aa8c8 })
    );
    globe.position.set(1.3, 0.62, -0.2);
    const map = box(1.8, 0.02, 1.2, 0xefe5cc);
    map.position.set(-1.2, 0.02, 0.6);
    map.rotation.y = 0.5;
    props.add(b1, b2, b3, globe, map);
  }
  grp.add(props);

  // 星屑(可拾取):八面体,本章节色,呼吸浮动
  const mote = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42),
    new THREE.MeshBasicMaterial({ color: cfg.color })
  );
  mote.position.set(0, topY + 1.15, 2.6);
  grp.add(mote);

  // 回程门(拾取后才出现):小石环
  const door = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.09, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd88a })
  );
  door.position.set(0, topY + 1.5, -3.4);
  door.visible = false;
  grp.add(door);

  const planetWorld = worldManager.registerWorld('king' + cfg.num, {
    scene: new THREE.Scene(),
    meta: { title: cfg.name },
  });
  planetWorld.scene.background = new THREE.Color(0x0a0a1e);
  addWorldLights(planetWorld.scene);
  addStarfield(planetWorld.scene);
  grp.position.set(0, 0, 0);
  planetWorld.scene.add(grp);
  const isl = {
    cfg,
    grp,
    mote,
    door,
    props,
    topY,
    idx,
    moteW: { x: 0, y: topY + 1.15, z: 2.6 }, // 星屑本地坐标(独立世界以岛心为原点)
    doorW: { x: 0, z: -3.4 }, // 回程门本地坐标
  };
  islands.push(isl);
  return isl;
}
PLANETS.forEach(buildIsland);

// 独立世界故事资产:只挂到目标 scene,不进入主世界。
// B612:storybook 模型放在 (0,0,-15),玩家出生在 (0,2,12) 面朝它,距离 27m,模型宽 ~35m 填满视野
loadWorldAsset('models/hall/b612-world/b612-storybook.glb', b612World, {
  name: 'b612Storybook',
  maxSize: 40,
  x: 0,
  y: 0,
  z: -15,
});
// King:king-scene 模型放在 (0,0,-15),玩家出生在 (0,7,12) 面朝它
loadWorldAsset('models/hall/b612-world/king-scene.glb', worldManager.getWorld('king325'), {
  name: 'kingStoryScene',
  maxSize: 40,
  x: 0,
  y: 0,
  z: -15,
});
// B612 由 storybook GLB 原样呈现(小王子+绵羊+玫瑰+火山+星空全在模型内)
// 终幕配乐:进入 B612 播放 GARGANTUA intro + main
const gargIntro = new Audio('media/gargantua/gargantua-intro.mp3');
const gargMain = new Audio('media/gargantua/gargantua-main.mp3');
gargMain.loop = true;
let gargStarted = false;
ctx.scene.worldChanged &&
  ctx.scene.worldChanged(function (d) {
    if (d && d.to === 'b612') {
      if (!gargStarted) {
        gargStarted = true;
        gargIntro.play().catch(function () {});
        gargIntro.onended = function () {
          gargMain.play().catch(function () {});
        };
      } else gargMain.play().catch(function () {});
    } else {
      try {
        gargMain.pause();
      } catch (e) {}
    }
  });

/* ===================== 星门(出生点正前方;苔藓古石门 GLB + 随章节换色的门内符文环) =====================
   2026-09-05 主人定:星门 X/Z=0.1/56.0,门洞朝北(360°),模型与石台均贴地(由沙漠高度场求 Y),
   出生点突出地板(缺图照片+深棕底座)已退役。*/
const gateGrp = new THREE.Group();
// 石门贴地:模型底座落回沙漠地形高度(不再悬空 Y=1.6);X/Z 与朝向仍按用户指定
const mainGateY =
  ctx.media.desert && typeof ctx.media.desert.getH === 'function'
    ? ctx.media.desert.getH(0.1, 56.0)
    : 0;
gateGrp.position.set(0.1, mainGateY, 56.0);
const pads = { main: gateGrp, king: null, b612: null };
function loadPortalPad(world, position, targetWorld) {
  const root = new THREE.Group();
  root.position.set(position.x, position.y, position.z);
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.5, 0.18, 32),
    new THREE.MeshBasicMaterial({ color: 0x7d6248 })
  );
  marker.position.y = 0.09;
  root.add(marker);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
    'models/hall/b612-world/portal-platform.glb',
    (gltf) => {
      const m = gltf.scene;
      m.scale.setScalar(0.003);
      m.traverse((o) => {
        if (o.name && /monolith|column|pillar/i.test(o.name)) o.visible = false;
      });
      root.add(m);
    },
    undefined,
    (e) => console.warn('[planets] portal platform load failed', e.message)
  );
  world.scene.add(root);
  pads[targetWorld] = root;
  return root;
}
{
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 3.0, 0.24, 24),
    new THREE.MeshBasicMaterial({ color: 0x6b5a44 })
  );
  base.position.y = 0.12;
  gateGrp.add(base);
  // 石门 GLB(压缩版 4.5MB;门洞朝向画廊内部,即 -Z)
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
    'models/hall/b612-gate-moss.glb',
    function (gltf) {
      const m = gltf.scene;
      m.scale.setScalar(8.2); // 0.74m → ~6.1m 高
      m.rotation.y = Math.PI; // 门洞转向画廊
      m.position.y = 0;
      gateGrp.add(m);
    },
    undefined,
    function (e) {
      console.warn('[planets] 星门模型加载失败,保留石环:', e.message);
    }
  );
}
// 门内符文环+膜(挂在门洞中心;颜色随章节变化,是"下一站"的信号)
const gateRingMat = new THREE.MeshBasicMaterial({
  color: PLANETS[0].color,
  transparent: true,
  opacity: 0.9,
});
const gateRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 12, 48), gateRingMat);
gateRing.position.set(0, 2.4, -0.15);
gateGrp.add(gateRing);
const gateDisc = new THREE.Mesh(
  new THREE.CircleGeometry(1.4, 40),
  new THREE.MeshBasicMaterial({
    color: 0x1a1020,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  })
);
gateDisc.position.set(0, 2.4, -0.16);
gateGrp.add(gateDisc);
const gateNum = numSprite(PLANETS[chapter] ? PLANETS[chapter].num : 'B612', '#ffd88a');
gateNum.position.y = 6.9;
gateGrp.add(gateNum);
s.add(gateGrp);

function refreshGate() {
  const cfg = PLANETS[Math.min(chapter, 5)];
  if (chapter < 6) {
    gateRingMat.color.set(cfg.color);
    const x = gateNum.material.map.image.getContext('2d');
    x.clearRect(0, 0, 128, 64);
    x.font = 'bold 40px Georgia,serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = cfg.color;
    x.fillText(cfg.num, 64, 32);
    gateNum.material.map.needsUpdate = true;
    gateGrp.visible = true;
  } else {
    gateRingMat.color.set(0xffd88a);
    gateGrp.visible = false; // 全部完成:星门退役(罗盘页接管 B612 传送)
  }
}
refreshGate();
// 独立世界双向传送台:main 石门→B612;B612→king;king→B612/main。
// king 台放在第一座岛中心,玩家进入国王星球后立即可见;B612 台在原点。
loadPortalPad(worldManager.getWorld('main'), { x: 0.1, y: mainGateY + 0.03, z: 56.0 }, 'b612');
loadPortalPad(worldManager.getWorld('king325'), { x: 0, y: 0, z: 0 }, 'b612');
loadPortalPad(b612World, { x: 0, y: 0, z: 0 }, 'king');

/* ===================== 天幕色罩(每章进入时淡入的 DOM 渐变) ===================== */
let veil = null;
function veilOn(cfg) {
  veilOff();
  veil = document.createElement('div');
  veil.style.cssText = `position:fixed;inset:0;z-index:8;pointer-events:none;opacity:0;transition:opacity 1.6s ease;background:radial-gradient(120% 100% at 50% 0%, ${cfg.veil}, transparent 70%)`;
  document.body.appendChild(veil);
  requestAnimationFrame(() => (veil.style.opacity = '1'));
}
function veilOff() {
  if (!veil) return;
  const v = veil;
  veil = null;
  v.style.opacity = '0';
  setTimeout(() => v.remove(), 1700);
}

/* ===================== 指引 HUD(屏顶箭头, spirits 同款自建) ===================== */
const hud = document.createElement('div');
hud.style.cssText =
  'position:fixed;top:52px;left:50%;transform:translateX(-50%);z-index:56;display:none;flex-direction:column;align-items:center;pointer-events:none;font-family:inherit';
const hudArrow = document.createElement('div');
hudArrow.textContent = '▲';
hudArrow.style.cssText =
  'font-size:18px;line-height:20px;color:#ffd88a;text-shadow:0 0 10px rgba(255,200,100,.85)';
const hudText = document.createElement('div');
hudText.style.cssText =
  'margin-top:2px;font-size:11px;letter-spacing:2px;color:rgba(255,232,190,.9);text-shadow:0 1px 4px rgba(0,0,0,.75);white-space:nowrap';
hud.appendChild(hudArrow);
hud.appendChild(hudText);
document.body.appendChild(hud);

/* ===================== 拾取/回程按钮 ===================== */
const pickBtn = document.createElement('button');
pickBtn.style.cssText =
  'position:fixed;left:50%;bottom:160px;transform:translateX(-50%);z-index:60;display:none;padding:12px 30px;border-radius:24px;border:1px solid rgba(255,214,130,.7);background:rgba(40,26,12,.8);color:#ffe9c4;font-size:16px;letter-spacing:4px;cursor:pointer;font-family:inherit';
pickBtn.textContent = '拾取星屑';
document.body.appendChild(pickBtn);
const doorBtn = document.createElement('button');
doorBtn.textContent = '返回画廊';
doorBtn.style.cssText = pickBtn.style.cssText;
doorBtn.style.display = 'none';
doorBtn.onclick = function () {
  backToGallery();
};
document.body.appendChild(doorBtn);
const worldBtn = document.createElement('button');
worldBtn.textContent = '返回 B612';
worldBtn.style.cssText = doorBtn.style.cssText;
worldBtn.style.display = 'none';
worldBtn.style.left = 'calc(50% - 220px)';
document.body.appendChild(worldBtn);
const mainBtn = document.createElement('button');
mainBtn.textContent = '返回主世界';
mainBtn.style.cssText = doorBtn.style.cssText;
mainBtn.style.display = 'none';
mainBtn.style.left = 'calc(50% - 60px)';
document.body.appendChild(mainBtn);
// 主世界石台触发按钮(独立于章节系统,站上去就能进 B612)
const padBtn = document.createElement('button');
padBtn.textContent = '✦ 进入 B612';
padBtn.style.cssText =
  'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:60;display:none;padding:14px 36px;border-radius:24px;border:2px solid rgba(255,214,130,.9);background:rgba(30,18,8,.92);color:#ffe9c4;font-size:18px;letter-spacing:4px;cursor:pointer;font-family:inherit';
padBtn.onclick = function () {
  padBtn.style.display = 'none';
  worldManager.enter('b612', {
    snapshot: {
      camera: null,
      player: {
        position: new THREE.Vector3(0, 1.6, 3),
        yaw: 0,
        pitch: 0,
        vy: 0,
        onGround: true,
        gliding: false,
      },
    },
  });
};
document.body.appendChild(padBtn);

function showWorldTravel(label, action) {
  worldBtn.textContent = label;
  worldBtn.style.display = 'block';
  worldBtn.onclick = action;
}

/* ===================== 章节流程 ===================== */
function islandOfKey(key) {
  return islands.find((i) => i.cfg.key === key) || null;
}
function travelTo(idx) {
  const isl = islands[idx];
  if (!isl || !worldManager) return;
  // 新入口顺序:主世界石门 → B612 小王子之家;B612 内再进入对应星球世界。
  const targetWorld = ctx.scene.activeWorld === 'main' ? 'b612' : 'king' + isl.cfg.num;
  // 每个世界有自己的出生坐标(独立坐标系,和主世界无关)
  const spawn =
    targetWorld === 'b612'
      ? {
          position: new THREE.Vector3(0, 2, 12),
          yaw: 0,
          pitch: 0,
          vy: 0,
          onGround: true,
          gliding: false,
        }
      : {
          position: new THREE.Vector3(0, 2, 12),
          yaw: 0,
          pitch: 0,
          vy: 0,
          onGround: true,
          gliding: false,
        };
  worldManager.enter(targetWorld, { snapshot: { camera: null, player: spawn } });
  if (ctx.ui.modeToast)
    ctx.ui.modeToast(targetWorld === 'b612' ? "B612 · The Little Prince's Home" : isl.cfg.place);
}
function backToGallery() {
  veilOff();
  worldManager.toMainWorld();
}
function pl() {
  return ctx.player.pl.p;
}

/* ===================== 太空人模式:独立世界内无重力+3D 自由移动 ===================== */
const spaceKeys = {};
window.addEventListener('keydown', (e) => {
  spaceKeys[e.code] = true;
});
window.addEventListener('keyup', (e) => {
  spaceKeys[e.code] = false;
});
window.addEventListener('blur', () => {
  for (const k in spaceKeys) spaceKeys[k] = false;
});
bag.custom.push(() => {
  window.removeEventListener('keydown', spaceKeys._kd || function () {});
  window.removeEventListener('keyup', spaceKeys._ku || function () {});
});

/* ===================== 主循环 ===================== */
let hudT = 0,
  lampT = 0;
onTick(function (dt) {
  const t = performance.now() * 0.001;
  // 星屑呼吸 + 点灯人路灯亮灭
  islands.forEach(function (isl, i) {
    isl.mote.rotation.y += 0.01;
    if (!isl.mote.visible) return;
    isl.mote.position.y = isl.topY + 1.15 + Math.sin(t * 1.6 + i) * 0.18;
    if (i === 4) {
      const on = Math.floor(t / 1.2) % 2 === 0;
      isl.props.userData.lampHead.material.color.set(on ? 0xffe9b0 : 0x555044);
    }
  });
  if (!ctx.player.pl) return;
  const p = pl();
  const plRef = ctx.player.pl;
  const activeWorld = ctx.scene.activeWorld || 'main';

  // ==== 太空人模式:非主世界时自由飞行,无重力,3D 全方向移动 ====
  if (activeWorld !== 'main') {
    const dt2 = Math.min(dt || 0.016, 0.05);
    const speed = spaceKeys['ShiftLeft'] || spaceKeys['ShiftRight'] ? 22 : 9;
    const yaw = plRef.y || 0;
    const pitch = plRef.pi || 0;
    // 相机方向 3D 向量
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    if (spaceKeys['KeyW']) {
      p.x += fx * speed * dt2;
      p.y += fy * speed * dt2;
      p.z += fz * speed * dt2;
    }
    if (spaceKeys['KeyS']) {
      p.x -= fx * speed * dt2;
      p.y -= fy * speed * dt2;
      p.z -= fz * speed * dt2;
    }
    if (spaceKeys['KeyA']) {
      p.x -= rx * speed * dt2;
      p.z -= rz * speed * dt2;
    }
    if (spaceKeys['KeyD']) {
      p.x += rx * speed * dt2;
      p.z += rz * speed * dt2;
    }
    if (spaceKeys['Space']) {
      p.y += speed * dt2;
    }
    if (spaceKeys['ControlLeft'] || spaceKeys['KeyC']) {
      p.y -= speed * dt2;
    }
    // 阻止重力:物理步不施加下落
    plRef.vy = 0;
    plRef.onGround = true;
    plRef.gliding = false;
    // 星屑呼吸 + 点灯人路灯
    islands.forEach(function (isl, i) {
      isl.mote.rotation.y += 0.01;
      if (!isl.mote.visible) return;
      if (i === 4) {
        const on = Math.floor((performance.now() * 0.001) / 1.2) % 2 === 0;
        isl.props.userData.lampHead.material.color.set(on ? 0xffe9b0 : 0x555044);
      }
    });
    // 传送按钮(太空中也能用)
    const nearB612Pad = Math.hypot(p.x, p.z) < 6;
    mainBtn.style.display = nearB612Pad ? 'block' : 'none';
    mainBtn.onclick = function () {
      worldManager.toMainWorld();
    };
    if (/^king/.test(activeWorld)) {
      showWorldTravel('← 返回 B612', function () {
        worldManager.back();
      });
    } else if (activeWorld === 'b612') {
      showWorldTravel('前往 325 国王星球 →', function () {
        worldManager.enter('king325', {
          snapshot: {
            camera: null,
            player: {
              position: new THREE.Vector3(0, R * 0.42 + 1.6, 4),
              yaw: 0,
              pitch: 0,
              vy: 0,
              onGround: true,
            },
          },
        });
      });
    }
    hud.style.display = 'none';
    pickBtn.style.display = 'none';
    doorBtn.style.display = 'none';
    return;
  }

  // ==== 主世界:靠近石门自动传送 + 远处显示按钮 ====
  if (activeWorld === 'main') {
    const dgx = p.x - 0.1,
      dgz = p.z - 56.0;
    const nearGate = dgx * dgx + dgz * dgz < 16; // 4m 范围自动传送
    if (nearGate) {
      padBtn.style.display = 'none';
      hud.style.display = 'none';
      travelTo(0);
      return;
    }
    // 不在门旁:显示按钮
    padBtn.style.display = 'block';
    hud.style.display = 'none';
    doorBtn.style.display = 'none';
    pickBtn.style.display = 'none';
    worldBtn.style.display = 'none';
    mainBtn.style.display = 'none';
    return;
  } else {
    padBtn.style.display = 'none';
  }
  // ==== B612 世界 ====
  if (activeWorld === 'b612') {
    pickBtn.style.display = 'none';
    doorBtn.style.display = 'none';
    hud.style.display = 'none';
    const nearB612Pad = p.x * p.x + p.z * p.z < 9;
    mainBtn.style.display = nearB612Pad ? 'block' : 'none';
    mainBtn.onclick = function () {
      worldManager.toMainWorld();
    };
    if (nearB612Pad) {
      showWorldTravel('前往 325 国王星球', function () {
        mainBtn.style.display = 'none';
        worldManager.enter('king325', {
          snapshot: {
            camera: null,
            player: {
              position: new THREE.Vector3(0, R * 0.42 + 1.6, 4),
              yaw: 0,
              pitch: 0,
              vy: 0,
              onGround: true,
            },
          },
        });
      });
    } else worldBtn.style.display = 'none';
    return;
  }
  if (/^king\d+$/.test(activeWorld)) {
    const nearKingPad = p.x * p.x + p.z * p.z < 9;
    mainBtn.style.display = nearKingPad ? 'block' : 'none';
    mainBtn.onclick = function () {
      worldManager.toMainWorld();
    };
    worldBtn.style.display = nearKingPad ? 'block' : 'none';
    worldBtn.textContent = '返回 B612';
    worldBtn.onclick = function () {
      worldManager.back();
    };
  } else {
    worldBtn.style.display = 'none';
    mainBtn.style.display = 'none';
  }
  const curWorldNum = /^king(\d+)$/.test(activeWorld) ? activeWorld.replace('king', '') : null;
  const onIsland = curWorldNum ? islands.find((isl) => isl.cfg.num === curWorldNum) : null;
  // 只有当前章节星球才可拾取,回到完成态星球时不重复计算
  if (onIsland) onIsland.active = onIsland.idx === chapter;
  // 回程门:任何岛上走近即用(拾取后章节已推进,不能按 idx 匹配)
  if (onIsland) {
    const dd =
      (p.x - onIsland.doorW.x) * (p.x - onIsland.doorW.x) +
      (p.z - onIsland.doorW.z) * (p.z - onIsland.doorW.z);
    doorBtn.style.display = dd < 6.25 ? 'block' : 'none';
  } else doorBtn.style.display = 'none';
  let pending = islands[chapter]; // 当前章节岛
  let hudTarget = null,
    hudName = '';

  if (chapter < 6) {
    // 画廊侧:走向星门
    const dgx = p.x - gateGrp.position.x,
      dgz = p.z - gateGrp.position.z;
    const atGate = dgx * dgx + dgz * dgz < 9;
    pickBtn.style.display = 'none';
    if (!onIsland) {
      hudTarget = gateGrp.position;
      hudName = pending.cfg.place + ' · ' + Math.round(Math.hypot(dgx, dgz)) + 'm';
      if (atGate) {
        hud.style.display = 'none';
        travelTo(chapter);
        return;
      }
    } else if (onIsland.idx === chapter) {
      // 在本章岛上:走近星屑拾取(世界坐标判定)
      const m = onIsland.moteW;
      const dm2 = (p.x - m.x) * (p.x - m.x) + (p.z - m.z) * (p.z - m.z);
      const near = dm2 < 9 && Math.abs(p.y - onIsland.topY) < 4;
      if (near) {
        pickBtn.style.display = 'block';
        pickBtn.textContent = '拾取星屑 · ' + onIsland.cfg.name;
        hud.style.display = 'none';
      } else pickBtn.style.display = 'none';
      hudTarget = m;
      hudName = onIsland.cfg.name + ' 的星屑';
    } else {
      pickBtn.style.display = 'none';
      hudTarget = gateGrp.position;
      hudName = '回到画廊 · 星门';
    }
  } else {
    pickBtn.style.display = 'none';
    hud.style.display = 'none';
    doorBtn.style.display = 'none';
  }

  // HUD(8Hz)
  if (t - hudT > 0.12) {
    hudT = t;
    if (hudTarget && chapter < 6) {
      const hx = hudTarget.x - p.x,
        hz = hudTarget.z - p.z;
      const tAng = Math.atan2(hx, hz),
        fAng = Math.atan2(-Math.sin(ctx.player.pl.y), -Math.cos(ctx.player.pl.y));
      let rel = tAng - fAng;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      hudArrow.style.transform = 'rotate(' + ((-rel * 180) / Math.PI).toFixed(1) + 'deg)';
      hudArrow.style.color = pending && !onIsland ? pending.cfg.color : '#ffd88a';
      hudText.textContent = hudName;
      hud.style.display = ctx.kunlun.flightLock ? 'none' : 'flex';
    } else hud.style.display = 'none';
  }
});
function hookedDoor() {
  backToGallery();
}

/* ===================== 拾取 → 章节推进 ===================== */
pickBtn.onclick = function () {
  if (chapter >= 6) return;
  const isl = islands[chapter];
  const cfg = isl.cfg;
  isl.mote.visible = false;
  isl.door.visible = true;
  pickBtn.style.display = 'none';
  // 复用 spirits 反馈/库存/终章(key 同序同键;台词用本章星球版)
  ctx.kunlun.spiritsCollectExternal(cfg.key, {
    popup: cfg.popup,
    tts: cfg.tts,
    toast: cfg.name + ' · 已收入罗盘',
  });
  chapter += 1;
  ctx.store.setNum('planetsChapter', chapter);
  refreshGate();
};

/* ===================== 对外接口(spirits/罗盘页/小地图) ===================== */
// 罗盘页:覆盖 spiritsState 的 place/name(星球版);顺序与 SPIRITS 一致
const prevSpiritsState = ctx.kunlun.spiritsState;
ctx.kunlun.spiritsState = function () {
  const arr = prevSpiritsState();
  return arr.map(function (st, i) {
    if (i >= PLANETS.length) return st;
    return Object.assign({}, st, {
      name: PLANETS[i].name,
      en: PLANETS[i].en,
      place: chapter > i ? PLANETS[i].place + ' · 已点亮' : PLANETS[i].place,
    });
  });
};
// 小地图标记:当前目标(星门或当前岛)
ctx.kunlun.planetsMark = function () {
  if (chapter >= 6) return null;
  const cfg = PLANETS[chapter];
  if (!ctx.player.pl) return null;
  const onIsland = islands.some(function (isl) {
    const dx = ctx.player.pl.p.x - isl.cfg.pos[0],
      dz = ctx.player.pl.p.z - isl.cfg.pos[2];
    return dx * dx + dz * dz < (R + 2) * (R + 2);
  });
  if (onIsland) {
    const isl = islands[chapter];
    if (!isl.mote.visible) return null;
    return { x: isl.moteW.x, z: isl.moteW.z, name: cfg.name, color: cfg.color };
  }
  return {
    x: gateGrp.position.x,
    z: gateGrp.position.z,
    name: '星门 · ' + cfg.place,
    color: cfg.color,
  };
};

bag.custom.push(function () {
  hud.remove();
  pickBtn.remove();
  doorBtn.remove();
  worldBtn.remove();
  mainBtn.remove();
  padBtn.remove();
  veilOff();
});
hotEnd('planets');
if (import.meta.hot) import.meta.hot.accept();
