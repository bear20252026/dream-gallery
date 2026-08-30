// 精确诊断:角色世界坐标 → 屏幕投影,确定它是否在相机视野内
const { chromium } = require('playwright-core');
const URL = 'https://cloudbear.cloud/';

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('agreementConsented', '1');
      sessionStorage.setItem('privacyConsented', '1');
      sessionStorage.setItem('communityConsented', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = document.getElementById('openingOv');
    if (el) el.remove();
    document.querySelectorAll('body > div').forEach((d) => {
      const z = parseInt(d.style.zIndex || '0', 10);
      if (z >= 400 && z < 9000 && !d.id) d.remove();
    });
  });
  await page.waitForTimeout(1200);
  // 切第三人称
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
  });
  // 等模型
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__avatarLoaded)) break;
  }
  await page.waitForTimeout(2500);
  // 清掉答题门/弹窗等大 UI 层(z-index 150~9000),保留 HUD,让角色可见
  await page.evaluate(() => {
    document.querySelectorAll('body > div, body > section, body > aside').forEach((el) => {
      const z = parseInt(el.style.zIndex || getComputedStyle(el).zIndex || '0', 10);
      if (z >= 150 && z < 9000) el.remove();
    });
  });
  await page.waitForTimeout(800);

  const diag = await page.evaluate(() => {
    const c = window.__ctx;
    if (!c || !c.scene) return { err: 'no ctx' };
    const cam = c.scene.cam;
    const av = c.scene.avatar;
    const out = { viewMode: c.player.viewMode };
    out.pl = c.player.pl.p.toArray().map((n) => +n.toFixed(2));
    out.plY_rot = +c.player.pl.y.toFixed(2);
    if (!av) { out.noAvatar = true; return out; }
    out.avVisible = av.visible;
    out.avPos = av.position.toArray().map((n) => +n.toFixed(2));
    out.avInScene = !!av.parent;
    out.avParentType = av.parent ? av.parent.type : null;
    out.avChildren = av.children.length;
    // 内层模型
    if (av.children[0]) {
      const inner = av.children[0];
      out.innerPos = inner.position.toArray().map((n) => +n.toFixed(3));
      out.innerScale = inner.scale.toArray().map((n) => +n.toFixed(3));
    }
    // 世界坐标(考虑层级变换)
    av.updateMatrixWorld(true);
    const wp = new (av.position.constructor)(0, 0, 0);
    av.getWorldPosition(wp);
    out.avWorldPos = wp.toArray().map((n) => +n.toFixed(2));
    // 相机
    out.camPos = cam.position.toArray().map((n) => +n.toFixed(2));
    out.camNear = cam.near, out.camFar = cam.far;
    // 投影到屏幕
    const sp = wp.clone().project(cam);
    out.screenX = +((sp.x * 0.5 + 0.5) * 1280).toFixed(0);
    out.screenY = +((-sp.y * 0.5 + 0.5) * 800).toFixed(0);
    out.inFront = sp.z < 1; // z<1 表示在视锥内(前方)
    out.ndc = [sp.x.toFixed(2), sp.y.toFixed(2), sp.z.toFixed(3)];
    // 距离
    out.dist = +wp.distanceTo(cam.position).toFixed(2);
    // 场景里是否真的挂着
    let found = false;
    c.scene.s.traverse((o) => { if (o === av) found = true; });
    out.inSceneTree = found;
    return out;
  });

  console.log(JSON.stringify(diag, null, 2));
  await page.screenshot({ path: 'third-person-diag.png' });
  console.log('截图: third-person-diag.png');
  await b.close();
})();
