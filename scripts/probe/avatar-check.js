// avatar-check.js — 专门针对 avatar 的线上黑匣子
// 加载 cloudbear.cloud,等待 FBX(41MB) 跨域加载,汇报 __avatarLoaded / __avatarFailed
// 以及任何 CORS / 网络失败 / pageerror
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL_ARG = process.argv[2] || 'https://cloudbear.cloud/';
const WAIT_S = parseInt(process.argv[3] || '35', 10);
const log = (l, c) => { const s = `[${new Date().toISOString()}] [${l}] ${c}`; console.log(s); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();

  const corsFails = [];
  const pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(e.message); log('PAGE_ERROR', e.message); });
  page.on('requestfailed', req => {
    const u = req.url(); const t = (req.failure() || {}).errorText || '';
    if (/avatar|walk2|fbx|cdn\.cloudbear/i.test(u) || /CORS|blocked|Access-Control/i.test(t)) {
      corsFails.push({ u, t });
      log('REQ_FAIL', `${u} - ${t}`);
    }
  });
  page.on('response', res => {
    if (res.status() >= 400 && /avatar|walk2|fbx|cdn\.cloudbear/i.test(res.url()))
      log('HTTP_' + res.status(), res.url());
  });
  page.on('console', msg => {
    const t = msg.text();
    if (/avatar|walk2|fbx|CORS|跨域|加载失败|FBX/i.test(t)) log('CONSOLE', `[${msg.type()}] ${t}`);
  });

  log('START', '打开 ' + URL_ARG);
  await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 轮询等待 avatar 状态(最多 WAIT_S 秒)
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

  // 同时检查场景里有没有 avatar 网格
  const sceneInfo = await page.evaluate(() => {
    try {
      const s = (window.__ctx && window.__ctx.scene && window.__ctx.scene.s) || null;
      if (!s) return 'no-scene';
      let meshes = 0; s.traverse(o => { if (o.isMesh) meshes++; });
      return 'scene-meshes=' + meshes;
    } catch (e) { return 'err:' + e.message; }
  }).catch(e => 'eval-err:' + e.message);
  log('SCENE', sceneInfo);

  await page.screenshot({ path: path.join(__dirname, 'avatar-final.png') });
  log('SHOT', 'avatar-final.png');
  log('SUMMARY', `state=${state} corsFails=${corsFails.length} pageErrors=${pageErrors.length}`);
  await browser.close();
})().catch(e => { log('FATAL', e.message); process.exit(1); });
