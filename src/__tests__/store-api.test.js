// store-api.test.js — 存档深模块纯层契约(2026-09-18 审计 P1 补测)
// store.test.js 测的是挂载层(store.js 经 ctx);这里直测 store-api(零依赖,lobby.html 复用同层)。
// 重点:类型转换/坏数据兜底/unmark/spirits 旧档迁移/未登记键即抛。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeApi } from '../state/store-api.js';

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

describe('store-api 纯层', () => {
  beforeEach(() => {
    localStorageMock.clear();
    storeApi._dropCache(); // 读缓存(2026-10-07):mock 直写 backing store 绕过模块,缓存须手动失效
  });

  it('num/setNum:未设置=0;字符串数字可读;未登记键抛「未登记」', () => {
    expect(storeApi.num('quiz')).toBe(0);
    storage['kunlunQuiz'] = '42';
    storeApi._dropCache(); // 直写 backing store 后失效缓存,下一读才重新走 getItem
    expect(storeApi.num('quiz')).toBe(42);
    storeApi.setNum('quiz', 7);
    expect(storage['kunlunQuiz']).toBe('7');
    expect(() => storeApi.num('不存在')).toThrow('未登记');
  });

  it('str:未设置=空串;新登记键(devId)读写通', () => {
    expect(storeApi.str('nick')).toBe('');
    storeApi.setStr('devId', 'abc123');
    expect(storeApi.str('devId')).toBe('abc123');
  });

  it('json:坏数据回退默认值不抛;对象往返一致', () => {
    expect(storeApi.json('upHash', { a: 1 })).toEqual({ a: 1 });
    storage['kunlunUpHash'] = '{{{bad json';
    storeApi._dropCache(); // 直写 backing store 后失效缓存
    expect(storeApi.json('upHash', { ok: true })).toEqual({ ok: true });
    storeApi.setJson('upHash', ['a', 'b']);
    expect(storeApi.json('upHash', null)).toEqual(['a', 'b']);
  });

  it('flag/mark/unmark:存在即真;unmark 移除后回假(2026-09-10 ?storyreset 依赖)', () => {
    expect(storeApi.flag('scene2')).toBe(false);
    storeApi.mark('scene2');
    expect(storeApi.flag('scene2')).toBe(true);
    expect(storage['b612Scene2']).toBe('1');
    storeApi.unmark('scene2');
    expect(storeApi.flag('scene2')).toBe(false);
    expect(storage['b612Scene2']).toBeUndefined();
    expect(() => storeApi.unmark('不存在')).toThrow('未登记');
  });

  it('spirits 旧档迁移:无新键时按数量键读出前 n 颗;新键一旦存在即权威', () => {
    storage['kunlunSpirits'] = '3';
    expect(storeApi.getSpirits()).toEqual(['sprout', 'flame', 'leaf']); // SPIRIT_ORDER 前 3
    expect(storage['kunlunSpiritsKeys']).toBeDefined(); // 迁移落盘
    storeApi.setJson('spiritsKeys', ['leaf']);
    expect(storeApi.getSpirits()).toEqual(['leaf']);
    storeApi.addSpirit('sprout');
    expect(storeApi.getSpirits()).toEqual(['leaf', 'sprout']);
    expect(storage['kunlunSpirits']).toBe('2'); // 兼容数量键同步
  });

  it('新登记的豁免键在册(musicHistory/kunlunVer/devId/welcomed——独立子页与开机迁移写入方)', () => {
    // 只验登记存在(读写权限),不验写入方
    expect(() => storeApi.str('kunlunVer')).not.toThrow();
    expect(() => storeApi.json('musicHistory', [])).not.toThrow();
    expect(() => storeApi.setNum('welcomed', 1)).not.toThrow();
    expect(() => storeApi.setStr('devId', 'x')).not.toThrow();
  });

  it('读缓存:重复读只打一次 localStorage;set/unmark 同步缓存;mock 直写需 _dropCache 失效', () => {
    storage['kunlunGaze'] = '5'; // gaze 键无其他用例使用,调用计数不受干扰
    expect(storeApi.num('gaze')).toBe(5);
    expect(storeApi.num('gaze')).toBe(5);
    const gazeReads = () =>
      localStorageMock.getItem.mock.calls.filter((c) => c[0] === 'kunlunGaze').length;
    expect(gazeReads()).toBe(1); // 第二读走缓存
    storeApi.setNum('gaze', 9);
    expect(storeApi.num('gaze')).toBe(9); // 写后读缓存
    expect(gazeReads()).toBe(1); // 未再触发 getItem
    storage['kunlunGaze'] = '77'; // 模拟外部直写(node 环境无 storage 事件,手动失效)
    storeApi._dropCache();
    expect(storeApi.num('gaze')).toBe(77);
    storeApi.mark('scene2');
    storeApi.unmark('scene2'); // unmark 同步缓存,不靠重读
    expect(storeApi.flag('scene2')).toBe(false);
    expect(storage['b612Scene2']).toBeUndefined();
  });
});
