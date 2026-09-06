// scene-visual-regression.cjs — 3D 场景截图回归(2026-09-07 场景自动化第三层:拍照对比兜底)
// 四检查点全链路:main-boot(开世界) → b612(石门) → king325(星球) → main-return(返回)
// 每检查点三层断言:
//   ① 语义:activeWorld 到位
//   ② 亮度:非全黑非全白(SwiftShader 下主世界白天≈20-40)
//   ③ 像素:与基线签名对比——归一化块签名(昼夜/曝光漂移被抵消),
//      changedRatio 超标报警。构图级变化(建筑/门/星球消失)必中;
//      小物件回归靠专项探针(b612-return-black 等)守。
// 用法:
//   node scripts/probe/scene-visual-regression.cjs                 # 有基线则对比,无则只记录
//   VR_UPDATE=1 node ...                                           # 重建基线(改画面后跑一次)
//   VR_STRICT=1 node ...                                           # 像素差异超标 → 退出码 1(CI/发版前)
//   BASE_URL=http://127.0.0.1:3000 node ...                        # 打已有服务器(默认自起)
const path = require('path'),
  fs = require('fs'),
  os = require('os');
const { spawn } = require('child_process');
const { launch } = require('./browser.js');
const { brightness, blockSignature, compare } = require('./png-diff.cjs');

const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b612vr-'));
const PORT = process.env.VR_PORT || 3264;
const BASELINE_DIR = path.join(__dirname, 'baselines');
const CROP = { x0: 0.15, y0: 0.1, x1: 0.85, y1: 0.55 }; // 避开小地图/HUD/导航按钮的中窗
const GRID = { gx: 40, gy: 25 };
const WARN_RATIO = 0.1; // 超过 10% 块变化 → 控制台警告(动画/视频噪声区间的上界)
const STRICT_RATIO = 0.25; // VR_STRICT=1 时超过 25% → 失败(构图级变化远超此值)

function startServer() {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    c.stdout.on('data', (d) => {
      if (d.toString().includes('服务器已启动')) resolve(c);
    });
    c.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 12000);
  });
}

