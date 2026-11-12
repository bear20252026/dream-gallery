// achievements.test.js — 成就徽章纯核判据(C4,2026-11-12)
// 钉死:10 枚定义齐备且 id 唯一 / 六灵蕴逐项判定 / 四项里程碑各自的门槛 /
//       老档兼容(只有终章标记也算六合归位) / 脏数据 fail-closed(绝不凭空发徽章) /
//       新解锁差集只报没通报过的 / 展示视图顺序固定。
import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  SPIRIT_KEYS,
  achievementById,
  normalizeSnapshot,
  earnedIds,
  newlyEarned,
  achievementView,
} from '../shared/achievements.mjs';

const EMPTY = { spiritsKeys: [], spiritsDone: false, arkFlew: false, eternalPicks: [], skyMs: 0 };
const snap = (over) => Object.assign({}, EMPTY, over || {});

describe('定义表(10 枚,设计文档第五节修正口径)', () => {
  it('恰好 10 枚:六灵蕴 6 + 里程碑 4', () => {
    expect(ACHIEVEMENTS.length).toBe(10);
    expect(ACHIEVEMENTS.filter((a) => a.group === 'spirits').length).toBe(6);
    expect(ACHIEVEMENTS.filter((a) => a.group === 'milestone').length).toBe(4);
  });
  it('id 唯一,且四项里程碑 id 与设计文档一一对应', () => {
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(10);
    for (const id of ['six-united', 'sky-visitor', 'cloud-home', 'sky-mender'])
      expect(ACHIEVEMENT_IDS).toContain(id);
  });
  it('六灵蕴徽章的 key 与 SPIRIT_KEYS 同集同序(与 store-api SPIRIT_ORDER 对齐)', () => {
    expect(ACHIEVEMENTS.filter((a) => a.group === 'spirits').map((a) => a.key)).toEqual(
      SPIRIT_KEYS
    );
  });
  it('每枚都有双语名称/描述与配色(UI 直接渲染,不允许缺字段)', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name, a.id).toBeTruthy();
      expect(a.en, a.id).toBeTruthy();
      expect(a.desc, a.id).toBeTruthy();
      expect(a.descEn, a.id).toBeTruthy();
      expect(a.color, a.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('achievementById:命中返回定义,未知返回 null', () => {
    // 2026-11-12 世界观统一:补天者 → 星图已亮(id 不变,只换显示名)
    expect(achievementById('sky-mender').name).toBe('星图已亮');
    expect(achievementById('nope')).toBe(null);
  });
});

describe('空档:一枚都不发(fail-closed)', () => {
  it('全空快照 ⇒ 零达成', () => {
    expect(earnedIds(snap())).toEqual([]);
  });
  it('undefined/null/非对象 ⇒ 零达成,不抛', () => {
    expect(earnedIds(undefined)).toEqual([]);
    expect(earnedIds(null)).toEqual([]);
    expect(earnedIds('x')).toEqual([]);
  });
});

describe('六灵蕴:逐项独立判定', () => {
  it('拾一颗只发那一枚', () => {
    expect(earnedIds(snap({ spiritsKeys: ['flame'] }))).toEqual(['spirit-flame']);
  });
  it('六颗齐 ⇒ 六枚灵蕴 + 六合归位(共 7)', () => {
    const ids = earnedIds(snap({ spiritsKeys: [...SPIRIT_KEYS] }));
    expect(ids.length).toBe(7);
    expect(ids).toContain('six-united');
    for (const k of SPIRIT_KEYS) expect(ids).toContain('spirit-' + k);
  });
  it('重复 key 不重复发;非法 key 不算', () => {
    expect(earnedIds(snap({ spiritsKeys: ['leaf', 'leaf', 'bogus'] }))).toEqual(['spirit-leaf']);
  });
  it('顺序不影响结果(乱序拾取是既有玩法)', () => {
    const a = earnedIds(snap({ spiritsKeys: ['dusk', 'sprout'] }));
    const b = earnedIds(snap({ spiritsKeys: ['sprout', 'dusk'] }));
    expect(a).toEqual(b);
    expect(a).toEqual(['spirit-sprout', 'spirit-dusk']); // 输出按定义序,不按拾取序
  });
});

describe('四项里程碑各自的门槛', () => {
  it('六合归位:老档只有终章标记也算(兼容数量键时代)', () => {
    expect(earnedIds(snap({ spiritsDone: true }))).toEqual(['six-united']);
  });
  it('天空的访客:arkFlew 首飞完成', () => {
    expect(earnedIds(snap({ arkFlew: true }))).toEqual(['sky-visitor']);
  });
  it('云端的归宿:展厅选片 >0 才算(空数组不算)', () => {
    expect(earnedIds(snap({ eternalPicks: [] }))).toEqual([]);
    expect(earnedIds(snap({ eternalPicks: ['a.jpg'] }))).toEqual(['cloud-home']);
  });
  it('补天者:skyMs 必须 ≥100(75 档不算)', () => {
    expect(earnedIds(snap({ skyMs: 75 }))).toEqual([]);
    expect(earnedIds(snap({ skyMs: 100 }))).toEqual(['sky-mender']);
  });
  it('全达成 ⇒ 10 枚,且顺序 = 定义序', () => {
    const ids = earnedIds(
      snap({
        spiritsKeys: [...SPIRIT_KEYS],
        spiritsDone: true,
        arkFlew: true,
        eternalPicks: ['a'],
        skyMs: 100,
      })
    );
    expect(ids).toEqual(ACHIEVEMENT_IDS);
  });
});

describe('normalizeSnapshot:脏数据一律退到未达成侧', () => {
  it('spiritsKeys 非数组 ⇒ 空;过滤非法 key;去重', () => {
    expect(normalizeSnapshot({ spiritsKeys: 'x' }).spirits).toEqual([]);
    expect(normalizeSnapshot({ spiritsKeys: ['sprout', 'x', 'sprout'] }).spirits).toEqual([
      'sprout',
    ]);
  });
  it('skyMs 非数字/NaN/Infinity ⇒ 0(绝不因脏值发补天者)', () => {
    for (const v of ['100', 'abc', NaN, Infinity, null]) {
      const n = normalizeSnapshot({ skyMs: v }).skyMs;
      expect(n === 0 || n === 100).toBe(true); // '100' 经 Number 得 100 属可接受(存档 num 键本就是字符串)
      if (!Number.isFinite(Number(v))) expect(n).toBe(0);
    }
    expect(normalizeSnapshot({ skyMs: NaN }).skyMs).toBe(0);
    expect(normalizeSnapshot({ skyMs: Infinity }).skyMs).toBe(0);
  });
  it('eternalPicks 非数组 ⇒ 计数 0', () => {
    expect(normalizeSnapshot({ eternalPicks: {} }).pickCount).toBe(0);
  });
});

describe('newlyEarned:只报没通报过的', () => {
  it('首次:全部达成项都是新的', () => {
    const raw = snap({ arkFlew: true, skyMs: 100 });
    expect(newlyEarned(raw, [])).toEqual(['sky-visitor', 'sky-mender']);
  });
  it('已通报过的不再重复报', () => {
    const raw = snap({ arkFlew: true, skyMs: 100 });
    expect(newlyEarned(raw, ['sky-visitor'])).toEqual(['sky-mender']);
    expect(newlyEarned(raw, ['sky-visitor', 'sky-mender'])).toEqual([]);
  });
  it('recorded 里的脏 id 被忽略,不会吞掉真新解锁', () => {
    const raw = snap({ arkFlew: true });
    expect(newlyEarned(raw, ['ghost-id'])).toEqual(['sky-visitor']);
  });
  it('recorded 非数组 ⇒ 视为空,不抛', () => {
    expect(newlyEarned(snap({ arkFlew: true }), null)).toEqual(['sky-visitor']);
  });
  it('进度回退(存档被清)不会报负解锁', () => {
    expect(newlyEarned(snap(), ['sky-visitor'])).toEqual([]);
  });
});

describe('achievementView:UI 直接渲染的固定顺序视图', () => {
  it('长度恒为 10,顺序 = 定义序,earned 布尔正确', () => {
    const v = achievementView(snap({ spiritsKeys: ['snow'], arkFlew: true }));
    expect(v.length).toBe(10);
    expect(v.map((x) => x.def.id)).toEqual(ACHIEVEMENT_IDS);
    expect(v.find((x) => x.def.id === 'spirit-snow').earned).toBe(true);
    expect(v.find((x) => x.def.id === 'spirit-leaf').earned).toBe(false);
    expect(v.find((x) => x.def.id === 'sky-visitor').earned).toBe(true);
  });
  it('空档视图:全部未达成(UI 显示 10 个锁定位,而不是空列表)', () => {
    expect(achievementView(snap()).every((x) => !x.earned)).toBe(true);
  });
});
