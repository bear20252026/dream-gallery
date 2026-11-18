#!/usr/bin/env node
// ctx-registry.cjs — ctx 属性域登记册(I1,2026-11-18)
//
// 第五轮审计最大遗留:"ctx 约 171 个登记属性仅 3 个有 owner"。按域真拆是最大工程,
// 第一步先把**谁在写哪个属性**变成制度:全量扫描写点 → 按域分组登记 → 守卫双向钉死
// (新属性/新写方/写方变更都必须显式更新登记册,否则测试红)。运行时零改动。
//
// 扫描口径(与 ctx-writer-shapes 同纪律:只逐行,不跨行惰性量词;注释行剔除):
//  1. 直写:ctx.x = / ctx.domain.x =(排除 ==/===;=> 不是赋值)
//  2. 批量注册:Object.assign(ctx[.domain], {…}) —— 全仓 6 处,全部平铺。
//     多行块只认**恰好 2 空格缩进**的键行(函数值体内的行缩进≥4,不会误收);
//     单行块直接取花括号内顶层键。
//  3. 不扫解构读(const { s } = ctx 是读不是写)、不扫 ctx[k] 动态键(全仓 0 处,守卫钉死保持 0)。
//
// 用法:
//   node scripts/admin/ctx-registry.cjs --write   重新生成 docs/ctx-registry.{json,md}
//   node scripts/admin/ctx-registry.cjs --check   扫描结果与登记册比对,漂移即 exit 1
// 守卫:src/__tests__/ctx-registry.test.js 在 vitest 里跑同一比对(进全量门禁)。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const JSON_PATH = 'docs/ctx-registry.json';
const MD_PATH = 'docs/ctx-registry.md';

function srcFiles(dir = 'src', acc = []) {
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) {
      if (rel === 'src/__tests__' || rel === 'src/vendor') continue;
      srcFiles(rel, acc);
    } else if (/\.(js|mjs)$/.test(name)) acc.push(rel);
  }
  return acc;
}

const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);
// 直写:ctx.x = 或 ctx.d.x =(负向前瞻排 ==;键名只取字母数字_$)
const DIRECT = /\bctx\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*=(?!=)/g;
const ASSIGN_HEAD = /Object\.assign\(\s*ctx(\.[A-Za-z_$][\w$]*)?\s*,\s*\{(.*)$/;

/** 从花括号内容提取顶层键(单行块):shorthand `a,` / `a: expr,` / `a }` */
function keysFromInline(body) {
  // 去掉尾部 }):单行块以 } 收口
  const keys = [];
  const re = /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?::|,|$|\})/g;
  let m;
  while ((m = re.exec(body))) keys.push(m[1]);
  return keys;
}

function scan() {
  /** @type {Map<string, Set<string>>} */
  const writers = new Map();
  const add = (key, rel) => {
    if (!writers.has(key)) writers.set(key, new Set());
    writers.get(key).add(rel);
  };
  for (const rel of srcFiles()) {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').split('\n');
    let block = null; // {prefix, keys}
    for (const line of lines) {
      if (block) {
        // 多行 assign 块:恰好 2 空格缩进的键行才算顶层键;块以 }); 收口
        const km = line.match(/^ {2}([A-Za-z_$][\w$]*)\s*[:,]/);
        if (km) block.keys.push(km[1]);
        if (/^\s*\}\s*\)/.test(line)) {
          for (const k of block.keys) add(block.prefix ? `${block.prefix}.${k}` : k, rel);
          block = null;
        }
        continue;
      }
      if (isComment(line)) continue;
      const am = line.match(ASSIGN_HEAD);
      if (am) {
        const prefix = am[1] ? am[1].slice(1) : '';
        const rest = am[2];
        if (/\}\s*\)/.test(rest)) {
          // 单行块
          for (const k of keysFromInline(rest)) add(prefix ? `${prefix}.${k}` : k, rel);
        } else {
          block = { prefix, keys: [] };
          // 首行花括号后可能已带键(本仓 6 处均换行,保守起见也收)
          for (const k of keysFromInline(rest)) block.keys.push(k);
        }
        continue;
      }
      let m;
      DIRECT.lastIndex = 0;
      while ((m = DIRECT.exec(line))) add(m[1], rel);
    }
    if (block) throw new Error(`未收口的 Object.assign(ctx…) 块:${rel}(扫描口径失效,须人工核)`);
  }
  return [...writers.entries()]
    .map(([key, ws]) => ({ key, writers: [...ws].sort() }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

const domainOf = (key) => {
  const i = key.indexOf('.');
  return i < 0 ? '_root' : key.slice(0, i);
};

function renderMd(rows) {
  const byDomain = new Map();
  for (const r of rows) {
    const d = domainOf(r.key);
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(r);
  }
  const multi = rows.filter((r) => r.writers.length > 1);
  let out = `# ctx 属性域登记册(I1 自动生成,勿手改)\n\n`;
  out += `> 生成:\`node scripts/admin/ctx-registry.cjs --write\`;校验:\`--check\`(vitest 守卫 ctx-registry.test.js 同跑)。\n`;
  out += `> 新属性/新写方/写方变更必须重新生成登记册并在 PR 里说明——这是 ctx 按域真拆前的所有权制度地基。\n`;
  out += `> ⚠️ 标记 = 多写方(真拆时须先收编单一 owner)。注释行/解构读不计;动态键 ctx[k] 全仓必须保持 0。\n\n`;
  out += `**总计 ${rows.length} 个属性,${multi.length} 个多写方。**\n\n`;
  for (const [d, list] of [...byDomain.entries()].sort()) {
    out += `## ${d}(${list.length})\n\n| 属性 | 写方 | |\n|---|---|---|\n`;
    for (const r of list) {
      out += `| \`ctx.${r.key}\` | ${r.writers.map((w) => `\`${w}\``).join('<br>')} | ${r.writers.length > 1 ? '⚠️多写方' : ''} |\n`;
    }
    out += '\n';
  }
  return out;
}

function main() {
  const mode = process.argv[2];
  const rows = scan();
  if (mode === '--write') {
    fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, JSON_PATH), JSON.stringify({ rows }, null, 2) + '\n');
    fs.writeFileSync(path.join(ROOT, MD_PATH), renderMd(rows));
    console.log(`✅ 登记册已生成:${rows.length} 属性,${rows.filter((r) => r.writers.length > 1).length} 多写方`);
    return;
  }
  if (mode === '--check') {
    const reg = JSON.parse(fs.readFileSync(path.join(ROOT, JSON_PATH), 'utf8'));
    const a = JSON.stringify(reg.rows);
    const b = JSON.stringify(rows);
    if (a === b) {
      console.log(`✅ ctx 登记册与源码一致(${rows.length} 属性)`);
      return;
    }
    // 报漂移明细
    const old = new Map(reg.rows.map((r) => [r.key, r.writers.join(',')]));
    const now = new Map(rows.map((r) => [r.key, r.writers.join(',')]));
    for (const [k, w] of now) if (!old.has(k)) console.error(`新增未登记:ctx.${k} ← ${w}`);
    for (const [k] of old) if (!now.has(k)) console.error(`已消失仍登记:ctx.${k}`);
    for (const [k, w] of now) if (old.has(k) && old.get(k) !== w) console.error(`写方变更:ctx.${k} ${old.get(k)} → ${w}`);
    console.error('❌ 登记册漂移:跑 --write 重新生成,并在 PR 说明所有权变化');
    process.exit(1);
  }
  console.error('用法:--write | --check');
  process.exit(2);
}

if (require.main === module) main();
module.exports = { scan, domainOf };