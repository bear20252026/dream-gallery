// gate-flash-probe.cjs — 闸门恢复闪现回归探针(2026-09-24)
// 主人报告:三协议面板点「返回」后,一瞬间先切到真实 3D 画廊再回首屏。
// 根因:面板 display:none 瞬关,闸门却走 1.2s 淡入(头几帧全透明,露出底下 3D 世界)。
// 契约:面板关闭后,**同一帧**闸门即恢复不透明(opacity ≥ 0.95),后续帧绝不下跌。
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'http://localhost:5173';
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    for (const k of ['agreementConsented', 'privacyConsented', 'communityConsented'])
      sessionStorage.setItem(k, '1');
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });

  let pass = 0,
    fail = 0;
  const ok = (n, c, x) => {
    if (c) { pass++; console.log('  ✅ ' + n); }
    else { fail++; console.log('  ❌ ' + n + (x ? ' → ' + x : '')); }
  };
  const op = () =>
    page.evaluate(() => {
      const g = document.getElementById('b612Gate');
      return g ? getComputedStyle(g).opacity : 'gone';
    });

  ok('A. 闸门初始不透明', (await op()) === '1');

  // 打开协议面板(点第一个协议名)
  await page.click('#b612Gate .gLegal a[data-doc]');
  await page.waitForSelector('#b612Pact', { timeout: 15000 });
  // onHide 淡出是 1.2s,等它落到 ~0(面板遮着,跌多少都不影响本契约)
  await page.waitForFunction(
    () => {
      const g = document.getElementById('b612Gate');
      return g && parseFloat(getComputedStyle(g).opacity) < 0.05;
    },
    null,
    { timeout: 5000 }
  );
  ok('B. 面板打开后闸门暂隐(既有设计)', true);

  // 点「‹ 返回闸门」关闭面板,同一帧采样闸门透明度
  await page.click('#b612Pact .pClose');
  const o1 = await op();
  ok('C. 关面板同一帧闸门即恢复不透明(修闪现的关键)', parseFloat(o1) >= 0.95, 'opacity=' + o1);

  // 随后 10 帧(约 160ms)持续采样,绝不下跌
  const samples = await page.evaluate(async () => {
    const out = [];
    const g = () => {
      const el = document.getElementById('b612Gate');
      return el ? parseFloat(getComputedStyle(el).opacity) : -1;
    };
    for (let i = 0; i < 10; i++) {
      out.push(g());
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  });
  ok('D. 后续 10 帧稳定不透明', samples.every((v) => v >= 0.95), samples.join(','));

  ok('E. 无 pageerror', errors.length === 0, errors[0]);

  console.log(`\n=== 闸门恢复闪现探针:${pass} 通过 / ${fail} 失败 ===`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
