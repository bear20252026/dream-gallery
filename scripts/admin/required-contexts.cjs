#!/usr/bin/env node
// required-contexts.cjs — 回答"合并进 main 之前必须绿的是哪些 checks",而且只在有依据时回答。
// 用法:node scripts/admin/required-contexts.cjs <legacy保护JSON文件> [ruleset详情JSON文件 ...]
// stdout: 每行一个 required context;stderr: 读了哪些来源(给人核对)
// exit 0 = 有依据 / exit 2 = 判不了(≠ 没有要求)
//
// 为什么要两个来源都读:2026-10-14 实测本仓的 main 归 **ruleset** 管,而 legacy 分支保护接口
// 在有 ruleset 存在的仓库里**写操作一律 404**(读还能读到东西,是派生视图)。只读 legacy 的话,
// 以后改 ruleset 里的 context 名,这边会拿着旧名单"绿着放行"——正是本仓记过的那类假绿。
// 只读一个来源、或来源读不到就当没有要求,都属于"闸门失去依据",所以 fail-closed 到 exit 2。
const fs = require('fs');

// ruleset 到底管不管 main:include 为空 = 谁都不管(2026-10-14 实查 —— 那条 include 为空的
// required_linear_history ruleset 并没有让 main 变成线性历史,PR 的 merge commit 照样合进去)。
const MAIN_TARGETS = ['refs/heads/main', '~DEFAULT_BRANCH', '~ALL', 'refs/*', 'refs/heads/*'];

function collect(legacy, rulesets, branch) {
  const out = { ctx: [], sources: [], problems: [] };
  const targets = MAIN_TARGETS.map((p) => p.replace('main', branch));
  if (legacy && legacy.message && !legacy.required_status_checks) {
    out.problems.push('legacy 保护读不到(' + legacy.message + '),继续看 ruleset');
  } else if (legacy && legacy.required_status_checks) {
    const c = legacy.required_status_checks.contexts;
    if (!Array.isArray(c)) out.problems.push('legacy 保护里没有 contexts 数组');
    else { out.ctx.push(...c.filter((x) => typeof x === 'string' && x)); out.sources.push('legacy'); }
  } else {
    out.problems.push('legacy 保护 JSON 形状不认识');
  }
  for (const [i, rs] of rulesets.entries()) {
    if (!rs || typeof rs !== 'object') { out.problems.push('ruleset #' + (i + 1) + ' 不是对象'); continue; }
    if (rs.enforcement !== 'active') { out.sources.push('ruleset ' + rs.name + '(enforcement=' + rs.enforcement + ',跳过)'); continue; }
    const inc = (rs.conditions && rs.conditions.ref_name && rs.conditions.ref_name.include) || [];
    if (!inc.some((p) => targets.includes(p))) continue; // 不 targeting 这条分支,不算来源
    const rule = (rs.rules || []).find((r) => r && r.type === 'required_status_checks');
    if (!rule) { out.sources.push('ruleset ' + rs.name + '(管 ' + branch + ' 但没有 required_status_checks 规则)'); continue; }
    const list = (rule.parameters && rule.parameters.required_status_checks) || [];
    const got = list.map((e) => e && e.context).filter((x) => typeof x === 'string' && x);
    if (!list.length && !got.length) out.problems.push('ruleset ' + rs.name + ' 管 ' + branch + ' 但 required_status_checks 是空的');
    else { out.ctx.push(...got); out.sources.push('ruleset ' + rs.name); }
  }
  out.ctx = [...new Set(out.ctx)];
  return out;
}

