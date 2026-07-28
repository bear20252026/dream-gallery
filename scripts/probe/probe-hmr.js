// probe-hmr.js — Vite 热更新红利探针:验证模块热替换不整页刷新、旧实例清理干净
// 流程:起后端(3219)+Vite dev(5174)→ 加载页面 → 打标记 → 改文件触发热更新 →
//   断言:①页面没整页刷新(标记还在) ②模块实例已更换 ③iG/碰撞体无重复(清理干净)
// 用法: node probe-hmr.js   退出码: 全过 0,任一失败 1(探针结束自动还原被改文件)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
const children = [];
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}
function spawnWait(cmd, args, marker, env) {
  return new Promise((resolve, reject) => {
    // args 为空时 cmd 视作整条 shell 命令(Windows 的 npx 是 .cmd,必须走 shell)
    const useShell = args.length === 0 && typeof cmd === 'string' && cmd.includes(' ');
    const child = useShell
      ? spawn(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
      : spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.stdout.on('data', d => { if (d.toString().includes(marker)) resolve(); });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    setTimeout(() => reject(new Error(`启动超时: ${cmd} ${args.join(' ')}`)), 30000);
  });
}

(async () => {
  // 后端 API/媒体服务器:vite.config.js 代理写死 localhost:3000。
  // 若 3000 已有画廊后端在跑(用户本地开发服务器),直接复用,不重复起、也不动它。
  let backendUp = false;
  try { backendUp = (await fetch('http://localhost:3000/api/quiz/state')).ok; } catch (e) {}
  if (backendUp) console.log('  (复用 3000 已在运行的后端)');
  else await spawnWait(process.execPath, ['server.js'], '服务器已启动', { PORT: '3000' });
  // Vite dev 服务器:直接 node 跑 vite 入口,不用 npx——
  // shell 方式起 npx 时 kill 只杀 cmd 壳,vite 进程残留占端口(2026-07-25 踩坑)
  await spawnWait(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5174', '--strictPort'], 'ready in');

  const files = {
    'src/scene/effects.js': fs.readFileSync(path.join(ROOT, 'src/scene/effects.js'), 'utf8'),
    'src/gate/quizgate.js': fs.readFileSync(path.join(ROOT, 'src/gate/quizgate.js'), 'utf8'),
  };
  let browser = null;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    children.push({ kill: () => browser.close() });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const pageErrs = [];
    page.on('pageerror', e => pageErrs.push(e.message));
    await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__ctx && window.__ctx.s && window.__HMR__, { timeout: 90000 });
    // 等模块全部就绪(quizgate 的牌子/答题屏注册进 iG)
    await page.waitForFunction(() =>
      window.__ctx.iG.some(m => m.userData && m.userData.isQuizGate) &&
      window.__HMR__.effects && window.__HMR__.quizgate, { timeout: 60000 });

    // 打标记:整页刷新会洗掉它
    await page.evaluate(() => { window.__hmrMarker = 'alive'; });

    // ---------- 热更新 effects.js ----------
    const bagBefore = await page.evaluate(() => !!window.__HMR__.effects);
    fs.writeFileSync(path.join(ROOT, 'src/scene/effects.js'), files['src/scene/effects.js'] + '\n// hmr-probe-touch\n');
    await page.waitForTimeout(2500);
    const st1 = await page.evaluate(() => ({
      marker: window.__hmrMarker || '',
      hasBag: !!window.__HMR__.effects,
    }));
    ok(bagBefore && st1.hasBag, 'effects.js 热替换:实例记录仍在');
    ok(st1.marker === 'alive', 'effects.js 热替换:页面未整页刷新(标记存活)');

    // ---------- 热更新 quizgate.js(重点:碰撞体/iG 不能重复) ----------
    const before = await page.evaluate(() => ({
      quizGates: window.__ctx.iG.filter(m => m.userData && m.userData.isQuizGate).length,
      gateBounds: window.__ctx.bounds.filter(b => b.mnZ === 28.1 && b.mxZ === 28.5).length,
    }));
    fs.writeFileSync(path.join(ROOT, 'src/gate/quizgate.js'), files['src/gate/quizgate.js'] + '\n// hmr-probe-touch\n');
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => ({
      marker: window.__hmrMarker || '',
      quizGates: window.__ctx.iG.filter(m => m.userData && m.userData.isQuizGate).length,
      gateBounds: window.__ctx.bounds.filter(b => b.mnZ === 28.1 && b.mxZ === 28.5).length,
      walls: (() => { let n = 0; window.__ctx.s.traverse(o => { if (o.userData && o.userData.isQuizGate && o.type === 'Group') n++; }); return n; })(),
    }));
    ok(after.marker === 'alive', 'quizgate.js 热替换:页面未整页刷新(标记存活)');
    ok(before.quizGates === 1 && after.quizGates === 1, `答题屏在 iG 中恰有 1 份(热替换前 ${before.quizGates} → 后 ${after.quizGates},无重复)`);
    ok(before.gateBounds === 1 && after.gateBounds === 1, `门禁墙碰撞体恰有 1 份(前 ${before.gateBounds} → 后 ${after.gateBounds},无泄漏)`);
    ok(after.walls === 1, `场景中心象共鸣围墙组(Group)恰有 1 份(${after.walls})`);

    ok(pageErrs.length === 0, `热更新全程无 JS 未捕获异常 (${pageErrs.length})${pageErrs[0] ? ': ' + pageErrs[0].slice(0, 120) : ''}`);
  } finally {
    // 还原被 touch 的文件
    for (const [f, content] of Object.entries(files)) fs.writeFileSync(path.join(ROOT, f), content);
    if (browser) await browser.close().catch(() => {});
    children.forEach(c => { try { c.kill(); } catch (_) {} });
  }
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => {
  children.forEach(c => { try { c.kill(); } catch (_) {} });
  console.error('探针执行失败:', e);
  process.exit(1);
});
