// 线上故障诊断探针(2026-08-29) — 通过本地 SSH 隧道打线上 :3000,抓全部浏览器错误
// 用法: node scripts/probe/live-debug.js [url]
import { chromium } from 'playwright-core';

const URL = process.argv[2] || 'http://127.0.0.1:39000/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const results = {
  console: [],
  pageErrors: [],
  requestFailed: [],
  checks: {},
};

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('console', (msg) => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') {
    results.console.push(`[${t}] ${msg.text().slice(0, 500)}`);
  }
});
page.on('pageerror', (err) => results.pageErrors.push(String(err && err.stack || err).slice(0, 800)));
page.on('requestfailed', (req) => {
  results.requestFailed.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
});

const start = Date.now();
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) {
  results.pageErrors.push('GOTO_FAIL: ' + e.message.slice(0, 300));
}

// 等场景初始化 + 若干帧
await page.waitForTimeout(10000);

results.checks = await page.evaluate(() => {
  const out = {};
  // 基础 DOM
  out.hasCanvas = !!document.querySelector('canvas');
  const c = document.querySelector('canvas');
  if (c) {
    out.canvasSize = `${c.width}x${c.height}`;
    out.canvasDisplay = getComputedStyle(c).display;
  }
  // 关键容器
  ['#l', '#c', '#jt', '#gameDialog', '#questHud', '#gsMenuBtn', '#gameMenu'].forEach((sel) => {
    out[sel] = !!document.querySelector(sel);
  });
  // WebGL 上下文
  try {
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    out.webgl = !!gl;
  } catch (e) {
    out.webgl = 'ERR:' + e.message.slice(0, 100);
  }
  // 场景系统暴露的任何状态
  out.windowKeys = ['__scene', 'SCENE', 'rnd', 'ctx'].filter((k) => k in window);
  // 页面是否整体挂了(有没有任何文字)
  out.bodyTextLen = (document.body.innerText || '').length;
  return out;
});

// 截图(看实际画面)
try {
  await page.screenshot({ path: 'live-debug.png', fullPage: false });
  results.checks.screenshot = 'live-debug.png';
} catch (e) {
  results.checks.screenshot = 'ERR:' + e.message.slice(0, 100);
}

console.log('===== 诊断结果 =====');
console.log('时长(ms):', Date.now() - start);
console.log('\n-- 页面检查 --');
console.log(JSON.stringify(results.checks, null, 2));
console.log('\n-- console 错误/警告 (%d) --', results.console.length);
results.console.forEach((l, i) => console.log(`  ${i + 1}. ${l}`));
console.log('\n-- 未捕获异常 (%d) --', results.pageErrors.length);
results.pageErrors.forEach((l, i) => console.log(`  ${i + 1}. ${l}`));
console.log('\n-- 网络失败 (%d) --', results.requestFailed.length);
results.requestFailed.slice(0, 20).forEach((l, i) => console.log(`  ${i + 1}. ${l}`));
if (results.requestFailed.length > 20) console.log(`  ... 还有 ${results.requestFailed.length - 20} 条`);

await browser.close();
