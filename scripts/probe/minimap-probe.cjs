// minimap-probe.cjs — 羊皮纸罗盘小地图专项探针(2026-09-10 圆形改造验收)
// 覆盖:图集预渲染/纸色与等高线/建筑底图无霓虹残留+朱砂印章/箭头随朝向旋转/
//   禁区 hatch/单帧耗时/圆形尺寸切换/z 登记/世界隐藏声明
// 用法:node scripts/probe/minimap-probe.cjs   (自起 :3225 server)
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3225;
const TMP = path.join(os.tmpdir(), 'minimap-probe-' + Date.now());
fs.mkdirSync(TMP, { recursive: true });

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
  const child = await startServer();
  const ORIGIN = 'http://localhost:' + PORT;
  let fail = 0;
  const ok = (name, cond, extra) => {
    console.log((cond ? '✓' : '✗') + ' ' + name + (extra ? ' | ' + extra : ''));
    if (!cond) fail++;
  };

  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    try {
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      // 旧档:跳过剧本链(叫醒词/画板会盖住小地图,本探针只管地图本身)
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
    } catch (e) {}
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
    () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0,
    null,
    { timeout: 90000 }
  );
  await page.waitForTimeout(1000);

  // ① 罗盘形态:圆形、150、z 收编
  const shape = await page.evaluate(() => {
    const m = document.getElementById('m');
    const cs = getComputedStyle(m);
    return { w: m.offsetWidth, radius: cs.borderRadius, z: cs.zIndex };
  });
  ok('[形态] 圆形 150px', shape.w === 150, JSON.stringify(shape));
  ok('[形态] border-radius 50%', /50%/.test(shape.radius));
  ok('[形态] z=20(登记册 mapPanel)', shape.z === '20');

  // ② 图集预渲染(requestIdleCallback 兜底 8s)
  await page.waitForFunction(() => window.__minimap && window.__minimap.atlasReady, null, { timeout: 15000 });
  ok('[图集] 预渲染完成', true);

  // ③ 图集暖色纸调主导(沙色水彩洗+#f3ead2 纸底,绝不允许回到旧版深底)
  const atlasInfo = await page.evaluate(() => {
    const a = window.__minimap.atlas;
    const t = document.createElement('canvas');
    t.width = 200;
    t.height = 200;
    const c = t.getContext('2d');
    c.drawImage(a, 300, 300, 400, 400, 0, 0, 200, 200); // 西南缓丘区 400m² 缩采
    const d = c.getImageData(0, 0, 200, 200).data;
    let warm = 0, dark = 0, rSum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      rSum += r;
      n++;
      if (r > 200 && r - bl > 8) warm++;
      if (r < 60 && g < 60 && bl < 60) dark++;
    }
    return { avgR: Math.round(rSum / n), warm, dark };
  });
  ok('[图集] 暖纸调主导(均 R>150,旧深底应≈40)', atlasInfo.avgR > 150, JSON.stringify(atlasInfo));
  ok('[图集] 无深底残留(暗像素<400)', atlasInfo.dark < 400, 'dark=' + atlasInfo.dark);

  // 先进建筑区(惰性触发底图绘制),再扫建筑底图
  await page.evaluate(() => { const p = window.__ctx.player.pl; p.p.x = 0; p.p.z = 10; });
  await page.waitForTimeout(500);
  // ④ 建筑底图:无粉霓虹残留 + 有墨线 + 有朱砂印章
  const baseInfo = await page.evaluate(() => {
    const a = window.__minimap.buildBase;
    const t = document.createElement('canvas');
    t.width = a.width;
    t.height = a.height;
    const c = t.getContext('2d');
    c.drawImage(a, 0, 0);
    const d = c.getImageData(0, 0, a.width, a.height).data;
    let neon = 0, inkPix = 0, sealPix = 0, opaque = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      if (d[i + 3] > 200) opaque++;
      if (r > 230 && g < 120 && bl > 110 && bl < 190) neon++; // 旧 #ff5090 系
      if (r < 110 && g < 100 && bl < 95) inkPix++;
      if (r > 140 && r < 190 && g < 100 && bl < 80) sealPix++;
    }
    return { neon, inkPix, sealPix, opaque, total: a.width * a.height };
  });
  ok('[建筑底图] 已绘制(不透明像素>60%)', baseInfo.opaque > baseInfo.total * 0.6, 'opaque=' + baseInfo.opaque);
  ok('[建筑底图] 无粉霓虹残留', baseInfo.neon === 0, 'neon=' + baseInfo.neon);
  ok('[建筑底图] 墨线存在', baseInfo.inkPix > 200 && baseInfo.inkPix < baseInfo.total * 0.5, 'ink=' + baseInfo.inkPix);
  ok('[建筑底图] 朱砂印章存在', baseInfo.sealPix > 30, 'seal=' + baseInfo.sealPix);

  // ⑤ 沙漠模式:单帧耗时 + 箭头随朝向旋转
  await page.evaluate(() => { const p = window.__ctx.player.pl; p.p.x = -3.5; p.p.z = 70.5; }); // 出生点(沙漠视野)
  await page.waitForTimeout(400);
  const perf = await page.evaluate(() => window.__minimap.lastMs);
  ok('[性能] 单帧 drawMap < 1.5ms(旧版沙漠 1200+ 采样/帧已废)', perf < 1.5, 'lastMs=' + perf.toFixed(2));
  const arrowProbe = await page.evaluate(() => {
    const mm = window.__minimap;
    const c = document.getElementById('mc').getContext('2d');
    const minRed = (x, y) => {
      const d = c.getImageData(x - 2, y - 2, 4, 4).data;
      let mn = 255;
      for (let i = 0; i < d.length; i += 4) mn = Math.min(mn, d[i]);
      return mn;
    };
    const patch = (x, y) => {
      c.save();
      c.clearRect(x - 12, y - 12, 24, 24);
      c.fillStyle = '#f3ead2';
      c.fillRect(x - 12, y - 12, 24, 24);
      c.restore();
    };
    // 同步任务内:画朝上箭头 → 读尖部;擦净 → 画朝左(π/2,正上方是箭身外侧空纸) → 读同一点
    patch(60, 60);
    mm.drawArrowAt(60, 60, 0, 1);
    const upMin = minRed(60, 60 - 4);
    patch(60, 60);
    mm.drawArrowAt(60, 60, Math.PI / 2, 1);
    const sideMin = minRed(60, 60 - 4);
    patch(60, 60); // 还原
    return { upMin, sideMin };
  });
  ok('[玩家] 箭头朝上时尖部见墨(最小R<150)', arrowProbe.upMin < 150, JSON.stringify(arrowProbe));
  ok('[玩家] 转向 90° 后原尖部无墨(随朝向旋转)', arrowProbe.sideMin > 170, JSON.stringify(arrowProbe));

  // ⑥ 万镜画廊禁区 hatch(玩家传到展厅旁)
  await page.evaluate(() => { const p = window.__ctx.player.pl; p.p.x = 785; p.p.z = 600; });
  await page.waitForTimeout(400);
  const keepOut = await page.evaluate(() => window.__minimap.lastKeepOut);
  ok('[禁区] 万镜画廊 hatch 已上图', keepOut);

  // ⑦ 建筑区视图 + 目检截图
  await page.evaluate(() => { const p = window.__ctx.player.pl; p.p.x = 0; p.p.z = 10; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ROOT, 'scripts', 'artifacts', 'minimap-building.png'), clip: { x: 1040, y: 0, width: 240, height: 240 } });

  // ⑧ 放大切换 ⌀260
  await page.click('#m button');
  await page.waitForTimeout(500);
  const bigW = await page.evaluate(() => document.getElementById('m').offsetWidth);
  await page.screenshot({ path: path.join(ROOT, 'scripts', 'artifacts', 'minimap-big.png'), clip: { x: 930, y: 0, width: 350, height: 350 } });
  await page.click('#m button');
  await page.waitForTimeout(500);
  const smallW = await page.evaluate(() => document.getElementById('m').offsetWidth);
  ok('[放大] ⤢ 切 260 / 回 150', bigW === 260 && smallW === 150, bigW + '→' + smallW);

  // ⑨ 世界隐藏声明(data-world-ui 机制;完整切换链由 b612-prod-worlds 覆盖)
  const worldUi = await page.evaluate(() => document.getElementById('m').dataset.worldUi);
  ok('[世界] data-world-ui=main 声明在', worldUi === 'main');

  ok('无未捕获页面异常', errs.length === 0, errs.slice(0, 3).join(' || '));
  console.log(fail ? 'FAIL ' + fail : 'PASS 全部通过');
  await b.close();
  child.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
