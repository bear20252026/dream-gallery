// crash-site.js — 坠机点(2026-09-07 主人定):出生点迁至残骸旁,小王子出场引导
// 电影结尾纸飞机贴沙即"变成"这架真飞机(Piper PA-18 残骸, CC BY 4.0, 署名见 CREDITS.md);
// 玩家在残骸旁睁眼(视野从仰望天空缓缓回正),小王子从沙丘跳步走下,
// 说出第一句 "If you please— draw me a sheep!"(原著 Woods 译,书内原句)。
// 模型: models/b612/piper-pa18.glb(无动画,程序化) / chibi-prince-rigged-v2.glb(2026-09-25 骨骼动画版:Idle/Walk/Wave/Hop)。
import * as THREE from 'three';
import { createGLTFLoader } from '../scene/gltf-loader.js';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { STORY, tt, whoSpk } from '../shared/story-text.mjs';
import { replyChoices } from '../shared/dialog-replies.mjs';

const bag = hotBegin('crash-site');
const { s } = ctx;
const getH = (x, z) => ctx.media.desert.getH(x, z);

// ===================== 选址(2026-09-07 地形探针实测) =====================
// 石门南侧洼地,16×14m 内高差仅 0.73m,缓坡可达;残骸机头朝北(朝画廊方向滑停)。
const WRECK = { x: -9, z: 76, yaw: -0.35 }; // yaw: 机头大致朝北偏东
const SPAWN_DIR = { x: -3.5, z: 70.5 }; // 出生点(与 player.js SPAWN 常量一致;残骸碰撞盒外)
// 2026-09-25 主人报「小王子卡在飞机里」:王子 3.2m 高,原站位距机身轴线仅 1.37m,
// 机翼/尾翼包络直接罩住上半身 → 站位与初见位整体向西南挪出机翼包络(垂距 ≥3.1m),
// 行走路线顺势拉长(2.6m→3.7m),跳步更有戏。
const DUNE = { x: -13.5, z: 73.5 }; // 小王子初见位(西南沙丘,机翼包络外垂距 5.1m)
const PRINCE_DEST = { x: -10.6, z: 71.2 }; // 叫醒站位(机身轴线垂距 3.1m,机尾外空地)
const PRINCE_H = 3.2; // chibi 王子目标身高(m)(2026-09-07 主人定:放大 3~5 倍,取 4 倍)

const loader = createGLTFLoader();
const pushedBounds = []; // HMR 退出时回收
function addBox(b) {
  pushedBounds.push(b);
  if (ctx.scene.addBounds) ctx.scene.addBounds([b]);
}

// ===================== 残骸 =====================
loader.load(
  '/models/b612/piper-pa18.glb',
  (g) => {
    const m = g.scene;
    // 真机比例(6.9×2.7×10.7m),机头下俯扎沙、侧倾、机身半埋
    const box = new THREE.Box3().setFromObject(m);
    m.position.y -= box.min.y; // 先贴地
    const wrap = new THREE.Group();
    wrap.add(m);
    wrap.rotation.y = WRECK.yaw;
    wrap.rotation.z = 0.34; // 机头下俯(绕自身翼展轴,姿态经截图校验)
    wrap.rotation.x = 0.1; // 轻微侧倾
    wrap.position.set(WRECK.x, getH(WRECK.x, WRECK.z) - 0.32, WRECK.z); // 半埋
    wrap.name = 'crashWreck';
    s.add(wrap);
    // 碰撞:机身实心一盒(座舱玻璃按惯例可穿,不单独立柱)
    wrap.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(wrap);
    addBox({
      mnX: bb.min.x + 2.6, // 只保留机身段(座舱),机翼下可穿行——否则整个翼展圈住出生点
      mxX: bb.max.x - 2.6,
      mnZ: bb.min.z + 0.6,
      mxZ: bb.max.z - 0.6,
    });
  },
  undefined,
  (e) => console.error('[crash-site] 残骸模型加载失败:', e.message)
);

