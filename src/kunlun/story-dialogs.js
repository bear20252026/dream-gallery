// story-dialogs.js — 小世界情景对话(2026-09-06 主人定:小王子之家/国王星球,英文 Satisfy 手写体)
// 正式方案:Three.js 官方 CSS2DRenderer —— 对话框是锚定 3D 坐标的 HTML,始终面向屏幕。
// 引入经 importmap 映射 vendor/examples/jsm/renderers/CSS2DRenderer.js(与 GLTFLoader 同款接入,
// sync-vendor 已登记)。气泡以 CSS2DObject 挂到各世界自己的 scene,SceneManager 切世界时自动跟随。
// 近距触发、逐条轮播、离开淡出;主世界层隐藏+零投影开销。
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ctx } from '../ctx.js';
import { hotBegin } from '../hot.js';
import { Z } from '../shared/z-layers.mjs';
import { DIALOG_LINES } from '../shared/story-text.mjs';

const bag = hotBegin('story-dialogs');

// ===================== 对话数据(全英文,书体手写风;台词正文单一源在 story-text.mjs) =====================
const ACTORS = [
  {
    world: 'b612',
    id: 'prince',
    match: /polySurface[1456]|^hair$/i, // 小王子身体网格(发/身/腿/臂/披风)
    lines: DIALOG_LINES.prince,
    off: 1.6,
    radius: 11,
    every: 7000,
  },
  {
    world: 'b612',
    id: 'rose',
    match: /rosss/i, // 归位后的玫瑰坛
    lines: DIALOG_LINES.rose,
    off: 1.7,
    radius: 6,
    every: 9000,
  },
  {
    world: 'king325',
    id: 'king',
    match: /kingStoryScene/i, // 国王场景整体:气泡锚在其顶面中心
    lines: DIALOG_LINES.king,
    off: 2.4,
    radius: 12,
    every: 7000,
  },
];

// ===================== CSS2DRenderer 层 =====================
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.cssText =
  'position:fixed;inset:0;z-index:' + Z.worldFx + ';pointer-events:none;display:none;overflow:hidden';
labelRenderer.domElement.innerHTML = `
<style>
#storyDialogLayer .b612-bubble{
  font-family:'Satisfy',cursive;font-size:clamp(18px,2vw,24px);line-height:1.55;
  color:#4e4237;background:rgba(253,248,236,.95);
  border:1px solid rgba(90,72,50,.35);border-radius:14px;
  padding:10px 16px;max-width:min(300px,42vw);text-align:center;white-space:nowrap;
  box-shadow:0 10px 26px rgba(61,55,46,.18);position:relative;
  transition:opacity .5s ease;
}
#storyDialogLayer .b612-bubble:after{
  content:'';position:absolute;left:50%;bottom:-9px;margin-left:-9px;
  border:9px solid transparent;border-top-color:rgba(253,248,236,.95);border-bottom:none;
}
@keyframes b612BubbleIn{from{opacity:0}to{opacity:1}}
#storyDialogLayer .b612-bubble.show{animation:b612BubbleIn .6s ease both}
</style>`;
labelRenderer.domElement.id = 'storyDialogLayer';
// CSS2DRenderer 在渲染时会往 domElement 追加 position:absolute 的对象 div,
// 内层用绝对定位 + translate 实现"锚点上方"与"居中"
const DIALOG_WRAP = document.createElement('style');
DIALOG_WRAP.textContent = '#storyDialogLayer .b612-anchor{position:absolute;left:0;top:0;transform:translate(-50%,-110%);will-change:transform}';
labelRenderer.domElement.appendChild(DIALOG_WRAP);
document.body.appendChild(labelRenderer.domElement);
bag.custom.push(() => labelRenderer.domElement.remove());

// ===================== 气泡对象(CSS2DObject,每 Actor 一个) =====================
const states = new Map(); // actor.id -> { obj, inner, idx, at }
const bubbleOf = (() => {
  function create(actor) {
    // CSS2DRenderer 会重写它直接持有的元素 transform(translate(-50%,-50%))以实现屏幕居中,
    // 因此用 root→anchor 双层:root 归 CSS2DRenderer 摆位,anchor 内层负责"锚点上方"上移。
    const root = document.createElement('div');
    root.className = 'b612-root';
    root.style.cssText = 'position:absolute;left:0;top:0';
    const wrap = document.createElement('div');
    wrap.className = 'b612-anchor';
    const inner = document.createElement('div');
    inner.className = 'b612-bubble';
    inner.dataset.actor = actor.id; // 探针可按 data-actor 精确定位
    wrap.appendChild(inner);
    root.appendChild(wrap);
    const obj = new CSS2DObject(root);
    const st = { obj, inner, idx: -1, at: 0 };
    states.set(actor.id, st);
    return st;
  }
  return (actor) => (states.has(actor.id) ? states.get(actor.id) : create(actor));
})();

