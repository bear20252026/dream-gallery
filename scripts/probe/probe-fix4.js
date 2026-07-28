// probe-fix4.js — 2026-07-25 四项修复联合探针(自带临时服务器,端口 3214,测后自动清理)
// 验证:①开局双弹窗+10秒锁定 ②围墙「心象共鸣」牌可点击开答题 ③本人上传照片纹理加载(缩略图404回退原图) ④开局视频有声播放
// 用法: node probe-fix4.js   退出码: 全过 0,任一失败 1
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const UA = 'ProbeUA-fix4/1.0';
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

// ---- 最小合法 PNG 生成器(红色方块,无任何外部依赖) ----
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
  ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
  const raw = Buffer.alloc((sz * 3 + 1) * sz);
  for (let y = 0; y < sz; y++) { const r = y * (sz * 3 + 1); for (let x = 0; x < sz; x++) { raw[r + 1 + x * 3] = 255; raw[r + 2 + x * 3] = 20; raw[r + 3 + x * 3] = 40; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const base = await startServer(3214);
  const gateBak = ROOT + '/gate_data.json';
  const gateBakCopy = ROOT + '/gate_data.json.probe4bak';
  fs.copyFileSync(gateBak, gateBakCopy);
  const photoName = 'probe-fix4-' + Date.now().toString(36) + '.png';
  const photoPath = path.join(ROOT, 'photos', photoName);
  let browser = null;
  try {
    // ---------- 准备:探针设备上传一张照片 ----------
    const up = await fetch(`${base}/api/upload?dir=photos&name=${photoName}`, {
      method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/octet-stream' }, body: makeRedPng(8),
    });
    const upD = await up.json();
    ok(up.ok && upD.ok, `探针照片已上传 (${photoName})`);

    // ---------- 启动浏览器(允许有声自动播放,验证代码的有声策略) ----------
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    children.push({ kill: () => browser.close() });
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const pageErrs = [];
    page.on('pageerror', e => pageErrs.push(e.message));
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // ---------- ① 开局双弹窗 + 10 秒锁定 ----------
    console.log('\n[① 开局双弹窗]');
    await page.waitForFunction(() => {
      const p = document.getElementById('nickPop');
      return p && p.classList.contains('show') && document.getElementById('guideCard');
    }, { timeout: 20000 });
    const popState = await page.evaluate(() => {
      const x = document.getElementById('nickX');
      const gc = document.getElementById('guideCard');
      const btns = gc ? [...gc.querySelectorAll('button')] : [];
      return {
        nickShown: true,
        xText: x ? x.textContent : '',
        xLocked: x ? getComputedStyle(x).pointerEvents === 'none' : false,
        guideShown: !!gc,
        guideLocked: btns.length > 0 && btns.every(b => b.disabled),
      };
    });
    ok(popState.nickShown, '昵称弹窗开局自动出现(未起名)');
    ok(/^\d+s$/.test(popState.xText) && popState.xLocked, `昵称弹窗 10 秒锁定中(关闭键显示 ${popState.xText || '?'})`);
    ok(popState.guideShown && popState.guideLocked, '说明书卡同屏出现且同步锁定');

    // ---------- ② 围墙「心象共鸣」牌点击(未通过答题时) ----------
    console.log('\n[② 围墙答题牌点击]');
    await page.waitForFunction(() => window.__ctx && window.__ctx.pl && window.__ctx.cam, { timeout: 30000 });
    const quizPassed0 = await page.evaluate(() => window.__ctx.quizPassed);
    const signHit = await page.evaluate(async () => {
      const c = window.__ctx;
      c.pl.p.set(0, 3, 34); c.pl.y = 0; c.pl.pi = 0.2; // 站到围墙牌正前方,面朝 -z 看向牌子
      await new Promise(r => setTimeout(r, 600));      // 等主循环同步相机
      c.onC3D({ clientX: innerWidth / 2, clientY: innerHeight / 2 });
      await new Promise(r => setTimeout(r, 300));
      const ov = document.getElementById('quizOv');
      return { opened: !!(ov && getComputedStyle(ov).display === 'flex') };
    });
    ok(quizPassed0 === false, '探针设备初始未通过答题(quizPassed=false)');
    ok(signHit.opened, '点击围墙「心象共鸣」牌成功打开答题面板');
    await page.evaluate(() => { const ov = document.getElementById('quizOv'); if (ov) ov.style.display = 'none'; });

    // ---------- 通过答题(邀请函通道),为纹理门禁放行 ----------
    const inv = await fetch(base + '/api/quiz/invite', { method: 'POST', headers: { 'User-Agent': UA } });
    const invD = await inv.json();
    ok(inv.ok && invD.passed, '邀请函接口授予探针设备进馆权限');
    await page.waitForFunction(() => window.__ctx.quizPassed === true, { timeout: 15000 });

    // ---------- ③ 本人上传照片纹理加载(缩略图 404 → 回退原图) ----------
    console.log('\n[③ 本人上传照片纹理]');
    const texState = await page.evaluate(async (name) => {
      const c = window.__ctx;
      const g = (c.paintGroups || []).find(g => (g.userData.src || '').endsWith(name));
      if (!g) return { found: false };
      // 站到画框正前方 2 米,触发距离懒加载
      c.pl.p.set(g.userData.ox + g.userData.nx * 2, 2.2, g.userData.oz + g.userData.nz * 2);
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        await new Promise(r => setTimeout(r, 500));
        const m = g.children.find(ch => ch.material && ch.material.map && ch.material.map.image && ch.material.map.image.width === 1024);
        if (!m) {
          // 检查是否已走了 onErr 粉色占位(256 画布)
          const bad = g.children.find(ch => ch.material && ch.material.map && ch.material.map.image && ch.material.map.image.width === 256);
          if (bad) return { found: true, loaded: false, errPlaceholder: true };
          continue;
        }
        const cv = m.material.map.image;
        const px = cv.getContext('2d').getImageData(0, 0, 1, 1).data;
        const isPlaceholder = px[0] === 232 && px[1] === 224 && px[2] === 228; // #e8e0e4
        if (!isPlaceholder) return { found: true, loaded: true, px: [px[0], px[1], px[2]] };
      }
      return { found: true, loaded: false };
    }, photoName);
    ok(texState.found, '探针照片画框已上墙');
    ok(texState.loaded, `本人上传照片纹理加载成功(缩略图404已回退原图${texState.px ? ',像素 ' + texState.px.join(',') : ''})${texState.errPlaceholder ? ' — 走了错误占位!' : ''}`);

    // ---------- ④ 开局视频有声播放 ----------
    console.log('\n[④ 开局视频声音]');
    const vid = await page.evaluate(() => {
      const v = window.__vidEl || (window.__ctx && window.__ctx.vidEl);
      if (!v) return { exists: false };
      return { exists: true, paused: v.paused, muted: v.muted, volume: v.volume, rs: v.readyState };
    });
    ok(vid.exists && !vid.paused, `开局视频自动播放中(paused=${vid.paused}, readyState=${vid.rs})`);
    ok(vid.exists && vid.muted === false, `视频未静音,有声播放(muted=${vid.muted}, volume=${vid.volume})`);

    // ---------- 起名后重进:双弹窗不再出现 ----------
    console.log('\n[起名后重进]');
    await page.evaluate(() => localStorage.setItem('galleryNick', '探针'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);
    const pop2 = await page.evaluate(() => {
      const p = document.getElementById('nickPop');
      return { nick: !!(p && p.classList.contains('show')), guide: !!document.getElementById('guideCard') };
    });
    ok(!pop2.nick && !pop2.guide, '写过雅号后重进,双弹窗均不再出现');

    ok(pageErrs.length === 0, `无 JS 未捕获异常 (${pageErrs.length})${pageErrs[0] ? ': ' + pageErrs[0].slice(0, 120) : ''}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    children.forEach(c => { try { c.kill(); } catch (_) {} });
    // 清理:恢复 gate_data.json + 删除探针照片(含压缩任务可能产生的副本)
    try { fs.copyFileSync(gateBakCopy, gateBak); fs.unlinkSync(gateBakCopy); } catch (e) {}
    try { fs.unlinkSync(photoPath); } catch (e) {}
    try { fs.unlinkSync(photoPath.replace(/\.png$/, '.compressing.png')); } catch (e) {}
  }
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => {
  children.forEach(c => { try { c.kill(); } catch (_) {} });
  console.error('探针执行失败:', e);
  process.exit(1);
});
