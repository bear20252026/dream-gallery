#!/usr/bin/env node
// build-repro-check.cjs — 构建可复现性判据(2026-11-11 技术债整改:R6 不变发布的本地前提)
//
// 背景:AGENTS.md / verify-drift.sh 曾记载"本项目构建不可复现——同一棵工作树连续两次
// npm run build,79 个 chunk 文件名全变"。2026-11-11 实测推翻:依赖升级(vite 8.3.8 等)后,
// 连续两次构建的 dist 逐字节完全一致(93 chunk + index.html 零差异)。本脚本把这条实测
// 固化成可失败判据:两次构建产物不一致 ⇒ exit 1,防止未来再悄悄漂移回"不可复现"。
//
// 用法:node scripts/build-repro-check.cjs
// 退出码:0=可复现;1=不可复现(列出差异);2=构建本身失败。
// ⚠️ 只读比对,不改源码;两次构建的产物落在系统临时目录,跑完即清。
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function build() {
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe', shell: process.platform === 'win32' });
}
// 递归收集 dist 下所有文件的相对路径 → 内容哈希(用字节比对,不只看文件名)
function snapshot(dir) {
  const out = new Map();
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs, r);
      else out.set(r, fs.readFileSync(abs));
    }
  };
  walk(dir, '');
  return out;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-repro-'));
try {
  console.log('[repro] 第一次构建…');
  build();
  const a = snapshot(DIST);
  const copyA = path.join(tmp, 'a');
  fs.cpSync(DIST, copyA, { recursive: true });

  console.log('[repro] 第二次构建…');
  build();
  const b = snapshot(DIST);

  const diffs = [];
  const keysA = [...a.keys()].sort();
  const keysB = [...b.keys()].sort();
  if (keysA.join('\n') !== keysB.join('\n')) {
    const onlyA = keysA.filter((k) => !b.has(k));
    const onlyB = keysB.filter((k) => !a.has(k));
    if (onlyA.length) diffs.push('仅第一次有: ' + onlyA.slice(0, 10).join(', '));
    if (onlyB.length) diffs.push('仅第二次有: ' + onlyB.slice(0, 10).join(', '));
  }
  for (const k of keysA) {
    if (b.has(k) && !a.get(k).equals(b.get(k))) diffs.push('内容不同: ' + k);
  }

  if (diffs.length) {
    console.error('❌ 构建不可复现:两次产物存在 ' + diffs.length + ' 处差异');
    for (const d of diffs.slice(0, 20)) console.error('   ' + d);
    console.error('   R6 不变发布的前提被破坏 —— 请排查内容哈希里掺入的每次构建都变的量。');
    process.exit(1);
  }
  console.log('✅ 构建可复现:两次产物逐字节一致(' + a.size + ' 个文件)。R6 不变发布前提满足。');
  process.exit(0);
} catch (e) {
  console.error('❌ 构建失败或比对异常:', e.message);
  process.exit(2);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}