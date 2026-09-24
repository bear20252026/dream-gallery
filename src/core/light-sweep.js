// light-sweep.js — 灯光限额执行器(2026-09-24 自 main.js 下沉,热点减负)
// 只负责"执行删除":触屏判定 + 调 light-budget 纯逻辑选灯 + 从场景/列表移除。
// 光源总数直接决定着色器体积:实测单程序编译 59盏≈822ms / 24盏≈208ms / 13盏≈103ms。
// ⚠️ scripts/test/test-mobile.js 的静态门禁盯住本文件(ontouchstart + selectLightsToRemove),
//    与 core/light-budget.js(isPointLight + keepEvery)两处都在才算防线完整——别改名拆散。
import { expose } from '../debug-hooks.js';

export async function sweepLights(ctx) {
  const { s, pls } = ctx;
  const isMobile = 'ontouchstart' in window && Math.min(screen.width, screen.height) < 768;
  const { selectLightsToRemove } = await import('./light-budget.js');
  const { remove: rm, ceil } = selectLightsToRemove((cb) => s.traverse(cb), pls, { isMobile });
  rm.forEach((l) => l.parent && l.parent.remove(l));
  for (let i = pls.length - 1; i >= 0; i--) if (!ceil.has(pls[i].l)) pls.splice(i, 1);
  expose('lightBudget', {
    removed: rm.length,
    keepEvery: isMobile ? 3 : 2,
    spotKeep: isMobile ? 4 : 10,
  });
}
