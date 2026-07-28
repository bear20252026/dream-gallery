// 项目自检脚本：语法检查 + HTTP 冒烟测试
// 用法: node check.js   （HTTP 冒烟需要 server.js 已在运行）
// 退出码: 全部通过 0，任一失败 1

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let failed = 0;

// ---- 1. ES 模块语法检查 ----
const walkSrc = (d, p) => fs.readdirSync(path.join(d, p), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walkSrc(d, p + '/' + e.name) : (e.name.endsWith('.js') ? [p + '/' + e.name] : []));
const jsFiles = ['data.js', ...walkSrc(ROOT, 'src')];
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: fs.readFileSync(path.join(ROOT, f)),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('语法 OK   ' + f);
  } catch (e) {
    failed++;
    console.error('语法 FAIL ' + f + '\n' + e.stderr);
  }
}

// ---- 2. HTTP 冒烟 ----
(async () => {
  const urls = ['/', '/data.js', '/api/files?dir=photos', ...jsFiles.filter(f => f.startsWith('src/')).map(f => '/' + f)];
  for (const u of urls) {
    try {
      const res = await fetch(BASE + u);
      if (res.status === 200) console.log('HTTP  OK   ' + u);
      else { failed++; console.error('HTTP  FAIL ' + u + ' → ' + res.status); }
    } catch (e) {
      failed++;
      console.error('HTTP  FAIL ' + u + ' → 无法连接（server.js 是否在运行？）');
      break;
    }
  }
  console.log(failed ? `\n共 ${failed} 项失败` : '\n全部检查通过');
  process.exit(failed ? 1 : 0);
})();
