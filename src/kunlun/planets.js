// planets.js — B612 六星章节(2026-09-05,小王子改编·方案A·贴原著)
// 画廊中庭石制星门 → fadeTeleport 至六座悬浮小行星岛(每章一座):
//   325 国王(王座)/326 爱虚荣的人(高镜)/327 酒鬼(酒瓶)/328 商人(账桌+星环)
//   /329 点灯人(自亮灭路灯)/330 地理学家(书堆星图)
// 岛上拾星屑 → ctx.kunlun.spiritsCollectExternal(复用 spirits 的反馈/库存/终章)
// 回程门回画廊,星门换色指向下一章;groundOverride 链式注册(多浮空岛地面)。
// 门槛解除: spirits questActive 在 planetsMode 下恒真(天穹100%前置退役)。
import * as THREE from 'three';
import { buildChapterProps, setLampLit } from './planet-props.js';
import { createGLTFLoader } from '../scene/gltf-loader.js';
import { createModelSurface } from '../scene/model-surface.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ctx } from '../ctx.js';
import { memoryWalkPosition as kingWalkPosition } from '../shared/journey-guidance.mjs';
import { hotBegin, hotEnd } from '../hot.js';
import { Z } from '../shared/z-layers.mjs';
import { initSceneManager } from '../core/scene-manager.js';
import { avAllowed } from '../core/av-switch.js'; // 全站音视频总闸(2026-09-26)
import {
  PLANETS,
  ISLAND_R as R,
  planetByNum,
  islandTopAt,
  kingSpawnPoint,
} from '../shared/planet-logic.mjs';
import { clampChapter, advanceChapter, decorateSpiritsState } from '../shared/story-progress.mjs'; // 剧情进度契约(2026-09-24 抽出,单测钉死;2026-09-27 加 storyNext 下一步权威)
import { tt } from '../shared/story-text.mjs';
import { legacyOn } from '../shared/legacy.mjs';
const bag = hotBegin('planets');
const { s, onTick } = ctx;

// 独立世界灯光工厂:超强力灯光让 GLB 内嵌 PBR 贴图颜色全部展开
// lite=true:B612 storybook 专用——材质已离线转换、天幕自发光,低照度防过曝(灯数不变,守手机账)
function addWorldLights(scene, lite) {
  if (lite) {
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const keyL = new THREE.DirectionalLight(0xfff4e0, 3.2);
    keyL.position.set(5, 8, 5);
    scene.add(keyL);
    const fillL = new THREE.DirectionalLight(0x6b8fc8, 1.3);
    fillL.position.set(-4, 2, -3);
    scene.add(fillL);
    const rimL = new THREE.DirectionalLight(0xffd9a0, 1.0);
    rimL.position.set(0, 3, -6);
    scene.add(rimL);
    scene.add(new THREE.HemisphereLight(0x8fb0d8, 0x3a5a2a, 1.0));
    return;
  }
  scene.add(new THREE.AmbientLight(0xffffff, 2.5));
  const key = new THREE.DirectionalLight(0xfff8f0, 5.0);
  key.position.set(10, 20, 15);
  scene.add(key);
  const warm = new THREE.DirectionalLight(0xffe0b0, 2.0);
  warm.position.set(-8, 6, -10);
  scene.add(warm);
  const cool = new THREE.DirectionalLight(0x8fb0ff, 1.2);
  cool.position.set(0, -5, 8);
  scene.add(cool);
  scene.add(new THREE.HemisphereLight(0xa8c8ff, 0x4a3820, 1.5));
}
// 星空粒子背景(每个世界独立实例;2026-09-07 定种子——随机星位让截图回归每次差 20%+)
function addStarfield(scene) {
  let seed = 0x9e3779b9; // 固定种子:星位跨加载恒定
  const rand = function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const geo = new THREE.BufferGeometry();
  const n = 3000;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = (rand() - 0.5) * 500;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.9 })
  );
  scene.add(stars);
  return stars;
}

import { initStoryGuides, updateStoryGuides, dropAllStoryGuides } from './story-guides.js';
import { initNavButtons, tickNav, setNav, removeNav } from './nav-buttons.js';

