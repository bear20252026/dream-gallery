// b612-return-black-probe.cjs — 复现「B612 返回主世界黑屏/回弹」(2026-09-06)
// 真实路径:主世界石门自动传送进 B612 → 点「返回主世界」导航按钮 →
// 连续采样 activeWorld 5 秒(抓“下一帧被石门回弹”)+ 截图像素亮度(抓黑屏)。
// 用法:node scripts/probe/b612-return-black-probe.cjs  (自起临时服务器)
//      BASE_URL=https://cloudbear.cloud node ... (跳过自起服务器,直测线上)
const path = require('path'), fs = require('fs'), os = require('os'), zlib = require('zlib');
const { spawn } = require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b612ret-'));
const PORT = process.env.RET_PROBE_PORT || 3262;

function startServer() {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    c.stdout.on('data', (d) => { if (d.toString().includes('服务器已启动')) resolve(c); });
    c.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 12000);
  });
}

// 极简 PNG 解码(RGBA8 非隔行,Playwright 截图即此格式)→ 返回 {w,h,mean,max}
function pngBrightness(buf) {
  let off = 8, w = 0, h = 0, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp, px = Buffer.alloc(h * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const row = raw.subarray(pos, pos + stride); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) v += paeth(a, b, c);
      px[y * stride + x] = v & 255;
    }
  }
  let sum = 0, mx = 0, n = 0;
  for (let i = 0; i < px.length; i += bpp * 7) { // 隔 7 像素采样提速
    const lum = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    sum += lum; if (lum > mx) mx = lum; n++;
  }
  return { w, h, mean: +(sum / n).toFixed(1), max: mx };
}

(async () => {
  const EXTERNAL = process.env.BASE_URL;
  const child = EXTERNAL ? null : await startServer();
  const ORIGIN = EXTERNAL || 'http://localhost:' + PORT;
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => { if (!/dynamically imported module/.test(e.message)) errs.push(String(e).slice(0, 200)); });
  await page.goto(ORIGIN + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(
    () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS && window.__ctx.loopManager.getFPS() > 0,
    null, { timeout: 90000 }
  );
  await page.waitForTimeout(2500);
  await page.click('#genderOv button:has-text("女")').catch(() => {});

  let fail = 0;
  const ok = (name, cond, extra) => { console.log((cond ? '✓' : '✗') + ' ' + name + (extra ? ' | ' + extra : '')); if (!cond) fail++; };

  // ⓪ 主世界基线亮度(白天沙漠场景) + 后处理管线在位
  const baseShot = await page.screenshot();
  const base = pngBrightness(baseShot);
  const prePP = await page.evaluate(() => typeof window.__ctx.scene.renderPostProcessing);
  ok('主世界基线(亮度=' + base.mean + ',后处理=' + prePP + ')', base.mean > 8 && prePP === 'function');

  // ① 走进石门 → 自动传送进 B612
  await page.evaluate(() => { const q = window.__ctx.player.pl.p; q.x = 0.1; q.z = 56; });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  ok('主世界石门 → B612', true);

  // ② 点真实「返回主世界」按钮,连续采样 5 秒抓回弹
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('返回主世界') && x.style.display !== 'none');
    if (!btn) return false;
    btn.click(); return true;
  });
  ok('返回主世界按钮存在且已点', clicked);
  const trace = await page.evaluate(async () => {
    const seq = [];
    for (let i = 0; i < 20; i++) {
      seq.push(window.__ctx.scene.activeWorld);
      await new Promise((r) => setTimeout(r, 250));
    }
    return { seq, stackLen: window.__ctx.scene.worldStack.length };
  });
  const bounced = trace.seq.includes('b612') && trace.seq[trace.seq.length - 1] !== 'main';
  const stableMain = trace.seq.slice(-4).every((w) => w === 'main');
  console.log('activeWorld 采样:', trace.seq.join(','), '| worldStack:', trace.stackLen);
  ok('返回后稳定停在主世界(无回弹)', stableMain && !bounced);

  // ③ 像素亮度:与主世界基线对比(白天场景亮度应同量级);后处理/角色回迁断言
  await page.waitForTimeout(1200);
  const shot = await page.screenshot();
  const bright = pngBrightness(shot);
  console.log(`截图像素: ${bright.w}x${bright.h} 返回后亮度=${bright.mean}/255 基线=${base.mean}/255`);
  ok('返回后画面非黑屏(亮度≥基线一半)', bright.mean >= base.mean * 0.5);
  const back = await page.evaluate(() => {
    const c = window.__ctx;
    return {
      pp: typeof c.scene.renderPostProcessing,
      avatarParent: c.scene.avatar && c.scene.avatar.parent === c.scene.s ? 'main' : c.scene.avatar ? 'other' : 'none',
      playerAt: (() => { const p = c.player.pl.p; return Math.hypot(p.x - 0.1, p.z - 56).toFixed(1); })(),
    };
  });
  ok('返回后后处理管线恢复', back.pp === 'function', JSON.stringify(back));
  ok('返回后落点在石门外(≥4m)', parseFloat(back.playerAt) >= 4);
  if (back.avatarParent !== 'none') ok('第三人称角色已随返回迁回主场景', back.avatarParent === 'main');

  ok('无未捕获页面异常', errs.length === 0);
  if (errs.length) console.log('页面异常:\n' + errs.slice(0, 6).join('\n'));
  fs.writeFileSync(path.join(__dirname, '..', 'artifacts', 'b612-return-last.png'), shot);
  await b.close();
  if (child) child.kill();
  setTimeout(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} }, 500);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('探针失败:', e && e.message); process.exit(1); });
