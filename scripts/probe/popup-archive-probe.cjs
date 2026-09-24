// popup-archive-probe.cjs — 两弹窗归档验收(2026-09-24,主人令"归档不要弹出")
// 契约:①#nickPop(古老的低语…真言)不再自动弹出;②#guideCard(元素共鸣说明书)不再自动弹出;
//      ③替代入口完好(罗盘设置面板 + 说明书菜单按钮);④无 pageerror。
// 触发窗:原逻辑 4s 起等叫醒词,最长 25s 兜底 → 静置 45s 仍无弹窗即归档成立。
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
    // 注意:故意**不**设 nickPopOff —— 归档后不需要这道防线也绝不弹
  });
  await page.goto(URL + '/?noopening&noprologue', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(
    () => window.__bootCheck && window.__bootCheck.ok === true,
    null,
    { timeout: 120000 }
  );

  let pass = 0,
    fail = 0;
  const ok = (n, c, x) => {
    if (c) { pass++; console.log('  ✅ ' + n); }
    else { fail++; console.log('  ❌ ' + n + (x ? ' → ' + x : '')); }
  };

  // 静置 45s:覆盖原触发窗(4s 起等 + 21s 兜底)
  await page.waitForTimeout(45000);
  const state = await page.evaluate(() => ({
    nickShown: (() => {
      const p = document.getElementById('nickPop');
      return !!(p && p.classList.contains('show'));
    })(),
    guideCard: !!document.getElementById('guideCard'),
    gearPanel: !!document.getElementById('gearPanel'),
    gmGuide: !!document.getElementById('gmGuide'),
    gearNick: !!document.getElementById('gearNickSave'),
  }));
  ok('A. 昵称弹窗(古老的低语…)45s 内零弹出', !state.nickShown);
  ok('B. 指引卡(元素共鸣说明书)45s 内零弹出', !state.guideCard);
  ok('C. 替代入口:罗盘设置面板存在', state.gearPanel);
  ok('D. 替代入口:说明书菜单按钮存在', state.gmGuide);
  ok('E. 替代入口:昵称面板保存钮存在', state.gearNick);
  ok('F. 无 pageerror', errors.length === 0, errors[0]);

  console.log(`\n=== 弹窗归档探针:${pass} 通过 / ${fail} 失败 ===`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
