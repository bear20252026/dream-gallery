// perf-profile.js — CDP CPU Profiler:抓出主线程 5 秒长任务里到底在跑什么
const { chromium } = require('playwright-core');
const fs = require('fs');

const URL_ARG = process.argv[2] || 'http://localhost:3100/';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const page = await browser.newPage();
  await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(20000); // 稳态后开始

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); // 1ms 采样
  await cdp.send('Profiler.start');
  console.log('Profiler 录制 30s(含视频播放 + 移动)…');
  await page.waitForTimeout(15000);
  await page.keyboard.down('w');
  await page.waitForTimeout(15000);
  await page.keyboard.up('w');
  const { profile } = await cdp.send('Profiler.stop');

  // 聚合:按函数名统计自持时间
  const nodes = new Map(profile.nodes.map(n => [n.id, n]));
  const selfTime = new Map(); // nodeId -> us
  const deltas = profile.timeDeltas;
  const samples = profile.samples;
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i], dt = deltas[i] || 0;
    selfTime.set(id, (selfTime.get(id) || 0) + dt);
  }
  const byFunc = new Map(); // "func url:line" -> us
  for (const [id, us] of selfTime) {
    const n = nodes.get(id); if (!n) continue;
    const cf = n.callFrame;
    const key = `${cf.functionName || '(匿名)'} ${cf.url.replace(/^.*\//, '')}:${cf.lineNumber}`;
    byFunc.set(key, (byFunc.get(key) || 0) + us);
  }
  const top = [...byFunc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  const total = deltas.reduce((a, b) => a + b, 0);
  console.log(`总采样 ${(total / 1e6).toFixed(1)}s,Top25 热点(自持时间):`);
  for (const [k, us] of top) console.log(`  ${(us / 1e6).toFixed(2)}s  ${(us / total * 100).toFixed(1)}%  ${k}`);
  fs.writeFileSync('perf-profile.json', JSON.stringify(profile));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
