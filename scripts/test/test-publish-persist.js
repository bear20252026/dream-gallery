// publish 落盘结论回归: node scripts/test/test-publish-persist.js
// 钉死 2026-11-20 R6 收编:publish.js 各分支的 saveGateData 由即发即忘(try/catch 吞掉)
// 改读结论 —— 写不进盘(jsonOk:false)时响应必须带 warning,
// 否则重启后归属/待审记录回滚,而调用方和主人都毫不知情。
// 两个场景各起子进程(模块加载即捕获 GATE_DATA_FILE,同 test-store-sqlite 的口径)。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

const SNIPPET = `
const fs = require('fs');
const path = require('path');
const store = require('./lib/store.js');
const pub = require('./lib/upload/publish.js');
const dir = process.env.PUB_DIR;
const file = path.join(dir, 'clip.bin');
fs.writeFileSync(file, 'x');
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) PubPersist/1.0';
const req = { headers: { 'user-agent': UA, cookie: 'vid=v1' }, url: '', socket: { remoteAddress: '203.0.113.9' } };
const res = {
  code: 0, body: null, writableEnded: false,
  setHeader() {}, getHeader() { return null; },
  writeHead(c) { res.code = c; },
  end(b) { res.body = b ? JSON.parse(b) : null; res.writableEnded = true; },
};
(async () => {
  await pub.publishWhiteboardSave(req, res, {
    dir: 'videos', finalName: 'my-clip.mp4', filePath: file,
    adminWrite: false, exclusiveNew: false, overwriteOwn: false, r2Mirror: () => {},
  });
  const last = store.lastSaveResult() || {};
  console.log(JSON.stringify({
    code: res.code,
    warning: (res.body && res.body.warning) || '',
    ok: last.ok, jsonOk: last.jsonOk,
  }));
})().catch((e) => console.log(JSON.stringify({ threw: String((e && e.message) || e) })));
`;

function run(mode, gateFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-persist-'));
  const r = spawnSync(process.execPath, ['-e', SNIPPET], {
    cwd: ROOT,
    env: { ...process.env, PUB_DIR: dir, GATE_DATA_FILE: gateFile, SQLITE_PATH: '', TOKEN: 'pub-persist-token' },
    encoding: 'utf8',
  });
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  if (!line) throw new Error(`${mode}: 子进程无输出\n${r.stderr || ''}`);
  return JSON.parse(line);
}

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}

console.log('[publish 落盘结论回归]');

// 基线:镜像与库都写得成 ⇒ 不带 warning(判据不空转,正常路径无噪音)
const goodDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-persist-ok-'));
const good = run('baseline', path.join(goodDir, 'gate_data.json'));
ok(good.code === 202, '基线:非公开匿名视频入待审,回 202');
ok(good.jsonOk === true && good.ok === true, '基线:落盘成功(jsonOk/ok 均真)');
ok(good.warning === '', '基线:落盘成功时不带 warning(不误报)');

// 注入:正式镜像指向不存在的目录(ENOENT)⇒ jsonOk:false,进程正常收尾
const ghostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-persist-ghost-'));
const ghost = path.join(ghostDir, 'no-such-dir', 'gate_data.json');
const bad = run('mirror-broken', ghost);
ok(bad.threw === undefined, '注入:落盘失败不抛不 reject(子进程正常收尾)');
ok(bad.jsonOk === false, '注入:jsonOk=false 被如实读出');
ok(bad.code === 202, '注入:业务结论不变,仍回 202(文件确实收到了)');
ok(typeof bad.warning === 'string' && bad.warning.length > 0, '注入:响应带 warning(持久失败不再被吞)');

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
