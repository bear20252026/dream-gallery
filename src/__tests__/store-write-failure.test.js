// store-write-failure.test.js — localStorage 写失败必须可见(2026-10-11 DG-STATE-002)
// 钉死的行为:
//   ① rawSet 写失败(隐私模式/配额满)→ setter 返回 false、内存缓存剔除、console.warn 留痕(与 rawRemove 对称);
//   ② 正常路径返回 true 且命中内存缓存(2026-10-07 加的读缓存语义不许被改坏);
//   ③ 关键剧情 checkpoint 写失败 → 装配方注入的提示出口被调用,且每键每会话只一次;
//      普通 UI 偏好类键失败保持静默(只有 console.warn,不打扰访客);
//   ④ hasWriteFailure() 粘性:true 之后 ui/gl-lost.js 才不会再对用户报「进度已经保存」。
// 只测 store-api 纯层(零 ctx 依赖),localStorage 用 mock。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storeApi } from '../state/store-api.js';

const storage = {};
let throwOnSet = false;
const localStorageMock = {
  getItem: vi.fn((k) => (k in storage ? storage[k] : null)),
  setItem: vi.fn((k, v) => {
    if (throwOnSet) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
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

function quotaFull() {
  throwOnSet = true;
}
function quotaOk() {
  throwOnSet = false;
}

describe('store 写失败可见性(DG-STATE-002)', () => {
  let warnSpy;
  let noticeSpy;
  beforeEach(() => {
    localStorageMock.clear();
    quotaOk();
    storeApi._dropCache();
    storeApi.resetCriticalNotified();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    noticeSpy = vi.fn();
    storeApi.setCriticalWriteNotifier(noticeSpy);
  });
  afterEach(() => {
    warnSpy.mockRestore();
    storeApi.setCriticalWriteNotifier(null);
  });

  it('正常路径:setJson/setNum/mark 返回 true 且读走内存缓存(不再打 getItem)', () => {
    expect(storeApi.hasWriteFailure()).toBe(false); // 首条断言:粘性旗在干净会话里必须是 false
    expect(storeApi.setJson('upHash', ['a'])).toBe(true);
    expect(storeApi.setNum('quiz', 7)).toBe(true);
    expect(storeApi.mark('page1')).toBe(true);
    localStorageMock.getItem.mockClear();
    expect(storeApi.json('upHash', null)).toEqual(['a']);
    expect(storeApi.num('quiz')).toBe(7);
    expect(storeApi.flag('page1')).toBe(true);
    expect(localStorageMock.getItem).not.toHaveBeenCalled(); // 2026-10-07 读缓存语义仍在
    expect(storeApi.hasWriteFailure()).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('配额满:setJson/setNum/mark/setStr 全部返回 false,缓存被剔除并有 warn', () => {
    storeApi.setJson('upHash', ['ok']); // 先正常存一次,让缓存里有值
    quotaFull();
    expect(storeApi.setJson('upHash', ['a', 'b'])).toBe(false);
    expect(storeApi.setNum('quiz', 3)).toBe(false);
    expect(storeApi.setStr('nick', 'x')).toBe(false);
    expect(storeApi.mark('page1')).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      '[store] 写入持久键失败',
      expect.any(String),
      expect.any(Error)
    );
    // 写失败不留内存镜像:读到的一定是真存上的值(旧值,不是没存上的新值)
    storeApi._dropCache();
    expect(storeApi.json('upHash', null)).toEqual(['ok']);
    expect(storeApi.num('quiz')).toBe(0);
    expect(storeApi.flag('page1')).toBe(false);
  });

  it('写失败是粘性的:hasWriteFailure() 一旦为 true 就不再清零(后续成功写入不能假装没事)', () => {
    quotaFull();
    storeApi.setStr('lang', 'zh');
    expect(storeApi.hasWriteFailure()).toBe(true);
    quotaOk();
    expect(storeApi.setStr('lang', 'en')).toBe(true);
    expect(storeApi.hasWriteFailure()).toBe(true); // 粘性不清零(gl-lost 据此不再报「已经保存」)
  });

  it('关键剧情 checkpoint 写失败 → 提示出口被调用一次;重复失败不再刷屏', () => {
    quotaFull();
    expect(storeApi.setNum('endingStep', 2)).toBe(false);
    expect(noticeSpy).toHaveBeenCalledTimes(1);
    expect(noticeSpy).toHaveBeenCalledWith('endingStep');
    storeApi.setNum('endingStep', 3);
    storeApi.mark('page1');
    storeApi.setNum('planetsChapter', 4);
    expect(noticeSpy).toHaveBeenCalledTimes(3); // endingStep 只一次,page1/planetsChapter 各一次
    expect(noticeSpy.mock.calls.map((c) => c[0]).sort()).toEqual([
      'endingStep',
      'page1',
      'planetsChapter',
    ]);
  });

  it('普通 UI 偏好类键失败继续静默(不弹提示,只留 console.warn)', () => {
    quotaFull();
    expect(storeApi.setJson('uiFold', { quest: true })).toBe(false);
    expect(storeApi.mark('musicOff')).toBe(false);
    expect(storeApi.setNum('chimeLastRing', 1)).toBe(false);
    expect(noticeSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('提示出口自己抛错不污染存档写入(异常被接住并留痕)', () => {
    storeApi.setCriticalWriteNotifier(() => {
      throw new Error('toast 炸了');
    });
    quotaFull();
    expect(storeApi.mark('earthDay')).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('提示抛出异常'),
      expect.any(Error)
    );
  });

  it('unmark 返回删除结果:removeItem 没报错即 true(与 setItem 的配额失败互不干扰)', () => {
    storeApi.mark('page1');
    expect(storeApi.unmark('page1')).toBe(true);
    expect(storeApi.flag('page1')).toBe(false);
    quotaFull(); // 只挡 setItem:删除仍然成功,写入仍然被拒
    expect(storeApi.unmark('page1')).toBe(true);
    expect(storeApi.setHouseColor('A', '#fff')).toBe(false); // 动态组键同样透传失败
    quotaOk();
    expect(storeApi.setHouseColor('A', '#fff')).toBe(true);
    expect(storeApi.houseColor('A')).toBe('#fff');
    expect(storeApi.clearHouseColor('A')).toBe(true);
    expect(storeApi.houseColor('A')).toBe('');
  });

  it('rawRemove 抛错时 unmark 返回 false 并 warn(旧值可能复活的事实必须可感知)', () => {
    const prev = localStorageMock.removeItem;
    localStorageMock.removeItem = vi.fn(() => {
      throw new Error('SecurityError');
    });
    storeApi.mark('page1');
    expect(storeApi.unmark('page1')).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('[store] 删除持久键失败', 'b612Page1', expect.any(Error));
    localStorageMock.removeItem = prev;
  });

  it('checkpoint 键集是登记制:剧情推进键在册、偏好键不在册', () => {
    const keys = storeApi.storyCheckpointKeys();
    for (const k of [
      'endingStep',
      'page1',
      'planetsChapter',
      'scene2',
      'earthDay',
      'spiritsKeys',
    ]) {
      expect(keys).toContain(k);
    }
    for (const k of ['uiFold', 'musicOff', 'lang', 'lowQuality', 'nick'])
      expect(keys).not.toContain(k);
  });
});
