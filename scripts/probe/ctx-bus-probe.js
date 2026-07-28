// ctx-bus-probe.js — ctx 命名空间别名层(架构深化① 阶段二)实机验收
// 断言:①别名读===扁平读(身份等价,函数引用同一) ②别名写→扁平同步(含函数替换,HMR 场景)
//   ③别名写→扁平读同步 ④别名集冻结(不可加属性) ⑤昆仑簇模块经别名注册/调用 eternalHandlers 正常
//   ⑥全程无 pageerror
// 用法: node scripts/probe/ctx-bus-probe.js
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3222' }, stdio: ['ignore', 'pipe', 'pipe'],
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
  await page.goto('http://localhost:3222/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.ui && window.__ctx.kunlun && window.__ctx.player, null, { timeout: 90000 });
  await page.waitForTimeout(3000);

  // [1] 别名读===扁平读(运行期真值,函数引用同一)
  const eq = await page.evaluate(() => {
    const c = window.__ctx;
    return {
      toast: c.ui.modeToast === c.modeToast,
      speak: c.ui.kunlunSpeak === c.kunlunSpeak,
      store: c.ui.store === c.store,
      overlay: c.ui.overlay === c.overlay,
      handlers: c.kunlun.eternalHandlers === c.eternalHandlers,
      lock: c.kunlun.flightLock === c.flightLock,
      pl: c.player.pl === c.pl,
      passed: c.player.quizPassed === c.quizPassed,
    };
  });
  ok(Object.values(eq).every(v => v === true), '别名读===扁平读(ui/kunlun/player 全等价): ' + JSON.stringify(eq));

  // [2] 别名写→扁平读同步(函数替换=HMR 场景)
  const wr = await page.evaluate(() => {
    const c = window.__ctx;
    const fn = () => 'alias-wrote';
    c.ui.modeToast = fn;
    const a = c.modeToast === fn;
    c.kunlun.flightLock = 'lock-test';
    const b = c.flightLock === 'lock-test';
    // 还原(扁平写回,别名校验)
    c.modeToast = () => 'restored';
    const d = c.ui.modeToast === c.modeToast;
    c.flightLock = false;
    return { a, b, d, lockBack: c.kunlun.flightLock === false };
  });
  ok(wr.a && wr.b && wr.d && wr.lockBack, '别名写→扁平读同步,扁平写→别名读同步(往返等价)');

  // [3] 别名集冻结(不可加新属性,防"顺手往命名空间塞新键")
  const frz = await page.evaluate(() => {
    try { window.__ctx.kunlun.brandNewKey = 1; } catch (e) {}
    return window.__ctx.kunlun.brandNewKey === undefined && window.__ctx.brandNewKey === undefined;
  });
  ok(frz === true, '命名空间冻结:新键塞不进(也不污染扁平 ctx)');

  // [4] 昆仑簇经别名注册的 eternalHandlers 真实可用(契约在总线边界可测)
  const eh = await page.evaluate(() => {
    const c = window.__ctx;
    const h = c.kunlun.eternalHandlers || {};
    return {
      keys: Object.keys(h).sort(),
      allFn: Object.values(h).every(v => typeof v === 'function'),
    };
  });
  ok(eh.keys.length >= 5 && eh.allFn, 'eternalHandlers 经别名注册齐全(' + eh.keys.join('/') + ')且均为函数');

  // [5] 昆仑簇模块运行正常:灵蕴接口/飞舟泊位/展厅禁区钩子存在
  const kl = await page.evaluate(() => {
    const c = window.__ctx;
    return {
      got: typeof c.kunlun.spiritsGot === 'function' ? c.kunlun.spiritsGot() : -1,
      done: typeof c.kunlun.isDone === 'function' ? c.kunlun.isDone() : null,
      keepOut: typeof c.kunlun.eternalKeepOut === 'function',
      ground: 'groundOverride' in c.kunlun,
      arkTp: typeof c.kunlun.arkTeleportToPeak === 'function' || c.kunlun.arkTeleportToPeak === undefined,
    };
  });
  ok(kl.got >= 0 && kl.keepOut && kl.ground, '昆仑簇契约:spiritsGot()/eternalKeepOut/groundOverride 经别名可取 ' + JSON.stringify(kl));

  // [6] 新命名空间(scene/media/gallery/mode)存在且与扁平等价(阶段二扩展)
  const ns2 = await page.evaluate(() => {
    const c = window.__ctx;
    return {
      scene: !!(c.scene && c.scene.s === c.s && c.scene.cam === c.cam && c.scene.iG === c.iG),
      media: !!(c.media && c.media.vidEl === c.vidEl && c.media.desert === c.desert),
      gallery: !!(c.gallery && c.gallery.paintGroups === c.paintGroups && c.gallery.onC3D === c.onC3D),
      mode: !!(c.mode && c.mode.siteMode === c.siteMode && c.mode.demoPhotos === c.demoPhotos && c.mode.applyPaintMode === c.applyPaintMode),
    };
  });
  ok(Object.values(ns2).every(v => v), 'scene/media/gallery/mode 命名空间等价: ' + JSON.stringify(ns2));

  // [7] 软冻结:映射属性的扁平访问已变为存取器(vault 通道),扁平写仍同步(行为不断)
  const fz = await page.evaluate(() => {
    const c = window.__ctx;
    const d1 = Object.getOwnPropertyDescriptor(c, 'modeToast');
    const d2 = Object.getOwnPropertyDescriptor(c, 's');
    const d3 = Object.getOwnPropertyDescriptor(c, 'siteMode');
    const accessor = !!(d1 && d1.get && d1.set) && !!(d2 && d2.get && d2.set) && !!(d3 && d3.get && d3.set);
    // 扁平写(兼容路径)→ 命名空间读
    c.modeToast = () => 'flat-write';
    const sync = c.ui.modeToast === c.modeToast;
    c.siteMode = 'normal';
    const sync2 = c.mode.siteMode === 'normal';
    return { accessor, sync, sync2 };
  });
  ok(fz.accessor && fz.sync && fz.sync2, '软冻结:映射属性=存取器,扁平写→命名空间读仍同步');

  ok(pageErrors.length === 0, `全程无 pageerror(共 ${pageErrors.length} 个)`);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close();
  server.kill();
  process.exit(fail ? 1 : 0);
})();
