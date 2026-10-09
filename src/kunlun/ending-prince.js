// ending-prince.js — 结局线的小王子 rig(2026-10-09 自 ending-journey.js 切出,逐字迁移)
// 模型加载/动画/摆放/透明度/跟随与倒下的逐帧行为。princeMode 状态自持,
// trunk 经 setPrinceMode/getPrinceMode/resetFall 读写(原直接赋值 fallT=0 等价 resetFall)。
// initPrinceRig({ scene, groundH }) 注入主干的主场景 getter 与地面高度函数
// (两者都是 trunk 的可变量/函数——mainScene 在组件 init 时才赋值,必须传 getter)。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { createGLTFLoader } from '../scene/gltf-loader.js';

const PRINCE_MODEL = '/models/b612/chibi-prince-rigged-v2.glb';
const PRINCE_H = 3.2; // 与 crash-site.js 一致

let prince = null; // { wrap, mixer, acts, cur }
let princeMode = 'hidden'; // hidden | follow | well | wall | still | falling
let fallT = 0;
let SCENE = null;
let GROUND_H = null;

export function initPrinceRig(deps) {
  SCENE = deps.scene;
  GROUND_H = deps.groundH;
}
export function getPrinceMode() {
  return princeMode;
}
export function setPrinceMode(m) {
  princeMode = m;
}
export function resetFall() {
  fallT = 0;
}
export function disposePrince() {
  if (prince && prince.wrap) prince.wrap.removeFromParent();
  prince = null;
}
export function loadPrince(cb) {
  if (prince) {
    cb && cb();
    return;
  }
  createGLTFLoader().load(
    PRINCE_MODEL,
    (g) => {
      const m = g.scene;
      const box = new THREE.Box3().setFromObject(m, true);
      const h = box.max.y - box.min.y || 1;
      m.scale.setScalar(PRINCE_H / h);
      m.updateWorldMatrix(true, true);
      let rootBone = null;
      m.traverse((o) => {
        if (!rootBone && o.isBone && o.name === 'root') rootBone = o;
        if (o.isMesh) {
          o.frustumCulled = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          if (mats.some((mm) => /Layer_1/i.test(mm.name || ''))) o.visible = false;
          // 倒下时要淡出:材质克隆成可透明(只影响本实例)
          o.material = Array.isArray(o.material)
            ? o.material.map((mm) => cloneFade(mm))
            : cloneFade(o.material);
        }
      });
      if (rootBone) m.position.y -= rootBone.getWorldPosition(new THREE.Vector3()).y;
      const wrap = new THREE.Group();
      wrap.name = 'endingPrince';
      wrap.add(m);
      wrap.visible = false;
      let mixer = null,
        acts = null;
      if (g.animations && g.animations.length) {
        mixer = new THREE.AnimationMixer(m);
        const pick = (n) => g.animations.find((c) => c.name === n) || g.animations[0];
        acts = {
          idle: mixer.clipAction(pick('ChibiIdle')),
          walk: mixer.clipAction(pick('ChibiWalk')),
          wave: mixer.clipAction(pick('ChibiWave')),
        };
        acts.idle.play();
      }
      prince = { wrap, mixer, acts, cur: acts ? acts.idle : null, model: m };
      SCENE().add(wrap);
      cb && cb();
    },
    undefined,
    (e) => console.error('[ending] 小王子模型加载失败(结局照常推进):', e.message)
  );
}
function cloneFade(mm) {
  if (!mm || !mm.clone) return mm;
  const c = mm.clone();
  c.transparent = true;
  return c;
}
export function princeAnim(name) {
  if (!prince || !prince.acts || !prince.acts[name]) return;
  const a = prince.acts[name];
  if (prince.cur === a) return;
  a.reset();
  if (prince.cur) a.crossFadeFrom(prince.cur, 0.35, false);
  a.play();
  prince.cur = a;
}
export function placePrince(x, z, y, faceX, faceZ) {
  if (!prince) return;
  prince.wrap.position.set(x, y == null ? GROUND_H(x, z) : y, z);
  if (faceX != null) prince.wrap.rotation.y = Math.atan2(faceX - x, faceZ - z);
  prince.wrap.visible = true;
  prince.wrap.rotation.z = 0;
  setPrinceOpacity(1);
}
export function setPrinceOpacity(o) {
  if (!prince) return;
  prince.wrap.traverse((n) => {
    if (!n.isMesh) return;
    (Array.isArray(n.material) ? n.material : [n.material]).forEach((mm) => {
      if (mm) mm.opacity = o;
    });
  });
}
// 坠机点原来那位小王子:结局线里由同行的这位接替;告别之后,他回家了
export function crashPrinceVisible(v) {
  const o = SCENE() && SCENE().getObjectByName('littlePrince');
  if (o && o.visible !== v) o.visible = v;
}
export function sheepBoxVisible(v) {
  const o = SCENE() && SCENE().getObjectByName('sheepBox');
  if (o && o.visible !== v) o.visible = v;
}
export function updatePrince(dt) {
  if (!prince || !prince.wrap.visible) return;
  if (prince.mixer) prince.mixer.update(dt);
  const w = prince.wrap;
  if (princeMode === 'follow') {
    const pl = ctx.player.pl;
    if (!pl || !pl.p) return;
    const yaw = pl.y || 0;
    // 走在玩家右前侧(前向 = (-sin y, -cos y),右 = (cos y, -sin y))
    const tx = pl.p.x + Math.cos(yaw) * 2.8 - Math.sin(yaw) * 0.8;
    const tz = pl.p.z - Math.sin(yaw) * 2.8 - Math.cos(yaw) * 0.8;
    const dx = tx - w.position.x,
      dz = tz - w.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 14) {
      w.position.set(tx, GROUND_H(tx, tz), tz); // 传送/跌落兜底
      return;
    }
    const speed = d > 5 ? 6.5 : 3.2;
    const travel = Math.min(Math.max(0, d - 0.4), speed * Math.min(0.05, dt));
    if (travel > 0.002) {
      w.position.x += (dx / d) * travel;
      w.position.z += (dz / d) * travel;
      w.rotation.y = Math.atan2(dx, dz);
      princeAnim('walk');
    } else princeAnim('idle');
    w.position.y = GROUND_H(w.position.x, w.position.z);
  } else if (princeMode === 'falling') {
    fallT += dt;
    const k = Math.min(1, fallT / 1.8);
    w.rotation.z = (k * k * Math.PI) / 2.2; // 轻得像一棵树倒下
    if (fallT > 1.6) setPrinceOpacity(Math.max(0, 1 - (fallT - 1.6) / 1.6));
    if (fallT > 3.3) {
      w.visible = false;
      princeMode = 'hidden';
    }
  }
}
