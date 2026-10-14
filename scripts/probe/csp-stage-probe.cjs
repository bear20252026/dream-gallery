#!/usr/bin/env node
// csp-stage-probe.cjs — 分阶段 CSP(审计 H)的验收探针:量"真摘掉 unsafe-inline 会拦住谁"
//
// 为什么需要它而不是只看单测:单测能证明"头发对了",证明不了"页面在严格策略下还跑得起来"。
// 会被 script-src 拦掉的写法有两类,都藏在运行时:①JS 用 innerHTML 拼出 `onclick="…"`;
// ②运行时插入内联 <script>。这两类在浏览器里是"静默失灵"(按钮点了没反应),没有异常抛出。
// 所以这里在页面最前面挂一个 `securitypolicyviolation` 收集器,把每一条违规(含 report-only 的)
// 抓下来分类。
//
// ⚠️实测到的一个前提,决定了为什么第一阶段只能是 Report-Only:线上每个 HTML 响应里都有一条
//   **Cloudflare 边缘注入**的内联 jsd beacon(/cdn-cgi/challenge-platform/…/main.js,正文含每次
//   请求变的 r/t ⇒ 加不了 sha256 白名单)。摘掉 'unsafe-inline' 会顺手把它挡掉 = 削弱 CDN 的机器人
//   打分。那是要主人拍板的 CDN 侧取舍,不是本仓代码问题 ⇒ 探针把它单独归成"已知/待拍板"一类,
//   只有**除它以外**还有违规才判红。
//
// 用法:
//   node scripts/probe/csp-stage-probe.cjs            # 本地沙箱(起本仓 server.js,产物=dist,无 CDN 噪声)
//   node scripts/probe/csp-stage-probe.cjs --prod     # 打线上(会看到 CF 那条,正是要量的)
//   node scripts/probe/csp-stage-probe.cjs --enforce  # 沙箱里带 CSP_STRICT_MODE=enforce 起(验第二阶段行为)
// 结论行:CSP_STAGE_OK / CSP_STAGE_FAIL(有非 CF 来源的违规或页面没起来)/ CSP_STAGE_UNDECIDED(起不来/没浏览器)
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ARGS = process.argv.slice(2);
const PROD = ARGS.includes('--prod');
const ENFORCE = ARGS.includes('--enforce');
const PORT = 3477 + (process.uid || 0) % 50;
const SANDBOX = path.join(os.tmpdir(), 'csp-stage-' + Date.now());
const CF_MARKER = 'challenge-platform';

const pw = (() => { try { return require('playwright'); } catch (e) { try { return require('playwright-core'); } catch (e2) { return null; } } })();

// 登记表从 lib/security.js 取(唯一裁决源,这里绝不抄一份路径清单)
const { CSP_INLINE_FREE_PAGES } = require(path.join(ROOT, 'lib', 'security.js'));
const PAGES = [...new Map(CSP_INLINE_FREE_PAGES.map((e) => [e.file, e])).values()];

let server = null;
function cleanup() {
  if (server) { try { server.kill(); } catch (e) {} server = null; }
  if (!PROD && fs.existsSync(SANDBOX)) { try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {} }
}
process.on('SIGINT', () => { cleanup(); console.log('CSP_STAGE_UNDECIDED(手工中断)'); process.exit(130); });

function say(...l) { console.log(...l); }

async function fetchText(url) {
  const r = await fetch(url);
  const body = await r.text();
  return { status: r.status, body, headers: Object.fromEntries([...r.headers.entries()]) };
}

