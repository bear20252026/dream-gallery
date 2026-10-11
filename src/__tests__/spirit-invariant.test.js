// spirit-invariant.test.js — 灵蕴存档不变量由存储层自证(2026-10-11 DG-STATE-001)
// 定性(主代理已核实):重复添加在真实流程不可达(spirits.js 唯一调用点的三源都天然排除已收集,
// 且有 collecting 守卫),所以这条**不是**「玩家能提前通关」的漏洞,而是「完成判定是数量口径
// (got()>=6),底层不变量应由存储层自证」的加固:
//   ① key 必须 ∈ SPIRIT_ORDER,否则抛(白名单);
//   ② 已存在则幂等返回(不抛、不重复 push);
//   ③ getSpirits() 读时对旧档做 dedupe/去非法项(顺手迁移,并同步兼容数量键)。
// 顺带钉住既有「数量键 → 前 n 颗」迁移链仍然成立(旧档不能因为这次加固而读空)。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeApi } from '../state/store-api.js';

const SPIRIT_KEYS = ['sprout', 'flame', 'leaf', 'snow', 'dawn', 'dusk'];
const storage = {};
const localStorageMock = {
  getItem: vi.fn((k) => (k in storage ? storage[k] : null)),
  setItem: vi.fn((k, v) => {
    storage[k] = String(v);
  }),
  removeItem: vi.fn((k) => {
    delete storage[k];
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(storage)) delete storage[k];
  }),
};
globalThis.localStorage = localStorageMock;

describe('灵蕴库存不变量(DG-STATE-001)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    storeApi._dropCache();
  });

  it('addSpirit 重复添加同一颗:库存长度不变,且不重复写盘', () => {
    const a = storeApi.addSpirit('sprout');
    expect(a).toEqual(['sprout']);
    const b = storeApi.addSpirit('sprout'); // 幂等:不抛、不 push
    expect(b).toEqual(['sprout']);
    expect(b.length).toBe(1);
    expect(storeApi.getSpirits()).toEqual(['sprout']);
    expect(storage['kunlunSpirits']).toBe('1'); // 兼容数量键没有被重复添加顶成 2
    storeApi.addSpirit('sprout');
    storeApi.addSpirit('sprout');
    expect(storeApi.getSpirits().length).toBe(1);
  });

  it('非法 key 直接抛(白名单;不会污染库存也不会写盘)', () => {
    expect(() => storeApi.addSpirit('notASpirit')).toThrow('非法灵蕴 key');
    expect(() => storeApi.addSpirit('')).toThrow('非法灵蕴 key');
    expect(() => storeApi.addSpirit(undefined)).toThrow('非法灵蕴 key');
    expect(storage['kunlunSpiritsKeys']).toBeUndefined();
    expect(storeApi.getSpirits()).toEqual([]);
  });

  it('旧档含重复/非法项:读取即清洗,并同步兼容数量键', () => {
    storage['kunlunSpiritsKeys'] = JSON.stringify([
      'sprout',
      'sprout',
      'flame',
      'flame',
      'flame',
      'ghost',
    ]);
    storage['kunlunSpirits'] = '6'; // 脏档:数量键被重复项顶到 6 = 假「集齐」
    storeApi._dropCache();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const k = storeApi.getSpirits();
    expect(k).toEqual(['sprout', 'flame']); // 去重 + 去非法,顺序保留
    expect(k.length).toBeLessThan(6); // 数量口径的完成判定不再被脏数据满足
    expect(JSON.parse(storage['kunlunSpiritsKeys'])).toEqual(['sprout', 'flame']); // 清洗已回写
    expect(storage['kunlunSpirits']).toBe('2'); // 兼容数量键跟着归位
    warn.mockRestore();
  });

  it('清洗只在真的发现脏项时回写:干净档反复读取不重复写盘', () => {
    storeApi.addSpirit('leaf');
    const before = localStorageMock.setItem.mock.calls.length;
    for (let i = 0; i < 20; i++) storeApi.getSpirits();
    expect(localStorageMock.setItem.mock.calls.length).toBe(before);
    expect(storeApi.getSpirits()).toEqual(['leaf']);
  });

  it('既有迁移链仍然成立:只有数量键的旧档按前 n 颗重建,新键一旦存在即权威', () => {
    storage['kunlunSpirits'] = '3';
    expect(storeApi.getSpirits()).toEqual(['sprout', 'flame', 'leaf']);
    expect(storage['kunlunSpiritsKeys']).toBeDefined();
    storeApi.setJson('spiritsKeys', ['dusk']);
    expect(storeApi.getSpirits()).toEqual(['dusk']);
    expect(storeApi.addSpirit('sprout')).toEqual(['dusk', 'sprout']);
    expect(storage['kunlunSpirits']).toBe('2');
  });

  it('六颗全收:长度封顶 6,数量键与库存一致(spirits.js 的 isDone()=got()>=6 口径)', () => {
    for (const key of SPIRIT_KEYS) storeApi.addSpirit(key);
    expect(storeApi.getSpirits()).toEqual(SPIRIT_KEYS);
    expect(storage['kunlunSpirits']).toBe('6');
    storeApi.addSpirit('sprout'); // 收齐后再点一次仍然幂等
    expect(storeApi.getSpirits()).toEqual(SPIRIT_KEYS);
    expect(storage['kunlunSpirits']).toBe('6');
  });

  it('数量键越界(脏数据 99)被钳到合法集大小,不会凭空多出灵蕴', () => {
    storage['kunlunSpirits'] = '99';
    storeApi._dropCache();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(storeApi.getSpirits()).toEqual(SPIRIT_KEYS);
    warn.mockRestore();
  });
});
