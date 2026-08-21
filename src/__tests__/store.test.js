// store.js 单元测试 — 测试纯逻辑部分（localStorage mock）
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const storage = {};
const localStorageMock = {
  getItem: vi.fn((k) => storage[k] ?? null),
  setItem: vi.fn((k, v) => {
    storage[k] = String(v);
  }),
  removeItem: vi.fn((k) => {
    delete storage[k];
  }),
  clear: vi.fn(() => {
    Object.keys(storage).forEach((k) => delete storage[k]);
  }),
};
globalThis.localStorage = localStorageMock;

// Mock ctx（store.js 依赖 ctx.ui.store）
const ctx = { ui: {} };
vi.mock('../ctx.js', () => ({ ctx }));

// 导入 store.js 会执行副作用，将 store 挂到 ctx.ui
await import('../state/store.js');
const store = ctx.ui.store;

describe('store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  describe('num', () => {
    it('未设置时返回 0', () => {
      expect(store.num('quiz')).toBe(0);
    });

    it('读取已存储的数字', () => {
      localStorageMock.setItem('kunlunQuiz', '42');
      expect(store.num('quiz')).toBe(42);
    });

    it('setNum 写入后 num 可读', () => {
      store.setNum('quiz', 7);
      expect(store.num('quiz')).toBe(7);
    });

    it('未登记的键抛异常', () => {
      expect(() => store.num('nonexistent')).toThrow('未登记');
    });
  });

  describe('str', () => {
    it('未设置时返回空字符串', () => {
      expect(store.str('nick')).toBe('');
    });

    it('未设置时返回默认值', () => {
      expect(store.str('nick', '匿名')).toBe('匿名');
    });

    it('读取已存储的字符串', () => {
      localStorageMock.setItem('galleryNick', '小明');
      expect(store.str('nick')).toBe('小明');
    });
  });

  describe('json', () => {
    it('未设置时返回默认值', () => {
      expect(store.json('spiritsKeys', null)).toBeNull();
    });

    it('读取合法 JSON', () => {
      localStorageMock.setItem('kunlunSpiritsKeys', '["sprout","flame"]');
      expect(store.json('spiritsKeys', [])).toEqual(['sprout', 'flame']);
    });

    it('坏数据回退默认值', () => {
      localStorageMock.setItem('kunlunSpiritsKeys', '{bad json');
      expect(store.json('spiritsKeys', [])).toEqual([]);
    });
  });

  describe('flag / mark', () => {
    it('未标记时返回 false', () => {
      expect(store.flag('prologueDone')).toBe(false);
    });

    it('mark 后 flag 返回 true', () => {
      store.mark('prologueDone');
      expect(store.flag('prologueDone')).toBe(true);
    });
  });

  describe('getSpirits', () => {
    it('旧档迁移: 数量键 → key 数组', () => {
      localStorageMock.setItem('kunlunSpirits', '3');
      const spirits = store.getSpirits();
      expect(spirits).toEqual(['sprout', 'flame', 'leaf']);
    });

    it('新档直接读取 key 数组', () => {
      localStorageMock.setItem('kunlunSpiritsKeys', '["dawn","sprout"]');
      const spirits = store.getSpirits();
      expect(spirits).toEqual(['dawn', 'sprout']);
    });
  });

  describe('addSpirit', () => {
    it('添加灵蕴并同步数量键', () => {
      store.addSpirit('sprout');
      const spirits = store.getSpirits();
      expect(spirits).toContain('sprout');
      expect(store.num('spiritsCount')).toBe(1);
    });
  });

  describe('houseColor', () => {
    it('未设置时返回空字符串', () => {
      expect(store.houseColor('walls')).toBe('');
    });

    it('setHouseColor 后可读', () => {
      store.setHouseColor('walls', '#ff0000');
      expect(store.houseColor('walls')).toBe('#ff0000');
    });

    it('clearHouseColor 清除', () => {
      store.setHouseColor('ceiling', '#00ff00');
      store.clearHouseColor('ceiling');
      expect(store.houseColor('ceiling')).toBe('');
    });
  });
});
