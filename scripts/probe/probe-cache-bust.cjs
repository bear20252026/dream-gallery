// probe-cache-bust.cjs — 验证"一次性强制刷新":每个浏览器首次进入刷一次,第二次不再刷
const { launch } = require('../probe/browser.js');
const { BUST_KEY } = require('../../lib/cache-bust.js');

const BASE = process.env.BASE_URL || 'http://localhost:3283/';

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  let pass = 0, total = 0;
  const chk = (name, ok, detail) => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

  // ---- 第一次进入(全新浏览器,localStorage 为空) ----
  const p1 = await ctx.newPage();
  let navs1 = 0;
  p1.on('framenavigated', (f) => { if (f === p1.mainFrame()) navs1++; });
  await p1.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p1.waitForTimeout(6000); // 等脚本触发的 reload 完成
  const mark1 = await p1.evaluate((k) => localStorage.getItem(k), BUST_KEY);
  chk('首次进入:已写入 localStorage 标记', !!mark1, `值=${mark1}`);
  chk('首次进入:发生了 reload(navigations=${navs1})', navs1 >= 2, `navs=${navs1}`);
  // 不查 readyState==='complete':3D 场景/GLB/图片持续加载会长期停在 interactive,
  // 这里只验证 reload 之后页面能正常初始化(场景上下文就绪),而不是资源全部下完。
  const ok1 = await p1
    .waitForFunction(() => window.__ctx && window.__ctx.scene && window.__ctx.scene.s, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  chk('首次进入:reload 后场景正常初始化', ok1);
  await p1.close();

  // ---- 第二次进入(同一浏览器,localStorage 已有标记) ----
  const p2 = await ctx.newPage();
  let navs2 = 0;
  p2.on('framenavigated', (f) => { if (f === p2.mainFrame()) navs2++; });
  await p2.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p2.waitForTimeout(6000);
  chk('第二次进入:不再 reload(navigations 应为 1)', navs2 === 1, `navs=${navs2}`);
  await p2.close();

  // ---- 服务端注入与响应头 ----
  const p3 = await ctx.newPage();
  const resp = await p3.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const cacheCtl = resp.headers()['cache-control'] || '';
  const html = await resp.text();
  chk('主页 Cache-Control 含 no-store', /no-store/.test(cacheCtl), cacheCtl);
  chk('主页 HTML 注入了一次性脚本', html.includes(BUST_KEY));
  chk('注入脚本在 </head> 之前', html.indexOf(BUST_KEY) < html.indexOf('</head>'));
  await p3.close();

  console.log(`\n通过 ${pass}/${total}`);
  await b.close();
  process.exit(pass === total ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