function selftest() {
  const prot = { required_status_checks: { strict: true, contexts: ['build-and-test', 'smoke'] } };
  const rsOn = { name: 'gate', enforcement: 'active', conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } }, rules: [{ type: 'required_status_checks', parameters: { strict: true, required_status_checks: [{ context: 'build-and-test' }, { context: 'smoke' }, { context: 'extra-guard' }] } }] };
  const rsOff = { name: '1', enforcement: 'active', conditions: { ref_name: { include: [], exclude: [] } }, rules: [{ type: 'required_linear_history' }] };
  const rsBypassed = { name: 'draft', enforcement: 'bypassed', conditions: { ref_name: { include: ['~ALL'] } }, rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ghost' }] } }] };
  const checks = [
    ['只有 legacy,照用', collect(prot, [], 'main'), { ctx: ['build-and-test', 'smoke'], sources: ['legacy'], problems: 0 }],
    ['ruleset 空 include ⇒ 不算来源,也不报错', collect(prot, [rsOff], 'main'), { ctx: ['build-and-test', 'smoke'], sources: ['legacy'], problems: 0 }],
    ['两个来源取并集(新增的 extra-guard 不能漏)', collect(prot, [rsOn], 'main'), { ctx: ['build-and-test', 'smoke', 'extra-guard'], sources: 2, problems: 0 }],
    ['legacy 404 但 ruleset 在 ⇒ 照样有依据', collect({ message: 'Not Found', status: '404' }, [rsOn], 'main'), { ctx: ['build-and-test', 'smoke', 'extra-guard'], sources: ['ruleset gate'], problems: 1 }],
    ['bypassed 的 ruleset 不参与', collect(prot, [rsBypassed], 'main'), { ctx: ['build-and-test', 'smoke'], sources: ['legacy', 'ruleset draft(enforcement=bypassed,跳过)'], problems: 0 }],
    ['两边都没有 ⇒ 判不了(ctx 空)', collect({ message: 'Not Found' }, [], 'main'), { ctx: [], sources: [], problems: 1 }],
    ['ruleset 管 main 但 required 列表为空 ⇒ 记问题', collect({ message: 'Not Found' }, [{ ...rsOn, rules: [{ type: 'deletion' }] }], 'main'), { ctx: [], problems: 1, sources: ['ruleset gate(管 main 但没有 required_status_checks 规则)'] }],
  ];
  let bad = 0;
  for (const [name, got, want] of checks) {
    const okCtx = JSON.stringify(got.ctx) === JSON.stringify(want.ctx);
    const okSrc = Array.isArray(want.sources)
      ? JSON.stringify(got.sources) === JSON.stringify(want.sources)
      : got.sources.length === want.sources;
    const okPrb = got.problems.length === want.problems;
    const pass = okCtx && okSrc && okPrb;
    if (!pass) bad++;
    console.log((pass ? '  ✓ ' : '  ✗ ') + name
      + (pass ? '' : ' ⇒ ctx=' + JSON.stringify(got.ctx) + ' sources=' + JSON.stringify(got.sources) + ' problems=' + got.problems.length));
  }
  console.log(bad ? 'SELFTEST_FAILED ' + bad : 'SELFTEST_OK ' + checks.length);
  process.exit(bad ? 1 : 0);
}

if (process.argv[2] === '--selftest') selftest();

const argv = process.argv.slice(2);
const branch = process.env.REQ_CTX_BRANCH || 'main';
const [legacyFile, ...rsFiles] = argv;
const load = (f) => { try { return { j: JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch (e) { return { err: f + ': ' + e.message }; } };
let legacy, rulesets = [];
if (legacyFile) { const r = load(legacyFile); if (r.err) { console.error('ERROR ' + r.err); process.exit(2); } legacy = r.j; } else legacy = { message: '没有 legacy 文件' };
for (const f of rsFiles) { const r = load(f); if (r.err) { console.error('ERROR ruleset 文件读不了 ⇒ 无法确认它是否管 ' + branch + ':' + r.err); process.exit(2); } rulesets.push(r.j); }
const res = collect(legacy, rulesets, branch);
for (const p of res.problems) console.error('ℹ️ ' + p);
console.error('→ 依据来源:' + (res.sources.join(' + ') || '无'));
if (!res.ctx.length) {
  console.error('❌ 读不出任何 required context ⇒ 闸门没有依据(分支保护被改了?还是真的一个 required 都没配?)。判不了 ≠ 可以合。');
  process.exit(2);
}
console.log(res.ctx.join('\n'));