// 独立世界容器:main 保留现有画廊,B612 独立注册;六星世界在 PLANETS 数据定义后按序注册。

const worldManager = initSceneManager({
  renderer: ctx.scene.rnd,
  camera: ctx.scene.cam,
  mainScene: s,
  player: ctx.player,
});
const b612World =
  worldManager.getWorld('b612') ||
  worldManager.registerWorld('b612', {
    // 幂等守卫:HMR 重放防 throw(2026-10-10)
    scene: new THREE.Scene(),
    meta: { title: 'B612' },
    ground: (x, z) => homeSurface?.height(x, z),
  });
b612World.scene.background = new THREE.Color(0x05050f);
addWorldLights(b612World.scene, true);
addStarfield(b612World.scene);

// 沿原模型的曲面行走，保留球体轮廓、贴图与整套场景的相对比例。
let homeSurface = null,
  homeReveal = null,
  homeFocus = null;
b612World.meta.focusTarget = (x, z) => {
  homeFocus = { x, z, start: performance.now(), yaw: ctx.player.pl.y, pitch: ctx.player.pl.pi };
};
b612World.meta.showOverview = () =>
  new Promise((resolve) => {
    homeReveal?.resolve(false);
    homeReveal = { start: performance.now(), resolve, fov: ctx.scene.cam.fov };
    b612World.meta.revealing = true;
    document.body.dataset.homeReveal = '1';
  });
function finishHomeReveal(result) {
  const current = homeReveal;
  homeReveal = null;
  delete document.body.dataset.homeReveal;
  b612World.meta.revealing = false;
  if (current && ctx.scene.activeWorld === 'b612') {
    ctx.scene.cam.fov = current.fov;
    ctx.scene.cam.updateProjectionMatrix();
  } else if (current && b612World.camera) b612World.camera.fov = current.fov;
  current?.resolve(result);
}
function tickHomeReveal() {
  if (!homeReveal || !homeSurface) return;
  const progress = Math.min(1, (performance.now() - homeReveal.start) / 3600);
  const angle = 1.05 + progress * 0.2;
  const c = homeSurface.center;
  const portrait = ctx.scene.cam.aspect < 0.7;
  const fov = portrait ? 85 : homeReveal.fov;
  const distance = portrait ? 34 : 30;
  if (ctx.scene.cam.fov !== fov) {
    ctx.scene.cam.fov = fov;
    ctx.scene.cam.updateProjectionMatrix();
  }
  ctx.scene.cam.position.set(
    c.x + Math.sin(angle) * distance,
    c.y + 15,
    c.z + Math.cos(angle) * distance
  );
  ctx.scene.cam.lookAt(c.x, c.y + 3, c.z);
  if (progress >= 1) finishHomeReveal(true);
}
bag.custom.push(() => finishHomeReveal(false));
ctx.events.on('world:changed', ({ from, to }) => {
  if (from === 'b612' && to !== 'b612') finishHomeReveal(false);
  if (from === 'b612' && to !== 'b612') homeFocus = null;
});

const assetLoader = createGLTFLoader();
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
      if (opts.onLoad) opts.onLoad(model, gltf);
    },
    undefined,
    (err) => console.warn('[planets] world asset unavailable:', url, err.message)
  );
}
/* ===================== 状态 ===================== */
let chapter = clampChapter(ctx.store.num('planetsChapter')); // 0..6(6=全部完成;脏数据钳制,2026-09-24 下沉 story-progress.mjs)
ctx.kunlun.planetsMode = true; // spirits.js:沙漠光柱系统休眠,questActive 恒真

