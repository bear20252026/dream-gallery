// tp-verify-v2.js — 完整流程验证第三人称相机(原神调参版)
// 走: 协议→答题→进3D世界→等FBX→切viewMode=1→读avatar.visible→截图
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL_ARG = process.argv[2] || 'https://cloudbear.cloud/';
const WAIT_S = parseInt(process.argv[3] || '180', 10);
const log = (l, c) => { const s = `[${new Date().toISOString()}] [${l}] ${c}`; console.log(s); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message); log('PAGE_ERROR', e.message); });

  // 视口设宽一点,更像真实屏幕
  await page.setViewportSize({ width: 1280, height: 720 });

  log('START', '打开 ' + URL_ARG);
  await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // === 步骤1: 点过用户协议 ===
  log('AGREE', '尝试勾选协议复选框...');
  try {
    // 勾选"我已阅读并同意"
    const cb = await page.$('input[type="checkbox"]');
    if (cb) { await cb.click(); log('AGREE', '已勾选复选框'); await page.waitForTimeout(500); }
    // 点击"同意并继续"按钮
    const agreeBtn = await page.$('button:has-text("同意"), button:has-text("继续"), .agree-btn, [class*="agree"]');
    if (agreeBtn) { await agreeBtn.click(); log('AGREE', '点击了同意按钮'); await page.waitForTimeout(2000); }
    // 备用: 点击任何包含"同意"文字的可点击元素
    if (!agreeBtn) {
      await page.evaluate(() => {
        const els = document.querySelectorAll('*');
        for (const el of els) {
          if (el.textContent.includes('同意') && el.textContent.length < 30 &&
              (el.tagName === 'BUTTON' || el.tagName === 'DIV' || el.tagName === 'SPAN' || el.onclick)) {
            el.click(); return true;
          }
        }
        return false;
      }).then(clicked => { if (clicked) log('AGREE', 'JS fallback clicked agree'); });
      await page.waitForTimeout(2000);
    }
  } catch (e) { log('AGREE_WARN', '协议步骤异常: ' + e.message); }

  // === 步骤2: 答题门(如果有) ===
  try {
    // 检查是否有答题界面
    const hasQuiz = await page.evaluate(() => !!document.querySelector('[class*="quiz"], [class*="question"], [id*="quiz"]'));
    if (hasQuiz) {
      log('QUIZ', '检测到答题界面,尝试自动答题...');
      // 选理科
      const sciBtn = await page.$('text=理科');
      if (sciBtn) { await sciBtn.click(); log('QUIZ', '选了理科'); await page.waitForTimeout(1000); }
      // 提交
      const submitBtn = await page.$('text=提交, text=确定, button:has-text("提交")');
      if (submitBtn) { await submitBtn.click(); log('QUIZ', '提交了答案'); await page.waitForTimeout(2000); }
    } else {
      log('QUIZ', '未检测到答题界面(可能已跳过)');
    }
  } catch (e) { log('QUIZ_WARN', '答题步骤异常: ' + e.message); }

  // === 步骤3: 关闭可能的弹窗/遮罩,等3D世界就绪 ===
  log('WORLD', '等待3D世界加载...');
  // 尝试关闭协议/弹窗层
  await page.evaluate(() => {
    // 关闭所有可见的模态框/overlay
    document.querySelectorAll('.modal, .overlay, .dialog, [class*="modal"], [class*="overlay"], [class*="popup"]').forEach(el => {
      if (el.offsetParent !== null) el.style.display = 'none';
    });
    // 如果有"返回画廊"/关闭按钮
    document.querySelectorAll('button, [role="button"], .close-btn, [class*="close"]').forEach(el => {
      const t = el.textContent.trim();
      if (t.includes('返回') || t.includes('关闭') || t.includes('跳过') || t === '×') el.click();
    });
  });
  await page.waitForTimeout(2000);

  // 等头像 FBX 加载完成
  let state = 'pending';
  const deadline = Date.now() + WAIT_S * 1000;
  while (Date.now() < deadline) {
    state = await page.evaluate(() => {
      if (window.__avatarLoaded) return 'loaded';
      if (window.__avatarFailed) return 'failed';
      return 'pending';
    }).catch(() => 'pending');
    if (state !== 'pending') break;
    await page.waitForTimeout(2000);
  }
  log('AVATAR_STATE', state);

  // 再多等几帧确保渲染稳定
  await page.waitForTimeout(1500);

  // === 步骤4: 切第三人称 ===
  const before = await page.evaluate(() => {
    const c = window.__ctx;
    return { viewMode: c?.player?.viewMode,
             avatarVisible: c?.scene?.avatar?.visible ?? 'no-avatar',
             hasAvatar: !!(c?.scene?.avatar),
             inWorld: !!(c?.scene?.s) };
  }).catch(e => ({ err: e.message }));
  log('BEFORE', JSON.stringify(before));

  // 方法1: 直接改 ctx.player.viewMode
  await page.evaluate(() => {
    if (window.__ctx?.player) window.__ctx.player.viewMode = 1;
  });
  // 方法2: 也尝试点"第三人称"按钮(UI上的切换按钮)
  try {
    const tpBtn = await page.$('text=第三人称, button:has-text("第三人称"), [class*="tp-mode"]');
    if (tpBtn) { await tpBtn.click(); log('TP_BTN', '也点了UI第三人称按钮'); }
  } catch (_) {}
  await page.waitForTimeout(2000);

  const after = await page.evaluate(() => {
    const c = window.__ctx;
    const a = c?.scene?.avatar;
    const cam = c?.scene?.cam;
    return {
      viewMode: c?.player?.viewMode,
      avatarVisible: a ? a.visible : 'no-avatar',
      hasAvatar: !!a,
      avatarPos: a ? [a.position.x.toFixed(2), a.position.y.toFixed(2), a.position.z.toFixed(2)] : null,
      camPos: cam ? [cam.position.x.toFixed(2), cam.position.y.toFixed(2), cam.position.z.toFixed(2)] : null,
      sceneMeshes: (() => { let n=0; c?.s?.traverse(o=>{if(o.isMesh)n++}); return n; })()
    };
  }).catch(e => ({ err: e.message }));
  log('AFTER_TP', JSON.stringify(after));

  // 截图:第三人称视角
  await page.screenshot({
    path: path.join(__dirname, 'tp-genshin.png'),
    type: 'png'
  });
  log('SHOT', 'tp-genshin.png');

  // 再截一张第一人称对比
  await page.evaluate(() => { if (window.__ctx?.player) window.__ctx.player.viewMode = 0; });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(__dirname, 'tp-firstperson.png'), type: 'png' });
  log('SHOT_CMP', 'tp-firstperson.png (first-person comparison)');

  const ok = after && after.avatarVisible === true && after.viewMode === 1;
  log('SUMMARY', `avatarLoaded=${state} tpVisible=${after?.avatarVisible} viewMode=${after?.viewMode} ` +
    `camPos=[${after?.camPos}] meshes=${after?.sceneMeshes} pageErrors=${errs.length} => ${ok ? 'PASS ✅' : 'CHECK ⚠️'}`);
  await browser.close();
  process.exit(ok ? 0 : 2);
})().catch(e => { log('FATAL', e.message); process.exit(1); });
