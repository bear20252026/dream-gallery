// 冒烟门禁(2026-08-30 反回归地基):本地/CI 可跑的页面健康检查
// 断言:canvas 创建 / ctx 装配 / 动态光源 ≤ 40(灯光预算门禁)/ 无未捕获页面异常
// 用法:BASE_URL=http://127.0.0.1:3311 PW_BROWSER=chromium node scripts/probe/smoke-gate.js
const { BASE_URL, launch } = require('./browser');

(async () => {
  const b = await launch(['--use-gl=swiftshader', '--enable-unsafe-swiftshader']);
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => {
    const m = String(e);
    if (m.includes('beacon') || m.includes('cloudflareinsights')) return; // CF 统计脚本被 CSP 拦属预期
    errs.push(m.slice(0, 220));
  });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(14000); // 等开屏与主循环就绪

  const st = await page.evaluate(() => {
    const c = window.__ctx;
    let lights = 0;
    if (c && c.scene && c.scene.s) {
      c.scene.s.traverse((o) => {
        if (o.isPointLight || o.isSpotLight || o.isDirectionalLight) lights++;
      });
    }
    return {
      hasCanvas: !!document.querySelector('#c canvas'),
      hasCtx: !!c,
      lights,
      budget: window.__lightBudget || null,
      hasRaf: typeof window.requestAnimationFrame === 'function',
    };
  });

  let fail = 0;
  const ok = (name, cond) => {
    console.log((cond ? '✓' : '✗') + ' ' + name);
    if (!cond) fail++;
  };
  ok('canvas 已创建', st.hasCanvas);
  ok('ctx 已装配', st.hasCtx);
  ok('动态光源 ≤ 40(防灯光爆炸回归)', st.lights > 0 && st.lights <= 40);
  ok('无未捕获页面异常', errs.length === 0);
  console.log(`灯光总数: ${st.lights} | 灯光预算记录: ${JSON.stringify(st.budget)}`);
  if (errs.length) console.log('页面异常:\n' + errs.slice(0, 5).join('\n'));
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('冒烟执行失败:', e && e.message);
  process.exit(1);
});
