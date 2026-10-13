// b612-prod-worlds.cjs — 生产世界切换验证(2026-09-10 重写适配两段式开机)
// 2026-10-14 复活:此前它从 2026-09-27/09-30 那批剧情闸上线后就一直假红(只跑到第 2 行)。
// 现在稳定跑到 ①主世界 ②石门→B612 ③B612→国王星 三段全绿(含 storybook / kingStoryScene 入景)。
// ⚠️**还剩一段没修好**:④「星球原点出现返回钮」——把人直接放到 (0,0) 就是垫子中心,
//    那边若同样走"走近才 fire",很可能已经传回 B612 了才去找按钮,于是等钮超时。
//    这一段需要按 planet-logic 的近身/按钮时序重写,别把它的红当成世界切换坏了。
// 路径:闸门→电影 skip→主世界 → 石门传送进 B612 → 导航钮进国王星球 → 返回 B612 → 返回主世界
// 断言:activeWorld 链 / 小地图隐藏与恢复 / storybook+king 模型入景 / ▼隐藏 ⌂恢复 / 零 JS 错误
// 用法:node scripts/probe/b612-prod-worlds.cjs            (自起本地 :3259)
//       BASE_URL=https://cloudbear.cloud node ...          (直测生产)
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const { launch } = require('./browser.js');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3259;
const EXTERNAL = process.env.BASE_URL;
let child = null;
const TMP = path.join(os.tmpdir(), 'b612-prod-worlds-' + Date.now());

function startServer() {
  fs.mkdirSync(TMP, { recursive: true });
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), GATE_DATA_FILE: path.join(TMP, 'g.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => {
      if (d.toString().includes('服务器已启动')) resolve(child);
    });
    child.on('error', reject);
    setTimeout(() => reject(Error('server timeout')), 12000);
  });
}