// ===================== 锚点解析(懒执行;按结构类型定位,不依赖易变的网格名) =====================
// 王子=b612Storybook 内的蒙皮网格(SkinnedMesh,动画角色);玫瑰=Rosss 组节点世界坐标;
// 国王=整个 kingStoryScene 的顶面中心(CSS2DObject 挂到该世界 scene,切世界自动跟随)
const anchorCache = new Map(); // actor.id -> THREE.Vector3
function resolveAnchor(actor) {
  if (anchorCache.has(actor.id)) return anchorCache.get(actor.id);
  const world = ctx.scene.worldManager.getWorld(actor.world);
  if (!world) return null;
  const s = world.scene;
  let root = null;
  s.traverse((o) => {
    if (root) return;
    if (o.name === 'b612Storybook' || o.name === 'kingStoryScene') root = o;
  });
  if (!root) return null;
  root.updateMatrixWorld(true);
  const c = new THREE.Vector3();
  if (actor.id === 'king') {
    const box = new THREE.Box3().setFromObject(root);
    box.getCenter(c);
    c.y = box.max.y + actor.off;
  } else if (actor.id === 'rose') {
    let g = null;
    root.traverse((o) => {
      if (!g && /rosss/i.test(o.name || '')) g = o;
    });
    if (!g) return null;
    g.getWorldPosition(c);
    c.y += actor.off;
  } else {
    // 王子:蒙皮网格的 geometry 包围盒是"绑定姿态"(bind pose),×matrixWorld 后是错误坐标。
    // 改从星球顶面(PlanetLP)推算王子站位:王子就立在绿星球顶上,锚在顶面中心的上前方。
    let top = -1e9,
      cx = 0,
      cz = 0,
      hit = false;
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!/PlanetLP/i.test(o.name || '')) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (b.max.y > top) {
        top = b.max.y;
        cx = (b.min.x + b.max.x) / 2;
        cz = (b.min.z + b.max.z) / 2;
        hit = true;
      }
    });
    if (!hit) return null;
    c.set(cx, top + actor.off, cz - 1.5); // 面朝玩家站立的方向,略前移
  }
  const st = bubbleOf(actor);
  st.obj.position.copy(c);
  s.add(st.obj);
  anchorCache.set(actor.id, c);
  return c;
}
bag.custom.push(() => anchorCache.clear());
// 调试钩子:探针可读锚点精确传送到角色旁(生产零影响)
window.__storyDialogs = {
  anchors: () => Object.fromEntries([...anchorCache].map(([k, v]) => [k, { x: v.x, y: v.y, z: v.z }])),
};

// ===================== 每帧:就近 Actor 触发 + 轮播 + 渲染 =====================
let lastWorld = '';
ctx.onTick(function storyDialogTick() {
  const w = ctx.scene.activeWorld || 'main';
  const isStory = w === 'b612' || /^king\d+/.test(w);
  labelRenderer.domElement.style.display = isStory ? '' : 'none';
  if (!isStory) {
    lastWorld = '';
    return;
  }
  const pl = ctx.player.pl;
  if (!pl) return;
  const now = performance.now();

  // 最近的一个 Actor 触发,其余隐藏
  let best = null,
    bestD = 1e9;
  for (const actor of ACTORS) {
    if (actor.world !== w) continue;
    const a = resolveAnchor(actor);
    if (!a) continue;
    const d = Math.hypot(pl.p.x - a.x, pl.p.y - a.y, pl.p.z - a.z);
    if (d < actor.radius && d < bestD) {
      bestD = d;
      best = actor;
    }
  }
  for (const actor of ACTORS) {
    const st = bubbleOf(actor);
    if (actor.world !== w) {
      st.obj.visible = false; // 非当前世界:Actor 的气泡归位其场景,跨世界切换时须隐藏残留
      continue;
    }
    const active = best && best.id === actor.id;
    st.obj.visible = !!active;
    if (active && now - st.at > actor.every) {
      st.at = now;
      st.idx = (st.idx + 1) % actor.lines.length;
      st.inner.textContent = actor.lines[st.idx];
      st.inner.classList.remove('show');
      void st.inner.offsetWidth; // 重启淡入
      st.inner.classList.add('show');
    }
  }

  // 仅当前世界激活时渲染(其 CSS2DObject 已挂在本世界 scene)
  if (w !== lastWorld) {
    lastWorld = w;
  }
  labelRenderer.render(ctx.scene.s, ctx.scene.cam);
});
