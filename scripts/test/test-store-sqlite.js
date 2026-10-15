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

// 子进程跑一段脚本,输出 JSON 到 stdout(隔离 require 缓存/模块级状态)
function runInChild(env, code) {
  const out = execFileSync(process.execPath, ['-e', code], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    cwd: path.join(__dirname, '..', '..'),
  });
  return JSON.parse(out);
}
// 子进程挂了(未处理 rejection / 启动即抛)不当成"测试崩溃",而是当成**被测方的结论**:
// 注入磁盘失败时,"进程还活着吗"本身就是我要断言的那件事。
function runChildCatching(env, code) {
  try {
    return { died: false, r: runInChild(env, code) };
  } catch (e) {
    const so = (e.stdout && String(e.stdout)) || '';
    if (so.trim().startsWith('{')) {
      try { return { died: true, exitCode: e.status, r: JSON.parse(so) }; } catch (_) {}
    }
    return { died: true, exitCode: e.status, r: null, stderr: String((e.stderr || e.message) || '') };
  }
}
const STORE_SNIPPET = `
const store = require('./lib/store.js'); // runInChild 的 cwd 已是仓库根
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

// 结果契约(M-11)用的探针脚本:注入一次真实失败,看结论是不是真的把失败报出来,
// 以及"报失败"会不会把进程干掉(全站 85 处即发即忘调用方一旦遇到 reject 就是 ERR_UNHANDLED_REJECTION)。
// INJECT=none      基线:两条都写成 ⇒ ok:true
// INJECT=sqlite    把影子写换成 () => false ⇒ ok:false / jsonOk:true,还原后下一次必须 ok:true(链没断)
// INJECT=mirror    正式镜像指到一个不存在的目录(ENOENT)⇒ jsonOk:false,且**子进程正常收尾**
// INJECT=mirror-sync 同上,但走 saveGateDataSync() ⇒ 同步拿到同一个失败结论
const RESULT_SNIPPET = `
const sqlMod = require('./lib/sqlite-store.js');
const MODE = process.env.INJECT || 'none';
const origSyncAll = sqlMod.syncAll;
if (MODE === 'sqlite') sqlMod.syncAll = () => false; // 注入:SQLite 影子写坏(库仍开着,所以不是"降级")
const store = require('./lib/store.js');
const out = { mode: MODE, threw: false };
let printed = false;
const finish = () => { if (!printed) { printed = true; console.log(JSON.stringify(out)); } };
const shape = (r) => ({
  ok: r.ok, jsonOk: r.jsonOk, sqliteOk: r.sqliteOk, reason: r.sqliteReason,
  errors: r.errors, hasMs: typeof r.ms === 'number', savedAtIsNum: typeof r.savedAt === 'number',
});
try {
  if (MODE === 'mirror-sync') {
    out.sync = shape(store.saveGateDataSync());
    finish();
  } else {
    store.saveGateData().then((r) => {
      out.first = shape(r);
      if (MODE === 'sqlite') sqlMod.syncAll = origSyncAll; // 还原:证明一次失败没把写链打断
      return store.saveGateData().then((r2) => {
        out.second = shape(r2);
        out.last = shape(store.lastSaveResult());
        finish();
      });
    });
  }
} catch (e) {
  out.threw = true;
  out.errMsg = String((e && e.message) || e);
  finish();
}`;


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
  // ⚠️这一条以前是**假通过**(2026-10-14 第六轮审计 M-16):`fs.unlinkSync(json1)` 写在场景 3 里,
  //   于是场景 2 跑的时候 JSON 还在 ⇒ "从 SQLite 完整恢复"这句话从没被前置条件支撑过。
  //   现在:先删,再**断言此刻真的只剩 DB**,然后才起子进程。
  //   (子进程里的 snippet 每次都会 saveGateData(),所以镜像 JSON 会被重新写出来——
  //    因此前置断言必须放在起进程**之前**,放在之后就晚了。)
  const db1 = path.join(dir1, 'gate_data.db');
  fs.unlinkSync(json1); // 移除 JSON,强迫走 DB
  ok(!fs.existsSync(json1) && fs.existsSync(db1),
    '场景 2 前置条件成立:此刻 JSON 不存在而 gate_data.db 存在');
  const r2 = runInChild({ GATE_DATA_FILE: json1 }, STORE_SNIPPET);
  ok(r2.secret === 's1' && r2.applicants.v1 && r2.applicants.v1.status === 'approved',
    '删除 JSON 后从 SQLite 完整恢复');
  ok(fs.existsSync(json1), '恢复后 JSON 镜像被重新写出(兜底仍在,不是只剩 DB)');

  // ---- 场景 3:子进程写入新档案 → 第三个进程能读到(跨进程持久) ----
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

  // ---- 场景 6:结果契约(M-11)—— 注入一次真实失败,看结论会不会撒谎、会不会把进程干掉 ----
  const dir6 = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-'));
  const json6 = path.join(dir6, 'gate_data.json');

  // 6A 基线:两条介质都写得成(先证明"注入之前它是绿的",否则后面的红说明不了任何事)
  const c6a = runChildCatching({ GATE_DATA_FILE: json6, INJECT: 'none' }, RESULT_SNIPPET);
  ok(!c6a.died && c6a.r && c6a.r.first && c6a.r.first.ok === true,
    '结果契约基线:注入之前 ok=true / jsonOk=true / sqliteOk=true');
  ok(c6a.r && c6a.r.first && c6a.r.first.reason === 'ok' && c6a.r.first.hasMs && c6a.r.first.savedAtIsNum,
    '结论里字段齐:sqliteReason=ok、ms 是数字、savedAt 是数字');

  // 6B 影子写坏:必须报 ok:false 且**只有** SQLite 那侧坏(镜像仍写成 ⇒ jsonOk=true),还原后下一次要 ok
  const c6b = runChildCatching({ GATE_DATA_FILE: json6, INJECT: 'sqlite' }, RESULT_SNIPPET);
  const b1 = c6b.r && c6b.r.first, b2 = c6b.r && c6b.r.second;
  ok(!c6b.died && b1 && b1.ok === false && b1.sqliteOk === false && b1.jsonOk === true,
    '注入 SQLite 影子写失败 ⇒ ok=false 而 jsonOk=true(一边坏不冒充另一边成)');
  ok(b1 && b1.reason === 'error' && Array.isArray(b1.errors) && /SQLite/.test(b1.errors.join('')),
    '失败结论里点名是 SQLite 坏了');
  ok(b2 && b2.ok === true, '一次失败没打断写链:还原后下一次保存 ok=true');
  ok(c6b.r && c6b.r.last && c6b.r.last.ok === true, 'lastSaveResult() 读到的就是最近那次结论');

  // 6C 镜像写坏(GATE_DATA_FILE 指到一个不存在的目录 ⇒ ENOENT)。
  //   ⚠️这一条真正在防的是:结论"永不 reject"是不是真的 —— 全站 85 处即发即忘调用方一旦收到
  //   reject,Node ≥15 会因 ERR_UNHANDLED_REJECTION **直接把进程干掉**(启动时那一次 saveGateData
  //   也在其中:loadGateData 自己就会保存一次)。所以"子进程还活着"是断言,不是巧合。
  const ghost = path.join(dir6, 'no-such-dir', 'gate_data.json');
  const c6c = runChildCatching({ GATE_DATA_FILE: ghost, SQLITE_PATH: path.join(dir6, 'ghost.db'), INJECT: 'mirror' }, RESULT_SNIPPET);
  const c1 = c6c.r && c6c.r.first;
  ok(!c6c.died, '镜像 ENOENT 时子进程没被 reject 干掉(结论永不 reject,即发即忘调用方才安全)');
  ok(c1 && c1.ok === false && c1.jsonOk === false, '镜像写坏 ⇒ ok=false / jsonOk=false');
  ok(c1 && c1.sqliteOk === true && c1.reason === 'ok', '镜像坏不掉 SQLite 那侧的事实(两笔账分开记)');

  // 6D 同步收尾路径:同一个结论对象,给优雅关闭/测试用(SIGTERM 之后入队的写盘未必赶得上)
  const c6d = runChildCatching({ GATE_DATA_FILE: ghost, SQLITE_PATH: path.join(dir6, 'ghost.db'), INJECT: 'mirror-sync' }, RESULT_SNIPPET);
  ok(!c6d.died && c6d.r && c6d.r.sync && c6d.r.sync.ok === false && c6d.r.sync.threw !== true,
    'saveGateDataSync() 同步返回失败结论(不抛、不 reject)');
  ok(c6d.r && c6d.r.sync && c6d.r.sync.jsonOk === false && c6d.r.sync.sqliteOk === true,
    '同步路径也是两笔账分开:镜像 false / 影子 true');

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

function db5p(dir) { return path.join(dir, 'gate_data.db'); }
