// portal.js — 主世界石门「✦ 进入 B612」(2026-09-07 P2 审计整改:从 planets.js 迁出)
// 职责边界:这里只管**主世界侧**的入口——石门自动传送(armed 武装状态机)与石台按钮;
// B612/星球内的导航按钮与返回逻辑仍在 planets.js。数据与纯逻辑在 shared/planet-logic.mjs。
// 依赖说明:worldManager 经 ctx.scene.worldManager 惰性取(planets.js 导入期注册,
// 本模块在 main.js 加载链中排其之后),不与 kunlun 域建立 import 依赖。
import { ctx } from '../ctx.js';
import { eventBus } from '../event-bus.js';
import { Z } from '../shared/z-layers.mjs';
import { tt } from '../shared/story-text.mjs';
import {
  GATE_RADIUS,
  GATE_POS,
  gateStep,
  spawnFor,
  exitGateNudge,
} from '../shared/planet-logic.mjs';

let gateArmed = true; // 见 planet-logic.gateStep:触发即解除,走出半径重新武装(防返回回弹)

const padBtn = document.createElement('button');
padBtn.id = 'gateBtn'; // 布局样式(ui/hud-layout.js)按 id 定位
const padLabel = () => tt({ zh: '✦ 进入 B612', en: '✦ Enter B612' });
padBtn.textContent = padLabel();
window.addEventListener('script:lang', () => {
  padBtn.textContent = padLabel();
});
// 按钮亮着时它就是唯一的下一步:罗盘条(「转身 · 15m」)让位,免得两条指令打架
function showPad(on) {
  padBtn.style.display = on ? 'block' : 'none';
  if (on) document.body.dataset.gateReady = '1';
  else delete document.body.dataset.gateReady;
}
const padStyle = document.createElement('style');
padStyle.textContent = 'body[data-gate-ready] #storyCompass{display:none!important}';
document.head.appendChild(padStyle);
padBtn.style.cssText =
  'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:' +
  Z.navBtn +
  ';display:none;padding:14px 36px;border-radius:24px;border:2px solid rgba(255,214,130,.9);background:rgba(30,18,8,.92);color:#ffe9c4;font-size:18px;letter-spacing:4px;cursor:pointer;font-family:inherit';
padBtn.onclick = function () {
  if (ctx.ui.dialogOpen?.() || ctx.overlay.anyOpen()) return;
  const wm = ctx.scene.worldManager;
  if (!wm || wm.transitioning) return; // navGuard 语义:切换中不重复触发
  showPad(false);
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
  if (ctx.ui.dialogOpen?.() || ctx.overlay.anyOpen()) {
    showPad(false);
    return;
  }
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
    showPad(false);
    return;
  }
  // 石门未现身:按钮不挂、走近不传(2026-09-27 按剧情出场;营地守卫防现身瞬间误传)
  try {
    if (ctx.kunlun.isStarGateOut && !ctx.kunlun.isStarGateOut()) {
      showPad(false);
      gateArmed = false;
      return;
    }
  } catch (e) {
    console.debug('[portal] 石门出场判定失败(按已现身放行):', e);
  }
  const pl = ctx.player.pl;
  if (!pl) return;
  const step = gateStep(gateArmed, pl.p.x, pl.p.z);
  // 按钮只在门前 15m 内亮(2026-09-30 主人报「布局混乱」):远处由罗盘+光柱吸引,
  // 走近才亮按钮交接 —— 旧版任何时候都挂屏底,与罗盘/信标三路同指一块屏幕。
  // 15m 与 planets.js 光柱门控阈值对齐(>15m 光柱,≤15m 按钮,≤4m 自动传送)。
  if (!step.near) {
    gateArmed = true;
    const dx = pl.p.x - GATE_POS.x,
      dz = pl.p.z - GATE_POS.z;
    // 对白/弹层期间不亮(首访实测:羊箱对白还没收尾,「进入」大按钮已压在台词上方)
    const busy = !!(ctx.ui.dialogOpen?.() || ctx.overlay.anyOpen());
    showPad(dx * dx + dz * dz < 225 && !busy);
    return;
  }
  if (step.fire) {
    gateArmed = false; // 触发即解除;从 B612 返回落在圈内不再回弹
    showPad(false);
    padBtn.onclick();
  }
});
