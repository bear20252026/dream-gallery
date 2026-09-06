// crash-site.js — 坠机点(2026-09-07 主人定):出生点迁至残骸旁,小王子出场引导
// 电影结尾纸飞机贴沙即"变成"这架真飞机(Piper PA-18 残骸, CC BY 4.0, 署名见 CREDITS.md);
// 玩家在残骸旁睁眼(视野从仰望天空缓缓回正),小王子从沙丘跳步走下,
// 说出第一句 "If you please— draw me a sheep!"(原著 Woods 译,书内原句)。
// 模型: models/b612/piper-pa18.glb / models/b612/chibi-prince.glb(均无骨骼动画,动效全程序化)。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { STORY } from '../shared/story-text.mjs';

const bag = hotBegin('crash-site');
const { s } = ctx;
const getH = (x, z) => ctx.media.desert.getH(x, z);

// ===================== 选址(2026-09-07 地形探针实测) =====================
// 石门南侧洼地,16×14m 内高差仅 0.73m,缓坡可达;残骸机头朝北(朝画廊方向滑停)。
const WRECK = { x: -9, z: 76, yaw: -0.35 }; // yaw: 机头大致朝北偏东
const SPAWN_DIR = { x: -5.5, z: 72.8 }; // 出生点(与 player.js SPAWN 常量一致)
const DUNE = { x: -11.8, z: 72.2 }; // 小王子初见位(玩家睁眼即可见的西南沙地,走出时不穿残骸)
const PRINCE_DEST = { x: -9.3, z: 72.8 }; // 叫醒站位(相机投影实测:屏幕 84%/75%,对话框右侧空地)
const PRINCE_H = 0.8; // chibi 王子目标身高(m)

const loader = new GLTFLoader();
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
      mnX: bb.min.x + 0.3,
      mxX: bb.max.x - 0.3,
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
  x.font = 'italic 26px Georgia, serif';
  const words = STORY.wreckSign.en.split(' ');
  let line = '',
    y = 66;
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
  x.font = '22px "Microsoft YaHei", sans-serif';
  for (const seg of STORY.wreckSign.zh.split('\n')) {
    x.fillText(seg, 256, y);
    y += 34;
  }
  const tex = new THREE.CanvasTexture(cnv);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.06, 0.06),
    [
      new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
      new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
      new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
      new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
      new THREE.MeshStandardMaterial({ map: tex }),
      new THREE.MeshStandardMaterial({ color: '#8a6a4a' }),
    ]
  );
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
loader.load(
  '/models/b612/chibi-prince.glb',
  (g) => {
    const m = g.scene;
    const box = new THREE.Box3().setFromObject(m);
    const h = box.max.y - box.min.y;
    m.scale.setScalar(PRINCE_H / h); // 归一化到 0.8m(chibi 小人影)
    m.position.y -= box.min.y * (PRINCE_H / h); // 底面贴到轴心(否则半截埋沙)
    const wrap = new THREE.Group();
    wrap.add(m);
    const gh = getH(DUNE.x, DUNE.z);
    wrap.position.set(DUNE.x, gh, DUNE.z); // bottom 贴地(min.y 在归一化后已近 0)
    wrap.name = 'littlePrince';
    wrap.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; // 无骨骼动画的静态人偶,防误剔除
      }
    });
    s.add(wrap);
    prince = wrap;
    princeState = 'dune';
  },
  undefined,
  (e) => console.error('[crash-site] 王子模型加载失败:', e.message)
);

// ===================== 睁眼 + 王子走近叫醒 =====================
let bootT = null;
let wakePlayed = false;
setTimeout(function () {
  window.__crashWakeDone = true; // 兜底:对话链路异常时 16s 后照常放行开场弹窗
}, 16000);
ctx.onTick(function crashTick(dt) {
  if ((ctx.scene.activeWorld || 'main') !== 'main') return;
  const now = performance.now();
  if (bootT === null) bootT = now;
  const t = (now - bootT) / 1000;

  // 睁眼:出生瞬间仰望天空,1.8s 缓缓回正(电影黑场交棒过来的"醒")
  const pl = ctx.player.pl;
  if (t < 1.8) pl.pi = 0.85 * (1 - t / 1.8);
  else pl.pi = 0;

  // 王子未就绪/未到出场时刻:只处理待机呼吸
  if (!prince || t < 1.4) return;
  if (princeState === 'dune' && !wakePlayed) {
    wakePlayed = true;
    princeState = 'walking';
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
    prince.rotation.y = Math.atan2(-(princeAt.x - DUNE.x), -(princeAt.z - DUNE.z)); // 行进朝向
    if (k >= 1) {
      princeState = 'idle';
      // 叫醒词(书内原句):第一句对话即主线发令枪
      if (ctx.openDialog) {
        ctx.openDialog({
          speaker: STORY.princeWake.speaker,
          lines: [STORY.princeWake.en + '\n' + STORY.princeWake.zh], // 单行双语,自动收束不抢拍
          autoHide: 9000,
          onDone: function () {
            window.__crashWakeDone = true; // settings.js 等此标记再弹雅号/指引卡,不盖开场对白
          },
        });
      } else window.__crashWakeDone = true;
    }
  } else if (princeState === 'idle') {
    prince.position.y = getH(prince.position.x, prince.position.z) + Math.abs(Math.sin(now * 0.003)) * 0.03; // 待机轻息
  }
});

bag.custom.push(function () {
  if (pushedBounds.length && ctx.scene.removeBounds) ctx.scene.removeBounds(pushedBounds);
});
hotEnd('crash-site');
if (import.meta.hot) import.meta.hot.accept();
