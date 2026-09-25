// enter-flash-probe.cjs — ENTER 进场闪现回归探针(2026-09-24,主人报「ENTER 后闪一下」)
// 两条衔接缝逐帧体检:
//   缝A:闸门→电影 —— 电影层(z=580)挂载须淡入(0.45s),不得瞬间盖住纸色闸门(纸→黑硬切)。
//   缝B:电影结束→世界揭幕 —— 收束淡出开始时主流程已提前 startWorld(交叉溶解):
//        电影层消失瞬间 #c 必须 cOp≥0.85,之后无 cOp<0.5 暗帧、无 >0.35 亮度跳变。
// 剧本:点 ENTER → 等电影挂载 → 点「帽子」选项(电影在二选一处等玩家,不点永远停驻) → 盯到电影消失。
const { launch } = require('./browser.js');
(async () => {
  const URL = process.env.PROBE_URL || 'https://cloudbear.cloud';
  const b = await launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.check('#b612Gate #gAgreeChk');
  await page.click('#b612Gate .gEnter');
  console.log('[probe] 已点 ENTER');

  // 缝A:电影挂载后立刻采样前几帧透明度(应从 0 淡入)
  await page.waitForSelector('#b612film', { timeout: 30000 });
  const fadein = await page.evaluate(async () => {
    const f = document.getElementById('b612film');
    const out = [];
    for (let i = 0; i < 12; i++) {
      out.push((parseFloat(getComputedStyle(f).opacity) || 0).toFixed(2));
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  });
  console.log('缝A 电影挂载后 12 帧透明度:', fadein.join(' → '));

  // 点「帽子」(电影在二选一处等玩家)
  await page.waitForSelector('#cHat', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.click('#cHat').catch(() => console.log('!! 帽子选项点击失败'));
  console.log('[probe] 已选帽子,等电影收束…');

  // 缝B:电影收束淡出全程逐帧采样(80ms),盯到 DOM 移除后 3s
  await page.evaluate(() => {
    window.__snap = [];
    window.__snapTimer = setInterval(() => {
      const f = document.getElementById('b612film');
      const c = document.getElementById('c');
      const cs = c ? getComputedStyle(c) : null;
      window.__snap.push({
        t: Date.now(),
        film: !!f,
        fOp: f ? (parseFloat(getComputedStyle(f).opacity) || 0).toFixed(2) : '-',
        cVis: cs ? cs.visibility : '?',
        cOp: cs ? (parseFloat(cs.opacity) || 0).toFixed(2) : '?',
      });
    }, 80);
  });
  try {
    await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 150000 });
    console.log('[probe] 电影层已移除');
  } catch (e) { console.log('!! 150s 内电影未结束'); }
  await page.screenshot({ path: 'scripts/artifacts/enter-flash-end-0ms.png' }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'scripts/artifacts/enter-flash-end-600ms.png' }).catch(() => {});
  await page.waitForTimeout(2400);
  const snap = await page.evaluate(() => { clearInterval(window.__snapTimer); return window.__snap; });
  await page.screenshot({ path: 'scripts/artifacts/enter-flash-end-3000ms.png' }).catch(() => {});

  // 淡出窗 = 最后 film=true 到 DOM 移除后 1s
  let lastFilm = -1;
  snap.forEach((s, i) => { if (s.film) lastFilm = i; });
  const win = snap.slice(Math.max(0, lastFilm - 25), Math.min(snap.length, lastFilm + 14));
  console.log('=== 缝B 时间线(电影收束 ±1s,每 80ms) ===');
  for (const s of win) console.log(`  film=${s.film} fOp=${s.fOp} cVis=${s.cVis} cOp=${s.cOp}`);

  const after = snap.filter((s) => !s.film);
  const atGone = after[0] || {};
  const darkGap = after.filter((s) => parseFloat(s.cOp) < 0.5);
  const jumps = [];
  for (let i = 1; i < after.length; i++) {
    if (Math.abs(parseFloat(after[i].cOp) - parseFloat(after[i - 1].cOp)) > 0.35)
      jumps.push(after[i].cOp + '<-' + after[i - 1].cOp);
  }
  // 黑场预热契约(2026-09-25):世界揭幕(cVis 翻 visible)必须发生在电影移除前 ≥1.5s
  // ——即在「沉入全黑」静止期内已启动世界,首帧编译卡顿被纯黑盖住,交棒零卡顿。
  const cVisFlipIdx = snap.findIndex((s) => s.cVis === 'visible');
  const goneIdx = snap.findIndex((s) => !s.film);
  const revealLead = cVisFlipIdx >= 0 && goneIdx > cVisFlipIdx ? (goneIdx - cVisFlipIdx) * 80 : 0;
  console.log('揭幕领先电影移除:', revealLead + 'ms(cVis 翻转于第 ' + cVisFlipIdx + ' 帧)');
  let pass = 0, fail = 0;
  const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? ' → ' + x : '')); } };
  ok('缝A 电影层淡入(挂载后首帧 opacity<1)', parseFloat(fadein[0]) < 0.9, '首帧=' + fadein[0]);
  ok('缝B 黑场预热:揭幕领先电影移除 ≥1.5s', revealLead >= 1500, revealLead + 'ms');
  ok('缝B 交叉溶解:电影消失瞬间世界已亮起(cOp≥0.85)', parseFloat(atGone.cOp) >= 0.85, 'cOp=' + atGone.cOp + ' cVis=' + atGone.cVis);
  ok('缝B 无暗帧(电影消失后 cOp 恒 ≥0.5)', darkGap.length === 0, darkGap.length + ' 帧暗');
  ok('缝B 无亮度跳变(>0.35)', jumps.length === 0, jumps.join(', '));
  ok('无页面报错', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