function inlineScripts(html) {
  const out = [];
  // 组 1 = 属性,组 2 = 正文(那个 (?!…) 是零宽的,不占组号 —— 早先按 m[3] 取正文,
  // 内联脚本一多就 undefined.includes() 崩掉,是负向测试抓出来的)
  const re = /<script((?![^>]*\bsrc=)[^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[2]);
  return out;
}

(async () => {
  if (!pw) { say('❌ 没有 playwright / playwright-core ⇒ 无法在浏览器里收违规'); console.log('CSP_STAGE_UNDECIDED(无浏览器)'); process.exit(2); }
  if (!PAGES.length) { say('❌ 登记表是空的 ⇒ 没有页面可测'); console.log('CSP_STAGE_UNDECIDED(登记表为空)'); process.exit(2); }

  let base = 'https://cloudbear.cloud';
  if (!PROD) {
    const cpd = (s, d) => fs.cpSync(s, d, { recursive: true });
    fs.mkdirSync(path.join(SANDBOX, 'src'), { recursive: true });
    cpd(path.join(ROOT, 'server.js'), path.join(SANDBOX, 'server.js'));
    cpd(path.join(ROOT, 'lib'), path.join(SANDBOX, 'lib'));
    cpd(path.join(ROOT, 'src', 'shared'), path.join(SANDBOX, 'src', 'shared'));
    cpd(path.join(ROOT, 'dist'), SANDBOX);
    for (const d of ['photos', 'videos', 'music', 'models', '.chunks', 'hill']) fs.mkdirSync(path.join(SANDBOX, d), { recursive: true });
    fs.writeFileSync(path.join(SANDBOX, 'package.json'), JSON.stringify({ name: 'cspstage-sandbox', private: true }));
    const env = {
      ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_PATH: path.join(ROOT, 'node_modules'),
      TOKEN: 'csp-stage-probe-token', GATE_DATA_FILE: path.join(SANDBOX, 'gate_data.json'),
      SQLITE_PATH: path.join(SANDBOX, 'gate_data.db'), USE_SQLITE: '0', RETENTION_DISABLED: '1',
      R2_OUTBOX_DISABLE: '1', NODE_ENV: '', MULTI: 'off',
    };
    if (ENFORCE) env.CSP_STRICT_MODE = 'enforce';
    server = cp.spawn(process.execPath, ['server.js'], { cwd: SANDBOX, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const booted = await new Promise((res) => {
      const t = setTimeout(() => res(false), 25000);
      const h = (d) => { out += d.toString(); if (/服务器已启动|listening|http:\/\/127/i.test(out)) { clearTimeout(t); res(true); } };
      server.stdout.on('data', h); server.stderr.on('data', h);
    });
    if (!booted) { say('❌ 沙箱服务器起不来(端口 ' + PORT + ' 被占?):\n' + out.slice(-400)); console.log('CSP_STAGE_UNDECIDED(沙箱起不来)'); cleanup(); process.exit(2); }
    base = 'http://127.0.0.1:' + PORT;
  }
  say('目标:' + base + (ENFORCE ? ' [enforce 档]' : PROD ? ' [线上]' : ' [沙箱 Report-Only]'));

  const browser = await pw.chromium.launch();
  let unexpected = 0, cfKnown = 0, headerBad = 0, bootBad = 0;
  for (const entry of PAGES) {
    const url = base + entry.path;
    const row = { page: entry.path, file: entry.file };
    // ① HTTP 层:头对不对、响应里 ourselves 有没有内联
    let html = '';
    try {
      const r = await fetchText(url);
      row.status = r.status;
      html = r.body;
      const enforced = r.headers['content-security-policy'] || '';
      const ro = r.headers['content-security-policy-report-only'] || '';
      const strictSrc = (ro.match(/script-src[^;]*/) || [''])[0];
      const enforcedSrc = (enforced.match(/script-src[^;]*/) || [''])[0];
      if (r.status !== 200) { row.http = 'HTTP ' + r.status; bootBad++; }
      else if (ENFORCE) {
        row.http = "enforced 无 unsafe-inline?" + !/unsafe-inline/.test(enforcedSrc);
        if (/unsafe-inline/.test(enforcedSrc)) headerBad++;
      } else {
        row.http = 'ro=' + (ro ? (/\bunsafe-inline\b/.test(strictSrc) ? '有但带 inline(错)' : '有且已摘 inline') : '缺(错)')
          + ' | base 仍带 inline=' + /unsafe-inline/.test(enforcedSrc);
        if (!ro || /\bunsafe-inline\b/.test(strictSrc) || !/unsafe-inline/.test(enforcedSrc)) headerBad++;
      }
    } catch (e) { row.http = '取不到:' + e.message; headerBad++; }

    // ② 我们自己的 HTML 里有没有内联(线上多出来的那条应是 CF 的)
    const inln = inlineScripts(html);
    const ours = inln.filter((s) => !s.includes(CF_MARKER));
    const cf = inln.length - ours.length;
    row.inline = '内联 ' + inln.length + ' 条(我们的 ' + ours.length + ',CF ' + cf + ')';
    if (ours.length) { say('   ⚠️ ' + entry.path + ' 的响应里出现非 CF 内联脚本:' + ours[0].slice(0, 80)); }

    // ③ 浏览器层:装收集器,量真实违规(含 report-only)
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 120)));
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (ev) => {
        window.__csp.push({
          blocked: String(ev.blockedURI || '').slice(0, 120),
          directive: String(ev.effectiveDirective || ev.violatedDirective || ''),
          source: String(ev.sourceFile || ''),
          line: ev.lineNumber, col: ev.columnNumber,
        });
      }, true);
    });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(PROD ? 5000 : 3500); // 给模块图与首帧一点时间
    } catch (e) { row.boot = 'goto 超时:' + String(e.message).slice(0, 60); bootBad++; }
    const viols = await page.evaluate(() => window.__csp || []).catch(() => null);
    if (!viols) { row.boot = (row.boot || '') + ' 读不到收集器'; bootBad++; }
    // ⚠️"零违规"只有在页面真的跑了它自己的代码时才有意义:模块 404/没执行同样是零违规,却是假绿。
    // 所以这里正面量一次"外部 JS 确实取到了、且首帧画出来了"。
    const boot = await page.evaluate(() => {
      const rs = performance.getEntriesByType('resource').filter((r) => /\.js(\?|$)/.test(r.name) && r.responseStatus !== 404);
      const failed = rs.filter((r) => r.transferSize === 0 && r.decodedBodySize === 0);
      const c = document.querySelector('canvas');
      return { js: rs.length, zero: failed.length, canvas: !!(c && c.width > 0 && c.height > 0), ready: document.readyState };
    }).catch(() => null);
    row.boot = (boot ? 'JS ' + boot.js + ' 个(空响应 ' + boot.zero + '),canvas ' + (boot.canvas ? '已画' : '无') + ',' + boot.ready : '读不到')
      + (row.boot ? ' | ' + row.boot : '');
    if (!boot || boot.js === 0 || boot.zero > 0) bootBad++;
    // CF 的那条只能靠**条数**归位:内联违规里,不超过"响应里 CF 注入的内联脚本条数"的那部分算已知,
    // 超出的必然是我们自己的代码(innerHTML 拼 onclick、运行时插内联 script 之类)⇒ 判红。
    // (不能用 sourceFile 区分:Chrome 对内联脚本把 sourceFile 填成**文档 URL**,与 CF/我们的都一样。)
    const inlineViol = (viols || []).filter((v) => v.blocked === 'inline');
    const attributed = Math.max(0, inlineViol.length - cf);
    row.viol = (viols || []).length ? JSON.stringify((viols || []).slice(0, 4)
      .map((v) => v.directive + ':' + v.blocked + (v.line ? '@' + v.line : '') + (v.source ? ' ←' + String(v.source).replace(/^https?:\/\/[^/]+/, '') : ''))) : '无';
    const violVerdict = attributed > 0 ? '❌ 有 ' + attributed + ' 条内联违规不是 CF 的'
      : (inlineViol.length ? '✓ 仅 CF 注入(' + inlineViol.length + ' 条)' : '✓ 零违规');
    // 结论优先级:页面没跑起来 > 违规归属。假绿的"零违规"比红更危险,不能被后面那行覆盖掉。
    if (!boot || boot.js === 0 || boot.zero > 0) row.verdict = '❌ 页面没跑到自己的 JS ⇒ 零违规不作数';
    else if (attributed > 0) { unexpected += attributed; row.verdict = violVerdict; }
    else { if (inlineViol.length) cfKnown += inlineViol.length; row.verdict = violVerdict; }
    if (pageErrors.length) { row.perr = 'JS 异常 ' + pageErrors.length + ' 条:' + pageErrors[0]; bootBad++; }
    await ctx.close();
    say('  ' + entry.path.padEnd(14) + ' | ' + row.http + ' | ' + row.inline + ' | 违规 ' + ((viols || []).length) + ' | ' + row.verdict
      + (row.perr ? ' | ' + row.perr : '') + (row.boot ? ' | ' + row.boot : ''));
    // 违规明细只在有违规时另起一行打全:一行表格里塞不下 4 条 directive+行号,
    // 而"谁被拦了"恰恰是这项测量唯一有用的部分(2026-10-14 第一次判 '/' 时就是因为没打这个,
    // 只能看到"违规 4"而分不清那条 importmap 算不算被拦)。
    if ((viols || []).length) say('        ↳ ' + row.viol);
  }
  await browser.close();
  cleanup();

  say('');
  say('合计:非 CF 的内联违规 ' + unexpected + ' 条 | CF 注入(待拍板) ' + cfKnown + ' 条 | 头部/登记表问题 ' + headerBad + ' | 页面加载问题 ' + bootBad);
  if (unexpected || headerBad) { say('❌ 摘掉 unsafe-inline 会打断' + (unexpected ? '我们自己的代码' : '登记承诺') + ' ⇒ 先把内联改成 addEventListener,或把该页从登记表划掉'); console.log('CSP_STAGE_FAIL'); process.exit(1); }
  if (bootBad) { say('❌ 有页面没起来/读不到违规 ⇒ 判不了'); console.log('CSP_STAGE_UNDECIDED(页面没起来)'); process.exit(2); }
  if (cfKnown && !ENFORCE) say('ℹ️  线上每条响应都被 CF 注入了一个内联 jsd beacon。它被记为"已知",但**enforce 之后它就不跑了** ⇒ 要不要为此在 Cloudflare 控制台对这些路径关掉 Bot 打分,是主人的取舍。');
  console.log('CSP_STAGE_OK');
})().catch((e) => { say('❌ 探针异常:' + e.stack); cleanup(); console.log('CSP_STAGE_UNDECIDED(异常)'); process.exit(2); });