(async () => {
  if (!EXTERNAL) await startServer();
  const ORIGIN = EXTERNAL || 'http://localhost:' + PORT;
  let pass = 0,
    fail = 0;
  const ok = (c, n, extra) => {
    if (c) {
      pass++;
      console.log('  ✓ ' + n + (extra ? ' | ' + extra : ''));
    } else {
      fail++;
      console.log('  ✗ ' + n + (extra ? ' | ' + extra : ''));
    }
  };
  const errors = [];

  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => {
    if (!/dynamically imported module/.test(e.message)) errors.push(String(e).slice(0, 200));
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('nickPopOff', '1');
    try {
      localStorage.setItem('kunlunWelcomed', String(Date.now()));
      // **回访档**而不是新档:石门按剧情出场(2026-09-27),新档在沙漠里根本看不到门,
      // 一进世界还是画羊三选一的对白 —— 探针不该替玩家做剧情决定,也不该等新档走到那一步。
      localStorage.setItem('b612Scene2', '1');
      localStorage.setItem('b612Page1', '1');
      // 本探针的按钮选择器是按**中文文案**写的(前往 325 / 返回 B612),而站点默认语言会跟着
      // 浏览器走 —— 2026-10-14 这次就撞上 en:标签变成 "Visit 325 …" ⇒ 找不到按钮、点空气。
      // 在这里钉死中文,比给每个选择器写两套语言更稳。
      localStorage.setItem('scriptLang', 'zh');
    } catch (e) {}
  });
  await page.goto(ORIGIN + '/?noopening', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#b612Gate', { timeout: 90000 });
  await page.evaluate(() => {
    const c = document.getElementById('gAgreeChk') || document.createElement('input'); // 2026-10-03 起闸门无勾选框
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b612Gate .gEnter');
  // 等的是**世界接棒**(预加载完成 ∧ 主画布显形),不是"第一帧":headless 没有 GPU,
  // rnd.compileAsync() 在 SwiftShader 上编全站着色器要 15-45s,拿 FPS 当闸门会随机假红
  // (2026-10-14 生产实测:同一份产物两次跑,首帧分别 35s / 45s;FPS 仍然读,只打印不判定)。
  await page.waitForFunction(
    () =>
      window.__preloadState &&
      window.__preloadState() === 'done' &&
      (document.getElementById('c') || { style: {} }).style.visibility === 'visible',
    null,
    { timeout: 90000 }
  );
  const fpsAt = await page
    .waitForFunction(
      () => window.__ctx && window.__ctx.loopManager && window.__ctx.loopManager.getFPS() > 0,
      null,
      { timeout: 90000 }
    )
    .then(() => '首帧 FPS 已出(仅参考)')
    .catch(() => '首帧 90s 未出(仅参考,不影响判定)');
  console.log('  · ' + fpsAt);
  // 新档首次进世界有「性别配色」弹层:overlay.anyOpen() 为真时 portal.js 刻意不挂石门按钮
  // (台词/弹层上方压一个大按钮是 2026-09-30 主人报的"布局混乱")。先按玩家一样选掉它。
  await page.click('#genderOv button:has-text("女")').catch(() => {});
  // 进世界还有一两句台词(#gameDialog)。对话框开着时 portal.js **刻意不挂**石门按钮
  // (2026-09-30 主人报的「羊箱对白还没收尾,『进入』大按钮已压在台词上方」)⇒ 先点完。
  // (2026-09-30 主人报的「羊箱对白还没收尾,『进入』大按钮已压在台词上方」),
  // 所以像玩家一样把台词点完再走向石门。
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      if (!window.__ctx.ui.dialogOpen || !window.__ctx.ui.dialogOpen()) break;
      const d = document.getElementById('gameDialog');
      if (!d) break;
      (d.querySelector('.gs-next') || d).click();
      await sleep(250);
    }
  });
  await page.waitForTimeout(1000); // 场景装配稳定

  // ① 初始主世界
  let w = await page.evaluate(() => window.__ctx.scene.activeWorld);
  ok(w === 'main', '初始主世界(activeWorld=' + w + ')');
  const mapShown0 = await page.evaluate(() => {
    const m = document.getElementById('m');
    return document.body.dataset.world === 'main' && m && m.style.display !== 'none';
  });
  ok(mapShown0, '主世界小地图在场(data-world=main)');

  // ② 石门传送 → B612(与玩家真实路径一致:走到 (0.1,56) 触发自动传送)
  // ⚠️ 三处 2026-09-27/09-30 之后新增的剧情闸,旧探针一概没处理,于是从那时起一直假红
  //    (2026-10-14 A/B 实测:three 移出入口前后都是同样超时,与那次改造无关):
  //    ① 石门**按剧情出场** ⇒ 新档在沙漠里看不到门,得是走过书页一的回访档(scene3-night 现身);
  //    ② 对白/弹层开着时 portal.js **刻意不挂**「Enter B612」按钮(主人报的「布局混乱」),
  //       所以先把回访档的那一两句台词点完;
  //    ③ 自动传送是**武装机**(shared/planet-logic.mjs 的 gateStep):要先有一帧人在 4m 圈外
  //       (那一帧同时点亮按钮),再进圈才 fire ⇒ 一步瞬移进圈永远不触发。
  await page.waitForFunction(() => window.__starGate.visible(), null, { timeout: 25000 });
  await page.evaluate(() => {
    const q = window.__ctx.player.pl.p;
    q.x = 0.1;
    q.z = 46; // 距门 10m:>4m 不算进圈,<15m 该亮按钮
  });
  await page.waitForFunction(
    () => {
      const b = document.getElementById('gateBtn');
      return !!b && b.style.display === 'block';
    },
    null,
    { timeout: 25000 }
  );
  await page.evaluate(() => {
    window.__ctx.player.pl.p.z = 56;
  });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 25000 });
  ok(true, '进入 B612(activeWorld=b612)');
  const mapHidden = await page.evaluate(() => {
    const m = document.getElementById('m');
    return document.body.dataset.world === 'b612' && m && m.style.display === 'none';
  });
  ok(mapHidden, '非主世界小地图已隐藏');
  // storybook GLB 生产走网络,给有界等待(本地秒过)
  await page.waitForFunction(
    () => {
      let found = null;
      const s = window.__ctx.scene.s;
      if (s) s.traverse((o) => { if (o.name === 'b612Storybook') found = o; });
      return !!found;
    },
    null,
    { timeout: 30000 }
  ).catch(() => {});
  const hasStory = await page.evaluate(() => {
    let found = null;
    const s = window.__ctx.scene.s;
    if (s) s.traverse((o) => { if (o.name === 'b612Storybook') found = o; });
    return !!found;
  });
  ok(hasStory, 'B612 storybook 模型已入景');

  // ③ B612 → 国王星球(导航钮,与玩家真实路径一致)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('前往 325'))?.click());
  await page.waitForFunction(() => /^king325$/.test(window.__ctx.scene.activeWorld), null, { timeout: 25000 });
  await page.waitForFunction(
    () => {
      let found = null;
      const s = window.__ctx.scene.s;
      if (s) s.traverse((o) => { if (o.name === 'kingStoryScene') found = o; });
      return !!found;
    },
    null,
    { timeout: 30000 }
  ).catch(() => {});
  const hasKing = await page.evaluate(() => {
    let found = null;
    const s = window.__ctx.scene.s;
    if (s) s.traverse((o) => { if (o.name === 'kingStoryScene') found = o; });
    return !!found;
  });
  ok(hasKing, '进入国王星球 + kingStoryScene 入景');

  // ④ 国王星球 → B612(星球原点出现返回钮)
  await page.evaluate(() => { const q = window.__ctx.player.pl.p; q.x = 0; q.z = 0; });
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('返回 B612') && x.style.display === 'block'),
    null,
    { timeout: 25000 }
  );
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('返回 B612') && x.style.display === 'block')?.click());
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'b612', null, { timeout: 25000 });
  ok(true, '国王星球 → B612');

  // ⑤ B612 → 主世界(官方返回入口)
  await page.evaluate(async () => {
    try {
      await window.__ctx.scene.toMainWorld();
    } catch (e) {}
  });
  await page.waitForFunction(() => window.__ctx.scene.activeWorld === 'main', null, { timeout: 25000 });
  const backMain = await page.evaluate(() => {
    const m = document.getElementById('m');
    const d = document.getElementById('descendBtnSpace');
    const h = document.getElementById('homeBtn');
    return (
      document.body.dataset.world === 'main' &&
      m && m.style.display !== 'none' && // 小地图恢复
      d && d.style.display === 'none' && // ▼ 太空下降键隐藏
      h && h.style.display !== 'none' // ⌂ 回家键恢复
    );
  });
  ok(backMain, '回主世界:小地图恢复、▼隐藏、⌂恢复');

  ok(errors.length === 0, '零 JS 错误', errors.length ? errors[0] : '');
  console.log(`\n结果: ${pass} 通过, ${fail} 失败` + (EXTERNAL ? ' [生产]' : ' [本地]'));
  await b.close();
  if (child) child.kill();
  setTimeout(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} }, 500);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
