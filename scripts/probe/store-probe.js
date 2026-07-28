// store-probe.js — 存档登记处(store.js)实机验收(2026-07-28 架构深化②)
// 断言:默认值语义 / 旧档迁移(只有数量键→重建数组) / addSpirit 双键同步 / 读写回环 /
//   坏 JSON 回退 / houseColor 动态键 / 未登记键报错 / 键名唯一出口 / 全程无 pageerror
// 用法: node scripts/probe/store-probe.js
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3219' }, stdio: ['ignore', 'pipe', 'pipe'],
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
  await page.goto('http://localhost:3219/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__ctx && window.__ctx.store && window.__ctx.pl, null, { timeout: 90000 });
  await page.waitForTimeout(3000);

  // [1] 默认值语义(与旧写法逐点对齐)
  const dft = await page.evaluate(() => ({
    skyMs: window.__ctx.store.num('skyMs'),
    nick: window.__ctx.store.str('nick'),
    flew: window.__ctx.store.flag('arkFlew'),
    letGo: window.__ctx.store.json('letGo', []),
  }));
  ok(dft.skyMs === 0 && dft.nick === '' && dft.flew === false, '默认值:num=0 / str="" / flag=false');
  ok(Array.isArray(dft.letGo) && dft.letGo.length === 0, '默认值:json 缺失回退 def([])');

  // [2] 旧档迁移:只有数量键 kunlunSpirits=3 → getSpirits 重建前 3 颗并写回数组键
  const mig = await page.evaluate(() => {
    localStorage.removeItem('kunlunSpiritsKeys');
    localStorage.setItem('kunlunSpirits', '3');
    const k = window.__ctx.store.getSpirits();
    return { k, written: localStorage.getItem('kunlunSpiritsKeys') };
  });
  ok(JSON.stringify(mig.k) === JSON.stringify(['sprout', 'flame', 'leaf']), '旧档迁移:数量键 3 → 前 3 颗 key');
  ok(JSON.parse(mig.written || 'null') !== null, '旧档迁移:数组键已写回 localStorage');

  // [3] addSpirit:数组+兼容数量键双写
  const add = await page.evaluate(() => {
    const k = window.__ctx.store.addSpirit('snow');
    return { n: k.length, cnt: localStorage.getItem('kunlunSpirits'), has: k.includes('snow') };
  });
  ok(add.n === 4 && add.has && add.cnt === '4', 'addSpirit:数组 4 颗+数量键同步 "4"');

  // [4] 读写回环:num/str/flag
  const rw = await page.evaluate(() => {
    const st = window.__ctx.store;
    st.setNum('quiz', 7); st.setStr('nick', '藏梦人甲'); st.mark('fireTts');
    return {
      q: st.num('quiz'), qRaw: localStorage.getItem('kunlunQuiz'),
      n: st.str('nick'), f: st.flag('fireTts'), fRaw: localStorage.getItem('fireTts'),
    };
  });
  ok(rw.q === 7 && rw.qRaw === '7' && rw.n === '藏梦人甲' && rw.f === true && rw.fRaw === '1', '读写回环:num/str/flag 与原始键一致');

  // [5] 坏 JSON 回退 def(不抛)
  const bad = await page.evaluate(() => {
    localStorage.setItem('eternalLetGo', '{bad json');
    try { return { v: window.__ctx.store.json('letGo', []), threw: false }; }
    catch (e) { return { threw: true }; }
  });
  ok(bad.threw === false && Array.isArray(bad.v) && bad.v.length === 0, '坏 JSON 回退 def,不抛异常');

  // [6] houseColor 动态键
  const hc = await page.evaluate(() => {
    const st = window.__ctx.store;
    st.setHouseColor('wall', '#aabbcc');
    const a = st.houseColor('wall');
    st.clearHouseColor('wall');
    return { a, b: st.houseColor('wall'), raw: localStorage.getItem('houseColor_wall') };
  });
  ok(hc.a === '#aabbcc' && hc.b === '' && hc.raw === null, 'houseColor 动态键:写/读/清除');

  // [7] 未登记键报错(防新键绕过登记册)
  const unreg = await page.evaluate(() => {
    try { window.__ctx.store.num('hackerKey'); return false; } catch (e) { return /未登记/.test(e.message); }
  });
  ok(unreg === true, '未登记键抛出「未登记」错误');

  // [8] 键名唯一出口:src 内除 store.js/注释外无 localStorage 直写(构建产物抽查)
  const fs = require('fs');
  const srcFiles = [];
  (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.js')) srcFiles.push(p); } })(path.join(ROOT, 'src'));
  let stray = 0;
  for (const f of srcFiles) {
    if (f.endsWith(path.join('state', 'store.js'))) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    for (const ln of lines) {
      const t = ln.trim();
      if (t.startsWith('//')) continue; // 注释豁免
      if (/localStorage\.(getItem|setItem|removeItem)/.test(t)) { stray++; console.log('    漏网:', path.relative(ROOT, f), '→', t.slice(0, 80)); }
    }
  }
  ok(stray === 0, '键名唯一出口:src 业务代码零 localStorage 直写(漏网 ' + stray + ' 处)');

  ok(pageErrors.length === 0, `全程无 pageerror(共 ${pageErrors.length} 个)`);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  await browser.close();
  server.kill();
  process.exit(fail ? 1 : 0);
})();
