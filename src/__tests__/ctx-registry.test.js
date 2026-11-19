// ctx-registry.test.js — ctx 属性域登记册守卫(I1,2026-11-18)
//
// 第五轮审计最大遗留:"ctx 约 171 个登记属性仅 3 个有 owner"。真拆前先把所有权变成制度:
// 登记册(docs/ctx-registry.json)由 scripts/admin/ctx-registry.cjs 全量扫描生成,
// 本守卫在 vitest 里跑同一扫描并逐键比对——**新属性/新写方/写方变更不登记就红**。
// 运行时零改动;这是给后续"按域真拆"打的地基,不是拆本身。
//
// 判据纪律沿用 ctx-writer-shapes:锚点不命中抛错不空转;只逐行不跨行。
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { scan } = require('../../scripts/admin/ctx-registry.cjs');
const ROOT = path.resolve(__dirname, '..', '..');

describe('I1 ctx 属性域登记册:写点全量登记,漂移即红', () => {
  it('扫描结果与登记册逐键一致(新属性/新写方必须 --write 重新生成并说明)', () => {
    const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/ctx-registry.json'), 'utf8'));
    const now = scan();
    const old = new Map(reg.rows.map((r) => [r.key, r.writers.join(',')]));
    const cur = new Map(now.map((r) => [r.key, r.writers.join(',')]));
    const added = [...cur.keys()].filter((k) => !old.has(k));
    const removed = [...old.keys()].filter((k) => !cur.has(k));
    const changed = [...cur.keys()].filter((k) => old.has(k) && old.get(k) !== cur.get(k));
    expect({ added, removed, changed }).toEqual({ added: [], removed: [], changed: [] });
  });

  it('动态键 ctx[k] 全仓保持 0(登记册口径的前提;出现即须先收编再登记)', () => {
    // 只扫产品代码;ctx[k] 形态的写无法静态归属 owner,是登记册制度的盲区,必须绝迹
    const files = [];
    const walk = (dir) => {
      for (const name of fs.readdirSync(path.join(ROOT, dir))) {
        const rel = `${dir}/${name}`;
        const st = fs.statSync(path.join(ROOT, rel));
        if (st.isDirectory()) {
          if (rel === 'src/__tests__' || rel === 'src/vendor') continue;
          walk(rel);
        } else if (/\.(js|mjs)$/.test(name)) files.push(rel);
      }
    };
    walk('src');
    const hits = [];
    for (const rel of files) {
      const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (/\bctx\s*\[[^\]]+\]\s*=(?!=)/.test(line)) hits.push(`${rel}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('已知锚点抽查:G1/E1 收编成果必须在册且写方唯一(防扫描口径退化)', () => {
    const rows = new Map(scan().map((r) => [r.key, r.writers]));
    expect(rows.get('scene.setAtmosphere')).toEqual(['src/main.js']); // G1 仲裁接线
    expect(rows.get('kunlun.groundOverride')).toEqual(['src/shared/ground-resolver.js']); // E1 单写方
    expect(rows.get('media.dayTimeSource')).toEqual(['src/scene/time-shift.js']); // C8 单写方
    expect(rows.get('player.pl')).toEqual(['src/scene/player.js']); // Object.assign 平铺块
    expect(rows.get('media.vidEl')).toEqual(['src/scene/media/video-wall.js']); // 单行 assign 块
    expect(rows.size).toBeGreaterThan(150); // 规模哨兵:口径漏扫一半会在这里红
  });
});

// J1:登记册假阳性治理。同名 ctx 未必是总线 —— markers.js 的 canvasTexture 回调参数是
// Canvas2D、visitor-fp.js 的 `var ctx = new OfflineAudioContext` 是音频上下文。
// 这两处曾把 fillStyle/font/textAlign/textBaseline/lineWidth/strokeStyle/oncomplete
// 共 7 个假属性登进册子,污染真拆施工图(把 Canvas API 当总线属性去收编)。
describe('J1 登记册口径:同名局部 ctx 不得当成总线属性', () => {
  const { scanDetailed } = require('../../scripts/admin/ctx-registry.cjs');

  it('7 个 Canvas/Audio 假属性绝迹于登记册', () => {
    const keys = new Set(scanDetailed().rows.map((r) => r.key));
    const fake = [
      'fillStyle',
      'font',
      'textAlign',
      'textBaseline',
      'lineWidth',
      'strokeStyle',
      'oncomplete',
    ].filter((k) => keys.has(k));
    expect(fake).toEqual([]);
  });

  it('依赖注入型文件不算遮蔽:核心写方必须在册(防口径过宽误排除)', () => {
    // 首版遮蔽正则把 replyChoices(ctx,…)/new LoopManager(ctx)/constructor(ctx)
    // 当成绑定,误排除 14 个合法文件,属性数 176→145、loop.timeScale 直接丢失。
    const keys = new Set(scanDetailed().rows.map((r) => r.key));
    const must = [
      'loop.timeScale', // loop-manager.js constructor(ctx) 注入
      'tickers', // ctx.js 总线本体
      'scene.s',
      'player.pl',
      'media.vidEl',
      'kunlun.groundOverride',
      'scene.renderPostProcessing',
      'gallery.hangOne',
      'ui.kunlunSpeak',
    ].filter((k) => !keys.has(k));
    expect(must).toEqual([]);
  });

  it('遮蔽文件清单钉死:只许真局部对象绑定的文件进榜(新增须人工复核)', () => {
    const { shadowed } = scanDetailed();
    // markers/visitor-fp/quiz 是真遮蔽(Canvas2D 回调、AudioContext、画字助手形参);
    // 其余为注入型或混合身份,列在榜上但块外仍照常扫描。
    expect(shadowed).toContain('src/gallery/markers.js');
    expect(shadowed).toContain('src/visitor-fp.js');
    expect(shadowed).not.toContain('src/ctx.js'); // 总线本体永不遮蔽
    expect(shadowed.length).toBeLessThanOrEqual(12); // 规模哨兵:口径失控会暴涨
  });
});
