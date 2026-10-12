#!/usr/bin/env node
// boot-cost-probe.cjs — 首屏"真实入网字节"回归闸(2026-10-12 建,资产性能项的守门人)
//
// 为什么用 CDP 而不是 Resource-Timing(今天踩过):
//   ① initiatorType:'link' 同时覆盖 Vite 自己发的 <link rel=modulepreload> 与我们注入的
//      <link rel=prefetch>,看类型分不出是谁;
//   ② 同一 URL 出现两条 entry 是**正常现象**(先被 import() 触发、后被 preload 声明命中缓存),
//      命中缓存那条 transferSize=0 ⇒ 只数条数会把 0 字节也算成浪费(今天第一版就误报"9 个重复/385KB")。
//   Network.loadingFinished.encodedDataLength 是**实际在线上传的字节**,配 responseReceived 的
//   fromDiskCache/fromServiceWorker 才能判"真重复下载"。
//
// 为什么自己起服务器而不用 vite preview:只有本仓的 lib/files-static.js 会发 `Vary: Origin`
//   (ACAO 随 Origin 变 ⇒ 缓存必须按 Origin 分键),而 `Vary: Origin` + prefetch 缺 crossorigin
//   正是"同一 chunk 下两遍"的成因;preview 不发这个头,用它测等于没测。
//
// 用法:
//   node scripts/probe/boot-cost-probe.cjs            # 需要 dist/(先 npm run build)
//   npm run build && node scripts/probe/boot-cost-probe.cjs
//   KEEP=1 起服后不退,人工接着看(打印端口)
// 退出码:0 达标 / 1 超标(有重复下载或单文件过大) / 2 前置条件不满足(无 dist、起不来服、缺浏览器)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP_URL_TOTAL_MAX_KB = Number(process.env.MAX_TOTAL_KB || 2600); // 压缩后首屏总入网上限(今天实测 ~1.6MB 达标值 + 余量)
const DUP_KB_TOLERANCE = Number(process.env.MAX_DUP_KB || 0); // 允许的重复字节总量:0 = 一个字节都不许重复下
const SINGLE_FILE_MAX_KB = Number(process.env.MAX_ONE_KB || 900); // 单个资源入网大小上限(gzip 后)
const PORT = Number(process.env.PROBE_PORT || 3231);
const ROOT = path.join(__dirname, '..', '..');

function log(...a) { console.log(...a); }
function die2(msg) { console.log('❌ ' + msg); process.exit(2); }

if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) die2('没有 dist/index.html —— 先 npm run build');
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch (e) {
  die2('缺 playwright-core:' + e.message);
}

// ---- 沙箱 web root:server.js 以 __dirname/.. 为根,所以把"后端 + dist 产物"铺进临时目录 ----
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'bootcost-'));
function cp(from, to) {
  const s = fs.statSync(from);
  if (s.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) cp(path.join(from, f), path.join(to, f));
  } else fs.copyFileSync(from, to);
}
let server = null;
function cleanup() {
  try { if (server) server.kill('SIGTERM'); } catch (e) {}
  if (!process.env.KEEP) { try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {} }
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });

