// titlecard-probe.js — 称号解锁卡片(B4)+ 回归文案(C6)实机验收(2026-07-28)
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

async function boot(browser, marks, port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.addInitScript((m) => {
    localStorage.setItem('kunlunPrologueDone', '1');
    localStorage.setItem('kunlunSkyMs', '100');
    localStorage.setItem('kunlunQuiz', '20');
    localStorage.setItem('galleryNick', '山月');
    localStorage.setItem('eternalMarks', JSON.stringify(m));
    sessionStorage.setItem('agreementConsented', '1'); sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1'); sessionStorage.setItem('kunlunWelcomed', '1'); sessionStorage.setItem('nickPopOff', '1');
  }, marks);
  await page.goto('http://localhost:' + port + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.pl, null, { timeout: 90000 });
  await page.waitForTimeout(3500);
  return page;
}

(async () => {
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3225', MIMO_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // ---- 页1:触发称号卡片 → 点「确认」关闭 ----
  const p1 = await boot(browser, [0, 1, 2, 3, 4], 3225);
  const r1 = await p1.evaluate(() => {
    try {
      const h = window.__ctx.kunlun.eternalHandlers.spiritmark;
      h({ userData: { markIndex: 5, pulse() {} } });
      return { ok: true, marks: window.__ctx.store.json('marks', []), done: window.__ctx.store.flag('marksDone') };
    } catch (e) { return { err: e.message, stack: (e.stack||'').slice(0,500) }; }
  });
  console.log('  [dbg] spiritmark:', JSON.stringify(r1));
  await p1.waitForTimeout(3500);
  const card = await p1.evaluate(() => {
    const d = document.getElementById('titleCardOv');
    return d ? { display: d.style.display, name: d.querySelector('#tcName').textContent, hasBtns: !!(d.querySelector('#tcOk') && d.querySelector('#tcLater') && d.querySelector('#tcX')) } : null;
  });
  ok(card && card.display === 'flex', '六印记点完 → 称号卡片弹出');
  ok(card && /六合藏梦人 · 山月/.test(card.name), '卡片显示「六合藏梦人 · 山月」(textContent 注入)');
  ok(card && card.hasBtns, '卡片带 确认/稍后修改/✕ 三控件');
  await p1.evaluate(() => document.getElementById('tcOk').click());
  await p1.waitForTimeout(400);
  ok(await p1.evaluate(() => !document.getElementById('titleCardOv')), '点「确认」关闭并移除卡片');
  ok(p1.errors.length === 0, '页1 无 pageerror');
  await p1.close();

  // ---- 页2:触发称号卡片 → Esc 关闭(弹层注册处) ----
  const p2 = await boot(browser, [0, 1, 2, 3, 4], 3225);
  await p2.evaluate(() => {
    const h = window.__ctx.kunlun.eternalHandlers.spiritmark;
    h({ userData: { markIndex: 5, pulse() {} } });
  });
  await p2.waitForTimeout(3500);
  console.log('  [dbg] 页2 Esc前卡片:', await p2.evaluate(() => { const d = document.getElementById('titleCardOv'); return d ? d.style.display : 'ABSENT'; }));
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(400);
  console.log('  [dbg] 页2 Esc后卡片:', await p2.evaluate(() => { const d = document.getElementById('titleCardOv'); return d ? d.style.display : 'ABSENT'; }));
  ok(await p2.evaluate(() => !document.getElementById('titleCardOv')), 'Esc 也可关闭卡片(overlay 三铁律)');
  ok(p2.errors.length === 0, '页2 无 pageerror');

  // ---- C6 回归文案:有进度的老访客,6 秒后残镜小字 ----
  await p2.waitForTimeout(4500);
  const wb = await p2.evaluate(() => [...document.querySelectorAll('div')].some(d => d.textContent.includes('它们还在等你') && d.children.length < 3));
  ok(wb, 'C6 回归文案:老访客见「它们还在等你」');
  await p2.close();

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close(); server.kill();
  process.exit(fail ? 1 : 0);
})();
