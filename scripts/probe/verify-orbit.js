// 验证第三人称轨道相机:环绕/俯仰/缩放/角色转向移动方向/动画无缝裁剪
const { BASE_URL: URL, launch } = require('./browser');

(async () => {
  const b = await launch(['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('agreementConsented', '1');
      sessionStorage.setItem('privacyConsented', '1');
      sessionStorage.setItem('communityConsented', '1');
      sessionStorage.setItem('nickPopOff', '1');
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
  });
  for (let r = 0; r < 8; r++) {
    const ok = await page.evaluate(() => {
      const kws = ['先逛逛', '跳过', '关闭', '进入画廊'];
      const btns = [...document.querySelectorAll('button, .btn')].filter((x) => {
        if (x.id === 'viewBtn') return false;
        const t = (x.textContent || '').trim();
        return t && kws.some((k) => t.includes(k)) && x.offsetParent !== null;
      });
      if (btns.length) { btns[0].click(); return true; }
      return false;
    });
    if (!ok) break;
    await page.waitForTimeout(1200);
  }
  // 清遮挡层
  await page.evaluate(() => {
    document.querySelectorAll('body > div, body > section, body > aside').forEach((el) => {
      const z = parseInt(el.style.zIndex || getComputedStyle(el).zIndex || '0', 10);
      if (z >= 80 && z < 9000 && el.id !== 'viewBtn' && el.id !== 'j') el.remove();
    });
  });
  await page.waitForTimeout(800);

  // 切第三人称(触发模型加载)
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
  });
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__avatarLoaded)) break;
  }
  await page.waitForTimeout(2000);

  const snap = () => page.evaluate(() => {
    const c = window.__ctx;
    return {
      obYaw: +(c._orbit ? c._orbit.yaw : NaN).toFixed(2),
      obPitch: +(c._orbit ? c._orbit.pitch : NaN).toFixed(2),
      obDist: +(c._orbit ? c._orbit.dist : NaN).toFixed(2),
      plY: +c.player.pl.y.toFixed(2),
      plP: c.player.pl.p.toArray().map((n) => +n.toFixed(2)),
      avRot: +(c.scene.avatar ? c.scene.avatar.rotation.y.toFixed(2) : NaN),
      camPos: c.scene.cam.position.toArray().map((n) => +n.toFixed(1)),
    };
  });

  // ---- 1. 静止拖拽:环绕 yaw/pitch 变化,角色朝向不变 ----
  const s0 = await snap();
  await page.mouse.move(640, 400);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(640 + i * 14, 400 - i * 6, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const s1 = await snap();
  console.log('【环绕】yaw', s0.obYaw, '→', s1.obYaw, s1.obYaw !== s0.obYaw ? '✓' : '✗',
    '| pitch', s0.obPitch, '→', s1.obPitch, s1.obPitch !== s0.obPitch ? '✓' : '✗',
    '| 角色朝向变化(应≈0):', Math.abs(s1.avRot - s0.avRot) < 0.05 ? '✓ 保持' : '✗ ' + (s1.avRot - s0.avRot).toFixed(2));

  // ---- 2. 滚轮缩放 ----
  const d0 = s1.obDist;
  await page.mouse.move(640, 400);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 240);
  await page.waitForTimeout(300);
  const s2 = await snap();
  console.log('【缩放】dist', d0, '→', s2.obDist, s2.obDist > d0 ? '✓ 拉远' : '✗');
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -240);
  await page.waitForTimeout(300);

  // ---- 3. W 前进:位移 + 状态机 walking + 角色转向移动方向 ----
  const s3 = await snap();
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  const s4 = await page.evaluate(() => {
    const clip = window.__avatarClips && window.__avatarClips.loop;
    let hipDrift = null;
    if (clip) {
      const tr = clip.tracks.find((t) => t.name.endsWith('CC_Base_Hip.position') || (t.name.includes('Hip') && t.name.endsWith('.position')));
      if (tr) {
        const n = tr.times.length;
        hipDrift = +Math.hypot(
          tr.values[0] - tr.values[(n - 1) * 3],
          tr.values[1] - tr.values[(n - 1) * 3 + 1],
          tr.values[2] - tr.values[(n - 1) * 3 + 2]
        ).toFixed(3);
      }
    }
    return {
      p: window.__ctx.player.pl.p.toArray().map((n) => +n.toFixed(2)),
      sm: window.__ctx._playerSM.current.name,
      avRot: +window.__ctx.scene.avatar.rotation.y.toFixed(2),
      clipDur: clip ? +clip.duration.toFixed(3) : null,
      hipDrift,
    };
  });
  await page.keyboard.up('w');
  const moved = Math.hypot(s4.p[0] - s3.plP[0], s4.p[2] - s3.plP[2]);
  console.log('【W前进】位移', moved.toFixed(2), 'm', moved > 0.3 ? '✓' : '✗',
    '| 状态机', s4.sm === 'walking' ? 'walking ✓' : '✗ ' + s4.sm,
    '| 角色转向(移动后朝向≠拖拽前):', Math.abs(s4.avRot - s1.avRot) > 0.1 ? '✓' : '✗',
    '| 髋部根运动(应≈单帧步距<0.1):', s4.hipDrift !== null ? s4.hipDrift + (s4.hipDrift < 0.1 ? ' ✓ 已原位化' : ' ✗ 未处理') : 'n/a');

  // ---- 4. 正脸可达:环绕 180° 后相机在角色面前 ----
  await page.evaluate(() => { window.__ctx._orbit.yaw += Math.PI; });
  await page.waitForTimeout(400);
  const s5 = await snap();
  console.log('【正脸】环绕180°后相机位置', JSON.stringify(s5.camPos), '(应绕到角色另一侧)');
  await page.screenshot({ path: 'orbit-verify.png' });
  await b.close();
})();
