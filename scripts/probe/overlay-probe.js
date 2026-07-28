// overlay-probe.js — 弹层注册处(overlay.js)实机验收(2026-07-28 架构深化⑤)
// 断言:三铁律注册即得(✕/点外圈/Esc) / Esc 栈后开先关 / 答题中点外圈拦截 / 触摸白名单 / touchOnly
// 用法: node scripts/probe/overlay-probe.js
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3218' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[PAGE_ERROR]', e.message.slice(0, 200)); });

  await page.addInitScript(() => {
    localStorage.setItem('kunlunPrologueDone', '1');
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
    sessionStorage.setItem('kunlunWelcomed', '1');
    sessionStorage.setItem('nickPopOff', '1');
  });
  await page.goto('http://localhost:3218/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.overlay && window.__ctx.pl, null, { timeout: 90000 });
  await page.waitForTimeout(5000);

  const disp = id => page.evaluate(i => document.getElementById(i).style.display, id);

  // [1] 打开聊天(昆仑罗盘 → 💬 聊天)
  await page.evaluate(() => {
    document.getElementById('kunlunCompass').click();
    document.getElementById('gmChat').click();
  });
  await page.waitForTimeout(400);
  ok(await disp('chatOv') === 'flex', '聊天弹层打开(display:flex)');

  // [2] Esc 关闭(注册处栈)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(await disp('chatOv') === 'none', 'Esc 关闭聊天弹层');

  // [3] 重开 → 点外圈关闭
  await page.evaluate(() => document.getElementById('gmChat').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const ov = document.getElementById('chatOv');
    ov.dispatchEvent(new MouseEvent('click', { bubbles: true })); // target===ov 即点外圈
  });
  await page.waitForTimeout(300);
  ok(await disp('chatOv') === 'none', '点外圈关闭聊天弹层');

  // [4] ✕ 按钮关闭(事件委托)
  await page.evaluate(() => document.getElementById('gmChat').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('chatX').click());
  await page.waitForTimeout(300);
  ok(await disp('chatOv') === 'none', '✕ 按钮关闭聊天弹层(事件委托)');

  // [5] Esc 栈:聊天在下、答题在上——先关答题,聊天还在;再关聊天
  await page.evaluate(() => { document.getElementById('gmChat').click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.startQuiz());
  await page.waitForTimeout(600);
  const stack1 = { chat: await disp('chatOv'), quiz: await disp('quizOv') };
  ok(stack1.chat === 'flex' && stack1.quiz === 'flex', '两层同开(聊天下+答题上)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const stack2 = { chat: await disp('chatOv'), quiz: await disp('quizOv') };
  ok(stack2.quiz === 'none' && stack2.chat === 'flex', 'Esc 先关栈顶(答题),聊天保留');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(await disp('chatOv') === 'none', '再 Esc 关下一层(聊天)');

  // [6] 答题中(stage=quiz)点外圈拦截;Esc 仍放行(与旧行为一致)
  await page.evaluate(() => window.startQuiz());
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const ov = document.getElementById('quizOv');
    ov.dataset.stage = 'quiz';
    ov.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  ok(await disp('quizOv') === 'flex', '答题中点外圈被拦截(canClose)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(await disp('quizOv') === 'none', '答题中 Esc 仍可关闭(与旧行为一致)');

  // [7] 触摸白名单:弹层内元素 true,场景 false;旧硬编码 id 清单已废
  const touch = await page.evaluate(() => ({
    inOv: window.__ctx.overlay.isUiTouch(document.querySelector('#chatOv > div')),
    body: window.__ctx.overlay.isUiTouch(document.body),
    hud: !!(document.getElementById('arkHud') && document.getElementById('arkHud').dataset.overlay),
  }));
  ok(touch.inOv === true && touch.body === false, '触摸白名单:data-overlay 内 true / 场景 false');
  ok(touch.hud === true, '飞舟 HUD 已注册 touchOnly(data-overlay 在)');

  ok(pageErrors.length === 0, `全程无 pageerror(共 ${pageErrors.length} 个)`);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close();
  server.kill();
  process.exit(fail ? 1 : 0);
})();
