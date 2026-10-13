#!/usr/bin/env node
// checks-verdict.cjs — 把「PR 的 statusCheckRollup + 分支保护的 required contexts」折成一个结论
// 用法:echo '<gh pr view --json statusCheckRollup 的 JSON>' | node scripts/admin/checks-verdict.cjs '<每行一个 required context>'
// 输出(第一词就是结论,给 shell 判):
//   PASS                      每个 required context 都 COMPLETED + SUCCESS
//   PENDING <明细>            还有在跑的 / 尚未登记的 —— 判定还不能下
//   FAIL <明细>               有 required context 完成但不是 SUCCESS
//   ERROR <原因>              输入不可解析(判不了 ≠ 通过,和 check-backend-manifest 同一纪律)
//
// 为什么要单独一个文件而不是在 release.sh 里塞一段 sed:这是**闸门的核心判定**,
// 用 sed 从 JSON 里抠字段就是本仓反复记过的那类"看起来在判,其实没判"。
// 三种失败方向都验过(见 scripts/ 演练与下面的 --selftest)。
// ⚠️fail-closed:认不出的 conclusion(如 NEUTRAL / ACTION_REQUIRED / STALE)一律按 FAIL 处理,
//   因为"不知道算不算绿"从来不该被算成绿。
const [mode] = process.argv.slice(2);
const REQ = (mode === '--selftest' ? '' : (process.argv[2] || ''))
  .split('\n').map((s) => s.trim()).filter(Boolean);

function readRoll() {
  if (mode === '--selftest') return selftest();
  const raw = require('fs').readFileSync(0, 'utf8');
  let j;
  try {
    j = JSON.parse(raw || 'null');
  } catch (e) {
    console.log('ERROR statusCheckRollup 不是合法 JSON:' + e.message);
    process.exit(0);
  }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.statusCheckRollup) ? j.statusCheckRollup : null;
  if (!list) { console.log('ERROR 输入里没有 statusCheckRollup 数组'); process.exit(0); }
  return list;
}

// 一条 check 的结论:SUCCESS / FAIL / PENDING
function one(e) {
  const st = String(e.status || e.state || '').toUpperCase();
  const conc = String(e.conclusion || '').toUpperCase();
  if (st && st !== 'COMPLETED') return 'PENDING'; // 还在排队/跑着
  if (conc === 'SUCCESS' || conc === 'SKIPPED') return 'SUCCESS'; // 跳过=不阻断(smoke 类可选矩阵)
  if (conc === '') return st === 'COMPLETED' ? 'FAIL' : 'PENDING';
  return conc === 'SUCCESS' ? 'SUCCESS' : 'FAIL'; // FAILURE/TIMED_OUT/CANCELLED/NEUTRAL/未知 全算不绿
}

function verdict(list) {
  const byName = new Map();
  for (const e of list) {
    const k = e.name || e.context || '';
    const v = one(e);
    // 同名多条(重跑/多个 app)时取"最差"那一票:PENDING > FAIL 之后再比
    const prev = byName.get(k);
    if (!prev || prev === 'SUCCESS' || (prev === 'PENDING' && v === 'FAIL')) byName.set(k, v);
  }
  const pend = [], bad = [];
  for (const c of REQ) {
    const v = byName.get(c);
    if (v === 'SUCCESS') continue;
    if (v === 'FAIL') bad.push(c + '=非SUCCESS');
    else pend.push(c + '=' + (v || '尚未登记'));
  }
  if (bad.length) return 'FAIL ' + bad.join(',');
  if (pend.length) return 'PENDING ' + pend.join(',');
  return 'PASS';
}

function selftest() {
  const ok = (name, got, want) => {
    const pass = got === want;
    console.log((pass ? '  ✓ ' : '  ✗ ') + name + ' ⇒ ' + got + (pass ? '' : ' (期望 ' + want + ')'));
    if (!pass) process.exitCode = 1;
  };
  const L = (arr) => verdict(arr);
  const REQ_BAKED = ['build-and-test', 'smoke'];
  const save = REQ.length;
  // 直接用固定 required 集跑三条断言
  REQ.length = 0; REQ.push(...REQ_BAKED);
  ok('两条都绿', L([{ name: 'build-and-test', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'smoke', status: 'COMPLETED', conclusion: 'SUCCESS' }]), 'PASS');
  ok('一条还在跑 ⇒ 不下结论', L([{ name: 'build-and-test', status: 'IN_PROGRESS' }, { name: 'smoke', status: 'COMPLETED', conclusion: 'SUCCESS' }]), 'PENDING build-and-test=PENDING');
  ok('一条红', L([{ name: 'build-and-test', status: 'COMPLETED', conclusion: 'FAILURE' }, { name: 'smoke', status: 'COMPLETED', conclusion: 'SUCCESS' }]).slice(0, 4), 'FAIL');
  ok('认不出的 conclusion 按不绿', L([{ name: 'build-and-test', status: 'COMPLETED', conclusion: 'NEUTRAL' }, { name: 'smoke', status: 'COMPLETED', conclusion: 'SUCCESS' }]).slice(0, 4), 'FAIL');
  ok('required 项根本没出现 ⇒ 视为未登记,不算过', L([{ name: 'build-and-test', status: 'COMPLETED', conclusion: 'SUCCESS' }]).slice(0, 7), 'PENDING');
  REQ.length = 0; REQ.push(...(save ? [] : []));
  return null;
}

const list = readRoll();
if (list === null) { process.exit(process.exitCode || 0); } // selftest 分支
if (mode === '--selftest') process.exit(process.exitCode || 0);
if (!REQ.length) { console.log('ERROR required contexts 列表为空 ⇒ 闸门没有依据(读不到分支保护?),不判 PASS'); process.exit(0); }
console.log(verdict(list));
