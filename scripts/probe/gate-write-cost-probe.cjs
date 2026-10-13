#!/usr/bin/env node
// gate-write-cost-probe.cjs — 切读前的写盘成本测量(2026-10-14 第五轮审计 C)
// ===================== 为什么先量再切 =====================
// R1 的账是"整库 JSON 快照写一次很贵",但"贵多少、多久一次"一直没人读过数,只有推断。
// "连续 7 天 table-parity exit 0" 只证明**影子写的形状对**,不证明**切到真表能省下多少**,
// 也不证明切读不会把延迟挪到别处。这条探针补的就是这一段证据。
//
// ===================== 它测什么、不测什么(边界要说全)=====================
// 测:① 线上那份快照的字节数与 JSON.parse / JSON.stringify 的耗时分布(p50/p95/max)
//     ② 同一段字节**真的落到磁盘**要多久(openSync + writeSync + fsyncSync,写完删)
//     ③ 生产实际写盘频率:采样 gate_data.json 的 mtime 若干秒,数它变了多少次
// 不测:① 应用内 `saveGateData()` 的**排队/合并**行为(那要往正在服务的进程里插桩,风险不对等;
//         这里量的是"一次落盘的物理成本",两者相加才是玩家感受)
//       ② 与并发请求的相互影响(那要在服务上做压测,属于另一件事,别拿这个数当结论)
// **零副作用**:只**读** DATA_FILE;写只写到 /tmp 下一个探针自己的文件,跑完就删。
// 绝不打 DB、绝不碰 SQLite、绝不打印 gateData 的任何内容(只有字节数与毫秒)。
//
// 用法:
//   在服务器上跑(唯一有意义的位置 —— 要的就是那块盘的延迟):
//     ssh -i ~/.ssh/gk-deploy.pem root@<host> "cd /opt/gallery && node -" < scripts/probe/gate-write-cost-probe.cjs
//   本地:DATA_FILE=./gate_data.json node scripts/probe/gate-write-cost-probe.cjs
// 退出码:0 测到了 / 2 读不到数据文件(判不了就不算结论)
const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), 'gate_data.json');
const ITER = Number(process.env.ITER || 12);
const MTIME_SECONDS = Number(process.env.MTIME_SECONDS || 45);
const TMP_OUT = path.join(process.env.TMP_DIR || '/tmp', 'gate-write-cost-probe.' + process.pid + '.json');

function die2(msg) {
  console.log('❌ ' + msg);
  process.exit(2);
}
let raw;
try {
  raw = fs.readFileSync(DATA_FILE, 'utf8');
} catch (e) {
  die2('读不到 ' + DATA_FILE + ':' + e.code + '(判不了,不当结论)');
}
const kb = Math.round(raw.length / 1024);
console.log('快照:' + DATA_FILE + ' = ' + kb + ' KB(只读它,不写回)');

const ms = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
  return { p50: p(0.5), p95: p(0.95), max: s[s.length - 1] };
};
// 同步睡 ms,**不占 CPU**。⚠️别写 `while (Date.now() < t) {}` 那种忙等:这脚本要在那台
// 2 核生产盒子上跑,忙等会把一整核点着 45 秒,而"探针把被测对象压慢了"测出来的数就没意义了。
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
const fmt = (o) => 'p50=' + o.p50.toFixed(1) + 'ms p95=' + o.p95.toFixed(1) + 'ms max=' + o.max.toFixed(1) + 'ms';
const r2 = (x) => Math.round(x * 10) / 10;

let obj;
const parseTimes = [];
for (let i = 0; i < ITER; i++) {
  const t = process.hrtime.bigint();
  obj = JSON.parse(raw);
  parseTimes.push(Number(process.hrtime.bigint() - t) / 1e6);
}
const strTimes = [];
for (let i = 0; i < ITER; i++) {
  const s = JSON.stringify(obj);
  const t = process.hrtime.bigint();
  JSON.stringify(obj);
  strTimes.push(Number(process.hrtime.bigint() - t) / 1e6);
  if (s.length !== raw.length) console.log('  · 注:序列化后 ' + Math.round(s.length / 1024) + 'KB ≠ 原文件 ' + kb + 'KB');
}
console.log('JSON.parse   ' + fmt(ms(parseTimes)));
console.log('JSON.stringify ' + fmt(ms(strTimes)));

// —— 真落盘:写到 /tmp 下探针自己的文件,每轮 fsync(这才是"掉电也不丢"的那次写)——
const writeTimes = [];
const fd = fs.openSync(TMP_OUT, 'w');
for (let i = 0; i < ITER; i++) {
  const t = process.hrtime.bigint();
  fs.writeFileSync(fd, raw);
  fs.fsyncSync(fd);
  writeTimes.push(Number(process.hrtime.bigint() - t) / 1e6);
}
fs.closeSync(fd);
try {
  fs.unlinkSync(TMP_OUT);
} catch (e) {}
console.log('write+fsync ' + kb + 'KB ' + fmt(ms(writeTimes)) + '(写到 ' + path.dirname(TMP_OUT) + ',跑完已删)');

const once = ms(parseTimes.map((v, i) => v + strTimes[i] + writeTimes[i]));
console.log('一次完整"整库快照落盘"(parse+stringify+fsync)≈ p50=' + r2(once.p50) + 'ms p95=' + r2(once.p95) + 'ms max=' + r2(once.max) + 'ms');

// —— 生产写频率:采样 mtime,数它变了几次(不改任何东西)——
if (process.env.MTIME_SECONDS === '0') {
  console.log('已跳过 mtime 采样(MTIME_SECONDS=0)');
  process.exit(0);
}
let stat0;
try {
  stat0 = fs.statSync(DATA_FILE);
} catch (e) {
  die2('读不到文件状态:' + e.code);
}
const startMs = stat0.mtimeMs;
let writes = 0;
let last = stat0.mtimeMs;
const deadline = Date.now() + MTIME_SECONDS * 1000;
console.log('采样 mtime ' + MTIME_SECONDS + 's 数生产实际写了多少次…');
while (Date.now() < deadline) {
  sleepSync(1000); // 1s 一次采样
  let m;
  try {
    m = fs.statSync(DATA_FILE).mtimeMs;
  } catch (e) {
    continue;
  }
  if (m !== last) {
    writes++;
    last = m;
  }
}
const mins = MTIME_SECONDS / 60;
console.log('观测到 ' + writes + ' 次写 / ' + MTIME_SECONDS + 's ⇒ ≈' + r2(writes / mins) + ' 次/分,每次约 ' + kb + 'KB ⇒ ≈' + r2((writes * kb) / mins / 1024) + ' MB/分的整库快照写放大(仅这段窗口)');
console.log('文件 mtime 从 ' + new Date(startMs).toISOString() + ' 走到 ' + new Date(last).toISOString());
console.log('结论怎么读:上面那三个数(单次成本 × 频率)才是"要不要切真表"的依据;' + 'table-parity 的连绿天数只证明影子写形状对,不替代这条。');
process.exit(0);
