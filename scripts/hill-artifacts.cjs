#!/usr/bin/env node
// hill-artifacts.cjs — 入库山丘产物的溯源清单:record 生成 / check 对账(2026-10-15 第六轮审计·结构包 C 附带项)
//
// 为什么要有这份清单:`public/hill/` 里 14 个文件是 **构建产物入库**,而 CI 明确不重建山丘
//   (.github/workflows/test.yml 只跑 hill-solo-guard 读现成产物;重建要在 hill-src 里 pnpm install)。
//   于是"站点上跑的山丘"与"仓库里的 hill-src 源码"之间没有任何机械联系 —— 改了 hill-src 忘了重构建,
//   或者从别处 scp 一包进来,仓里看不出来。审计说"产物无溯源"就是这样落地的。
// 这份清单把能机械确定的部分钉住:文件名 + 字节数 + sha256 + 来源提交。
//   重构建后:node scripts/hill-artifacts.cjs record(重新生成)
//   任何时候:node scripts/hill-artifacts.cjs check(有出入即 exit 1,由单测拦)
//
// 清单**必须**住在 public/hill 之外:hill-src/vite.config.ts 的 build 是 `emptyOutDir: true`,
// 一次重构建就把整个 public/hill 端掉 —— 记在产物目录里的东西一定会被自己抹掉。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// 目录/清单可用环境变量指到临时位置 —— 只为让"摘要与行尾无关"这条不变量能跨平台被测出来
// (Windows 检出是多行文本 CRLF、Linux CI 是 LF,拿真产物目录测出来的绿只证明了一台机器)。
const DIR = process.env.HILL_ARTIFACTS_DIR
  ? path.resolve(process.env.HILL_ARTIFACTS_DIR)
  : path.join(ROOT, 'public', 'hill');
const MANIFEST = process.env.HILL_ARTIFACTS_MANIFEST
  ? path.resolve(process.env.HILL_ARTIFACTS_MANIFEST)
  : path.join(ROOT, 'scripts', 'hill-artifacts.json');

// 文本类产物的摘要必须**与行尾无关**。
// ⚠️2026-10-15 CI 实锤的假红:清单原本按文件字节算 sha256,而 Windows 的 git 检出会把**多行文本**
// 转成 CRLF(压缩后的单行 js/css/html 没有换行所以不受影响)⇒ 同一份内容在两台机器算出两个哈希,
// CI 把三个 `fonts/*-OFL.txt` 判成"内容变了但清单没更新",本地却是绿的。清单要回答的是
// "内容与记录比有没有漂",不是"这份检出是什么行尾风格"。二进制(woff2/png)不参与归一。
const TEXT_EXT_RE = /\.(txt|md|json|html?|css|js|mjs|cjs|svg|map)$/i;
function digest(file) {
  const raw = fs.readFileSync(file);
  const buf = TEXT_EXT_RE.test(file)
    ? Buffer.from(raw.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
    : raw;
  return { bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}
function listFiles(dir, prefix = '') {
  const out = [];
  for (const e of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? prefix + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...listFiles(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}
// 来源提交:git 里最后一次真正动过 public/hill 的那一笔(产物与源码同一笔提交 ⇒ 溯源可查)
function gitInfo() {
  const fmt = (args) => {
    try {
      return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch (e) {
      return '';
    }
  };
  return {
    artifactCommit: fmt(['log', '-1', '--format=%H', '--', 'public/hill']),
    artifactDate: fmt(['log', '-1', '--format=%ad', '--date=iso-strict', '--', 'public/hill']),
    hillSrcCommit: fmt(['log', '-1', '--format=%H', '--', 'hill-src']),
    hillSrcDate: fmt(['log', '-1', '--format=%ad', '--date=iso-strict', '--', 'hill-src']),
    worktreeClean: fmt(['status', '--porcelain', '--', 'public/hill', 'hill-src']) === '',
  };
}

const BUILD = {
  source: 'hill-src/',
  command: 'cd hill-src && pnpm build', // = tsc --noEmit && vite build && node scripts/check-size.mjs
  variant: 'solo(默认;HILL_SOLO=0 是可联机的另一变体,不入库)',
  packageManager: 'pnpm@10.18.0(hill-src/package.json 的 packageManager 字段)',
  outDir: '../public/hill(emptyOutDir: true ⇒ 重构建会端掉整目录)',
  guard: 'node scripts/hill-solo-guard.cjs(CI 读现成产物判定,不重建)',
  ciRebuilds: false,
};

function snapshot() {
  return listFiles(DIR).map((rel) => {
    const d = digest(path.join(DIR, rel));
    return { file: rel, bytes: d.bytes, sha256: d.sha256 };
  });
}

const mode = process.argv[2] || 'check';
if (!fs.existsSync(DIR)) {
  console.log('❌ 没有 public/hill —— 判不了,不算通过');
  process.exit(2);
}
const files = snapshot();

if (mode === 'record') {
  const doc = {
    _why: 'public/hill 是入库的构建产物且 CI 不重建 ⇒ 这份清单是它与 hill-src 之间唯一的机械联系。重构建后必须重新 record。',
    built: { ...BUILD, ...gitInfo(), recordedAt: new Date().toISOString().slice(0, 19) + 'Z' },
    files,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log('✅ 已记录 ' + files.length + ' 个文件 → scripts/hill-artifacts.json');
  process.exit(0);
}

if (mode === 'check') {
  if (!fs.existsSync(MANIFEST)) {
    console.log('❌ 没有 scripts/hill-artifacts.json —— 产物无溯源记录');
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const want = new Map((doc.files || []).map((f) => [f.file, f]));
  const got = new Map(files.map((f) => [f.file, f]));
  const problems = [];
  for (const [f, w] of want) {
    const g = got.get(f);
    if (!g) problems.push('清单里有、目录里没有(被删了?): ' + f);
    else if (g.sha256 !== w.sha256) problems.push('内容变了但清单没更新: ' + f);
    else if (g.bytes !== w.bytes) problems.push('字节数对不上: ' + f);
  }
  for (const f of got.keys())
    if (!want.has(f)) problems.push('目录里有、清单没记(新产物没登记?): ' + f);
  if (problems.length) {
    console.log('❌ 山丘产物与溯源清单不一致(' + problems.length + ' 处):');
    for (const p of problems) console.log('   · ' + p);
    console.log('   重构建后请跑:node scripts/hill-artifacts.cjs record');
    process.exit(1);
  }
  console.log('✓ 山丘产物溯源一致:' + files.length + ' 个文件全部匹配清单');
  console.log(
    '  来源提交 ' +
      String(doc.built.artifactCommit || '?').slice(0, 8) +
      '(' +
      String(doc.built.artifactDate || '?').slice(0, 10) +
      ')  hill-src 末次提交 ' +
      String(doc.built.hillSrcCommit || '?').slice(0, 8)
  );
  process.exit(0);
}

console.log('用法:node scripts/hill-artifacts.cjs [record|check]');
process.exit(2);
