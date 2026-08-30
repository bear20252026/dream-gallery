// 视觉验证:完整走用户路径(跳过各门)→ V 键第三人称 → 等模型 → 截图看角色
const { chromium } = require('playwright-core');
const URL = 'https://cloudbear.cloud/';

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
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

  // 跳过开屏两阶段(若存在)
  await page.waitForTimeout(3500);
  await page.mouse.click(640, 400); // 阶段A"轻触启程"
  await page.waitForTimeout(2500);
  // 直接移除遮挡层(开屏/序章/指南卡),绕过 UI 点击时序问题
  await page.evaluate(() => {
    ['openingOv'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    // 序章层:按 z-index 找 overlay 并移除可能的遮罩
    document.querySelectorAll('body > div').forEach((el) => {
      const z = parseInt(el.style.zIndex || '0', 10);
      if (z >= 400 && el.id !== 'viewBtn' && (el.style.pointerEvents || '') !== 'none') {
        if (!el.id) el.remove(); // 无 id 的全屏遮罩(序章/协议残留)
      }
    });
  });
  await page.waitForTimeout(1500);
  // 跳过"心象共鸣"答题门与各弹窗:先点性别,再强制删掉答题/弹窗 UI 层
  await page.evaluate(() => {
    const byText = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
    const male = byText('男 生') || byText('男生');
    if (male) male.click();
  });
  await page.waitForTimeout(1500);
  for (let round = 0; round < 6; round++) {
    const clicked = await page.evaluate(() => {
      const keywords = ['先逛逛', '跳过', '关闭', '稍后再说', '暂不', '取消'];
      const btns = [...document.querySelectorAll('button')].filter((b) => {
        if (b.id === 'viewBtn') return false;
        const t = b.textContent.trim();
        if (!t) return false;
        return keywords.some((k) => t.includes(k)) || /btn-day|close|skip/.test(b.className);
      });
      const visible = btns.filter((b) => b.offsetParent !== null);
      if (visible.length) { visible[0].click(); return visible[0].textContent.trim(); }
      return null;
    });
    if (!clicked) break;
    console.log('  跳过弹窗:', clicked);
    await page.waitForTimeout(1200);
  }
  // 删除答题门/弹窗等大 UI 层(z-index >= 150 的无 id 全屏层),保留 HUD(viewBtn/状态条/任务栏)
  await page.evaluate(() => {
    document.querySelectorAll('body > div, body > section, body > aside').forEach((el) => {
      const z = parseInt(el.style.zIndex || getComputedStyle(el).zIndex || '0', 10);
      if (z >= 150 && z < 9000) el.remove();
    });
  });
  await page.waitForTimeout(800);
  console.log('viewMode:', await page.evaluate(() => window.__ctx.player.viewMode));

  // V 键用 dispatchEvent 触发(页面焦点可能停在契约书输入框,press 会被吞)
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
  });
  await page.waitForTimeout(800);
  console.log('viewMode:', await page.evaluate(() => window.__ctx.player.viewMode));
  console.log('已切第三人称,等待模型下载…');
  let loaded = false;
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__avatarLoaded)) { loaded = true; break; }
  }
  const info = await page.evaluate(() => {
    const c = window.__ctx;
    const a = c.scene.avatar;
    const out = { loaded: !!window.__avatarLoaded, viewMode: c.player.viewMode };
    if (a) {
      out.avatarVisible = a.visible;
      out.avatarPos = a.position.toArray().map((n) => +n.toFixed(2));
      out.camPos = c.scene.cam.position.toArray().map((n) => +n.toFixed(2));
      // 材质贴图
      let maps = 0, meshes = 0;
      a.traverse((o) => { if (o.isMesh) { meshes++; if (o.material && o.material.map) maps++; } });
      out.meshes = meshes; out.maps = maps;
    } else out.noAvatar = true;
    // 相机到角色的向量(确认角色在相机前方视野内)
    if (c.scene.cam && a) {
      const cam = c.scene.cam;
      const toAv = av.position.clone().sub(cam.position);
      const forward = new c.scene.cam.position.constructor(0, 0, -1).applyQuaternion(cam.quaternion);
      out.avInFront = +(toAv.clone().normalize().dot(forward)).toFixed(2);
      out.avDist = +toAv.length().toFixed(2);
    }
    // 状态条文字(模型加载提示)
    const cs = [...document.querySelectorAll('body > div')].filter((e) => (e.style.cssText || '').includes('top:12px'));
    out.status = cs.length ? cs[cs.length - 1].textContent.trim() : '';
    return out;
  }).catch((e) => ({ evalErr: String(e).slice(0, 150) }));
  console.log('状态:', JSON.stringify(info));
  console.log('模型加载:', loaded);

  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'third-person-visual.png' });
  console.log('截图: third-person-visual.png');
  await b.close();
})();
