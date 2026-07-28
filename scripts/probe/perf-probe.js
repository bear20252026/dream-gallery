// perf-probe.js — 视频卡顿归因探针
// 在页面里实测: rAF帧率 / 长任务(主线程阻塞) / 视频丢帧率(getVideoPlaybackQuality) / 硬件解码支持度
// 用法: node perf-probe.js [url] [采样秒数]
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const URL_ARG = args.find(a => a.startsWith('http')) || 'http://localhost:3000/';
const SAMPLE_S = parseInt(args.find(a => /^\d+$/.test(a)) || '20', 10);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[PAGE_ERROR]', e.message));
  page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('[NAV] 页面发生跳转/刷新:', f.url()); });
  page.on('console', m => { if (/context|lost|WebGL/i.test(m.text())) console.log('[CONSOLE]', m.text().slice(0, 200)); });
  await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // === 过审批门:浏览器内申请(带上本机cookie/设备指纹)→ 管理员接口批准 → 重进 ===
  try {
    await page.evaluate(() => fetch('/api/gate/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: '性能探针' })
    }));
    const list = await (await fetch(URL_ARG + 'api/admin/list?token='+encodeURIComponent(process.env.ADMIN_TOKEN||'')+'')).json().catch(() => null);
    const me = list && list.applicants && list.applicants.find(a => a.answer === '性能探针' && a.status === 'pending');
    if (me) {
      await fetch(URL_ARG + 'api/admin/decide?token='+encodeURIComponent(process.env.ADMIN_TOKEN||'')+'', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: me.id, action: 'day' })
      });
      console.log('[GATE] 已批准探针设备:', me.id);
      await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } else console.log('[GATE] 未找到待批准申请(可能已放行):', list ? 'list ok' : 'list fail');
  } catch (e) { console.log('[GATE] 过门失败:', e.message); }

  const SETTLE=parseInt(process.env.SETTLE_S||"20",10)*1000;
  await page.waitForTimeout(SETTLE); // 等场景初始化+着色器编译完成

  // 注入采样器(若页面刷新会重注)
  async function inject() {
    await page.evaluate(() => {
      if (window.__probe) return;
      window.__probe = { raf: [], longTasks: [], start: performance.now() };
      let last = performance.now();
      (function loop() {
        const now = performance.now();
        window.__probe.raf.push(now - last);
        last = now;
        requestAnimationFrame(loop);
      })();
      try {
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) window.__probe.longTasks.push(Math.round(e.duration));
        }).observe({ entryTypes: ['longtask'] });
      } catch (e) {}
    });
  }
  await inject();
  await page.bringToFront();
  // 模拟真实用户:点击一下解除静音(静音+非前台标签页会被 Chrome 降级挂起解码)
  await page.mouse.click(10, 10);
  await page.waitForTimeout(500);

  // 基线采样(静止不动)
  const q0 = await page.evaluate(() => {
    const v = window.__vidEl;
    return v && v.getVideoPlaybackQuality ? { t: v.getVideoPlaybackQuality().totalVideoFrames, d: v.getVideoPlaybackQuality().droppedVideoFrames, ct: v.currentTime, paused: v.paused, rs: v.readyState } : null;
  });
  await page.waitForTimeout(SAMPLE_S * 500);
  const baseline = await page.evaluate(() => {
    const p = window.__probe; const mid = p.raf.length;
    p.__mid = mid;
    return { rafCount: mid, longTasks: p.longTasks.slice() };
  });

  // 模拟移动(按住W键前进,制造"有动作"场景)
  await page.keyboard.down('w');
  await page.waitForTimeout(SAMPLE_S * 500);
  await page.keyboard.up('w');

  const q1 = await page.evaluate(() => {
    const v = window.__vidEl;
    return v && v.getVideoPlaybackQuality ? { t: v.getVideoPlaybackQuality().totalVideoFrames, d: v.getVideoPlaybackQuality().droppedVideoFrames, ct: v.currentTime, paused: v.paused, rs: v.readyState } : null;
  });
  const report = await page.evaluate(async () => {
    const p = window.__probe;
    const all = p.raf.slice(1);
    const mid = p.__mid || Math.floor(all.length / 2);
    const stats = arr => {
      if (!arr.length) return { n: 0 };
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const sorted = [...arr].sort((a, b) => a - b);
      return {
        n: arr.length,
        fps: Math.round(1000 / avg),
        p95ms: Math.round(sorted[Math.floor(arr.length * 0.95)] || 0),
        maxms: Math.round(sorted[sorted.length - 1] || 0),
        over33ms: arr.filter(x => x > 33).length, // 掉帧(<30fps)次数
        over100ms: arr.filter(x => x > 100).length,
      };
    };
    // 视频丢帧:从模块暴露的 ctx 里找不到,直接遍历 three 的视频纹理不可行;
    // 但页面里视频元素是 JS 创建的,不在 DOM。通过 performance 反推不行,换个办法:
    // media.js 把 vidEl 挂到了 ctx,而 ctx 被 main.js 引用…尝试从 window 全局找
    let videoQ = null;
    try {
      // ctx 没挂 window,用调试钩子:遍历所有模块不可行。改用事件:重建一个同 src 视频无意义。
      // → 直接读 __proto__ 不可行,放弃 DOM 路线,用 rVFC 计数:
      // 统计最近采样的长任务
    } catch (e) {}
    return {
      still: stats(all.slice(0, mid)),
      moving: stats(all.slice(mid)),
      longTasks: p.longTasks,
      hwAccel: await navigator.mediaCapabilities.decodingInfo({
        type: 'file',
        video: { contentType: 'video/mp4; codecs="avc1.640028"', width: 1280, height: 720, bitrate: 1500000, framerate: 30 }
      }).then(r => ({ supported: r.supported, smooth: r.smooth, powerEfficient: r.powerEfficient })).catch(e => String(e)),
    };
  });

  console.log('=== 静止(前半段) ===', JSON.stringify(report.still));
  console.log('=== 移动(后半段,按住W) ===', JSON.stringify(report.moving));
  console.log('=== 长任务(>50ms主线程阻塞) ===', JSON.stringify(report.longTasks), '共' + report.longTasks.length + '次');
  console.log('=== H.264 720p 解码能力 ===', JSON.stringify(report.hwAccel));
  if (q0 && q1) {
    const dt = q1.t - q0.t, dd = q1.d - q0.d;
    console.log('=== 视频丢帧 ===', `总帧+${dt} 丢帧+${dd} 丢帧率${dt ? Math.round(dd / dt * 1000) / 10 : 0}%`, `播放进度${q0.ct.toFixed(1)}s→${q1.ct.toFixed(1)}s`, q1.paused ? '(暂停中!)' : '(播放中)', 'readyState=' + q1.rs);
  } else console.log('=== 视频丢帧 === 探针未拿到视频元素');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