/* ===================== groundOverride 链式注册(浮空岛地面) ===================== */
const prevOverride = ctx.kunlun.groundOverride; // 可能是 eternal 的链(导入顺序在其后)
ctx.kunlun.groundOverride = function (x, z) {
  const active = ctx.scene.activeWorld;
  if (active === 'b612') return homeSurface?.height(x, z);
  if (active && /^king\d+$/.test(active)) {
    return planetByNum(active.replace('king', '')) ? R * 0.42 : 0;
  }
  const top = islandTopAt(x, z); // 浮空岛顶面(命中返回 y,未命中 null)
  if (top !== null) return top;
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
  sp.scale.set(1.8, 0.9, 1); // 章节号留作小标识，不挡住人物和目标
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

  // ---- 章节道具(2026-09-20 拆分 planet-props.js) ----
  const props = buildChapterProps(idx, box, cyl, topY);
  grp.add(props);

  // 星屑(可拾取):八面体,本章节色,呼吸浮动。
  // 摆在出生点(z=4)正后方 5m:走出 3m 拾取判定圈,「转身走过去拾」真实存在
  // (2026-09-27 血泪:z=2.6 时距出生点仅 1.4m,台词播完同帧自动拾取,指引信标/toast 全被顶没)。
  // name='sproutMote' 是 scene6-king 信标/拾取判定的坐标单一源,勿改名。
  const mote = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42),
    new THREE.MeshBasicMaterial({ color: cfg.color })
  );
  mote.name = 'sproutMote';
  mote.position.set(0, topY + 1.15, 9);
  grp.add(mote);

  // 回程门(拾取后才出现):小石环。name='sproutDoor' 是 scene6 回程传送判定的坐标单一源
  const door = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.09, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd88a })
  );
  door.name = 'sproutDoor';
  door.position.set(0, topY + 1.5, -3.4);
  door.visible = false;
  grp.add(door);

  const planetWorld =
    worldManager.getWorld('king' + cfg.num) ||
    worldManager.registerWorld('king' + cfg.num, {
      // 幂等守卫(同上)
      scene: new THREE.Scene(),
      ground: () => topY,
      meta: { title: cfg.name },
    });
  planetWorld.scene.background = new THREE.Color(0x05050f);
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
    moteW: { x: 0, y: topY + 1.15, z: 9 }, // 星屑本地坐标(独立世界以岛心为原点;与 mote.position 同步改)
    doorW: { x: 0, z: -3.4 }, // 回程门本地坐标
  };
  islands.push(isl);
  return isl;
}
PLANETS.forEach(buildIsland);
// 已完成章节的回程石环常亮(2026-09-27 点亮死代码:拾星后世界内返程提示;启动按进度还原)
for (let i = 0; i < chapter && i < islands.length; i++) islands[i].door.visible = true;

