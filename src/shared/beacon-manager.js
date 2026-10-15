// shared/beacon-manager.js — 剧情光柱信标的单一源(第六轮审计 M-07,2026-10-15)
//
// 为什么收:同一根"走到光柱里收下它"的光柱,审计点名 5 份,实际逐个数下来是 **7 份** ——
//   scene6-king.js:115 / scene7-vanity.js:65 / scene7-tippler.js:188 / gate/scene3-night.js:50 /
//   late-planets.js:84(以上五份 makeBeacon)+ earth-day.js:300(内联一根,顶口手写 0.24)
//   + story-guides.js:19 makeGuideBeacon。七份的几何与材质**逐字相同**(半径 0.55 缩口的开口圆柱、
//   MeshBasicMaterial 0xffd9a0、DoubleSide、depthWrite:false、fog:false),差别只在
//   "底面 y 从哪来"(岛顶 ISLE_TOP_Y / 地面 gy / 岛顶现算)和"挂哪个场景"。
// 重复的代价不是行数:那条 **零 PointLight 铁律**(光柱一律自发光、不进光照预算,由
// core/light-budget.js 兜底扫)此刻写在 7 个地方,谁在某一份里顺手加了个 PointLight,
// 灯光预算就在那颗星上被悄悄吃掉 —— 而这类改动没有任何测试会红。
// 摘取/脉冲同理:`remove*Beacon()` 与 `rotation.y += 0.004 / baseOpacity*(0.8+sin(t*1.9)*0.25)`
// 也各写了 5~6 份。story-guides.js 的呼吸是 0.75+sin(t*1.7)*0.25(远距门指引,节奏本来就不同),
// 那一份**不**并进 pulseBeacon,只并几何与拆除。
//
// 边界:本模块**不知道**世界名、星屑坐标、探针用的信标名 —— 那些留在各章里(它们是剧情)。
// 它只管"一根光柱怎么建、怎么拆、怎么呼吸",以及"一格_named slot_只立一根"。
import * as THREE from 'three';

// 光柱颜色(五份旧实现里都是这一个数)
export const BEACON_COLOR = 0xffd9a0;

/**
 * 建一根光柱(**不**挂场景,交给调用方/keeper 决定挂哪儿)。
 * @param {{x:number,z:number,baseY:number,h:number,r:number,opacity:number,name?:string,lift?:number}} spec
 *   baseY = 光柱底面所在高度(岛顶面 / 地面),lift = 往上抬一点点免得与地面共面
 */
export function createBeacon(spec) {
  const { x, z, baseY, h, r, opacity, name, lift = 0 } = spec;
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.55, r, h, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: BEACON_COLOR,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    })
  );
  m.position.set(x, baseY + h / 2 + lift, z);
  m.userData.baseOpacity = opacity;
  m.name = name || 'storyBeacon';
  return m;
}

/**
 * 拆一根光柱:先从**它自己所在的**父节点摘掉,再释放几何与材质。
 * 旧写法是"按世界名找到场景再 remove",场景此刻找不到时(世界已销毁)会把一个已 dispose
 * 的网格留在原父节点上;这里按 mesh.parent 摘,不留那种尾巴。返回值 = 是否真的拆过。
 */
export function disposeBeacon(mesh) {
  if (!mesh) return false;
  if (mesh.parent) mesh.parent.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  return true;
}

/**
 * 呼吸:缓慢自转 + 透明度起伏(各章 tick 里那份逐字相同的写法)。
 * @param {number} tSec 秒(与旧的 Date.now()*0.001 同单位)
 */
export function pulseBeacon(mesh, tSec) {
  if (!mesh) return;
  mesh.rotation.y += 0.004;
  const base = mesh.userData.baseOpacity;
  if (base == null) return;
  mesh.material.opacity = base * (0.8 + Math.sin(tSec * 1.9) * 0.25);
}

/**
 * 信标格子簿:同一格(mote / door / box / …)只立一根,立过就原样返回。
 * @param {() => (THREE.Scene|null|undefined)} getScene 现在该挂到哪个场景(拿不到 ⇒ 不立)
 */
export function createBeaconKeeper(getScene) {
  const slots = new Map();
  const api = {
    /** @returns {THREE.Mesh|null} 已有的或新建的;场景拿不到 ⇒ null */
    arm(key, spec) {
      const cur = slots.get(key);
      if (cur) return cur;
      const scene = typeof getScene === 'function' ? getScene() : null;
      if (!scene) return null;
      const s = typeof spec === 'function' ? spec(scene) : spec;
      const m = createBeacon(s);
      scene.add(m);
      slots.set(key, m);
      return m;
    },
    get(key) {
      return slots.get(key) || null;
    },
    has(key) {
      return slots.has(key);
    },
    keys() {
      return Array.from(slots.keys());
    },
    /** 拆一格:没这一格 ⇒ false(调用方靠它判断"是不是白拆了一回") */
    remove(key) {
      const m = slots.get(key);
      if (!m) return false;
      slots.delete(key);
      disposeBeacon(m);
      return true;
    },
    removeAll() {
      let n = 0;
      for (const key of Array.from(slots.keys())) if (api.remove(key)) n++;
      return n;
    },
    /** 还立着几根(自检/探针:离开岛屿后应为 0) */
    count() {
      return slots.size;
    },
  };
  return api;
}
