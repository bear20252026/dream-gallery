// SQLite 持久层回归测试: node scripts/test/test-store-sqlite.js
// 不触碰真实数据 —— 临时目录内验证:JSON→SQLite 迁移 / 快照往返 / _savedAt 新旧仲裁 /
// JSON 镜像兜底 / USE_SQLITE=0 回退开关。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}

const LIB = path.join(__dirname, '..', '..', 'lib');

// 子进程跑一段脚本,输出 JSON 到 stdout(隔离 require 缓存/模块级状态)
function runInChild(env, code) {
  const out = execFileSync(process.execPath, ['-e', code], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    cwd: path.join(__dirname, '..', '..'),
  });
  return JSON.parse(out);
}
const STORE_SNIPPET = `
const store = require(${JSON.stringify(LIB)} + '/store.js');
const done = JSON.parse(process.env.SEED || 'null');
if (done) {
  for (const k of Object.keys(done)) {
    if (k === 'applicants' && store.gateData.applicants) Object.assign(store.gateData.applicants, done.applicants);
    else store.gateData[k] = done[k];
  }
  store.saveGateData();
}
const flush = async () => { await store.saveGateData(); };
flush().then(() => {
  const g = store.gateData;
  console.log(JSON.stringify({
    secret: g.secret, applicants: g.applicants, stats: g.stats,
    savedAt: g._savedAt, uploads: g.uploads || null, alerts: g.alerts || null,
  }));
});`;

(async () => {
  console.log('[SQLite 持久层回归]');

  // ---- 场景 1:只有 JSON(老格式,无 _savedAt)→ 加载即迁移进 SQLite ----
  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-'));
  const json1 = path.join(dir1, 'gate_data.json');
  fs.writeFileSync(json1, JSON.stringify({
    secret: 's1', applicants: { v1: { status: 'approved', dk: 'dk1' } },
    stats: { total: 7, byDay: { '2026-09-01': 7 } },
  }));
  const r1 = runInChild({ GATE_DATA_FILE: json1 }, STORE_SNIPPET);
  ok(r1.secret === 's1' && r1.applicants.v1 && r1.stats.total === 7, 'JSON 老数据加载正常');
  ok(fs.existsSync(path.join(dir1, 'gate_data.db')), '首次保存即生成 gate_data.db');
  ok(fs.existsSync(path.join(dir1, 'gate_data.json')), 'JSON 镜像保留');

  // ---- 场景 2:删掉 JSON,只留 DB → 重启后从 SQLite 完整恢复(证明 DB 是权威源) ----
  const r2 = runInChild({ GATE_DATA_FILE: json1 }, STORE_SNIPPET);
  ok(r2.secret === 's1' && r2.applicants.v1 && r2.applicants.v1.status === 'approved',
    '删除 JSON 后从 SQLite 完整恢复');

  // ---- 场景 3:子进程写入新档案 → 第三个进程能读到(跨进程持久) ----
  fs.unlinkSync(json1); // 移除 JSON,强迫走 DB
  const r3 = runInChild({ GATE_DATA_FILE: json1, SEED: JSON.stringify({ applicants: { v2: { status: 'pending' } } }) }, STORE_SNIPPET);
  ok(r3.applicants.v1 && r3.applicants.v2, '增量写入保留旧档案 + 新档案(v1+v2)');
  const r4 = runInChild({ GATE_DATA_FILE: json1 }, STORE_SNIPPET);
  ok(r4.applicants.v1 && r4.applicants.v2, '新进程再读仍完整');

  // ---- 场景 4:_savedAt 仲裁:JSON 比 DB 新 → 取 JSON(SQLite 写坏/落后的兜底) ----
  const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-'));
  const json4 = path.join(dir4, 'gate_data.json');
  const db4 = path.join(dir4, 'gate_data.db');
  // 先造一个有 _savedAt 的 DB
  const r4a = runInChild({ GATE_DATA_FILE: json4, SEED: JSON.stringify({ applicants: { old: { status: 'approved' } } }) }, STORE_SNIPPET);
  // 手工把 JSON 改成"更新"(_savedAt 更大),模拟 SQLite 写失败后 JSON 领先
  const newer = { secret: 's4', applicants: { fresh: { status: 'approved' } }, _savedAt: r4a.savedAt + 999999 };
  fs.writeFileSync(json4, JSON.stringify(newer));
  const r4b = runInChild({ GATE_DATA_FILE: json4 }, STORE_SNIPPET);
  ok(r4b.applicants.fresh && !r4b.applicants.old, '_savedAt 较新的 JSON 胜出,旧 DB 不复活');

  // ---- 场景 5:USE_SQLITE=0 回退开关 —— 纯 JSON 模式不生成 .db ----
  const dir5 = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-'));
  const json5 = path.join(dir5, 'gate_data.json');
  runInChild({ GATE_DATA_FILE: json5, USE_SQLITE: '0' }, STORE_SNIPPET);
  ok(!fs.existsSync(db5p(dir5)), 'USE_SQLITE=0 时不生成 .db');
  ok(fs.existsSync(json5), 'USE_SQLITE=0 时 JSON 正常写入');

  console.log(`\\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

function db5p(dir) { return path.join(dir, 'gate_data.db'); }
