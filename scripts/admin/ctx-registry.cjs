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
//  4. **局部遮蔽必须剔除**(J1 实锤):同名 ctx 未必是总线 ——
//     markers.js `canvasTexture(w,h,(ctx)=>{…})` 的 ctx 是 Canvas2D 回调参数;
//     visitor-fp.js `var ctx = new OfflineAudioContext(...)` 是音频上下文。
//     这两处曾把 fillStyle/font/textAlign/oncomplete 等 7 个假属性登进册子。
//     判据:文件内出现 ctx 的**局部绑定**(回调/函数参数、var/let/const 声明)时,
//     该文件从直写扫描中排除,并在报告里列为「遮蔽文件」人工复核 —— 宁漏报不假报,
//     因为假属性会污染真拆施工图(把 Canvas API 当成总线属性去收编)。
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

/**
 * 行级遮蔽跟踪(J1)。同名 ctx 未必是总线,但**不能整文件排除** ——
 * markers.js 既 import 总线、又在 canvasTexture 回调里用同名 ctx 画 Canvas2D,
 * 整文件排除会连真写点一起漏掉。故按作用域逐行判定:
 *
 *  - 真局部对象绑定 ⇒ 进入遮蔽块,块内的 ctx.* 不计:
 *      · `var/let/const ctx = …`(visitor-fp.js 的 OfflineAudioContext)
 *      · 回调形参 `(ctx) => {` / `function (ctx)`(markers.js 的 Canvas2D)
 *      · `function wrapText(ctx, …)`(quiz.js 内部画字助手)
 *  - **依赖注入不算遮蔽**:boot-check/light-sweep/coord-hud/story-compass/
 *    loop-manager/dialog-replies 这些文件不 import 总线,ctx 由调用方传入,
 *    传进来的就是总线本体,必须扫(首版正则过宽曾因此误漏 14 个合法文件)。
 *  - 调用实参 `replyChoices(ctx, …)` / `new LoopManager(ctx)` 更不是绑定。
 *  - ctx.js 是总线本体,永不遮蔽。
 *
 * 遮蔽块用花括号配平收口(只数非注释行的 { },字符串里的括号极少见且本仓无此形态);
 * 单行箭头 `(ctx) => ctx.fillRect(...)` 同行即收。宁漏报不假报:假属性会污染真拆施工图。
 */
function shadowTracker(rel) {
  if (rel === 'src/ctx.js') return () => false;
  // outer: 文件级花括号深度(用于判定声明式遮蔽的作用域终点)
  let outer = 0;
  // shadows: 栈,每项 {kind:'block'|'decl', endDepth}
  //   block —— 回调/函数形参遮蔽,到自身函数体收口为止
  //   decl  —— var/let/const ctx = … 遮蔽,到**所在外层块**收口为止
  //            (visitor-fp.js 的 `var ctx = new AC(...)` 是单行声明,遮蔽范围是整个函数体,
  //             不是"下一行就结束" —— 首版按单行体处理导致 ctx.oncomplete 漏剔)
  const stack = [];
  return (line) => {
    if (isComment(line)) return stack.length > 0;
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    const inShadow = stack.length > 0;

    const declBind =
      /(?:var|let|const)\s+ctx\s*=/.test(line) && !/export\s+const\s+ctx/.test(line);
    const paramBind =
      /\((?:[^()]*,\s*)?ctx(?:\s*,[^()]*)?\)\s*(?:=>|\{)/.test(line) ||
      /(?:^|[^.\w])ctx\s*=>/.test(line) ||
      /function\s*[\w$]*\s*\([^)]*\bctx\b[^)]*\)/.test(line);

    let shadowThisLine = inShadow;
    if (!inShadow && (declBind || paramBind)) {
      shadowThisLine = true;
      if (declBind) {
        // 声明式:遮蔽到**所在外层块收口**——即 outer 降到声明时深度**以下**。
        // 首版写 endDepth:outer + `outer<=endDepth` 收口,声明行无花括号时
        // outer 恰等于 endDepth ⇒ 当场弹出,ctx.oncomplete 漏剔。故用 -1 严格下降判定。
        stack.push({ kind: 'decl', endDepth: outer - 1 });
      } else if (opens > closes) {
        // 函数体开在本行:遮蔽到该体收口(outer 回落至本行前深度)
        stack.push({ kind: 'block', endDepth: outer });
      } else {
        // 单行体 `(ctx) => ctx.fillRect(...)`:仅本行
        stack.push({ kind: 'line', endDepth: outer });
      }
    }
    outer += opens - closes;
    // 收口:深度已回到各自终点以下即出栈
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.kind === 'line') {
        stack.pop();
        continue;
      }
      if (outer <= top.endDepth) stack.pop();
      else break;
    }
    return shadowThisLine;
  };
}

/** 返回 { rows, shadowed } —— shadowed 为被排除的遮蔽文件(须人工复核) */
function scanDetailed() {
  /** @type {Map<string, Set<string>>} */
  const writers = new Map();
  const shadowed = [];
  const add = (key, rel) => {
    if (!writers.has(key)) writers.set(key, new Set());
    writers.get(key).add(rel);
  };
  for (const rel of srcFiles()) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
    // 遮蔽文件整体排除:同名 ctx 是 Canvas2D/AudioContext 等局部对象,不是总线
    const lines = text.split('\n');
    const inShadow = shadowTracker(rel);
    let sawShadow = false;
    let block = null; // {prefix, keys}
    for (const line of lines) {
      const shadow = inShadow(line);
      if (shadow) sawShadow = true;
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
      if (isComment(line) || shadow) continue;
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
    if (sawShadow) shadowed.push(rel);
  }
  const rows = [...writers.entries()]
    .map(([key, ws]) => ({ key, writers: [...ws].sort() }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  return { rows, shadowed: shadowed.sort() };
}

function scan() {
  return scanDetailed().rows;
}

const domainOf = (key) => {
  const i = key.indexOf('.');
  return i < 0 ? '_root' : key.slice(0, i);
};

function renderMd(rows, shadowed = []) {
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
  if (shadowed.length) {
    out += `### 遮蔽文件(已排除,须人工复核)\n\n`;
    out += `这些文件里存在 \`ctx\` 的**局部遮蔽块**(Canvas2D 回调参数 / AudioContext / 画字助手形参)。`;
    out += `遮蔽块内的 \`ctx.*\` 不计入登记册(否则 \`fillStyle\`/\`oncomplete\` 会被当成总线属性);`;
    out += `块外照常扫描 —— 依赖注入型文件(ctx 由调用方传入)不算遮蔽。\n\n`;
    for (const f of shadowed) out += `- \`${f}\`\n`;
    out += '\n';
  }
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
    fs.writeFileSync(path.join(ROOT, MD_PATH), renderMd(rows, scanDetailed().shadowed));
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
module.exports = { scan, scanDetailed, domainOf };