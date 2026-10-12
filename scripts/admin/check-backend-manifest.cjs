// check-backend-manifest.cjs — 「部署清单 ⊇ 真实依赖」自检(2026-10-12 查出,发布阻断级)
// ===================== 为什么需要它 =====================
// backend-sync.sh 的清单原先写死 `lib/*.js`,而 glob **不递归**。R1/R2 把后端拆进
// lib/repo/、lib/upload/、lib/migrations/ 之后,这些文件一个都不会被上传:
// 线上 server.js → lib/store → lib/shadow → lib/repo/chat 直接 Cannot find module,
// pm2 反复重启 = 全站 502。而 md5 差集、上传、复核全程"绿灯"——因为清单根本没看那个目录一眼。
//
// 所以这里把「代码里真实依赖的文件」和「脚本准备上传的文件」做集合比对:
//   可达但未列入清单 ⇒ 退出 1 并点名(按这份清单发上去必缺文件)
//   lib/migrations/*.sql 未列入清单 ⇒ 同样点名(迁移靠 readdirSync 发现,不在依赖图上)
//   清单里有本地不存在的文件 ⇒ 点名(tar -T 会当场失败)
// 判据取自 dependency-cruiser 解析出的真实依赖图(与 `npm run deps` 那道硬闸同一个解析器),
// 不是人记的目录名,也不是我自己写的正则——下次再拆目录不用回来改这里。
//
// ⚠️ 拿不到依赖图 / 拿不到清单 ⇒ 退出 2(判定失败),绝不报"没问题"。
//    第一版用正则扫源码,把注释里的 require('./lib/aiusage') 也算成依赖,又因路径拼接写错
//    解析出"只可达 1 个文件"却打印了 ✅ —— 判定器自己假绿,比漏传更危险,所以现在:
//    ① 解析交给 depcruise;② 图小得可疑(模块数 < MIN_MODULES)直接按判定失败处理。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIN_MODULES = 10; // 从 server.js 出发的真实图有 90+ 个模块;少到这个数就是解析没跑对
const IN_SCOPE = (rel) => rel === 'server.js' || rel.startsWith('lib/') || rel.startsWith('src/shared/');

function run(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { return null; }
}

/** depcruise 依赖图 → 从 server.js 可达的仓库内文件(rel -> [rel...]) */
function graph() {
  // 直接跑包里的 CLI 入口,不走 npx:npx 在 Windows 上是 .cmd 垫片,execFileSync 不经过 shell 会 ENOENT
  const cli = path.join(ROOT, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruise.mjs');
  let raw = null;
  if (fs.existsSync(cli)) raw = run(process.execPath, [cli, '--no-config', '--output-type', 'json', 'server.js']);
  if (raw === null) raw = run('npx', ['--no-install', 'depcruise', '--no-config', '--output-type', 'json', 'server.js']);
  if (raw === null) return { error: 'depcruise 跑不起来(dependency-cruiser 没装?node_modules 里找不到 bin)' };
  let json;
  try { json = JSON.parse(raw); } catch (e) { return { error: 'depcruise 输出不是 JSON,无法解析依赖图' }; }
  const mods = Array.isArray(json.modules) ? json.modules : [];
  if (mods.length < MIN_MODULES) {
    return { error: `依赖图只有 ${mods.length} 个模块(远少于真实规模)——判定不可信,按失败处理` };
  }
  const adj = new Map();
  for (const m of mods) {
    const deps = (m.dependencies || []).map((d) => String(d.resolved || '').replace(/\\/g, '/')).filter(Boolean);
    const key = String(m.source || '').replace(/\\/g, '/');
    adj.set(key, (adj.get(key) || []).concat(deps.filter((d) => IN_SCOPE(d))));
  }
  return { adj };
}

function main() {
  const bashOut = run('bash', ['-c', '. scripts/backend-files.sh && backend_files']);
  if (bashOut === null) {
    console.error('❌ 无法执行 scripts/backend-files.sh(bash 不在 PATH?)—— 清单**未能判定**,不是"没问题"');
    process.exit(2);
  }
  const manifest = new Set(bashOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  if (!manifest.has('server.js')) {
    console.error('❌ 清单里没有 server.js —— 清单出处本身坏了,拒绝判定');
    process.exit(2);
  }

  const g = graph();
  if (g.error) { console.error('❌ ' + g.error + ' —— 本次不做结论,不要当作"清单正确"'); process.exit(2); }

  const seen = new Set();
  const queue = ['server.js'];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel) || !g.adj.has(rel)) continue;
    seen.add(rel);
    for (const d of g.adj.get(rel)) if (!seen.has(d)) queue.push(d);
  }
  const missing = [...seen].filter((f) => !manifest.has(f));

  // 迁移 SQL 不在依赖图上(lib/migrate.js 用 readdirSync 发现它们),单独兜一条
  const migMissing = [];
  try {
    for (const f of fs.readdirSync(path.join(ROOT, 'lib', 'migrations'))) {
      if (!/^\d+_.+\.sql$/.test(f)) continue;
      if (!manifest.has('lib/migrations/' + f)) migMissing.push('lib/migrations/' + f);
    }
  } catch (e) { /* 没有迁移目录 = 本轮不涉及 R1,不是错误 */ }

  const ghost = [...manifest].filter((f) => {
    try { return !fs.statSync(path.join(ROOT, f)).isFile(); } catch (e) { return true; }
  });

  if (ghost.length) {
    console.error('❌ 清单里有本地不存在的文件(tar 会当场失败):');
    ghost.forEach((f) => console.error('   ' + f));
    process.exit(1);
  }
  if (missing.length || migMissing.length) {
    console.error('❌ 后端清单漏文件:这些文件被真实依赖 / 被迁移器发现,但【不会被上传】——');
    console.error('   按现在的清单发上去,线上会 Cannot find module 并反复重启(全站 502)。');
    missing.forEach((f) => console.error('   漏(依赖): ' + f));
    migMissing.forEach((f) => console.error('   漏(迁移): ' + f));
    console.error('   修法:把文件类型加进 scripts/backend-files.sh 的白名单(唯一出处,别在调用方补 glob)。');
    process.exit(1);
  }
  console.log(`✅ 后端清单覆盖真实依赖(从 server.js 可达 ${seen.size} 个,清单 ${manifest.size} 个)`);
}

main();
