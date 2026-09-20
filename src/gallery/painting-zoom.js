// painting-zoom.js — 画框飞入放大/缩回复位交互(2026-09-20 自 paintings.js 拆分,审计「大文件拆分」)
// 内聚状态:oFog(进入放大时的原雾密度)由本模块私有。
import { ctx } from '../ctx.js';

let oFog = null;
// 依赖注入(父模块 paintings.js 装配期调用 initPaintingZoom 传入;2026-09-20 拆分)
let s, cam, lerp, THREE, captionAllowed, showAI, hideAI;
export function initPaintingZoom(d) {
  s = d.s; cam = d.cam; lerp = d.lerp; THREE = d.THREE;
  captionAllowed = d.captionAllowed; showAI = d.showAI; hideAI = d.hideAI;
}

// 画框飞入放大
export function zoomIn(cg) {
  const d = cg.userData;
  d.zoomed = true;
  ctx.gallery.zG = cg;
  d.gazeT0 = Date.now(); // B612灵鉴 M2:凝视计时起点
  if (!oFog) oFog = s.fog.density;
  // 添加环境光晕
  const hl = new THREE.PointLight('#ffc8e0', 5, 8, 1.5);
  hl.position.set(0, 0.3, 0.8);
  cg.add(hl);
  cg.userData.hl = hl;
  // 添加背光（凸显轮廓）
  const bl = new THREE.PointLight('#80c8ff', 2, 6, 1.5);
  bl.position.set(0, 0, -0.5);
  cg.add(bl);
  cg.userData.bl = bl;
  // 动画参数
  const dur = 500; // 500ms飞入
  const t0 = performance.now();
  const sx = cg.position.x,
    sy = cg.position.y,
    sz = cg.position.z;
  const ss = cg.scale.x;
  // 目标：沿法线推进0.5m，正对相机，缩放2x
  const tx = d.ox + d.nx * 0.5,
    tz = d.oz + d.nz * 0.5;
  const ty = d.oy + 0.15; // 微微抬高
  // 旋转：轻微调整确保正对相机
  const angleToCam = Math.atan2(cam.position.x - d.ox, cam.position.z - d.oz);
  const tRot = angleToCam;
  const sRot = cg.rotation.y;
  // 最短角度差
  let dRot = tRot - sRot;
  while (dRot > Math.PI) dRot -= Math.PI * 2;
  while (dRot < -Math.PI) dRot += Math.PI * 2;
  const ts = sRot + dRot * 0.15; // 只旋转15%对齐
  if (d.aF) cancelAnimationFrame(d.aF);
  function animateIn() {
    const elapsed = performance.now() - t0;
    const p = Math.min(elapsed / dur, 1);
    // 缓出曲线（ease-out-cubic）
    const ease = 1 - Math.pow(1 - p, 3);
    cg.position.x = lerp(sx, tx, ease);
    cg.position.y = lerp(sy, ty, ease);
    cg.position.z = lerp(sz, tz, ease);
    cg.rotation.y = lerp(sRot, ts, ease);
    const sc = lerp(ss, 2.0, ease);
    cg.scale.set(sc, sc, sc);
    // 景深虚化：增加雾密度（背景变模糊）
    s.fog.density = lerp(oFog, 0.08, ease);
    if (p < 1) {
      d.aF = requestAnimationFrame(animateIn);
    } else {
      // 到达后物理摇晃（弹性回弹，像挂在弹簧上）
      springBounce(cg, tx, ty, tz, ts);
      // 显示AI文字介绍(普通模式下图库画框不显示配文——配文残留清理,2026-07-25)
      if (cg.userData.aiDesc && captionAllowed(cg)) showAI(cg.userData.aiDesc);
    }
  }
  animateIn();
}

// 物理摇晃：弹性回弹效果
function springBounce(cg, tx, ty, tz, ts) {
  let t = 0;
  function shake() {
    if (!cg.userData.zoomed) return;
    t += 0.08;
    const decay = Math.exp(-t * 1.5); // 衰减
    const offset = Math.sin(t * 8) * 0.02 * decay; // 振幅2cm，频率8Hz
    cg.position.y = ty + offset;
    cg.position.x = tx + Math.sin(t * 5) * 0.005 * decay;
    if (decay > 0.01) requestAnimationFrame(shake);
  }
  shake();
}

// 画框缩回复位;instant=true 时直接复位(切换放大对象时用,避免与新放大动画争抢)
export function zoomOut(cg, instant) {
  cg = cg || ctx.gallery.zG;
  if (!cg) return;
  const d = cg.userData;
  // B612灵鉴 M2:有效凝视(≥3秒)记一缕灵蕴
  if (d.gazeT0) {
    if (Date.now() - d.gazeT0 >= 3000) {
      const n = ctx.store.num('gaze') + 1;
      ctx.store.setNum('gaze', n);
      ctx.ui.modeToast && ctx.ui.modeToast('这一眼，B612记住了。');
    }
    d.gazeT0 = null;
  }
  if (d.aF) cancelAnimationFrame(d.aF);
  if (d.hl) {
    cg.remove(d.hl);
    d.hl = null;
  }
  if (d.bl) {
    cg.remove(d.bl);
    d.bl = null;
  }
  if (instant) {
    cg.position.set(d.ox, d.oy, d.oz);
    cg.rotation.y = d.ry;
    cg.scale.set(1, 1, 1);
    d.zoomed = false;
    if (ctx.gallery.zG === cg) ctx.gallery.zG = null;
    return;
  }
  const dur = 400; // 400ms缩回
  const t0 = performance.now();
  const sx = cg.position.x,
    sy = cg.position.y,
    sz = cg.position.z;
  const ss = cg.scale.x;
  const sRot = cg.rotation.y;
  function animateOut() {
    const elapsed = performance.now() - t0;
    const p = Math.min(elapsed / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    cg.position.x = lerp(sx, d.ox, ease);
    cg.position.y = lerp(sy, d.oy, ease);
    cg.position.z = lerp(sz, d.oz, ease);
    cg.rotation.y = lerp(sRot, d.ry, ease);
    const sc = lerp(ss, 1, ease);
    cg.scale.set(sc, sc, sc);
    // 恢复景深
    s.fog.density = lerp(s.fog.density, oFog, ease);
    if (p < 1) {
      d.aF = requestAnimationFrame(animateOut);
    } else {
      d.zoomed = false;
      if (ctx.gallery.zG === cg) {
        ctx.gallery.zG = null;
        hideAI();
      } // 竞态防护:期间已有新画放大则不抢状态
      s.fog.density = oFog;
    }
  }
  animateOut();
}
