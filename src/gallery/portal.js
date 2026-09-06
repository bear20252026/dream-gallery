// portal.js — 主世界石门「✦ 进入 B612」(2026-09-07 P2 审计整改:从 planets.js 迁出)
// 职责边界:这里只管**主世界侧**的入口——石门自动传送(armed 武装状态机)与石台按钮;
// B612/星球内的导航按钮与返回逻辑仍在 planets.js。数据与纯逻辑在 shared/planet-logic.mjs。
// 依赖说明:worldManager 经 ctx.scene.worldManager 惰性取(planets.js 导入期注册,
// 本模块在 main.js 加载链中排其之后),不与 kunlun 域建立 import 依赖。
import { ctx } from '../ctx.js';
import { eventBus } from '../event-bus.js';
import { Z } from '../shared/z-layers.mjs';
import { GATE_RADIUS, gateStep, spawnFor, exitGateNudge } from '../shared/planet-logic.mjs';

let gateArmed = true; // 见 planet-logic.gateStep:触发即解除,走出半径重新武装(防返回回弹)

const padBtn = document.createElement('button');
padBtn.textContent = '✦ 进入 B612';
padBtn.style.cssText =
  'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:' +
  Z.navBtn +
  ';display:none;padding:14px 36px;border-radius:24px;border:2px solid rgba(255,214,130,.9);background:rgba(30,18,8,.92);color:#ffe9c4;font-size:18px;letter-spacing:4px;cursor:pointer;font-family:inherit';
padBtn.onclick = function () {
  const wm = ctx.scene.worldManager;
  if (!wm || wm.transitioning) return; // navGuard 语义:切换中不重复触发
  padBtn.style.display = 'none';
  const sp = spawnFor('b612');
  wm.enter('b612', {
    snapshot: {
      camera: null,
      player: {
        position: { x: sp.position.x, y: sp.position.y, z: sp.position.z },
        yaw: sp.yaw,
        pitch: 0,
        vy: 0,
        onGround: true,
        gliding: false,
      },
    },
  });
};
document.body.appendChild(padBtn);

// 从 B612/星球返回主世界:解除武装(落点就在石门旁,不解除下一帧又弹回——
// 2026-09-06「返回主世界黑屏」根因)+ 把落点推出石门半径,回身即见「✦ 进入 B612」
eventBus.on('world:changed', function (e) {
  if (!e || e.to !== 'main') return;
  gateArmed = false;
  const pl = ctx.player.pl;
  if (!pl) return;
  const np = exitGateNudge(pl.p.x, pl.p.z, GATE_RADIUS + 2);
  if (np.moved) {
    pl.p.x = np.x;
    pl.p.z = np.z;
    const gy = ctx.media.desert && ctx.media.desert.getH && ctx.media.desert.getH(pl.p.x, pl.p.z);
    if (typeof gy === 'number') pl.p.y = gy + 1.6;
  }
});

ctx.onTick(function portalTick() {
  if ((ctx.scene.activeWorld || 'main') !== 'main') {
    padBtn.style.display = 'none';
    return;
  }
  const pl = ctx.player.pl;
  if (!pl) return;
  const step = gateStep(gateArmed, pl.p.x, pl.p.z);
  if (!step.near) {
    gateArmed = true;
    padBtn.style.display = 'block';
    return;
  }
  if (step.fire) {
    gateArmed = false; // 触发即解除;从 B612 返回落在圈内不再回弹
    padBtn.style.display = 'none';
    padBtn.onclick();
  }
});
