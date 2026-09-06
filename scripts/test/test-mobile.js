// test-mobile.js — 手机端渲染自动化测试(模拟 iPhone:触屏+小屏,触发手机端灯光限额路径)
// 用法: node test-mobile.js   自带临时测试服务器(端口 3212),测试后自动清理
// 退出码: 全部通过 0,任一失败 1
// 经验教训(2026-07-24): 手机 GPU 片元 uniform 上限(128~224 vec4)远低于电脑(1024+),
// 点光源过多 → 标准材质着色器链接失败(too many uniforms) → 墙/地形整片隐形。
// 此测试防回归: 模拟手机加载页面,任何着色器错误/JS错误/场景不渲染都算失败。

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
const children = [];
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    child.stdout.on('data', d => { if (d.toString().includes('服务器已启动')) resolve(`http://localhost:${port}`); });
    child.on('error', reject);
    setTimeout(() => reject(new Error(`端口 ${port} 服务器启动超时`)), 10000);
  });
}

(async () => {
  // ---------- 静态防回归:手机端灯光限额代码必须存在 ----------
  console.log('\n[静态检查]');
  // 2026-09-07 灯光预算选择算法拆到 core/light-budget.js(纯逻辑,vitest 单测),
  // main.js 保留触屏判定与执行删除——两处都在才算防线完整
  const mainCode = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const budgetCode = fs.readFileSync(path.join(ROOT, 'src', 'core', 'light-budget.js'), 'utf8');
  ok(
    mainCode.includes('ontouchstart') &&
      mainCode.includes('selectLightsToRemove') &&
      budgetCode.includes('isPointLight') &&
      budgetCode.includes('keepEvery'),
    'main.js+light-budget.js 存在手机端灯光限额(防止 too many uniforms 回归)'
  );

  // ---------- 动态:模拟 iPhone 加载页面 ----------
  console.log('\n[模拟 iPhone 12 加载]');
  const base = await startServer(3212);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  children.push({ kill: () => browser.close() });
  const ctx = await browser.newContext({ ...devices['iPhone 12'] });
  const page = await ctx.newPage();

  const shaderErrs = [], pageErrs = [];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/too many uniforms|WebGLProgram|Shader Error|VALIDATE_STATUS/i.test(t)) shaderErrs.push(t);
  });
  page.on('pageerror', e => pageErrs.push(e.message));

  await page.goto(base + '/?shaderdebug', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 走真实开场路径(2026-09-06):闸门勾选→ENTER→电影→skip;电影落定后 3D 世界才启动
  await page.waitForSelector('#b612Gate', { timeout: 60000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  await page.waitForSelector('#b612film', { timeout: 20000 });
  // 手机视口下 skip 按钮带动画,playwright 稳定性检查过不了 → evaluate 直点
  await page.evaluate(() => {
    const s = document.getElementById('fSkip');
    if (s) s.click();
  });
  // 等场景初始化(无头环境偏慢,轮询等 canvas 出现)
  let canvases = 0;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(3000);
    canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
    if (canvases > 0) break;
  }
  ok(canvases > 0, `3D 画布已创建 (${canvases} 个 canvas)`);

  await page.waitForTimeout(8000); // 给区块地形/模块充分加载
  const pos = await page.evaluate(() => (document.getElementById('posD') || {}).textContent || '');
  ok(/^X:-?[\d.]+ \| Y:-?[\d.]+ \| Z:-?[\d.]+$/.test(pos), `渲染循环存活(坐标 ${pos || '无'})`);

  ok(shaderErrs.length === 0, `无着色器/uniform 错误 (${shaderErrs.length})${shaderErrs[0] ? ': ' + shaderErrs[0].slice(0, 120) : ''}`);
  // 已知环境噪音(2026-09-05):裸 dev 服务器下部分动态 import 偶发 404(gallery-v2/rose-gallery 等,
  // Windows 文件锁瞬断;curl 直取同 URL 为 200 可复证)。生产走 vite 打包,/src 动态请求根本不存在,
  // 此失败模式线上不可能发生——降级为警告不挡部署;其余未捕获异常仍判失败。
  const noiseErrs = pageErrs.filter((e) => /Failed to fetch dynamically imported module/.test(e));
  const realErrs = pageErrs.filter((e) => !/Failed to fetch dynamically imported module/.test(e));
  if (noiseErrs.length) console.log(`  ⚠ 动态模块偶发 404 ${noiseErrs.length} 条(裸服环境噪音,生产打包不存在,已忽略)`);
  ok(realErrs.length === 0, `无 JS 未捕获异常 (${realErrs.length})${realErrs[0] ? ': ' + realErrs[0].slice(0, 120) : ''}`);

  // 截图非纯色(纯色 PNG 体积极小;真实场景包含天空/地形/建筑,体积大)
  const shot = await page.screenshot();
  ok(shot.length > 60000, `画面非纯色空屏 (截图 ${(shot.length / 1024).toFixed(0)} KB)`);

  await browser.close();
  children.forEach(c => c.kill());
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => {
  children.forEach(c => { try { c.kill(); } catch (_) {} });
  console.error('测试执行失败:', e);
  process.exit(1);
});
