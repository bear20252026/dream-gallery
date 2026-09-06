// 冒烟门禁(2026-08-30 反回归地基;2026-09-06 随开场顺序修正重写)
// 启动顺序现为:闸门(勾选→ENTER) → [电影,可跳] → startWorld(世界启动)。
// 本探针走真实开场但用 ?noopening 测试旁路跳过电影(与 watchOpening 文档一致),
// 然后轮询等世界真正启动(loopManager FPS>0),再做健康断言。
// 断言:canvas 创建 / ctx 装配 / 动态光源 ≤ 40(灯光预算门禁)/ 无未捕获页面异常
// 用法:BASE_URL=http://127.0.0.1:3311 PW_BROWSER=chromium node scripts/probe/smoke-gate.js
const { BASE_URL, launch } = require('./browser');

(async () => {
  const b = await launch(['--use-gl=swiftshader', '--enable-unsafe-swiftshader']);
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  const diag = []; // 失败诊断:控制台错误/失败请求全记录
  page.on('pageerror', (e) => {
    const m = String(e);
    if (m.includes('beacon') || m.includes('cloudflareinsights')) return; // CF 统计脚本被 CSP 拦属预期
    if (m.includes('Failed to fetch dynamically imported module')) return; // 裸服环境噪音(生产打包不存在)
    errs.push(m.slice(0, 220));
  });
  page.on('console', (m) => {
    if (m.type() === 'error') diag.push('[console.error] ' + m.text().slice(0, 180));
  });
  page.on('requestfailed', (r) => diag.push('[requestfailed] ' + r.url().slice(0, 140) + ' ' + (r.failure() && r.failure().errorText)));
  page.on('response', (r) => {
    if (r.status() >= 400) diag.push('[http ' + r.status() + '] ' + r.url().slice(0, 140));
  });
  await page.goto(BASE_URL + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ① 过闸门:勾选同意 → ENTER(每次进入都显示,勾选后 ENTER 才点亮)
  try {
    await page.waitForSelector('#b612Gate', { timeout: 60000 });
  } catch (e) {
    // 闸门未出现:打印诊断转储再失败(便于 CI 排查模块图/静态服务问题)
    const dump = await page.evaluate(() => ({
      url: location.href,
      readyState: document.readyState,
      navType: (performance.getEntriesByType('navigation')[0] || {}).type,
      navCount: performance.getEntriesByType('navigation').length,
      title: document.title,
      hasCtx: !!window.__ctx,
      hasC: !!document.querySelector('#c'),
      cChildren: document.querySelector('#c') ? document.querySelector('#c').children.length : -1,
      gate: !!document.getElementById('b612Gate'),
      load: document.getElementById('l') ? document.getElementById('l').style.display : 'no-#l',
      bodyKids: [...document.body.children].slice(0, 14).map((x) => x.id || x.tagName).join(','),
    }));
    // 服务端直取一个"被中止"的模块:区分浏览器侧中止 vs 服务端响应异常
    const probeMod = await page.request
      .get(BASE_URL + '/src/core/game-state.js')
      .then(async (r) => r.status() + ' len=' + (await r.body()).length)
      .catch((e) => 'fetch-err: ' + e.message);
    console.error('闸门 60s 未出现,诊断转储:\n' + JSON.stringify(dump, null, 1));
    console.error('服务端直取 /src/core/game-state.js → ' + probeMod);
    if (errs.length) console.error('页面异常:\n' + errs.slice(0, 8).join('\n'));
    if (diag.length) console.error('网络/控制台诊断:\n' + diag.slice(0, 20).join('\n'));
    throw e;
  }
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => {
    document.querySelector('#b612Gate .gEnter').click();
  });

  // ② 等世界真正启动:主循环 FPS>0(startWorld 在 finishIntro 时调用)
  await page.waitForFunction(
    () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0,
    null,
    { timeout: 90000 }
  );
  await page.waitForTimeout(4000); // 灯光/场景稳定

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
      world: c && c.scene ? c.scene.activeWorld : null,
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
  ok('世界已启动(main)', st.world === 'main');
  ok('动态光源 ≤ 40(防灯光爆炸回归)', st.lights > 0 && st.lights <= 40);
  ok('无未捕获页面异常', errs.length === 0);
  console.log(`世界: ${st.world} | 灯光总数: ${st.lights} | 灯光预算记录: ${JSON.stringify(st.budget)}`);
  if (errs.length) console.log('页面异常:\n' + errs.slice(0, 5).join('\n'));
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('冒烟执行失败:', e && e.message);
  process.exit(1);
});