// ===================== 坠机残骸告示牌(双语木牌) =====================
function makeSign() {
  const cnv = document.createElement('canvas');
  cnv.width = 512;
  cnv.height = 320;
  const x = cnv.getContext('2d');
  x.fillStyle = '#f3ead2';
  x.fillRect(0, 0, 512, 320);
  x.strokeStyle = '#6b4f37';
  x.lineWidth = 10;
  x.strokeRect(8, 8, 496, 304);
  x.fillStyle = '#4e4237';
  x.textAlign = 'center';
  const zhFont = '"Zhi Mang Xing", "Microsoft YaHei", sans-serif';
  function draw() {
    x.clearRect(0, 0, 512, 320);
    x.fillStyle = '#f3ead2';
    x.fillRect(0, 0, 512, 320);
    x.strokeStyle = '#6b4f37';
    x.lineWidth = 10;
    x.strokeRect(8, 8, 496, 304);
    x.fillStyle = '#4e4237';
    x.textAlign = 'center';
    x.font = 'italic 26px Georgia, serif';
    const signText = STORY.wreckSign.en;
    const words = signText.split(' ');
    let line = '';
    let y = 66;
    for (const w of words) {
      if (x.measureText(line + w).width > 440) {
        x.fillText(line, 256, y);
        y += 34;
        line = '';
      }
      line += w + ' ';
    }
    x.fillText(line, 256, y);
    y += 46;
    x.font = '30px ' + zhFont; // 中文行书(字体就绪后经 fonts.ready 重绘)
    for (const seg of STORY.wreckSign.zh.split('\n')) {
      x.fillText(seg, 256, y);
      y += 40;
    }
    tex.needsUpdate = true;
  }
  const tex = new THREE.CanvasTexture(cnv);
  draw();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      draw(); // 行书子集加载完成后重绘牌面中文
    });
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.06, 0.06), [
    new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
    new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
    new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
    new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
    new THREE.MeshStandardMaterial({ map: tex }),
    new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
  ]);
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 1.5, 0.09),
    new THREE.MeshStandardMaterial({ color: '#6b4f37' })
  );
  post.position.y = -1.15;
  const grp = new THREE.Group();
  grp.add(board, post);
  const sx = WRECK.x + 2.6,
    sz = WRECK.z + 1.8;
  grp.position.set(sx, getH(sx, sz) + 1.2, sz);
  grp.rotation.y = Math.atan2(SPAWN_DIR.x - sx, SPAWN_DIR.z - sz); // 牌面(纹样在 +Z)正对出生点
  grp.name = 'crashSign';
  s.add(grp);
}
makeSign();

// ===================== 小王子 =====================
let prince = null;
let princeState = 'dune'; // dune → walking → idle
let princeAt = null; // 目的地
let princeT0 = 0;
// idle 小动作状态(2026-09-25 起骨骼动画版 chibi-prince-rigged-v2.glb 接管:
// Blender 程序化绑骨+烘焙的四段动画 Idle/Walk/Wave/Hop 经 AnimationMixer 播放;
// 加载失败或旧模型时回落到整体变换的程序化 hop/look,逻辑保持不变)
let princeMixer = null; // 骨骼动画混音器(rigged 模型才有)
let princeActs = null; // { idle, walk, wave, hop }
let princeCurAct = null; // 当前播放的 Action
let idleClock = 0; // idle 累计秒
let idleAction = null; // 'hop' 原地小跳 | 'look' 张望摆头 | 'wave' 挥手
let idleActionT = 0;
let idleActionDur = 0;
let idleNextAt = 4; // 首次小动作提前,睁眼后马上能看见王子"活着"
// 动画切换:交叉淡化到目标动作(rigged 专用;未加载时返回 false 走程序化)
function princeFadeTo(next, fade) {
  if (!princeMixer || !princeActs || !princeActs[next]) return false;
  const act = princeActs[next];
  if (princeCurAct === act) return true;
  act.reset();
  if (princeCurAct) act.crossFadeFrom(princeCurAct, fade, false);
  act.play();
  princeCurAct = act;
  return true;
}
loader.load(
  '/models/b612/chibi-prince-rigged-v2.glb',
  (g) => {
    const m = g.scene;
    // 尺寸:与原版一致——全 bbox(含隐藏星星层)定标,视觉大小不变。
    const boxAll = new THREE.Box3().setFromObject(m, true);
    const h = boxAll.max.y - boxAll.min.y;
    m.scale.setScalar(PRINCE_H / h);
    // 贴地(2026-09-25「小王子半埋沙」终版修法):绑骨时 root 骨骼锚点就是脚底
    // (scripts/artifacts/chibi-rig.py BONES.root head=(0,0,-195)=脚底),直接用它的
    // 世界坐标把脚底抬到轴心。不用几何包围盒——蒙皮网格的包围盒/首帧骨骼矩阵
    // 都不可靠(渲染前 boneMatrices 未更新),实测差 1.4~1.6m。
    m.updateWorldMatrix(true, true);
    let rootBone = null;
    m.traverse((o) => {
      if (!rootBone && o.isBone && o.name === 'root') rootBone = o;
    });
    if (rootBone) {
      m.position.y -= rootBone.getWorldPosition(new THREE.Vector3()).y;
    }
    // 骨骼动画接线(无动画时 mixer 为 null,自动回落程序化动效)
    if (g.animations && g.animations.length) {
      princeMixer = new THREE.AnimationMixer(m);
      const pick = (n) => g.animations.find((c) => c.name === n);
      princeActs = {
        idle: princeMixer.clipAction(pick('ChibiIdle')),
        walk: princeMixer.clipAction(pick('ChibiWalk')),
        wave: princeMixer.clipAction(pick('ChibiWave')),
        hop: princeMixer.clipAction(pick('ChibiHop')),
      };
      princeActs.idle.play(); // 待机呼吸常驻
      princeCurAct = princeActs.idle;
    }
    const wrap = new THREE.Group();
    wrap.add(m);
    const gh = getH(DUNE.x, DUNE.z);
    wrap.position.set(DUNE.x, gh, DUNE.z); // bottom 贴地(min.y 在归一化后已近 0)
    wrap.name = 'littlePrince';
    wrap.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; // 无骨骼动画的静态人偶,防误剔除
      // Layer_1 = 模型自带的金色星星装饰层(0.8m 时是点缀,3.2m 后挡脸)——移除
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((mm) => /Layer_1/i.test(mm.name || ''))) o.visible = false;
    });
    s.add(wrap);
    prince = wrap;
    princeState = 'dune';
    // 探针/调试钩子(不进 UI,只读):线上验收 prince-rig-probe.cjs 用
    window.__princeDebug = {
      state: () => princeState,
      clip: () => (princeCurAct && princeCurAct.getClip().name) || null,
      rigged: () => !!princeMixer,
    };
  },
  undefined,
  (e) => console.error('[crash-site] 王子模型加载失败:', e.message)
);

