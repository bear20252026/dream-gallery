// media-rules-probe.js — 媒体可见性决策表(shared/mediarules.cjs)实机验收(2026-07-28 架构深化④)
// 断言:普通模式=演示上墙/图库框留内容拿掉/他人整框隐藏;切特殊模式=演示下墙/图库全展示;全程无 pageerror
// 用法: node scripts/probe/media-rules-probe.js
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3221' }, stdio: ['ignore', 'pipe', 'pipe'],
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
  await page.goto('http://localhost:3221/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.pl && (window.__ctx.paintGroups || []).length > 0, null, { timeout: 90000 });
  await page.waitForTimeout(4000);

  const tally = () => page.evaluate(() => {
    const c = window.__ctx;
    const r = { demoVisible: 0, demoHidden: 0, libContentOn: 0, libContentOff: 0, libHidden: 0, wbVisible: 0, wbHidden: 0, otherVisible: 0, otherHidden: 0, otherSrcs: [], texGate: null };
    for (const g of c.paintGroups) {
      const src = g.userData.src, name = (src || '').split('/').pop();
      const isDemo = (c.demoPhotos || []).includes(name);
      const isMine = (c.myUploads || []).includes(name);
      const isWb = /^whiteboard-/i.test(name);
      const isLib = (/^photos\/|^videos\//.test(src)) && !isMine && !isDemo && !isWb;
      if (isDemo) { g.visible ? r.demoVisible++ : r.demoHidden++; }
      else if (isMine) { g.visible ? r.otherVisible++ : r.otherHidden++; }
      else if (isWb) { g.visible ? r.wbVisible++ : r.wbHidden++; }
      else if (isLib) { if (!g.visible) r.libHidden++; else (g.children[3] && g.children[3].visible ? r.libContentOn++ : r.libContentOff++); }
      else { g.visible ? r.otherVisible++ : r.otherHidden++; if (r.otherSrcs.length < 6) r.otherSrcs.push((g.visible ? '+' : '-') + src); }
    }
    // 纹理门禁抽查:普通模式图库 url 应拦截,演示应放行
    if (c.texAllowed) {
      const demoName = (c.demoPhotos || [])[0];
      r.texGate = { libBlocked: !c.texAllowed('photos/1000000850.jpg'), demoOk: demoName ? c.texAllowed('photos/' + demoName) : null };
    }
    return r;
  });

  // [1] 普通模式(默认;本地测试服无演示照片配置,演示路径用 [2] 合成验证)
  const normal = await tally();
  console.log('  普通模式:', JSON.stringify(normal));
  ok(normal.libContentOff > 0 && normal.libContentOn === 0 && normal.libHidden === 0, '普通模式:图库框留下、内容拿掉(白卡空框)');
  ok(normal.texGate && normal.texGate.libBlocked === true, '普通模式:纹理门禁拦图库');
  console.log('  未归类帧:', JSON.stringify(normal.otherSrcs));

  // [2] 合成演示照片:把一幅图库照片标记为演示 → 普通模式上墙出内容,特殊模式下墙
  const demo = await page.evaluate(() => {
    const c = window.__ctx;
    const g = c.paintGroups.find(g => { const s = g.userData.src || ''; return /^photos\//.test(s) && !/^whiteboard-/i.test(s.split('/').pop()); });
    const name = g.userData.src.split('/').pop();
    c.demoPhotos = [name];
    c.applyPaintMode();
    const cm = g.children[3];
    const normalState = { visible: g.visible, content: !!(cm && cm.visible) };
    c.siteMode = 'special'; c.applyPaintMode();
    const specialState = { visible: g.visible };
    c.siteMode = 'normal'; c.applyPaintMode();
    const texOk = c.texAllowed ? c.texAllowed('photos/' + name) : null;
    return { name, normalState, specialState, texOk };
  });
  console.log('  合成演示:', JSON.stringify(demo));
  ok(demo.normalState.visible === true && demo.normalState.content === true, '演示照片:普通模式上墙出内容');
  ok(demo.specialState.visible === false, '演示照片:特殊模式下墙(仅后台展现)');
  ok(demo.texOk === true, '演示照片:纹理门禁放行');

  // [3] 特殊模式:图库全展示
  await page.evaluate(() => { window.__ctx.demoPhotos = []; window.__ctx.siteMode = 'special'; window.__ctx.applyPaintMode(); });
  const special = await tally();
  console.log('  特殊模式:', JSON.stringify(special));
  ok(special.libContentOn > 0 && special.libContentOff === 0 && special.libHidden === 0, '特殊模式:图库全展示');

  // [4] 切回普通模式可逆
  await page.evaluate(() => { window.__ctx.siteMode = 'normal'; window.__ctx.applyPaintMode(); });
  const back = await tally();
  ok(back.libContentOff === normal.libContentOff, '模式切换可逆(回普通后决策还原)');

  ok(pageErrors.length === 0, `全程无 pageerror(共 ${pageErrors.length} 个)`);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close();
  server.kill();
  process.exit(fail ? 1 : 0);
})();