// 独立世界故事资产:只挂到目标 scene,不进入主世界。
// B612:「球中球」原样呈现——±22.4 天幕壳(内壁手写英文星空画)之内,绿星球顶坐着小王子+绵羊+玫瑰。
// 2026-09-06 换材质离线转换版(specGloss→metalRough,见 scripts/gen/convert-storybook-pbr.cjs):
// 原版 23 材质全部是 three r160 不支持的 KHR_materials_pbrSpecularGlossiness,贴图全丢=黑块;
// 原生尺寸仅 ~1.14(Sketchfab 导出链带 0.025 祖先缩放),等比放大 39.3 倍,天幕壳即世界边界。
let storybookMixer = null;
bag.custom.push(function () {
  if (storybookMixer) storybookMixer.stopAllAction();
  storybookMixer = null;
});
loadWorldAsset('models/hall/b612-world/b612-storybook-pbr.glb', b612World, {
  name: 'b612Storybook',
  maxSize: 89.7,
  x: 0,
  y: -44.9, // 全场等比2倍；原星球顶部仍贴近0m，星幕与人物比例不变
  z: 0,
  onLoad: function (model, gltf) {
    model.updateWorldMatrix(true, true);
    const terrain = [];
    model.traverse((o) => {
      if (o.isMesh && /^PlanetLP_[12]_/.test(o.name)) terrain.push(o);
    });
    if (terrain.length) {
      homeSurface = createModelSurface(terrain);
      b612World.meta.surface = homeSurface;
    }
    if (gltf.animations && gltf.animations.length) {
      storybookMixer = new THREE.AnimationMixer(model);
      storybookMixer.clipAction(gltf.animations[0]).play(); // SceneFull2:小王子坐姿 idle(6.7s 循环)
    }
  },
});
// King:king-scene 模型放在 (0,0,-15),玩家出生在 (0,7,12) 面朝它
loadWorldAsset('models/hall/b612-world/king-scene.glb', worldManager.getWorld('king325'), {
  name: 'kingStoryScene',
  maxSize: 40,
  x: 0,
  y: 0,
  z: -15,
});
// 329 点灯人:维多利亚路灯真模型(主人提供,2026-10-04)取代程序化灯柱+灯球。
// 程序化灯头留作「状态载体」(隐藏,名 lampHead),亮灭经 setLampLit → 这里挂上的 setLit 改真灯的发光材质与光晕。
{
  const isl = islands[4];
  loadWorldAsset('models/hall/b612-world/street-lamp.glb', worldManager.getWorld('king329'), {
    name: 'streetLamp',
    maxSize: 4.4,
    x: 1.3,
    y: isl.topY,
    z: -2.6, // 稍往后、偏右:出生点(z=4)抬头就能把整盏灯和灯头收进画面;灯臂侧向伸出,看得见轮廓
    onLoad: function (model) {
      model.updateMatrixWorld(true);
      isl.props.children.forEach(function (c) {
        c.visible = false;
      });
      let lightMat = null;
      let lightMesh = null;
      model.traverse(function (o) {
        if (o.isMesh && o.material && /light/i.test(o.material.name)) {
          o.material = o.material.clone();
          lightMat = o.material;
          lightMesh = o;
        }
      });
      // 光晕:一张加法混合的柔光贴(零 PointLight 铁律,手机 GPU 友好)
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g2 = cv.getContext('2d');
      const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,233,176,1)');
      grd.addColorStop(0.35, 'rgba(255,214,138,.45)');
      grd.addColorStop(1, 'rgba(255,214,138,0)');
      g2.fillStyle = grd;
      g2.fillRect(0, 0, 64, 64);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(cv),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        })
      );
      glow.scale.set(2.6, 2.6, 1);
      glow.name = 'streetLampGlow';
      if (lightMesh) {
        const p = new THREE.Box3().setFromObject(lightMesh).getCenter(new THREE.Vector3());
        glow.position.copy(p);
      } else glow.position.set(0, isl.topY + 3.6, 0);
      worldManager.getWorld('king329').scene.add(glow);
      const head = isl.props.userData.lampHead;
      head.userData.setLit = function (on) {
        glow.visible = on;
        if (!lightMat) return;
        lightMat.color.set(on ? 0xfff3d0 : 0x6a665c);
        if (lightMat.emissive) lightMat.emissive.set(on ? 0xffc870 : 0x000000);
        if ('emissiveIntensity' in lightMat) lightMat.emissiveIntensity = on ? 1.6 : 0;
      };
    },
  });
}
// B612 由 storybook GLB 原样呈现(小王子+绵羊+玫瑰+火山+星空全在模型内)
// 终幕配乐:进入 B612 播放 GARGANTUA intro + main
// 2026-09-25 加速:音频走 R2 CDN 边缘(1.4MB main 原走同源抢开机带宽);localhost 走源码目录
const AUDIO_CDN =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? ''
    : 'https://cdn.cloudbear.cloud/';
