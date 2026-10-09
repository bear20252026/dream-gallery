// story-guides.js — 剧情浮光指引(2026-10-10 自 planets.js 切出,逐字迁移)
// 主世界章节期星门 + B612 小王子锚点:信标管远看 + 悬浮箭管精确落点(零 PointLight 铁律)。
// 罗盘单一权威 ctx.ui.storyTarget 的写入保留在本模块(单写者不变)。
// deps 注入(2026-10-10 审查 P2 巨石第二批):planets.js 的章节/门现身/岛表/主场景均为
// 可变模块状态,经 getter 注入;消费方(scene6/7/late-planets/8 个探针)只认场景对象名,零感知。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { ENDING_GATE_CHAPTER } from '../shared/ending-logic.mjs';
import { spawnFloatArrow, tickArrow, removeFloatArrow } from '../scene/guide-arrow.js';

let DEPS = null;
export function initStoryGuides(deps) {
  DEPS = deps;
}
let gateGuideBeacon = null,
  gateGuideArrow = null; // 主世界星门
let princeBeacon = null,
  princeArrow = null; // B612 小王子
function makeGuideBeacon(scene, x, z, gy, h, r, opacity, name) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.55, r, h, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    })
  );
  m.position.set(x, gy + h / 2 + 0.2, z);
  m.userData.baseOpacity = opacity;
  m.name = name;
  scene.add(m);
  return m;
}
function dropGuideBeacon(scene, b) {
  if (!b) return;
  scene.remove(b);
  b.geometry.dispose();
  b.material.dispose();
}
export function updateStoryGuides() {
  const active = ctx.scene.activeWorld || 'main';
  const p = ctx.player.pl && ctx.player.pl.p;
  const t = performance.now() * 0.001;
  const pulse = 0.75 + Math.sin(t * 1.7) * 0.25;
  // —— 目标点解析(罗盘单一权威;2026-09-30 照原神「一步一目标」定式) ——
  // 星球岛内目标=当前章星屑(chain 收束后 scene6/7 才置 visible,信标也是它们自己立的)。
  let page1Done = false;
  try {
    page1Done = !!ctx.store.flag('page1');
  } catch (e) {}
  let target = null;
  // 结局线(2026-10-03):327 完成后故事回到沙漠(画册页 → 井 → 告别),主世界不再指石门
  const endingOn = page1Done && DEPS.getChapter() >= ENDING_GATE_CHAPTER;
  if (p && DEPS.getChapter() < 6) {
    if (active === 'main' && DEPS.isGateRevealed() && page1Done && !endingOn)
      target = {
        world: 'main',
        x: 0.1,
        z: 56,
        en: 'Stone Gate — on to B612',
        zh: '石门 · 前往 B612',
      };
    else if (active === 'b612') target = null;
    else if (/^king\d+$/.test(active)) {
      const i = DEPS.getIslands()[DEPS.getChapter()];
      const ready = active !== 'king325' || !!window.__scene6?.state?.pickupArmed;
      if (ready && i && i.mote && i.mote.visible && i.moteW)
        target = { world: active, x: i.moteW.x, z: i.moteW.z, en: 'Stardust', zh: '星屑' };
    }
  }
  const journeyGoal = ctx.ui.journey?.goal();
  // hidden:true = 结局线找井时罗盘熄灭(只能靠听)
  if (journeyGoal && journeyGoal.world === active)
    target = /** @type {any} */ (journeyGoal).hidden ? null : journeyGoal;
  try {
    ctx.ui.storyTarget && ctx.ui.storyTarget(target);
  } catch (e) {}
  // ① 主世界星门:门已按剧情现身 + 书页一完成(夜信标已退役,不重复)+ 未终章 + 离门 15m 外
  //    (原神:目标 ≥50m 才给黄色光柱,走近交给近距离线索;本世界尺度小取 15m)
  const wantGate = !!(
    p &&
    active === 'main' &&
    DEPS.getChapter() < 6 &&
    !endingOn &&
    DEPS.isGateRevealed() &&
    page1Done &&
    (p.x - 0.1) * (p.x - 0.1) + (p.z - 56) * (p.z - 56) > 225
  );
  if (wantGate && !gateGuideArrow) {
    gateGuideBeacon = makeGuideBeacon(
      DEPS.getScene(),
      0.1,
      56,
      DEPS.getMainGateY(),
      4.2,
      0.3,
      0.25,
      'storyBeaconStarGate'
    );
    gateGuideArrow = spawnFloatArrow(DEPS.getScene(), 0.1, DEPS.getMainGateY() + 5.6, 56, {
      name: 'guideArrowStarGate',
      size: 1.4,
    });
  } else if (!wantGate && (gateGuideArrow || gateGuideBeacon)) {
    removeFloatArrow(DEPS.getScene(), gateGuideArrow);
    gateGuideArrow = null;
    dropGuideBeacon(DEPS.getScene(), gateGuideBeacon);
    gateGuideBeacon = null;
  }
  if (gateGuideBeacon)
    gateGuideBeacon.material.opacity = gateGuideBeacon.userData.baseOpacity * pulse;
  if (gateGuideArrow) tickArrow(gateGuideArrow, t);
  // ② B612 小王子:章节未满即立(故事心脏);走近原点 5m 内撤(入场白/按钮已接管)
  const wantPrince = !!(
    p &&
    active === 'b612' &&
    page1Done &&
    DEPS.getChapter() < 6 &&
    p.x * p.x + p.z * p.z > 25
  );
  if (wantPrince && !princeArrow) {
    const bw = DEPS.getWorldManager().getWorld('b612').scene;
    princeBeacon = makeGuideBeacon(bw, 0, 0, 0, 3.2, 0.35, 0.3, 'storyBeaconPrince');
    princeArrow = spawnFloatArrow(bw, 0, 4.6, 0, { name: 'guideArrowPrince', size: 1.4 });
  } else if (!wantPrince && (princeArrow || princeBeacon)) {
    const bw = DEPS.getWorldManager().getWorld('b612').scene;
    removeFloatArrow(bw, princeArrow);
    princeArrow = null;
    dropGuideBeacon(bw, princeBeacon);
    princeBeacon = null;
  }
  if (princeBeacon) princeBeacon.material.opacity = princeBeacon.userData.baseOpacity * pulse;
  if (princeArrow) tickArrow(princeArrow, t);
}

// HMR/卸载清理(planets.js 的 bag.custom 调用)
export function dropAllStoryGuides() {
  const s = DEPS.getScene();
  removeFloatArrow(s, gateGuideArrow);
  dropGuideBeacon(s, gateGuideBeacon);
  const bw =
    DEPS.getWorldManager() &&
    DEPS.getWorldManager().getWorld &&
    DEPS.getWorldManager().getWorld('b612');
  if (bw) {
    removeFloatArrow(bw.scene, princeArrow);
    dropGuideBeacon(bw.scene, princeBeacon);
  }
}