// ===================== 睁眼 + 王子走近叫醒 =====================
let bootT = null;
let wakePlayed = false;
let wakePitchDone = false;
setTimeout(function () {
  window.__crashWakeDone = true; // 兜底:对话链路异常时 16s 后照常放行开场弹窗
}, 16000);
ctx.onTick(function crashTick(dt) {
  if ((ctx.scene.activeWorld || 'main') !== 'main') return;
  const now = performance.now();
  if (bootT === null) bootT = now;
  const t = (now - bootT) / 1000;

  // 睁眼:出生瞬间仰望天空,1.8s 缓缓回正——只在窗口内调 pitch,之后放手交还鼠标,
  // 否则每帧 pl.pi=0 会把玩家俯仰永久锁零("进画廊后无法行动"根因,2026-09-07)
  const pl = ctx.player.pl;
  if (t < 1.8) pl.pi = 0.85 * (1 - t / 1.8);
  else if (!wakePitchDone) {
    wakePitchDone = true;
    pl.pi = 0;
  }

  // 王子未就绪/未到出场时刻:只处理待机呼吸
  if (!prince || t < 1.4) return;
  if (princeMixer) princeMixer.update(dt); // 骨骼动画推进(rigged 版)
  if (princeState === 'dune' && !wakePlayed) {
    wakePlayed = true;
    // 剧情进度守卫(2026-09-10 主人报「无法从对话跳转画羊」):画羊已完成的旧档
    // 不再重播叫醒词——否则对话说「给我画一只羊」、画板却被进度守卫跳过,永远接不上。
    // 旧档开场=王子已在目的地等候,直接放行后续指引(重走全链用 ?storyreset)
    if (ctx.store.flag('scene2')) {
      princeState = 'idle';
      princeFadeTo('idle', 0.2);
      princeAt = { x: PRINCE_DEST.x, z: PRINCE_DEST.z };
      prince.position.x = PRINCE_DEST.x;
      prince.position.z = PRINCE_DEST.z;
      window.__crashWakeDone = true;
      return;
    }
    princeState = 'walking';
    princeFadeTo('walk', 0.25);
    princeAt = { x: PRINCE_DEST.x, z: PRINCE_DEST.z }; // 相机投影实测位(2026-09-07)
    princeT0 = now;
  }
  if (princeState === 'walking') {
    const k = Math.min(1, (now - princeT0) / 3400);
    const px = DUNE.x + (princeAt.x - DUNE.x) * k;
    const pz = DUNE.z + (princeAt.z - DUNE.z) * k;
    prince.position.x = px;
    prince.position.z = pz;
    prince.position.y = getH(px, pz) + Math.abs(Math.sin(k * Math.PI * 5)) * 0.16; // 跳步
    prince.rotation.y = Math.atan2(-(princeAt.x - DUNE.x), -(princeAt.z - DUNE.z)) + Math.PI; // 行进朝向(模型前向补 π)
    if (k >= 1) {
      princeState = 'idle';
      princeFadeTo('idle', 0.3);
      // 叫醒词(书内原句):第一句对话即主线发令枪(单语,随语言切换)
      if (ctx.openDialog) {
        let wakeSpent = false; // onDone 与心跳守护只许一个推进
        // 心跳守护(2026-09-26 互动化改 interval):带 choices 的对话不自动关闭(等玩家开口),
        // 旧的一次性 11.6s 定时会在「玩家还没点」时误判链断。改为周期巡检:对话框关着才放行;
        // 玩家点选后的回应链 lock 互斥持续开着,不会被误杀。总等待无上限(剧情等玩家,应该的)。
        const wakeWd = setInterval(function () {
          if (ctx.dialogOpen && ctx.dialogOpen()) return; // 链在走(含等待玩家点选)
          wakeFinish();
        }, 1500);
        const wakeFinish = function () {
          if (wakeSpent) return;
          wakeSpent = true;
          clearInterval(wakeWd);
          window.__crashWakeDone = true; // settings.js 等此标记再弹雅号/指引卡,不盖开场对白
          // 叫醒词说完 → 第 2 场·画羊四笔(gate/scene2-draw.js 经事件解耦启动)
          setTimeout(function () {
            ctx.events.emit('story:scene2');
          }, 900);
        };
        ctx.openDialog({
          speaker: tt(STORY.princeWake.who),
          speakerType: whoSpk(STORY.princeWake.who),
          lines: [tt(STORY.princeWake)],
          autoHide: 9000,
          lock: true,
          // 轮到玩家开口(2026-09-26 主人令「不仅仅是在放台词」):叫醒词说完,
          // 选项按钮出现;点选 → 飞行员回应朗读 → 王子接话 → 汇合 scene2
          choices: replyChoices(ctx, 'wake', wakeFinish),
          onDone: wakeFinish,
        });
      } else {
        window.__crashWakeDone = true;
        ctx.events.emit('story:scene2');
      }
    }
  } else if (princeState === 'idle') {
    // 待机呼吸(0.05m,肉眼可见) + 每 6~11s 一次小动作:原地小跳 0.3m / 张望摆头 ±40°
    idleClock += dt;
    const tx = pl.p.x - prince.position.x;
    const tz = pl.p.z - prince.position.z;
    const targetYaw = Math.atan2(-tx, -tz) + Math.PI; // 模型视觉前向补 π
    let dy = targetYaw - prince.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    let yaw = prince.rotation.y + dy * Math.min(1, dt * 4); // 平滑转体面向玩家
    let y = getH(prince.position.x, prince.position.z) + Math.abs(Math.sin(now * 0.003)) * 0.05;
    if (idleAction) {
      idleActionT += dt;
      const k = Math.min(1, idleActionT / idleActionDur);
      if (k >= 1) {
        idleAction = null;
        idleClock = 0;
        idleNextAt = 6 + Math.random() * 5;
        princeFadeTo('idle', 0.25); // 骨骼动画:小动作结束回落待机
      } else if (idleAction === 'hop') {
        if (!princeFadeTo('hop', 0.1)) y += Math.sin(k * Math.PI) * 0.3; // 无动画时程序化跳
      } else if (idleAction === 'wave') {
        if (!princeMixer) yaw += Math.sin(k * Math.PI * 2) * 0.7; // 无动画退化为张望
      } else {
        yaw += Math.sin(k * Math.PI * 2) * 0.7;
      }
    } else if (idleClock >= idleNextAt) {
      const r = Math.random();
      idleAction = r < 0.4 ? 'wave' : r < 0.7 ? 'hop' : 'look';
      idleActionT = 0;
      idleActionDur = idleAction === 'wave' ? 2.1 : idleAction === 'hop' ? 1.0 : 1.6;
      if (idleAction !== 'look') princeFadeTo(idleAction, 0.15);
    }
    prince.position.y = y;
    prince.rotation.y = yaw;
  }
});

bag.custom.push(function () {
  if (pushedBounds.length && ctx.scene.removeBounds) ctx.scene.removeBounds(pushedBounds);
});
hotEnd('crash-site');
if (import.meta.hot) import.meta.hot.accept();
