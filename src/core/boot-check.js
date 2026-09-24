// boot-check.js — 启动自检(2026-09-24 自 main.js 下沉,热点减负;原 P3 审计项)
// 世界模块清单靠人肉同步,漏载的后果是静默的(2026-09-06「石门消失」= 漏载 planets.js)。
// 预加载完成后对关键装配断言,缺谁喊谁;结果挂 window.__bootCheck 供探针/诊断读取。
export function runBootCheck(ctx) {
  const missing = [];
  const need = function (name, getter) {
    try {
      if (!getter()) missing.push(name);
    } catch (e) {
      missing.push(name);
    }
  };
  need('scene.rnd(渲染器)', function () {
    return ctx.scene.rnd;
  });
  need('scene.s(活动场景)', function () {
    return ctx.scene.s;
  });
  need('scene.worldManager(世界注册表)', function () {
    return ctx.scene.worldManager;
  });
  need('scene.renderPostProcessing(后处理)', function () {
    return ctx.scene.renderPostProcessing;
  });
  need('player.pl(玩家)', function () {
    return ctx.player && ctx.player.pl;
  });
  need('desert.getH(地形)', function () {
    return ctx.media && ctx.media.desert && ctx.media.desert.getH;
  });
  need('kunlun.spiritsState(灵蕴契约)', function () {
    return ctx.kunlun && ctx.kunlun.spiritsState;
  });
  need('media.vidEl(户外大屏)', function () {
    return ctx.media && ctx.media.vidEl;
  });
  window.__bootCheck = { ok: missing.length === 0, missing: missing };
  if (missing.length)
    console.error('[startWorld] 启动自检缺项(模块漏载或初始化失败):', missing.join(', '));
}
