// probe-hint.js — 上传提示音探针(自带临时服务器,端口 3216,测后自动清理)
// 验证(2026-07-25 主人定):①照片/视频上传成功即随机播 51/52 之一,每次上传只播一个
// ②提示音播放期间暂停场景内其他所有音视频 ③提示音播完后自动恢复
// 用法: node probe-hint.js   退出码: 全过 0,任一失败 1
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const UA = 'ProbeUA-hint/1.0';
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

// ---- 最小合法 PNG 生成器(同 probe-fix4) ----
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++)c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_T[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makeRedPng(sz) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(sz, 0); ihdr.writeUInt32BE(sz, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((sz * 3 + 1) * sz);
  for (let y = 0; y < sz; y++) { const r = y * (sz * 3 + 1); for (let x = 0; x < sz; x++) { raw[r + 1 + x * 3] = 255; raw[r + 2 + x * 3] = 20; raw[r + 3 + x * 3] = 40; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const base = await startServer(3216);
  const gateFile = ROOT + '/gate_data.json';
  const gateBak = ROOT + '/gate_data.json.probeHintBak';
  fs.copyFileSync(gateFile, gateBak);
  const tmpPng = path.join(ROOT, 'probe-hint-upload.png');
  fs.writeFileSync(tmpPng, makeRedPng(8));
  let browser = null;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    children.push({ kill: () => browser.close() });
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const pageErrs = [];
    page.on('pageerror', e => pageErrs.push(e.message));
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__ctx && window.__ctx.vidEl && window.__ctx.openUpload, { timeout: 60000 });
    // 本探针不测弹窗:直接隐藏昵称弹窗/说明书卡,避免遮挡干扰
    await page.evaluate(() => {
      const p = document.getElementById('nickPop'); if (p) p.style.display = 'none';
      const g = document.getElementById('guideCard'); if (g) g.remove();
    });

    // 基线:户外大屏视频正在播放(提示音要把它暂停掉)
    await page.waitForFunction(() => !window.__ctx.vidEl.paused, { timeout: 30000 }).catch(() => {});
    const basePlaying = await page.evaluate(() => !window.__ctx.vidEl.paused);
    ok(basePlaying, '基线:户外大屏视频自动播放中');

    // ===== 第一次上传(走真实 UI:选文件 → 确认上传) =====
    await page.evaluate(() => window.__ctx.openUpload());
    await page.setInputFiles('#file', tmpPng);
    await page.click('#doUp');
    await page.waitForFunction(() => window.__upHint && window.__upHint.src, { timeout: 30000 });
    // play() 的 .then 里才暂停其他媒体(微任务),等一拍再读状态
    await page.waitForFunction(() => window.__ctx.vidEl.paused, { timeout: 8000 }).catch(() => {});
    const hint1 = await page.evaluate(() => ({
      src: window.__upHint.src, paused: window.__upHint.paused,
      vidPaused: window.__ctx.vidEl.paused,
    }));
    ok(/VID_20260725_5[12]\.mp3/.test(hint1.src), `提示音为 51/52 之一 (${decodeURIComponent(hint1.src.split('/').pop())})`);
    ok(!hint1.paused, '提示音正在播放');
    ok(hint1.vidPaused, '提示音播放期间,户外大屏视频已暂停');

    // 等提示音播完 → 大屏应自动恢复
    await page.waitForFunction(() => window.__upHint.ended, { timeout: 120000 });
    await page.waitForTimeout(800);
    const resumed = await page.evaluate(() => !window.__ctx.vidEl.paused);
    ok(resumed, '提示音播完,户外大屏视频自动恢复播放');

    // ===== 第二次上传:再播一次,且是全新的一次播放(每次上传只播一个) =====
    const firstSrc = hint1.src;
    await page.evaluate(() => { window.__upHint = null; window.__ctx.openUpload(); });
    // 先清空再设置:同名文件直接 set 可能不触发 change(浏览器去重),导致 doUp 不显示
    await page.setInputFiles('#file', []);
    await page.setInputFiles('#file', tmpPng);
    await page.waitForSelector('#doUp', { state: 'visible', timeout: 10000 });
    await page.click('#doUp');
    await page.waitForFunction(() => window.__upHint && window.__upHint.src, { timeout: 30000 });
    await page.waitForFunction(() => window.__ctx.vidEl.paused, { timeout: 8000 }).catch(() => {});
    const hint2 = await page.evaluate(() => ({ src: window.__upHint.src, paused: window.__upHint.paused, vidPaused: window.__ctx.vidEl.paused }));
    ok(/VID_20260725_5[12]\.mp3/.test(hint2.src) && !hint2.paused, `第二次上传再次播放提示音 (${decodeURIComponent(hint2.src.split('/').pop())}${hint2.src !== firstSrc ? ',与上次不同' : ',与上次相同(随机允许)'})`);
    ok(hint2.vidPaused, '第二次提示音期间,大屏再次被暂停');
    await page.waitForFunction(() => window.__upHint.ended, { timeout: 120000 });

    // 上传的两张探针照片名字(清理用)
    const uploaded = await page.evaluate(() => (window.__ctx.myUploads || []).slice());
    ok(pageErrs.length === 0, `无 JS 未捕获异常 (${pageErrs.length})${pageErrs[0] ? ': ' + pageErrs[0].slice(0, 120) : ''}`);

    // 清理探针上传的照片文件
    for (const n of uploaded) { try { fs.unlinkSync(path.join(ROOT, 'photos', n)); } catch (e) {} }
  } finally {
    if (browser) await browser.close().catch(() => {});
    children.forEach(c => { try { c.kill(); } catch (_) {} });
    try { fs.copyFileSync(gateBak, gateFile); fs.unlinkSync(gateBak); } catch (e) {}
    try { fs.unlinkSync(tmpPng); } catch (e) {}
  }
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => {
  children.forEach(c => { try { c.kill(); } catch (_) {} });
  console.error('探针执行失败:', e);
  process.exit(1);
});