(async () => {
  const EXTERNAL = process.env.BASE_URL;
  const child = EXTERNAL ? null : await startServer();
  const ORIGIN = EXTERNAL || 'http://localhost:' + PORT;
  const UPDATE = !!process.env.VR_UPDATE;
  const STRICT = !!process.env.VR_STRICT;
  if (UPDATE && !fs.existsSync(BASELINE_DIR)) fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const ART_DIR = path.join(ROOT, 'scripts', 'artifacts');
  fs.mkdirSync(ART_DIR, { recursive: true }); // CI 全新检出无此目录(gitignore),写对比图前先建

  const b = await launch();
  const page = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = [];
  page.on('pageerror', (e) => {
    if (!/dynamically imported module/.test(e.message)) errs.push(String(e).slice(0, 200));
  });
  await page.goto(ORIGIN + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  await page.waitForFunction(
    () =>
      window.__ctx &&
      window.__ctx.loopManager &&
      window.__ctx.loopManager.getFPS &&
      window.__ctx.loopManager.getFPS() > 0,
    null,
    { timeout: 90000 }
  );

  let fail = 0;
  const ok = (name, cond, extra) => {
    console.log((cond ? '✓' : '✗') + ' ' + name + (extra ? ' | ' + extra : ''));
    if (!cond) fail++;
  };
  async function settle(ms) {
    await page.waitForTimeout(ms);
  }

  // 把主世界昼夜钉在正午。优先用 2026-09-07 P4 的官方注入点 ctx.media.dayTimeSource;
  // 旧代码(线上未发新版)回退 monkey-patch dayNight + 吞 dayHour 写入。
  // 不锁的话 hour=(12+页面秒数/2.5)%24 随启动耗时漂移,跨环境截图不可比
  //(本地午后 vs 线上黄昏,changedRatio 会假报警到 90%+;2026-09-07 线上实测)。
  async function freezeDayNoon() {
    await page.evaluate(() => {
      const c = window.__ctx;
      if (!c) return;
      try {
        const m = c.media;
        if (m && 'dayTimeSource' in m) {
          m.dayTimeSource = function () {
            return 12;
          };
          if (c.desert && c.desert.dayNight) c.desert.dayNight(12);
          return;
        }
        if (c.desert && c.desert.dayNight) {
          c.desert.dayNight(12);
          c.desert.dayNight = function () {};
        }
        if (m && !Object.getOwnPropertyDescriptor(m, 'dayHour')?.freeze) {
          const fh = 12;
          Object.defineProperty(m, 'dayHour', {
            get: function () {
              return fh;
            },
            set: function () {},
            configurable: true,
          });
        }
      } catch (e) {}
    });
  }

  // 检查点通用:语义断言 + 截图 + 亮度 + 像素对比
  async function checkpoint(name, worldRe, settleMs) {
    await settle(settleMs);
    const world = await page.evaluate(() => window.__ctx.scene.activeWorld);
    ok(`[${name}] 世界=${world}`, worldRe.test(world));
    const shot = await page.screenshot();
    const lum = brightness(shot);
    ok(`[${name}] 亮度非黑非白(${lum.mean})`, lum.mean > 4 && lum.mean < 245);
    const base = path.join(BASELINE_DIR, 'vr-' + name + '.png');
    if (UPDATE) {
      fs.writeFileSync(base, shot);
      console.log('  ⤷ 基线已更新: ' + base);
      return;
    }
    if (!fs.existsSync(base)) {
      console.log('  ⤷ 无基线,仅记录(先跑 VR_UPDATE=1 建基线): ' + base);
      return;
    }
    const diff = compare(
      blockSignature(fs.readFileSync(base), CROP, GRID),
      blockSignature(shot, CROP, GRID)
    );
    const verdict =
      diff.changedRatio > STRICT_RATIO ? 'FAIL' : diff.changedRatio > WARN_RATIO ? 'WARN' : 'OK';
    console.log(
      `  ⤷ 像素对比 ${verdict}: changedRatio=${(diff.changedRatio * 100).toFixed(1)}% maxΔ=${diff.maxDelta}`
    );
    if (verdict === 'FAIL') {
      ok(`[${name}] 画面与基线一致`, false, `changedRatio ${(diff.changedRatio * 100).toFixed(1)}% > ${STRICT_RATIO * 100}%`);
    } else if (verdict === 'WARN') {
      console.log(`  ⚠ [${name}] 画面变化 ${Math.round(diff.changedRatio * 100)}%(仅警告;若为有意改动请 VR_UPDATE=1 重建基线)`);
    }
    fs.writeFileSync(path.join(ROOT, 'scripts', 'artifacts', 'vr-' + name + '-last.png'), shot);
  }

  // ① 主世界开世界(等场景/后处理稳定;昼夜钉正午保跨环境可比)
  await page.waitForTimeout(1200);
  await freezeDayNoon();
  await checkpoint('main-boot', /^main$/, 4000);
  // ② 石门 → B612
  await page.evaluate(() => {
    const q = window.__ctx.player.pl.p;
    q.x = 0.1;
    q.z = 56;
  });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 20000 });
  await checkpoint('b612', /^b612$/, 2500);
  // ③ B612 → 325 国王星球
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 325'))?.click()
  );
  await page.waitForFunction(() => /^king325$/.test(window.__ctx.scene.activeWorld), null, { timeout: 20000 });
  await checkpoint('king325', /^king325$/, 2500);
  // ④ 星球 → B612 → 主世界(直接返回按钮;回主世界先解冻昼夜再锁,防中途回到漂移相位)
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((x) => x.textContent.includes('返回主世界'))?.click()
  );
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'main', null, { timeout: 20000 });
  await freezeDayNoon();
  await checkpoint('main-return', /^main$/, 2500);

  ok('无未捕获页面异常', errs.length === 0);
  if (errs.length) console.log('页面异常:\n' + errs.slice(0, 6).join('\n'));
  await b.close();
  if (child) child.kill();
  setTimeout(() => {
    try {
      fs.rmSync(TMP, { recursive: true, force: true });
    } catch {}
  }, 500);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('探针失败:', e && e.message);
  process.exit(1);
});
