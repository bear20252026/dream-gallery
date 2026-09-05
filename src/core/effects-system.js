// core/effects-system.js — 烟花 + 漂浮粒子系统(阶段3 切片:engine/animate)
// 原 scene/effects.js 的逐帧逻辑(updateFireworks + 粒子漂移)原本嵌在 LoopManager._executeUpdatePhase
// 里直接读 ctx.media.* —— 属于上帝渲染器的散点读取。现抽成独立 System:
//   · 经 deps 注入 scene 与场景常量,绝不直接读写冻结 ctx;
//   · init 建网格、update(dt) 由组合根唯一单循环驱动(与 toast/audio/perf 同一通道);
//   · dispose 清定时器、移除网格、释放几何,支持热替换/孤立测试。
import * as THREE from 'three';
import { defineSystem } from './system.js';

export function createEffectsSystem(deps = {}) {
  const { scene, floorW, floorD, IL, IR, IRT, IRB, OT, OBR, WH, bW, bD, pyrHeight } = deps;
  if (!scene || !scene.s) {
    throw new Error('[effects-system] 缺少 scene 依赖(scene.s 场景根)');
  }
  const root = scene.s; // THREE.Group,可写(冻结只约束 ctx 命名空间代理,不约束其内部对象)

  // ===================== 3D 烟花(四棱锥表面) =====================
  const fwParticles = []; // {x,y,z,vx,vy,vz,life,maxLife,size,cr,cg,cb,gen,hasSplit}
  const fwColors = [
    '#ff0040', '#ff3366', '#ff5500', '#ff7700', '#ffaa00', '#ffcc00', '#ffee00',
    '#aaff00', '#66ff00', '#00ff44', '#00ff88', '#00ffcc', '#00ffff',
    '#0088ff', '#0044ff', '#1100ff', '#4400ff', '#7700ff', '#aa00ff',
    '#ff00ff', '#ff00cc', '#ff0099', '#ff0066', '#ff3399', '#ff66cc',
    '#ffffff', '#fff8dc', '#ffd700', '#c0c0c0', '#ff69b4', '#00fa9a',
    '#39ff14', '#ff00ff', '#00ffff', '#ff1493', '#7fff00', '#ff4500',
  ];
  let fwFrame = 0;
  let fwGeo, fwPosArr, fwColArr, fwSizeArr, fwPoints;

  function randomPyramidPoint() {
    const face = Math.floor(Math.random() * 4);
    const u = Math.random(), v = Math.random() * (1 - u);
    const w2 = bW / 2, d2 = bD / 2, h = pyrHeight, cz = (OT + OBR) / 2, by = WH;
    let x, y, z;
    if (face === 0) { x = -w2 + w2 * 2 * v; y = by + h * (1 - u); z = cz - d2; }
    else if (face === 1) { x = w2; y = by + h * (1 - u); z = cz - d2 + d2 * 2 * v; }
    else if (face === 2) { x = w2 - w2 * 2 * v; y = by + h * (1 - u); z = cz + d2; }
    else { x = -w2; y = by + h * (1 - u); z = cz + d2 - d2 * 2 * v; }
    return { x, y, z };
  }

  function createFirework(ox, oy, oz, generation = 0) {
    const count = generation === 0 ? 24 : generation === 1 ? 12 : 6;
    const speed = generation === 0 ? 3 : generation === 1 ? 2 : 1.2;
    const life = generation === 0 ? 60 : generation === 1 ? 45 : 30;
    const size = generation === 0 ? 2.5 : generation === 1 ? 1.8 : 1.2;
    const color = fwColors[Math.floor(Math.random() * fwColors.length)];
    const col = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      const vel = Math.random() * speed + 0.5;
      const pitch = (Math.random() - 0.5) * Math.PI * 0.5;
      fwParticles.push({
        x: ox, y: oy, z: oz,
        vx: Math.cos(angle) * Math.cos(pitch) * vel,
        vy: Math.sin(pitch) * vel + 1.5,
        vz: Math.sin(angle) * Math.cos(pitch) * vel,
        life: life + Math.random() * 15,
        maxLife: life + 15,
        size: size + Math.random() * 0.5,
        cr: col.r, cg: col.g, cb: col.b,
        gen: generation,
        hasSplit: false,
      });
    }
  }

  function autoFirework() {
    const p = randomPyramidPoint();
    createFirework(p.x, p.y, p.z, 0);
  }

  function updateFireworks() {
    fwFrame++;
    let idx = 0;
    for (let i = fwParticles.length - 1; i >= 0; i--) {
      const p = fwParticles[i];
      p.vx *= 0.98; p.vy *= 0.98; p.vz *= 0.98;
      p.vy -= 0.04;
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
      p.life--;
      const alpha = p.life / p.maxLife;
      if (p.life <= 0) { fwParticles.splice(i, 1); continue; }
      if (p.life <= 4 && !p.hasSplit && p.gen < 2) {
        p.hasSplit = true;
        createFirework(p.x, p.y, p.z, p.gen + 1);
      }
      if (idx < 3000) {
        fwPosArr[idx * 3] = p.x; fwPosArr[idx * 3 + 1] = p.y; fwPosArr[idx * 3 + 2] = p.z;
        fwColArr[idx * 3] = p.cr; fwColArr[idx * 3 + 1] = p.cg; fwColArr[idx * 3 + 2] = p.cb;
        fwSizeArr[idx] = p.size * alpha;
        idx++;
      }
    }
    fwGeo.attributes.position.needsUpdate = true;
    fwGeo.attributes.color.needsUpdate = true;
    fwGeo.attributes.size.needsUpdate = true;
    fwGeo.setDrawRange(0, idx);
  }

  // ===================== 漂浮粒子 =====================
  let pG, pC, pPs;
  const PARTICLE_DRIFT = 0.001;

  function initParticles() {
    pG = new THREE.BufferGeometry();
    pC = 400;
    pPs = new Float32Array(pC * 3);
    for (let i = 0; i < pC; i++) {
      let px, pz, ok = false;
      for (let t = 0; t < 30; t++) {
        px = (Math.random() - 0.5) * floorW; pz = (Math.random() - 0.5) * floorD;
        const inInner = px >= IL - 0.5 && px <= IR + 0.5 && pz >= IRT - 0.5 && pz <= IRB + 0.5;
        if (!inInner) { ok = true; break; }
      }
      if (!ok) { px = 0; pz = OT + 2; }
      pPs[i * 3] = px; pPs[i * 3 + 1] = 0.5 + Math.random() * (WH - 0.5); pPs[i * 3 + 2] = pz;
    }
    pG.setAttribute('position', new THREE.BufferAttribute(pPs, 3));
    root.add(new THREE.Points(pG, new THREE.PointsMaterial({
      color: '#ffb6c8', size: 0.035, transparent: true, opacity: 0.4,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending,
    })));
  }

  function updateParticles(now) {
    if (!pG || !pC) return;
    const pp = pG.attributes.position.array;
    for (let i = 0; i < pC; i++) {
      pp[i * 3 + 1] += Math.sin(now * 0.0004 + i * 0.6) * PARTICLE_DRIFT;
      if (pp[i * 3 + 1] > WH - 0.3) pp[i * 3 + 1] = 0.5;
    }
    pG.attributes.position.needsUpdate = true;
  }

  function initFireworks() {
    fwGeo = new THREE.BufferGeometry();
    fwPosArr = new Float32Array(3000 * 3);
    fwColArr = new Float32Array(3000 * 3);
    fwSizeArr = new Float32Array(3000);
    fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPosArr, 3));
    fwGeo.setAttribute('color', new THREE.BufferAttribute(fwColArr, 3));
    fwGeo.setAttribute('size', new THREE.BufferAttribute(fwSizeArr, 1));
    const fwPointsMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 3, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    fwPoints = new THREE.Points(fwGeo, fwPointsMat);
    root.add(fwPoints);
  }

  let autoTimer = null, autoFirst = null;

  return defineSystem({
    name: 'effects',
    layer: 'engine',
    phase: 'animate',
    order: 0,
    deps: { scene },
    init() {
      initFireworks();
      initParticles();
      // 自动烟花的定时器改为惰性启动(update 首帧):开场电影期间主循环未启动,
      // 若在此起 setInterval 会空攒粒子,世界启动瞬间集中爆开
    },
    update() {
      // 多世界切割(2026-09-06):烟花/漂浮粒子属主世界金字塔,小世界里不再模拟与 GPU 上传
      if ((scene.activeWorld || 'main') !== 'main') return;
      if (!autoFirst && !autoTimer) {
        autoFirst = setTimeout(autoFirework, 800);
        autoTimer = setInterval(autoFirework, 2800);
      }
      updateFireworks();
      updateParticles(performance.now());
    },
    dispose() {
      if (autoTimer) clearInterval(autoTimer);
      if (autoFirst) clearTimeout(autoFirst);
      autoTimer = autoFirst = null;
      if (fwPoints) { root.remove(fwPoints); fwGeo && fwGeo.dispose(); fwPoints = null; }
      if (pG) {
        // 找到并移除粒子 Points(它是在 init 时 add 到 root 的那个对象)
        root.children
          .filter((o) => o.isPoints && o.geometry === pG)
          .forEach((o) => { root.remove(o); o.geometry.dispose(); o.material.dispose(); });
        pG = null;
      }
      fwParticles.length = 0;
    },
  });
}