(async () => {
  cp(path.join(ROOT, 'server.js'), path.join(SANDBOX, 'server.js'));
  cp(path.join(ROOT, 'lib'), path.join(SANDBOX, 'lib'));
  cp(path.join(ROOT, 'src', 'shared'), path.join(SANDBOX, 'src', 'shared')); // 后端 require mediarules.mjs
  cp(path.join(ROOT, 'dist'), SANDBOX);                                        // 产物铺成 web root
  for (const d of ['photos', 'videos', 'music', 'models', '.chunks']) fs.mkdirSync(path.join(SANDBOX, d), { recursive: true });
  fs.writeFileSync(path.join(SANDBOX, 'package.json'), JSON.stringify({ name: 'bootcost-sandbox', private: true }));
  // 不复制 node_modules(几百 MB,而且 Windows 上软链要特权):裸包名走 NODE_PATH 回落到仓库里那份。
  // ⚠️ 这只影响"第三方包从哪找",不影响被测的响应头路径 —— 本探针存在的意义正是让 dist 产物
  //   经过**本仓自己的** lib/files-static.js + lib/security.js(它们发 Vary: Origin 与 immutable 头)。
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    NODE_PATH: path.join(ROOT, 'node_modules'),
    TOKEN: 'bootcost-probe-token',
    GATE_DATA_FILE: path.join(SANDBOX, 'gate_data.json'),
    SQLITE_PATH: path.join(SANDBOX, 'gate_data.db'),
    USE_SQLITE: '0',
    RETENTION_DISABLED: '1',
    R2_OUTBOX_DISABLE: '1',
    NODE_ENV: '',
    MULTI: 'off',
  };
  server = spawn(process.execPath, ['server.js'], { cwd: SANDBOX, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const booted = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 25000);
    server.stdout.on('data', (d) => { out += d.toString(); if (/服务器已启动|listening|http:\/\/127/i.test(out)) { clearTimeout(t); resolve(true); } });
    server.stderr.on('data', (d) => { out += d.toString(); });
  });
  if (!booted) { log(out.slice(-400)); die2('沙箱服务器起不来(端口 ' + PORT + ' 被占?)'); }
  if (process.env.KEEP) { log('KEEP=1:沙箱服停在 http://127.0.0.1:' + PORT + ' (根目录 ' + SANDBOX + ')'); }

  const base = 'http://127.0.0.1:' + PORT;
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    log(String(e && e.message).split('\n')[0]);
    die2('起不了 Chromium(先跑 node node_modules/playwright-core/... 的安装,或本机 Edge/Chrome 路径)');
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // 屏蔽 Service Worker:否则 SW 缓存会把重复下载"洗白"成 0 字节,掩盖真实结论
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: () => Promise.reject(new Error('probe')), getRegistration: () => Promise.resolve(undefined), addEventListener() {} },
        configurable: true,
      });
    } catch (e) {}
  });

  const cur = new Map();
  const loads = new Map();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e) => {
    cur.set(e.requestId, { method: (e.request && e.request.method) || 'GET' });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = e.response || {};
    const m = cur.get(e.requestId) || { method: 'GET' };
    cur.set(e.requestId, { method: m.method, url: (r.url || '').split('?')[0], cache: !!r.fromDiskCache, sw: !!r.fromServiceWorker, status: r.status });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = cur.get(e.requestId);
    cur.delete(e.requestId);
    if (!r || /^data:|^blob:/i.test(r.url)) return;
    if (!loads.has(r.url)) loads.set(r.url, []);
    loads.get(r.url).push({ kb: Math.round((e.encodedDataLength || 0) / 1024), cache: r.cache, sw: r.sw, method: r.method || 'GET' });
  });

  const errs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));
  await page.goto(base + '/', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(Number(process.env.SETTLE_MS || 12000));

  const all = [...loads].map(([u, v]) => ({ u: u.replace(base, ''), n: v.length, bytes: v.reduce((s, a) => s + a.kb, 0), v }));
  const totalKB = all.reduce((s, x) => s + x.bytes, 0);
  // 只判 **GET 资源**的重复入网:同一 URL 的多次 POST 是常态(台词预煮把 878 条键切成 10 个 batch
  // 打 /api/tts/batch),那是不同请求体,不是"同一份字节下两遍"。混进来会让探针天天假红。
  const asGets = (x) => x.v.filter((a) => (a.method || 'GET') === 'GET');
  const realDup = all.filter((x) => asGets(x).filter((a) => a.kb > 0).length > 1);
  const dupKB = realDup.reduce((s, x) => { const bs = asGets(x).filter((a) => a.kb > 0).map((a) => a.kb).sort((a, b) => a - b); return s + bs.slice(1).reduce((p, q) => p + q, 0); }, 0);
  const bigOnes = all.filter((x) => x.bytes > SINGLE_FILE_MAX_KB);
  const prefetch = await page.evaluate(() => {
    const n = document.querySelectorAll('link[rel="prefetch"][as="script"]').length;
    const c = document.querySelectorAll('link[rel="prefetch"][as="script"][crossorigin]').length;
    return { n, c };
  });

  console.log('沙箱(与本仓同一套响应头,含 Vary: Origin)首屏入网:' + totalKB + 'KB / 资源 ' + all.length + ' 个');
  console.log('prefetch 链接:' + prefetch.n + ' 条,其中带 crossorigin:' + prefetch.c + ' 条');
  if (realDup.length) console.log('真·重复下载 ' + realDup.length + ' 个,浪费 ' + dupKB + 'KB:\n  ' + realDup.map((x) => x.u.split('/').pop() + ' [' + x.v.map((a) => (a.sw ? 'SW' : a.cache ? 'disk' : a.kb + 'KB')).join(', ') + ']').join('\n  '));
  if (bigOnes.length) console.log('单文件超 ' + SINGLE_FILE_MAX_KB + 'KB:\n  ' + bigOnes.map((x) => x.u.split('/').pop() + ' ' + x.bytes + 'KB').join('\n  '));

  let fail = 0;
  if (prefetch.n && prefetch.c !== prefetch.n) { console.log('❌ 有 prefetch 缺 crossorigin(缓存键分裂 ⇒ chunk 下两遍)'); fail++; }
  if (dupKB > DUP_KB_TOLERANCE) { console.log('❌ 重复下载浪费 ' + dupKB + 'KB > 容差 ' + DUP_KB_TOLERANCE + 'KB'); fail++; }
  if (totalKB > CDP_URL_TOTAL_MAX_KB) { console.log('❌ 首屏总入网 ' + totalKB + 'KB > 上限 ' + CDP_URL_TOTAL_MAX_KB + 'KB'); fail++; }
  if (bigOnes.length) { console.log('❌ 有单资源超 ' + SINGLE_FILE_MAX_KB + 'KB(首屏不该拉这么大的整文件)'); fail++; }
  if (errs.length) { console.log('❌ pageerror ' + errs.length + ' 条:' + errs.slice(0, 2).join(' | ')); fail++; }

  console.log(fail ? '\n=== 首屏入网回归:未过(' + fail + ' 项)===' : '\n=== 首屏入网回归:通过 ===');
  await browser.close();
  cleanup();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('探针异常:' + (e && e.stack || e)); cleanup(); process.exit(2); });