const gargIntro = new Audio(AUDIO_CDN + 'media/gargantua/gargantua-intro.mp3');
const gargMain = new Audio(AUDIO_CDN + 'media/gargantua/gargantua-main.mp3');
gargMain.loop = true;
let gargStarted = false;
ctx.scene.worldChanged &&
  ctx.scene.worldChanged(function (d) {
    // 2026-10-03:B612 的配乐改由 ui/story-music.js 按章节编排(Our Corner of the Universe),
    // GARGANTUA 不再自动播放(两层音乐会叠在一起)。保留下面的代码,legacy 模式下仍可用。
    if (d && d.to === 'b612' && legacyOn()) {
      if (!gargStarted) {
        gargStarted = true;
        if (avAllowed()) {
          gargIntro.play().catch(function () {});
          gargIntro.onended = function () {
            gargMain.play().catch(function () {});
          };
        }
      } else if (avAllowed()) gargMain.play().catch(function () {});
      // B612 入场白(2026-09-27 主人报"进 B612 后没有任何台词"):回忆演出只播一次,
      // 此后进 B612 是哑巴世界 —— 王子每章亲口欢迎一句 + 下一步(任务册同源);
      // 回忆演出期(page1 未完成)不打扰,不上锁不阻塞
      // 回忆里的角色听不见玩家；下一站由界面指引，不再插入另一条欢迎对白。
    } else {
      try {
        gargMain.pause();
      } catch (e) {}
      // 多世界切割修复(2026-09-06):离开时 intro 也要停,否则会独自响完一整段;
      // 重置 gargStarted,再进 B612 重新从 intro 开始,不会叠两层
      try {
        gargIntro.pause();
        gargIntro.currentTime = 0;
      } catch (e) {}
      gargStarted = false;
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
  createGLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .load(
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
  createGLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .load(
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

// 星门出场(2026-09-27 主人令:石门不能一开局就摆在那 —— 开局一律隐藏,
// 台词走到"石门亮起/再进一次石门"时才现身;老档的 exitBridge 每会话重播一次,
// 门在重播收束时现身,不存在"回不去"的死路)
let gateRevealed = false;
let mainPad = null; // 主世界石台垫(与门同隐同现;注意 pads.b612 会被 king 台覆盖,另存一份)
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
  } else {
    gateRingMat.color.set(0xffd88a);
  }
  const show = gateRevealed && chapter < 6; // 未现身→隐藏;全完成→退役(罗盘页接管 B612 传送)
  gateGrp.visible = show;
  if (mainPad) mainPad.visible = show;
}
refreshGate();
// 章节推进/星屑隐藏钩子(2026-09-20 情节阶段一:scene6-king.js 等剧情模块调用)
ctx.kunlun.setChapter = function (n) {
  chapter = advanceChapter(chapter, n); // 只前进不回退,封顶 6(契约单测钉死)
  try {
    ctx.store.setNum('planetsChapter', chapter);
  } catch (e) {}
  refreshGate();
  // 刚写完的一章:回程石环亮起(世界内返程指引;scene6 再立光柱+toast 接力)
  const done = islands[chapter - 1];
  if (done && done.door) done.door.visible = true;
};
ctx.kunlun.hideSproutMote = function () {
  const isl = islandOfKey('sprout');
  if (isl && isl.mote) isl.mote.visible = false;
};
// 通用藏星屑(2026-09-27 第7场起:各星球拾取后藏各自星屑,key 与 PLANETS 同序)
ctx.kunlun.hidePlanetMote = function (key) {
  const isl = islandOfKey(key);
  if (isl && isl.mote) isl.mote.visible = false;
};
// 石门现身(2026-09-27 按剧情出场):scene3-night 在"石门亮起/再进一次石门"台词点调用,
// 只进不出;portal.js 凭 isStarGateOut 决定按钮与自动传送是否生效
ctx.kunlun.revealStarGate = function () {
  if (gateRevealed) return;
  gateRevealed = true;
  refreshGate();
};
ctx.kunlun.isStarGateOut = function () {
  return gateRevealed && chapter < 6;
};
// 探针钩子(验收"石门按剧情出场",不进 UI,只读)
window.__starGate = {
  visible: function () {
    return !!gateGrp.visible;
  },
};
// 独立世界双向传送台:main 石门→B612;B612→king;king→B612/main。
// king 台放在第一座岛中心,玩家进入国王星球后立即可见;B612 台在原点。
mainPad = loadPortalPad(
  worldManager.getWorld('main'),
  { x: 0.1, y: mainGateY + 0.03, z: 56.0 },
  'b612'
);
loadPortalPad(worldManager.getWorld('king325'), { x: 0, y: 0, z: 0 }, 'b612');
refreshGate(); // 主台刚建默认可见,按出场规则同步一次(新档即隐)

/* ===================== 章节流程 ===================== */
function islandOfKey(key) {
  return islands.find((i) => i.cfg.key === key) || null;
}

function pl() {
  return ctx.player.pl.p;
}

/* ===================== 太空人模式:独立世界内无重力+3D 自由移动 ===================== */
const spaceKeys = {};
// 具名引用(2026-10-07 修复死代码:此前清理读 spaceKeys._kd/_ku——从未赋值的属性,
// removeEventListener 形同虚设;blur 监听更是从没被移除)
function onSpaceKeyDown(e) {
  spaceKeys[e.code] = true;
}
function onSpaceKeyUp(e) {
  spaceKeys[e.code] = false;
}
function onSpaceBlur() {
  for (const k in spaceKeys) spaceKeys[k] = false;
}
window.addEventListener('keydown', onSpaceKeyDown);
window.addEventListener('keyup', onSpaceKeyUp);
window.addEventListener('blur', onSpaceBlur);
bag.custom.push(() => {
  window.removeEventListener('keydown', onSpaceKeyDown);
  window.removeEventListener('keyup', onSpaceKeyUp);
  window.removeEventListener('blur', onSpaceBlur);
});

// 叶子注入(2026-10-10 两拆):章节/门现身/岛表/主场景是本文件可变状态,getter 惰性取值
initStoryGuides({
  getScene: () => s,
  getWorldManager: () => worldManager,
  getChapter: () => chapter,
  isGateRevealed: () => gateRevealed,
  getIslands: () => islands,
  getMainGateY: () => mainGateY,
});
initNavButtons({
  getWorldManager: () => worldManager,
  getChapter: () => chapter,
});

/* ===================== 主循环 ===================== */
// 模块级 scratch(ark.js _v2/_v3/_camPos 同款范式):B612 步行每帧的上一帧位置,
// 替代每帧 p.clone() 的 GC 压力;model-surface.place() 只同步读 previous.x/z,不持有引用
const _prevHome = new THREE.Vector3();
onTick(function (dt) {
  const t = performance.now() * 0.001;
  // B612 小王子坐姿动画(SceneFull2)
  if (storybookMixer) storybookMixer.update(Math.min(dt || 0.016, 0.05));
  // 星屑呼吸 + 点灯人路灯亮灭(全世界每帧一次——2026-10-07 删掉太空分支里的重复块,
  // 此前非主世界两块都执行:星屑转速 ×2、setLampLit 每帧算两次)
  islands.forEach(function (isl, i) {
    isl.mote.rotation.y += 0.01;
    if (!isl.mote.visible) return;
    isl.mote.position.y = isl.topY + 1.15 + Math.sin(t * 1.6 + i) * 0.18;
    if (i === 4) {
      const on = Math.floor(t / 1.2) % 2 === 0;
      if (!isl.props.userData.lampHead.userData.manual) setLampLit(isl.props.userData.lampHead, on);
    }
  });
  if (!ctx.player.pl) return;
  const p = pl();
  const plRef = ctx.player.pl;
  const activeWorld = ctx.scene.activeWorld || 'main';
  const previousHome = activeWorld === 'b612' ? _prevHome.copy(p) : null;
  updateStoryGuides(); // 剧情浮光指引(story-guides.js,信标+悬浮箭同立同撤)

  // ==== 太空人模式:非主世界时自由飞行,无重力,3D 全方向移动 ====
  if (activeWorld !== 'main') {
    const guidedWalk = activeWorld === 'b612' || (activeWorld === 'king325' && chapter === 0);
    if (guidedWalk) document.body.dataset.journeyWalking = activeWorld;
    else delete document.body.dataset.journeyWalking;
    const dt2 =
      ctx.overlay.anyOpen() ||
      ctx.ui.dialogOpen?.() ||
      (activeWorld === 'b612' && (!homeSurface || homeReveal || homeFocus))
        ? 0
        : Math.min(dt || 0.016, 0.05);
    const speed = guidedWalk
      ? spaceKeys['ShiftLeft'] || spaceKeys['ShiftRight']
        ? 5.8
        : 3.8
      : spaceKeys['ShiftLeft'] || spaceKeys['ShiftRight']
        ? 22
        : 9;
    const yaw = plRef.y || 0;
    const pitch = guidedWalk ? 0 : plRef.pi || 0;
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
    // ▲ 跳跃键(太空=升空推进,2026-09-06 主人定:按键不回收,做成跳跃感):
    // tickPhysics 在非主世界把 jumpPressed/jumpHold 转成 boostT 爆发 + spaceUp 持续上升
    if (plRef.boostT > 0) {
      p.y += speed * 2.6 * dt2;
      plRef.boostT = Math.max(0, plRef.boostT - dt2);
    }
    if (plRef.spaceUp) p.y += speed * 0.9 * dt2;
    // ▼ 下降键(太空专属,与 ▲ 对称;tickPhysics 转成 boostDownT 爆发 + spaceDown 持续下降)
    if (plRef.boostDownT > 0) {
      p.y -= speed * 2.6 * dt2;
      plRef.boostDownT = Math.max(0, plRef.boostDownT - dt2);
    }
    if (plRef.spaceDown) p.y -= speed * 0.9 * dt2;
    // 手机摇杆(与主世界同一输入源 jD):相机相对 XZ 移动——太空模式此前只认键盘,手机无法移动
    const jx = (ctx.player.jD && ctx.player.jD.x) || 0;
    const jz = (ctx.player.jD && ctx.player.jD.z) || 0;
    const jl = Math.hypot(jx, jz);
    if (jl > 0.1) {
      const nx = jx / jl,
        nz = jz / jl;
      const fx2 = -Math.sin(yaw),
        fz2 = -Math.cos(yaw);
      const rx2 = Math.cos(yaw),
        rz2 = -Math.sin(yaw);
      const js = speed * 0.75 * dt2;
      p.x += (fx2 * nz + rx2 * nx) * js;
      p.z += (fz2 * nz + rz2 * nx) * js;
    }
    // 放大后的天幕壳半径约44m；步行区另由原模型地表收束。
    if (activeWorld === 'b612') {
      const rr = Math.hypot(p.x, p.y, p.z);
      if (rr > 42) {
        const k = 42 / rr;
        p.x *= k;
        p.y *= k;
        p.z *= k;
      }
    }
    if (guidedWalk) {
      const ground =
        activeWorld === 'b612' ? homeSurface?.place(p, previousHome) : kingWalkPosition(p);
      if (ground) {
        p.x = ground.x;
        p.y = ground.y;
        p.z = ground.z;
      } else if (previousHome) p.copy(previousHome);
      plRef.boostT = 0;
      plRef.boostDownT = 0;
    }
    // 阻止重力:物理步不施加下落
    plRef.vy = 0;
    plRef.onGround = true;
    plRef.gliding = false;
    if (activeWorld === 'b612') {
      if (homeFocus && homeSurface) {
        const f = homeFocus,
          t = Math.min(1, (performance.now() - f.start) / 700),
          smooth = t * t * (3 - 2 * t);
        const dx = f.x - p.x,
          dz = f.z - p.z;
        const angle = Math.atan2(-dx, -dz) - f.yaw;
        plRef.y = f.yaw + Math.atan2(Math.sin(angle), Math.cos(angle)) * smooth;
        const pitch = Math.atan2(
          (homeSurface.height(f.x, f.z) ?? p.y - 2) + 0.8 - p.y,
          Math.max(1, Math.hypot(dx, dz))
        );
        plRef.pi = f.pitch + (Math.max(-0.65, Math.min(0.4, pitch)) - f.pitch) * smooth;
        if (ctx.player.viewMode === 1 && ctx.player.orbit) ctx.player.orbit.yaw = plRef.y;
        if (t >= 1) homeFocus = null;
      }
      tickHomeReveal();
    }
    tickNav(activeWorld);
    return;
  }

  // ==== 主世界:石门自动传送已迁 gallery/portal.js,此处只收起本章 UI ====
  if (activeWorld === 'main') {
    delete document.body.dataset.journeyWalking;
    setNav(false); // 主世界导航隐藏(进 B612 走石门 portal)
    return;
  }
  setNav(false);
});
/* ===================== 拾取 → 章节推进 ===================== */

/* ===================== 对外接口(spirits/罗盘页/小地图) ===================== */
// 罗盘页:覆盖 spiritsState 的 place/name(星球版);顺序与 SPIRITS 一致
const prevSpiritsState = ctx.kunlun.spiritsState;
ctx.kunlun.spiritsState = function () {
  return decorateSpiritsState(prevSpiritsState(), PLANETS, chapter);
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
  removeNav();
  dropAllStoryGuides(); // 剧情浮光指引清理(story-guides.js,HMR/卸载不泄漏)
});
hotEnd('planets');
if (import.meta.hot) import.meta.hot.accept();
