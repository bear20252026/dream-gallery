// 前端密钥泄露防线(2026-09-24):扫 src/ + public/ + 根级 html,
// 断言不含 API 密钥形状的字符串与 AI 上游域名。
// 架构前提:所有 AI 调用走服务端代理(lib/aichannels.js),密钥只存在于服务器 .env,
// 浏览器 bundle 永远不该出现密钥 —— 本测试把它钉成契约,防止未来误把 key 写进前端。
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// 密钥形状:小米 sk-/tp- 前缀 + 16 位以上连续字母数字(避免误伤普通文本)
const KEY_PATTERNS = [
  { name: '密钥形状 sk-/tp-', re: /\b(?:sk|tp)-[A-Za-z0-9]{16,}/ },
  {
    name: 'AI 上游域名',
    re: /api\.xiaomimimo\.com|token-plan-cn\.xiaomimimo\.com|api\.moonshot\.cn|api\.kimi\.com/,
  },
  { name: '密钥环境变量名', re: /MIMO_TP_API_KEY|MIMO_API_KEY|AI_GRADE_API_KEY/ },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|ts|html|css|json)$/.test(name)) out.push(p);
  }
  return out;
}

function frontendFiles() {
  const files = walk(join(ROOT, 'src'));
  for (const extra of ['public']) {
    try {
      files.push(...walk(join(ROOT, extra)));
    } catch {
      /* 不存在则跳过 */
    }
  }
  // 根级入口 html(Vite 多页构建的输入)
  for (const name of [
    'index.html',
    'admin.html',
    'guide.html',
    'whiteboard.html',
    'music.html',
    'agreement.html',
    'privacy.html',
    'community.html',
    'lobby.html',
    'room.html',
    'official.html',
  ]) {
    try {
      const p = join(ROOT, name);
      statSync(p); // 存在才纳入
      files.push(p);
    } catch {
      /* 文件不存在则跳过 */
    }
  }
  return files;
}

describe('前端密钥泄露防线', () => {
  it('src/ + public/ + 根级 html 不含任何密钥形状/上游域名/密钥变量名', () => {
    const offenders = [];
    for (const f of frontendFiles()) {
      let text;
      try {
        text = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      for (const { name, re } of KEY_PATTERNS) {
        if (re.test(text)) offenders.push(`${name}: ${f.replace(ROOT, '')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
