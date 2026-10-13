#!/usr/bin/env node
// hill-solo-guard.cjs — 判定"打进站点里的山丘单人包确实没有可用的网络路径"(2026-10-14 第五轮审计 E)
//
// 为什么需要机器判定:审计说山丘单人包"带着登录/房间代码,只用 data-solo 遮 UI",核实后是
// **部分成立** —— 代码在包里,但 `room.start()` 全仓无调用点 ⇒ 那条 `new WebSocket` 与
// multiplayer/bootstrap.json 的 fetch 都不可达。"不可达"是人读代码得出的结论,人会读错,
// 也会被后来的提交悄悄改掉(加一行 room.peek() 轮询就把它变成真的出站)。所以钉成闸门。
//
// 三条检查各自能证明什么、不能证明什么(别把第一条当成全部):
//  ① 产物里不得出现 `api/notes`  ⇒ 涂鸦/账号那条网络层(net/notes.ts)在单人构建里被折掉了。
//     这条能证明,因为那些 URL 前缀只可能来自那几个函数。
//  ② 源码里 `room.start(` / `room.peek(` 必须零调用点 ⇒ 剩下的 net/room.ts 里那段
//     WebSocket / bootstrap.json / healthz 代码**没有入口**。这条证明的是"不可达",不是"不存在":
//     类本身还会打进包(它的 remotes()/status 被每帧读着),那是**死重量而不是出网点**。
//  ③ vite.config 里必须还定义着 __SOLO__ ⇒ 上面那条折叠的来源还在;丢了它,①会立刻变红,
//     但这条先红能告诉你红的是配置而不是某次误删。
//
// 用法:node scripts/hill-solo-guard.cjs     (读已入库的 public/hill 产物,不重建)
// 退出码:0 三条全过 / 1 有检查失败 / 2 前置条件不满足(没有产物、读不到源码 ⇒ 判不了就不算过)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'public', 'hill', 'assets');
const SRC = path.join(ROOT, 'hill-src', 'src');
let fail = 0;
const say = (ok, msg, extra) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + msg + (extra ? ' | ' + extra : ''));
  if (!ok) fail++;
};

if (!fs.existsSync(ASSETS)) {
  console.log('❌ 没有 ' + path.relative(ROOT, ASSETS) + ' —— 判不了,不算通过(先 cd hill-src && pnpm build)');
  process.exit(2);
}
const chunkFiles = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
const chunks = chunkFiles.map((f) => ({ f, text: fs.readFileSync(path.join(ASSETS, f), 'utf8') }));

// —— ① 产物里不该再有涂鸦/账号的网络端点 ——
const NOTES_URL = 'api/notes';
const hits = chunks.filter((c) => c.text.includes(NOTES_URL)).map((c) => c.f);
say(hits.length === 0, '单人包里不含 net/notes 的请求端点("' + NOTES_URL + '")', hits.length ? '出现在 ' + hits.join(', ') : '零命中');

// —— ② 源码里不该有能连上房间/取房间信息的调用点 ——
const tsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|mjs)$/.test(e.name)) tsFiles.push(p);
  }
})(SRC);
const DEFINITION = /net[\\/]room\.ts$/; // 类自己的定义不算调用点
// ⚠️只认 `room.start(` / `room.peek(` 这种**挂在房间实例上**的调用:.start( 是超多对象共用的方法名
//   (audio.start / loop.start / game.start / ambience.start…),裸写 /\.start\(/ 会把它们全判成调用点,
//   闸门第一版就这么假红过一次。房间实例在 hill-src 里一律叫 room(见 src/main.ts)。
const callPatterns = [/\broom\s*\.\s*(start|peek)\s*\(/];
const callers = [];
for (const f of tsFiles) {
  if (DEFINITION.test(f)) continue;
  const text = fs.readFileSync(f, 'utf8');
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // 注释与文档行不算(这条判的是"有没有人真去调")
    if (callPatterns.some((re) => re.test(line))) callers.push(path.relative(ROOT, f) + ':' + (i + 1) + ' ' + line.trim().slice(0, 70));
  });
}
say(callers.length === 0, '源码里没有任何 room.start()/room.peek() 调用点 ⇒ 房间那条连接起不来', callers.slice(0, 4).join(' / ') || '零调用点');

// —— ③ 折叠的来源还在 ——
const cfg = fs.readFileSync(path.join(ROOT, 'hill-src', 'vite.config.ts'), 'utf8');
say(cfg.includes('__SOLO__'), 'hill-src/vite.config.ts 仍在定义 __SOLO__');
const main = fs.readFileSync(path.join(SRC, 'main.ts'), 'utf8');
say(/if\s*\(\s*__SOLO__\s*\)\s+document\.body\.dataset\.solo\s*=/.test(main), 'main.ts 的单人标记由构建期常量决定(不是只靠 CSS 遮罩)');

const entry = chunks.filter((c) => /^index-/.test(c.f)).reduce((s, c) => s + c.text.length, 0);
console.log('  · 入口 chunk 现有 ' + Math.round(entry / 1024) + 'KB(minified);net/room.ts 仍在包内但按②不可达 —— 那是死重量,不是出网点');
console.log(fail ? '\n=== 山丘单人包判定:未过(' + fail + ' 项)===' : '\n=== 山丘单人包判定:通过 ===');
process.exit(fail ? 1 : 0);
