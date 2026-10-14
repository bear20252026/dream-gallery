// 原子写回归测试: node scripts/test/test-store.js
// 不触碰真实 gate_data.json —— 通过 GATE_DATA_FILE 指向系统临时目录下的文件。
// 覆盖:初始保存可解析 / 并发保存不截断 / 截断文件重载可恢复。
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
const tmpFile = path.join(tmpDir, 'gate_data.json');
process.env.GATE_DATA_FILE = tmpFile; // 必须在 require store 之前设置

const store = require('../../lib/store.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}

(async () => {
  console.log('[store 原子写回归]');

  // 1. 初始保存:写入后可解析且内容一致
  store.gateData.uploads = { 'a.jpg': { dk: 'x', ts: 1 } };
  await store.saveGateData();
  let raw = fs.readFileSync(tmpFile, 'utf8');
  let parsed = JSON.parse(raw); // 不抛即说明未截断
  ok(parsed.uploads && parsed.uploads['a.jpg'] && parsed.uploads['a.jpg'].dk === 'x',
    '初始保存后文件可解析且内容一致');

  // 2. 并发保存 N 次:最终文件仍完整、可解析、无数据丢失(验证 tmp+rename 串行化)
  const N = 50;
  for (let i = 0; i < N; i++) store.gateData.uploads['k' + i] = { dk: 'd' + i, ts: i };
  const tasks = [];
  for (let i = 0; i < N; i++) tasks.push(store.saveGateData());
  await Promise.all(tasks);
  raw = fs.readFileSync(tmpFile, 'utf8');
  parsed = JSON.parse(raw); // 并发写后仍能解析(无半截 JSON)
  ok(Object.keys(parsed.uploads).length === N + 1,
    `并发 ${N} 次保存后数据完整 (${Object.keys(parsed.uploads).length} 条,无截断)`);

  // 3. 崩溃恢复:伪造一个被截断的非法 JSON,调用 loadGateData 应重置为合法对象并回写,
  //    磁盘上的文件恢复为可解析(验证"崩溃残留的坏文件"不会让服务起不来)
  fs.writeFileSync(tmpFile, '{"uploads":{"a":{ "truncated": true'); // 非法 JSON
  store.loadGateData();
  await store.saveGateData(); // 冲刷 loadGateData 内排队的异步写(原子写改为微任务后需等待)
  let recoveredOk = false;
  try { JSON.parse(fs.readFileSync(tmpFile, 'utf8')); recoveredOk = true; } catch (e) {}
  ok(recoveredOk, '截断文件经 loadGateData 后磁盘恢复为合法 JSON(服务可正常启动)');

  // 4. 原子写的收尾:成功之后**不留临时文件**,且正式文件仍是完整可读的那一份
  //    ⚠️这一条以前写的是 `ok(true, ...)`:把 stray 大小打进消息里看着像在判,实际恒通过
  //    (2026-10-14 第六轮审计 M-16 抓到)。现在三条都真断言:
  //    ① 正式文件存在;② 它能被 JSON.parse 且带着上一步恢复出来的数据;③ `.tmp` 不残留。
  //    注:只在**成功路径**上要求"无残留"——写失败时留下 `.tmp` 是有意的现场,别在这条里顺手删证据。
  //    ⚠️还要**先埋一个残留**再保存:否则"没有 .tmp"是空话,哪天有人把原子写改成直写正式文件
  //    (不产生也不搬走 tmp),这条断言照样绿 —— 2026-10-14 反向验证时就是这样暴露的。
  fs.writeFileSync(tmpFile + '.tmp', '{"stale":"上一次没搬走的临时文件"}');
  ok(fs.existsSync(tmpFile + '.tmp'), '前置条件成立:已埋入待清理的 .tmp 残留');
  await store.saveGateData();
  const finalExists = fs.existsSync(tmpFile);
  let finalOk = false;
  let finalKeys = 0;
  try {
    const p = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    finalOk = true;
    finalKeys = Object.keys(p.uploads || {}).length;
  } catch (e) {}
  ok(finalExists && finalOk, '保存后正式文件存在且可解析(第 3 步恢复出的合法对象仍在)');
  ok(finalKeys === N + 1, `正式文件内容完整(${finalKeys} 条 uploads,应为 ${N + 1})`);
  ok(!fs.existsSync(tmpFile + '.tmp'), '原子写成功路径不留 .tmp 临时文件(rename 应已把它搬走)');

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(failed ? 1 : 0);
})();
