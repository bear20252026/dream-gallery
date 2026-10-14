#!/usr/bin/env node
// csp-page-registry-guard.cjs — 钉住"分阶段 CSP 登记表"(lib/security.js 的 CSP_INLINE_FREE_PAGES)
// 登记表断言的是:**这些页面我们自己的源码里没有内联脚本、没有 on* 属性**,所以才允许摘掉
// script-src 的 'unsafe-inline'。这个断言会被"日后有人往 lobby.html 里加一句 onclick=…"悄悄推翻,
// 而推翻之后浏览器只会表现为"按钮点了没反应"——线上很难归因。所以把它做成 CI 里的一条硬闸。
// 用法:node scripts/admin/csp-page-registry-guard.cjs [--selftest]
// 退出码:0 = 登记表与文件一致 / 1 = 有页面不再符合 / 2 = 判不了(取不到登记表/文件读不了/登记表现为空)
// ⚠️和 check-backend-manifest 同一纪律:2 永远不算绿。
const fs = require('fs');
const path = require('path');

// 常见事件属性名(逐个列出来而不是写 on[a-z]+=,因为那样会把 `one=1` 这类普通属性也吃掉一行红)
const ON_ATTR_RE = new RegExp('\\son('
  + 'click|dblclick|contextmenu|mouse(down|up|move|over|enter|leave|out)'
  + '|key(down|up|press)|focus|blur|input|change|submit|reset|select'
  + '|touch(start|end|move|cancel)|pointer(down|up|move|enter|leave)'
  + '|scroll|wheel|drag(start|end|over|leave|enter|leave)|drop'
  + '|animation(start|end|iteration)|transition(end|start|run|cancel)'
  + '|load|error|abort|canplay|play|pause|ended|progress|loadstart|durationchange'
  + '|copy|cut|paste|toggle|close|open|message|resize'
  + '|auxclick|mousedown|DOM[A-Z][a-zA-Z]*'
  + ')\\s*=', 'i');
// <script> 开标签;带 src= 的是外链(允许),不带的是内联(这页就不符合登记表了)。
// 已知局限:属性值里出现裸 '>' 会让正则提前截断 —— HTML 里这样写本身就非法,真出现时上面的
// on-attr 那条也会一起红,不会漏成"绿着上线"。
const SCRIPT_TAG_RE = /<script\b([^>]*)>/gi;

function scanHtml(html) {
  const bad = [];
  let m;
  SCRIPT_TAG_RE.lastIndex = 0;
  while ((m = SCRIPT_TAG_RE.exec(html))) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    bad.push('内联 <script>' + (m[1] || '').trim().slice(0, 60));
  }
  const onm = html.match(new RegExp(ON_ATTR_RE.source, 'gi'));
  if (onm) bad.push('事件属性 ' + [...new Set(onm.map((s) => s.trim()))].slice(0, 6).join(' '));
  return bad;
}

function check(registry, rootDir) {
  const rows = [];
  let fail = 0;
  const seen = new Set();
  for (const e of registry) {
    const p = String((e && e.path) || '');
    const f = String((e && e.file) || '');
    if (!p || !f) { rows.push({ p: p || '(缺 path)', f: f || '(缺 file)', bad: ['登记表条目必须同时写 path 与 file'] }); fail++; continue; }
    if (seen.has(p)) { rows.push({ p, f, bad: ['同一个 path 登记了两次 ⇒ 哪条说了算?'] }); fail++; continue; }
    seen.add(p);
    const abs = path.join(rootDir, f);
    let html;
    try { html = fs.readFileSync(abs, 'utf8'); } catch (err) { rows.push({ p, f, bad: ['读不到文件:' + err.code] }); fail++; continue; }
    const bad = scanHtml(html);
    if (bad.length) fail++;
    rows.push({ p, f, bad });
  }
  return { rows, fail };
}

function selftest() {
  const cases = [
    ['只有外链脚本 ⇒ 符合', '<html><script type="module" crossorigin src="./a.js"></script></html>', 0],
    ['内联脚本 ⇒ 不符合', '<html><script>var a=1</script></html>', 1],
    ['JSON 数据块也算内联(登记表按"零内联"承诺)', '<html><script type="application/json">{}</script></html>', 1],
    ['on* 事件属性 ⇒ 不符合', '<html><button onclick="go()">x</button></html>', 1],
    ['换行写的内联也抓得到', '<html><script\n>go()</script></html>', 1],
    ['普通属性 one= 不误报', '<html><div class="one" data-one="2">x</div></html>', 0],
    ['多行属性里带 src= 的外链不误报', '<html><script\n  type="module"\n  src="./a.js"\n></script></html>', 0],
  ];
  let bad = 0;
  for (const [name, html, want] of cases) {
    const got = scanHtml(html).length;
    const ok = got === want;
    if (!ok) bad++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + name + ' ⇒ ' + got + ' 条' + (ok ? '' : '(期望 ' + want + ',实得 ' + JSON.stringify(scanHtml(html)) + ')'));
  }
  // 登记表条目形状:缺 file 必须红
  const shape = check([{ path: '/x.html' }], process.cwd());
  const shapeOk = shape.fail === 1 && /同时写 path 与 file/.test(shape.rows[0].bad.join(''));
  if (!shapeOk) bad++;
  console.log((shapeOk ? '  ✓ ' : '  ✗ ') + '条目缺 file ⇒ 红(不能当成"没东西要查"而放行)');
  console.log(bad ? 'SELFTEST_FAILED ' + bad : 'SELFTEST_OK ' + (cases.length + 1));
  process.exit(bad ? 1 : 0);
}

if (process.argv[2] === '--selftest') selftest();

const ROOT = process.cwd();
let security;
try { security = require(path.join(ROOT, 'lib/security.js')); } catch (e) {
  console.error('❌ 取不到 lib/security.js ⇒ 无法核对登记表:' + e.message);
  process.exit(2);
}
const registry = security.CSP_INLINE_FREE_PAGES;
if (!Array.isArray(registry)) { console.error('❌ CSP_INLINE_FREE_PAGES 不是数组 ⇒ 判不了'); process.exit(2); }
if (!registry.length) { console.error('❌ 登记表是空的 ⇒ 分阶段 CSP 没有对象,机制等于没装(删页面请连 lib/security.js 那段注释一起删)'); process.exit(2); }
const { rows, fail } = check(registry, ROOT);
for (const r of rows) {
  console.log((r.bad.length ? '  ❌ ' : '  ✓  ') + r.p.padEnd(16) + ' ← ' + r.f
    + (r.bad.length ? '  ⇒ ' + r.bad.join(' / ') : '  (零内联脚本、零事件属性)'));
}
if (fail) {
  console.error('❌ 有 ' + fail + ' 条登记已不符合 ⇒ 这些页面不能摘 unsafe-inline。');
  console.error('   二选一:把内联/事件属性改成 addEventListener(继续留在登记表),或从 lib/security.js 的登记表里划掉这一页。');
  process.exit(1);
}
console.log('CSP_REGISTRY_OK ' + registry.length + ' 条登记全部符合(内联零、事件属性零)');
