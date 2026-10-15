// world-loader-shelving.test.js — 旧玩法搁置规则按**稳定 id** 判,不按中文标签(第六轮审计 M-10)
//
// 起因:world-loader 的条目原本是 `[中文标签, thunk]`,而「哪些模块被搁置」是一张**标签**集合
// (`LEGACY_MODULE_LABELS`)。于是标签同时是显示文字和身份键:把「远方山巅」改一个字,
// 那条搁置规则就静默失效,模块重新开始加载(旧玩法回魂),而**全仓没有一条测试会红**
// —— 这批测试落地前,`isShelved` 的覆盖只有 world-chain.test.js 里一个自己造的桩。
//
// 现在身份键是 `entry.id`(ASCII、与所加载文件同名),标签只用于显示与 `__worldPhase` 字符串。
// 下面钉的四件事:①清单自身形状与 id 唯一;②搁置集合不许指向不存在的模块;
// ③改标签不动加载行为 / 改 id 才动;④`__worldPhase` 的措辞是受保护的对外契约。
import { describe, it, expect } from 'vitest';
import { WORLD_MODULES, WORLD_MODULES_DEFERRED } from '../core/world-loader.js';
import { LEGACY_MODULE_IDS, isShelved } from '../shared/legacy.mjs';

const ALL = [...WORLD_MODULES, ...WORLD_MODULES_DEFERRED];
const labelsOf = (ids) => ALL.filter((e) => ids.has(e.id)).map((e) => e.label);

describe('世界模块清单的自身形状(M-10 的前提)', () => {
  it('每条都有非空 id、非空 label、可调用 load', () => {
    for (const e of ALL) {
      expect(typeof e.id, '缺 id 的条目: ' + JSON.stringify(e.label)).toBe('string');
      expect(e.id.length, 'id 不许为空').toBeGreaterThan(0);
      expect(typeof e.label, '缺 label 的条目: ' + e.id).toBe('string');
      expect(e.label.length, 'label 不许为空: ' + e.id).toBeGreaterThan(0);
      expect(typeof e.load, e.id + ' 的 load 不是函数').toBe('function');
    }
  });

  it('id 全局唯一(重复 id 会让一条搁置规则同时管住两个模块)', () => {
    const ids = ALL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...new Set(ids)]); // 顺带钉住"声明顺序"没被打乱
  });

  it('核心链与后台链不相交(同一个模块不能既阻塞揭幕又后台补载)', () => {
    const core = new Set(WORLD_MODULES.map((e) => e.id));
    const defer = WORLD_MODULES_DEFERRED.map((e) => e.id);
    expect(defer.filter((id) => core.has(id))).toEqual([]);
  });
});

describe('搁置集合与清单对得上(M-10 的两半)', () => {
  it('LEGACY_MODULE_IDS 里的每一个 id 都指得到一个真实模块', () => {
    const declared = new Set(ALL.map((e) => e.id));
    const stale = [...LEGACY_MODULE_IDS].filter((id) => !declared.has(id));
    // 指向已消失模块的过滤项看着像保护、其实是死账 —— 它会让下一个人以为"这条规则还在管事"
    expect(stale).toEqual([]);
  });

  it('搁置的仍是当初那 12 个旧玩法(名单缩水必须是一次看得见的决定)', () => {
    expect([...LEGACY_MODULE_IDS].sort()).toEqual(
      [
        'ark',
        'dome-towers',
        'eternal',
        'finale',
        'fireplace',
        'letgo',
        'peaks',
        'quiz',
        'quizgate',
        'resetview',
        'snowwin',
        'windchime',
      ].sort()
    );
  });

  it('搁置项落在核心链 4 条 + 后台链 8 条(与标签时代同一份账)', () => {
    expect(WORLD_MODULES.filter((e) => LEGACY_MODULE_IDS.has(e.id))).toHaveLength(4);
    expect(WORLD_MODULES_DEFERRED.filter((e) => LEGACY_MODULE_IDS.has(e.id))).toHaveLength(8);
  });
});

describe('身份键是 id,不是标签(M-10 的正面判据)', () => {
  it('改标签不改加载行为:重命名后照样被搁置', () => {
    const peaks = ALL.find((e) => e.id === 'peaks');
    expect(isShelved(peaks, false)).toBe(true); // 旧玩法关闭 ⇒ 搁置
    const renamed = { ...peaks, label: '远山(改名试验)' };
    expect(isShelved(renamed, false)).toBe(true); // ← 老写法在这里就变成 false 了
  });

  it('改 id 才改加载行为:身份键挪走 ⇒ 不再被搁置', () => {
    const peaks = ALL.find((e) => e.id === 'peaks');
    expect(isShelved({ ...peaks, id: 'peaks2' }, false)).toBe(false);
  });

  it('非旧玩法模块不受搁置影响;?legacy=1 时一律放行', () => {
    const player = ALL.find((e) => e.id === 'player');
    expect(isShelved(player, false)).toBe(false);
    for (const e of ALL) expect(isShelved(e, true)).toBe(false); // 旧玩法全开 ⇒ 一个都不搁置
  });

  it('清单里没有"标签撞车"的条目(标签是对外读数,撞了就分不出谁是谁)', () => {
    const labels = ALL.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('__worldPhase 的措辞是对外契约(6 个探针在读)', () => {
  it('搁置名单的显示文字一字未改', () => {
    expect(labelsOf(LEGACY_MODULE_IDS).sort()).toEqual(
      [
        '塔楼',
        '温柔度',
        '答题门',
        '远方山巅',
        '永恒厅',
        '飞舟',
        '风铃',
        '壁炉',
        '雪窗',
        '重置视角',
        '放下',
        '终章',
      ].sort()
    );
  });

  it('两条链的标签序列整体保持(顺序即依赖,重排要看得见的理由)', () => {
    expect(WORLD_MODULES.map((e) => e.label)).toEqual([
      '场景',
      '媒体',
      '牌子',
      '喷泉',
      '标记',
      '链接',
      '挂画',
      '模式',
      '塔楼',
      '设置',
      '上传',
      '房屋色',
      '温柔度',
      '沙漠',
      '玩家',
      '答题门',
      '远方山巅',
      '灵蕴',
      '星球世界',
      '对话',
      '石门',
      '坠机点',
      '画羊',
      '书页一',
      '状态机',
      '后处理',
    ]);
    expect(WORLD_MODULES_DEFERRED.map((e) => e.label)).toEqual([
      '永恒厅',
      '飞舟',
      '风铃',
      '壁炉',
      '雪窗',
      '第6场国王',
      '第7场虚荣',
      '第7场酒鬼',
      '第8-9场商人/点灯人/地理学家',
      '回忆层',
      '重置视角',
      '放下',
      '终章',
    ]);
  });
});
