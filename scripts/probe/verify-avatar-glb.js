// 线上 GLB 角色验证(2026-08-30):绕过协议门禁后验证 si.glb + 贴图 + 第三人称
import { chromium } from 'playwright-core';

const URL = 'https://cloudbear.cloud/';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// 直接放行 3 个协议勾选,跳过 /agreement → /privacy 流程
await ctx.addInitScript(() => {
  try {
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
  } catch (e) {}
});

const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 220)}`);
});
page.on('pageerror', (e) => logs.push('[pageerror] ' + String(e).slice(0, 280)));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
// 按钮由 avatar.js 模块加载 2s 后创建
await page.waitForSelector('#avatar-demo-btn', { timeout: 40000 });
console.log('✓ 第三人称按钮出现');
await page.click('#avatar-demo-btn');
console.log('已点击,等待 GLB…');

let loaded = false;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => ({
    ok: !!window.__avatarLoaded,
    fail: !!window.__avatarFailed,
  }));
  if (st.fail) break;
  if (st.ok) {
    loaded = true;
    console.log(`✓ __avatarLoaded = true (${(i + 1) * 2}s)`);
    break;
  }
}

if (loaded) {
  // 再点一次确保进入第三人称
  await page.click('#avatar-demo-btn');
  // 等开屏仪式(Chartogne 两阶段)结束,大约 10s 后再点屏幕中央触发 clickToStart
  await page.waitForTimeout(8000);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(4000);

  // 主动点"进入画廊"按钮(开屏第二阶段,aria-label=进入画廊)
  const enterBtn = await page.$('button[aria-label="进入画廊"]');
  if (enterBtn) {
    await enterBtn.click();
    console.log('✓ 点击「进入画廊」');
    // 序章 4 幕,逐幕点屏跳过
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(2500);
      await page.mouse.click(640, 400);
    }
    await page.waitForTimeout(5000);
  } else {
    console.log('(未找到进入画廊按钮)');
  }

  // 抓场景内角色信息(供肉眼对照)
  const sceneInfo = await page.evaluate(() => {
    const ctx = window.__ctx;
    if (!ctx || !ctx.scene || !ctx.scene.avatar) return { hasAvatar: false };
    const a = ctx.scene.avatar;
    const out = {
      hasAvatar: true,
      childCount: a.children.length,
      childName: a.children[0] ? a.children[0].name : '',
      pos: a.position.toArray().map((n) => +n.toFixed(2)),
      visible: a.visible,
    };
    let mesh = 0, mat = 0;
    a.traverse((c) => {
      if (c.isMesh) {
        mesh++;
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of ms) {
          mat++;
          if (m && m.map) out.hasMap = true;
        }
      }
    });
    out.meshes = mesh;
    out.materials = mat;
    return out;
  });
  console.log('-- 场景角色 --');
  console.log(JSON.stringify(sceneInfo, null, 2));
}

const info = await page.evaluate(() => ({
  status: (() => {
    const cs = [...document.querySelectorAll('body > div')].filter(
      (e) => (e.style.cssText || '').includes('top:12px') && (e.style.cssText || '').includes('border-radius:20px')
    );
    return cs[cs.length - 1] ? cs[cs.length - 1].textContent.trim() : '(无)';
  })(),
  loaded: !!window.__avatarLoaded,
  url: location.href,
}));
console.log('-- 状态 --');
console.log(JSON.stringify(info, null, 2));

const bad = logs.filter((l) =>
  /skeleton|skinning|FBXLoader|GLTFLoader|si\.glb|avatar/i.test(l)
);
console.log('-- 关键日志 --');
if (!bad.length) console.log('  (无相关错误/警告)');
bad.slice(0, 12).forEach((l) => console.log('  ' + l));
console.log('(总日志 %d 条)', logs.length);

try {
  await page.screenshot({ path: 'avatar-glb-verify.png' });
  console.log('截图: avatar-glb-verify.png');
} catch (e) {
  console.log('截图失败', String(e).slice(0, 100));
}
await browser.close();
