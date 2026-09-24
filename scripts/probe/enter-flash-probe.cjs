// enter-flash-probe.cjs — ENTER 进场闪现回归探针(2026-09-24)
// 主人报告:首页点 ENTER 后"闪一下"。分段盯两条衔接缝:
//   缝A:闸门→电影(首 3s)   缝B:电影结束→世界揭幕(盯到 #b612film 移除瞬间 ± 3s)
// 契约:两条缝里屏幕中心的顶层元素只能是 闸门/电影层/世界(#c),且世界揭幕必须走纸色淡入(cOp 0→1),不得黑帧/跳变。
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
  console.log('[probe] 已点 ENTER,等待电影结束…');

  // 缝B:在页面里起一个采样器,盯到电影层消失后 3s 停;同时随时可截图
  await page.evaluate(() => {
    window.__snap = [];
    const t0 = performance.now();
    function snap() {
      const f = document.getElementById('b612film');
      const c = document.getElementById('c');
      const cs = c ? getComputedStyle(c) : null;
      const mid = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      window.__snap.push({
        t: Math.round(performance.now() - t0),
        film: !!f,
        fOp: f ? (parseFloat(getComputedStyle(f).opacity) || 0).toFixed(2) : '-',
        cVis: cs ? cs.visibility : '?',
        cOp: cs ? (parseFloat(cs.opacity) || 0).toFixed(2) : '?',
        cBg: cs ? cs.backgroundColor : '?',
        top: mid ? (mid.id ? '#' + mid.id : mid.tagName) : '?',
      });
    }
    window.__snapTimer = setInterval(snap, 80);
  });

  // 等电影先挂载,再等它消失(最长 3 分钟)
  try {
    await page.waitForFunction(() => !!document.getElementById('b612film'), null, { timeout: 30000 });
    console.log('[probe] 电影层已挂载');
  } catch (e) { console.log('!! 30s 内电影未挂载'); }
  try {
    await page.waitForFunction(() => !document.getElementById('b612film'), null, { timeout: 180000 });
  } catch (e) { console.log('!! 3 分钟内电影未结束'); }
  await page.waitForTimeout(3200); // 采样器继续记 3s
  const snap = await page.evaluate(() => { clearInterval(window.__snapTimer); return window.__snap; });

  // 电影层消失 = 最后一个 film=true 的下一帧;取其前后各 ~40 帧
  let lastFilm = -1;
  snap.forEach((s, i) => { if (s.film) lastFilm = i; });
  const win = snap.slice(Math.max(0, lastFilm - 15), lastFilm + 41);
  console.log('=== 缝B 时间线(电影消失 ±3s,每 80ms) ===');
  for (const s of win) console.log(`  t=${s.t}ms film=${s.film} fOp=${s.fOp} cVis=${s.cVis} cOp=${s.cOp} cBg=${s.cBg} top=${s.top}`);

  // 揭幕契约检查
  const after = snap.filter((s) => !s.film);
  const darkFrames = after.filter((s) => s.cVis === 'visible' && s.cOp === '0.00' && /rgb\((0|1[0-9]|2[0-9]),/.test(s.cBg));
  const jumps = [];
  for (let i = 1; i < after.length; i++) {
    const d = Math.abs(parseFloat(after[i].cOp) - parseFloat(after[i - 1].cOp));
    if (d > 0.35) jumps.push(after[i - 1].t + 'ms(' + after[i - 1].cOp + '→' + after[i].cOp + ')');
  }
  let pass = 0, fail = 0;
  const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? ' → ' + x : '')); } };
  ok('电影结束后揭幕是纸色淡入(无黑帧)', darkFrames.length === 0, darkFrames.length + ' 帧黑底');
  ok('揭幕透明度无 >0.35 的跳变(平滑淡入)', jumps.length === 0, jumps.join(', '));
  ok('无页面报错', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('探针异常:', e.message); process.exit(2); });
