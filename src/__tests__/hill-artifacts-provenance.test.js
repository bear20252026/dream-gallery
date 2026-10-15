// hill-artifacts-provenance.test.js — 入库山丘产物的溯源对账(2026-10-15 第六轮审计·结构包 C 附带项)
//
// 病:`public/hill/` 是 14 个**构建产物文件入库**,而 CI 明确不重建山丘(重建要在 hill-src 里
//   pnpm install,而且 `hill-src/vite.config.ts` 的 `emptyOutDir: true` 会端掉整目录)。
//   ⇒ 站点上跑的那包山丘,和仓库里的 hill-src 源码之间**没有任何机械联系**:忘重构建、
//   或从别处 scp 一包进来,仓里看不出来。审计说"产物无溯源"就是这个意思。
// 药:`scripts/hill-artifacts.json`(由 `node scripts/hill-artifacts.cjs record` 生成)记着
//   每个文件的 sha256/字节数 + 来源提交 + 构建命令;本测试跑 `check` 对账。
// 边界(诚实写明,别当成全能闸门):
//   · 对账只比"目录里的文件 ≡ 清单",**不**在测试里跑 git —— CI 是浅克隆(detached + depth),
//     在那里 `git log -1 -- public/hill` 拿到的提交和我本地记的不是同一个,会把闸门变成假红。
//     来源提交字段是给人看的线索,不是断言对象。
//   · "hill-src 改了但没重构建"这一支仍拦不住(产物字节没变,清单自然匹配)。真要拦得住,
//     得在 CI 里重建山丘并比对哈希,那是独立的成本决定,不在本轮。
//   · 产物内部没有版本戳(主站有 `__B612_BUILD__`,山丘包没有)⇒ 只能靠清单,线上抓包看不出来。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'scripts', 'hill-artifacts.json');
const DIR = path.join(ROOT, 'public', 'hill');

function runChecker() {
  try {
    const out = execFileSync(process.execPath, ['scripts/hill-artifacts.cjs', 'check'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return {
      code: e.status === undefined ? 2 : e.status,
      out: String(e.stdout || '') + String(e.stderr || ''),
    };
  }
}

describe('山丘入库产物的溯源清单', () => {
  it('清单存在,且记着构建命令/来源提交/是否 CI 重建', () => {
    expect(fs.existsSync(MANIFEST), '缺 scripts/hill-artifacts.json').toBe(true);
    const doc = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    expect(doc.built.source).toBe('hill-src/');
    expect(doc.built.command).toContain('pnpm build');
    expect(doc.built.ciRebuilds).toBe(false);
    expect(doc.built.artifactCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(doc.built.hillSrcCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(Array.isArray(doc.files)).toBe(true);
    expect(doc.files.length).toBeGreaterThan(0);
  });

  it('清单必须住在 public/hill 之外(emptyOutDir 会端掉产物目录)', () => {
    const rel = path.relative(DIR, MANIFEST);
    expect(rel.startsWith('..'), '清单被记进产物目录里,重构建就没了: ' + rel).toBe(true);
    const cfg = fs.readFileSync(path.join(ROOT, 'hill-src', 'vite.config.ts'), 'utf8');
    expect(cfg).toMatch(/emptyOutDir:\s*true/);
  });

  it('目录里的 14 个文件与清单一致(改产物不重记 ⇒ 红)', () => {
    const r = runChecker();
    expect(r.code, 'hill-artifacts.cjs check:\n' + r.out).toBe(0);
    const doc = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    expect(r.out).toContain(String(doc.files.length));
  });

  // 2026-10-15 CI 实锤的假红:摘要原本按**本机检出的字节**算,而 Windows 会把多行文本检出成 CRLF
  // (压缩过的单行产物没有换行 ⇒ 不受影响,所以只有 license txt 与 index.html 四处中招)。
  // 这条把不变量做成**与平台无关**的可测命题:同一份内容,CRLF 检出记的清单必须能核对 LF 检出。
  it('摘要与行尾无关:CRLF 检出的记录必须核对得上 LF 检出(反之亦然)', () => {
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hill-eol-'));
    const ART = path.join(TMP, 'hill');
    const MF = path.join(TMP, 'manifest.json');
    fs.mkdirSync(path.join(ART, 'fonts'), { recursive: true });
    const env = { ...process.env, HILL_ARTIFACTS_DIR: ART, HILL_ARTIFACTS_MANIFEST: MF };
    const run = (mode) =>
      execFileSync(process.execPath, ['scripts/hill-artifacts.cjs', mode], {
        cwd: ROOT,
        encoding: 'utf8',
        env,
      });
    const txt = 'THE OFL LICENSE\nline two\nline three\n';
    const write = (rel, body, crlf) =>
      fs.writeFileSync(path.join(ART, rel), crlf ? body.replace(/\n/g, '\r\n') : body, 'utf8');

    write('fonts/A-OFL.txt', txt, true); // 先按 Windows 检出形状记
    write('index.html', '<html>\n<body>x\n</body>\n</html>\n', true);
    run('record');
    const doc = JSON.parse(fs.readFileSync(MF, 'utf8'));
    const rec = doc.files.find((f) => f.file === 'fonts/A-OFL.txt');
    expect(rec.bytes, '文本产物记的应是归一后的字节数,不是本机 CRLF 的字节数').toBe(txt.length);

    write('fonts/A-OFL.txt', txt, false); // 换成 Linux 的形状
    write('index.html', '<html>\n<body>x\n</body>\n</html>\n', false);
    expect(run('check'), '内容一字未动,只是行尾风格不同 ⇒ 不许报漂').toContain('✓');

    // 反向:归一不许把**真的**内容漂移也洗掉
    write('fonts/A-OFL.txt', txt + 'tampered\n', false);
    let red;
    try {
      red = run('check');
    } catch (e) {
      red = e;
    }
    expect(red.constructor.name, '内容真变了必须红(否则归一=放宽)').not.toBe('String');
    const out = String(red.stdout || '') + String(red.stderr || '');
    expect(out).toContain('内容变了但清单没更新');
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('index.html 引到的 chunk/字体都在清单里(半包复制 ⇒ 红)', () => {
    const doc = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const listed = new Set(doc.files.map((f) => f.file));
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(4); // 入口 js + css + 两个字体 preload
    for (const r of refs) expect(listed.has(r), 'index.html 引了不在清单里的 ' + r).toBe(true);
  });

  it('hill-solo-guard 仍判定通过(单人包没有可用出站路径)', () => {
    let res;
    try {
      res = {
        code: 0,
        out: execFileSync(process.execPath, ['scripts/hill-solo-guard.cjs'], {
          cwd: ROOT,
          encoding: 'utf8',
        }),
      };
    } catch (e) {
      res = {
        code: e.status === undefined ? 2 : e.status,
        out: String(e.stdout || '') + String(e.stderr || ''),
      };
    }
    expect(res.code, 'hill-solo-guard.cjs:\n' + res.out).toBe(0);
  });
});
