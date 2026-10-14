// types-ctx-drift.test.js — ctx 命名空间「运行时成员 ≡ 声明成员」双向对账(2026-10-14,审计 I 第二刀)
// 起因:checkJs 的 378 条里有 69 条**不是类型债** —— 成员一直在 `src/ctx-*.js` 的 `properties` 数组里
// (代理就是按这份名单 `defineProperty` 出来的),落后的是**手工维护**的 `types/ctx.d.ts`
// (没有任何生成脚本:`npm run typecheck` 就是 `tsc --noEmit`)。补完之后没人拦的话,它一定再漂一次:
//   · 数组有、声明没有 ⇒ 凭空长出 TS2339,下一个人会照着报错去"修代码",方向从一开始就错;
//   · 声明有、数组没有 ⇒ **更坏**:代理上根本没有这个 getter,读到的是 undefined,而对象是
//     `Object.freeze` 过的,赋值直接 TypeError。这种声明等于给了一个假的保证
//     (MediaNamespace 里的 `wb` / `ytHeart` 正是这一类,随本批删除,全仓无读写点)。
// 解析用的是最笨的正则,但**读不到就红**,不会沉默通过(空集合比"没有差异"更危险)。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const DTS = path.join(ROOT, 'types', 'ctx.d.ts');

// 七条命名空间一条都不漏:漏一条就等于把同样的坑原样留给下一条
const NAMESPACES = [
  { factory: 'createKunlunNamespace', iface: 'KunlunNamespace', src: 'src/ctx-kunlun.js' },
  { factory: 'createSceneNamespace', iface: 'SceneNamespace', src: 'src/ctx-scene.js' },
  { factory: 'createMediaNamespace', iface: 'MediaNamespace', src: 'src/ctx-media.js' },
  { factory: 'createPlayerNamespace', iface: 'PlayerNamespace', src: 'src/ctx-player.js' },
  { factory: 'createGalleryNamespace', iface: 'GalleryNamespace', src: 'src/ctx-gallery.js' },
  { factory: 'createModeNamespace', iface: 'ModeNamespace', src: 'src/ctx-mode.js' },
  { factory: 'createUINamespace', iface: 'UINamespace', src: 'src/ctx-ui.js' },
];

// 从工厂函数里取 properties 数组的成员名(支持一行写完与多行带注释两种排版)
function runtimeProps(srcFile) {
  const text = fs.readFileSync(path.join(ROOT, srcFile), 'utf8');
  const start = text.indexOf('const properties = [');
  if (start < 0)
    return {
      err:
        srcFile +
        ' 里找不到 `const properties = [`(数组写法变了?那就得改这里,别把命名空间成员改丢)',
    };
  const open = start + 'const properties = ['.length;
  const close = text.indexOf(']', open); // 成员名里不会出现 ],所以第一个 ] 就是收尾
  if (close < 0) return { err: srcFile + ' 的 properties 数组没有闭合' };
  const names = [...text.slice(open, close).matchAll(/['"]([A-Za-z0-9_]+)['"]/g)].map((m) => m[1]);
  return { names };
}

// 从 types/ctx.d.ts 取接口成员:只认**恰好两格缩进**的成员行(4 格的是 layout 那种嵌套对象的键)
function declaredMembers(iface) {
  const text = fs.readFileSync(DTS, 'utf8');
  const head = 'export interface ' + iface;
  const i = text.indexOf(head);
  if (i < 0) return { err: 'types/ctx.d.ts 里没有 ' + iface };
  const bodyStart = text.indexOf('{', i);
  const bodyEnd = text.indexOf('\n}', bodyStart);
  if (bodyEnd < 0) return { err: iface + ' 的接口体没有闭合' };
  const names = [...text.slice(bodyStart, bodyEnd).matchAll(/^ {2}([A-Za-z0-9_]+)[*?]?:/gm)].map(
    (m) => m[1]
  );
  return { names };
}

describe('ctx 命名空间:运行时 properties 数组 ≡ types/ctx.d.ts 声明', () => {
  it('声明文件本身读得到', () => {
    expect(fs.existsSync(DTS), 'types/ctx.d.ts 不存在(它入库,不在 CI 里生成)').toBe(true);
  });

  for (const ns of NAMESPACES) {
    it(ns.iface + '(' + ns.src + ')', () => {
      const r = runtimeProps(ns.src);
      const d = declaredMembers(ns.iface);
      expect(r.err, r.err || '').toBeUndefined();
      expect(d.err, d.err || '').toBeUndefined();
      // 两边都必须真的解析出东西来:空数组/空接口会让下面的比较"绿着通过"
      expect(r.names.length, ns.src + ' 解析出 0 个成员 ⇒ 解析失效,不是真没成员').toBeGreaterThan(
        0
      );
      expect(d.names.length, ns.iface + ' 解析出 0 个成员 ⇒ 解析失效').toBeGreaterThan(0);
      expect(new Set(r.names).size, ns.src + ' 数组里有重名成员').toBe(r.names.length);
      const missing = r.names.filter((n) => !d.names.includes(n));
      const stale = d.names.filter((n) => !r.names.includes(n));
      expect(
        missing,
        ns.iface + ' 缺声明(会在 checkJs 里长成假的类型债):' + missing.join(', ')
      ).toEqual([]);
      expect(
        stale,
        ns.iface + ' 有过期声明(代理上根本没这个成员,读到就是 undefined):' + stale.join(', ')
      ).toEqual([]);
    });
  }

  it('工厂名与接口名一一对应(改名要一起改)', () => {
    const text = fs.readFileSync(DTS, 'utf8');
    for (const ns of NAMESPACES) {
      expect(text, 'types/ctx.d.ts 里应有 ' + ns.iface).toContain('export interface ' + ns.iface);
      const src = fs.readFileSync(path.join(ROOT, ns.src), 'utf8');
      expect(src, ns.src + ' 里应有 ' + ns.factory).toContain('export function ' + ns.factory);
    }
  });
});
