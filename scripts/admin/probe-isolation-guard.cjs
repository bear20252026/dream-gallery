// probe-isolation-guard.cjs — 自起 server.js 的脚本必须把数据根挪进临时目录(2026-10-15 建)
// 为什么:任何一次 `spawn('server.js')` 若不打 GATE_DATA_FILE,就按 lib/store.js:9/19 的默认值指向仓库根
//   gate_data.json / gate_data.db;而 server.js:239 会调 lib/retention.js:457 那句"启动时先跑一次"的保留期
//   清扫,落到 :399 的 store.saveGateData() ⇒ 实测约 1 秒、零请求就把整份真实数据根覆写一遍。
//   探针一旦超时或断言失效(最典型的就是已退役的 media-rules-probe),坏数据已经落在仓库根上了。
// 判据(启发式,故意宽松):文件里出现被引号包住的 server.js,且它所在行或往上 3 行内出现 spawn/fork/exec
//   ⇒ 认定它会起服务器;此时整份文件里找不到 GATE_DATA_FILE 就算违规。
// 例外只许写进 scripts/probe-isolation-allowlist.txt(一行一个路径,# 之后是**为什么允许**)。
//   反向也要成立:清单里的路径若已经隔离、或已不起服务器、或文件已删 ⇒ 同样报红。
//   **清单只许缩短,不许当长期豁免账。**(以上两条都有反证用例,见 AGENTS.md 该条)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PROBE_DIR = path.join(ROOT, 'scripts', 'probe');
const ALLOWLIST_FILE = path.join(ROOT, 'scripts', 'probe-isolation-allowlist.txt');

function spawnsServer(src) {
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/['"]server\.js['"]/.test(lines[i])) continue;
    const ctx = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    if (/\b(?:spawn\w*|fork|exec\w*)\s*\(/.test(ctx)) return true;
  }
  return false;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'archive') continue; // 归档区:README 已声明是一次性/陈旧探针
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(js|cjs|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

// rel -> { spawns: 会起服务器, isolated: 打了 GATE_DATA_FILE }
const state = new Map();
for (const file of walk(PROBE_DIR)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');
  state.set(rel, { spawns: spawnsServer(src), isolated: /GATE_DATA_FILE/.test(src) });
}
const allowed = new Set(
  fs.existsSync(ALLOWLIST_FILE)
    ? fs.readFileSync(ALLOWLIST_FILE, 'utf8').split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean)
    : []
);

const violations = [...state]
  .filter(([rel, s]) => s.spawns && !s.isolated && !allowed.has(rel))
  .map(([rel]) => rel);
// 豁免条目只在"确实还需要豁免"时才允许存在
const unneeded = [...allowed].filter(rel => {
  const s = state.get(rel);
  if (!s) return true;          // 文件已经不在
  if (!s.spawns) return true;   // 现在根本不起服务器
  return s.isolated;            // 已经隔离 ⇒ 这条豁免是多余的
});
const exempted = [...state].filter(([rel, s]) => s.spawns && !s.isolated && allowed.has(rel)).length;

if (!violations.length && !unneeded.length) {
  console.log(`✓ 探针数据根隔离闸:扫 ${state.size} 个脚本,自起服务器的要么打了 GATE_DATA_FILE,要么在豁免清单里(本次豁免 ${exempted} 个,均为 README 声明的一次性探针)`);
  process.exit(0);
}
if (violations.length) {
  console.error(`✗ ${violations.length} 个脚本自起 server.js 却不隔离数据根(会把仓库根 gate_data.json/.db 当测试库写):`);
  violations.forEach(v => console.error('    - ' + v));
  console.error('  改法:DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "...-"));spawn 的 env 里加');
  console.error('        GATE_DATA_FILE: path.join(DATA_DIR, "gate_data.json");收尾 fs.rmSync(DATA_DIR, {recursive:true,force:true})。');
  console.error('  可抄:scripts/probe/store-probe.js(最小组合)或 security-fix-probe.js(还要 seed 的场合)。');
}
if (unneeded.length) {
  console.error(`✗ 豁免清单里 ${unneeded.length} 条已经不需要(已隔离 / 已不起服务器 / 文件已删),清单只许缩短:`);
  unneeded.forEach(v => console.error('    - ' + v));
}
process.exit(1);
