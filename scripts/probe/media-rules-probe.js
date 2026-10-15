// media-rules-probe.js — 媒体可见性决策表(src/shared/mediarules.mjs)实机验收(2026-07-28 架构深化④)
// ⚠️已退役(2026-10-15;定性过程见 AGENTS.md「媒体可见性规矩」):断言的对象已经不存在,不是"环境跑不通"——
//   ① 夹具没了:2026-09-06「照片全库退役」删光 data.js 里 69 张图库照片,只剩 5 张演示(201~205),
//      它抽查的 photos/1000000850.jpg 也不存在 ⇒ `libContentOff > 0` 这类断言永无可能成立;
//   ② 特殊模式已删(lib/siteconfig.js:68 起 mode 恒为 'normal')⇒ 下面 [2][3] 两段验的东西没了;
//   ③ 数据根没隔离:本文件 spawn 只改 PORT,不打 GATE_DATA_FILE/SQLITE_PATH,会按 lib/store.js:9/19 的默认值
//      拿仓库根的 gate_data.json / gate_data.db 起服 —— 在一个注定红的验收上写真实数据根。
// 现在真正覆盖这张决策表的是:src/__tests__/mediarules.test.js(12)+ src/__tests__/lib-thumb-gate.test.js(14)
//   + scripts/test/test.js 媒体门禁段(12 项,户外大屏那项按本地文件存在才跑)+ api-ban-upload-probe.cjs(22 项)。
// 要恢复实机验收:先按今天的数据集重写夹具、补上临时目录隔离,再用 MEDIA_RULES_PROBE_FORCE=1 显式解除本闸。
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright-core');

// 拒绝运行 ≠ 通过:退出码 2,和"跑绿"必须能从出口区分开
if (process.env.MEDIA_RULES_PROBE_FORCE !== '1') {
  console.error('media-rules-probe.js 已退役(夹具与特殊模式都已不在,且缺 GATE_DATA_FILE/SQLITE_PATH 隔离)。'
    + '原因与现有覆盖见文件头注释;确要运行:先重写夹具,再 MEDIA_RULES_PROBE_FORCE=1 node scripts/probe/media-rules-probe.js');
  process.exit(2);
}

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
