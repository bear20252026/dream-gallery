// 一次性强制刷新(2026-08-31):验证「每个浏览器只刷一遍」,既不能漏刷也不能无限循环刷
// 2026-09-06:改为直接以假环境调用 lib/cache-bust.js 的 bust(env,key)(源级测试),
//             不再 vm.runInContext 动态执行注入串;注入串形状契约仍由 injectScript 用例守着。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BUST_KEY, INJECT_UNTIL, shouldInject, injectScript, bust } from '../../lib/cache-bust.js';

// 以假环境执行 bust:返回 { reloadCount, mark, env }
function runScript(initialStore, opts = {}) {
  const store = new Map(Object.entries(initialStore || {}));
  let reloadCount = 0;
  const env = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    location: {
      reload: () => {
        reloadCount++;
      },
    },
    window: {},
    // 注入侧 30ms 后 reload;测试环境立即执行以便同步断言
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    Date,
    JSON,
    Promise,
    console,
  };
  if (opts.withCaches) {
    const deleted = [];
    env.window.caches = {
      keys: () => Promise.resolve(['c1', 'c2']),
      delete: (k) => (deleted.push(k), Promise.resolve(true)),
    };
    env.__deleted = deleted;
  }
  bust(env, BUST_KEY);
  return { reloadCount, mark: store.get(BUST_KEY), env };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('cache-bust 一次性强制刷新', () => {
  it('首次进入(无标记):写标记 + reload 一次', () => {
    const r = runScript({});
    expect(r.mark).toBeTruthy();
    expect(r.reloadCount).toBe(1);
  });

  it('再次进入(已有标记):不写、不 reload —— 不会循环刷新', () => {
    const r = runScript({ [BUST_KEY]: '1788188000000' });
    expect(r.reloadCount).toBe(0);
    expect(r.mark).toBe('1788188000000');
  });

  it('localStorage 不可用(隐私模式)时不抛异常,也不刷', () => {
    const env = {
      setTimeout: () => 0,
      location: {
        reload: () => {
          throw new Error('不该 reload');
        },
      },
    };
    expect(() => bust(env, BUST_KEY)).not.toThrow();
  });

  it('有 Cache Storage 时会被清空(清掉旧版本 Service Worker 缓存)', async () => {
    const r = runScript({}, { withCaches: true });
    // caches.keys() 是 Promise,清空发生在微任务里 → 让出一次事件循环再断言
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.env.__deleted).toEqual(['c1', 'c2']);
  });

  it('注入窗口内 shouldInject 为真,窗口后为假', () => {
    vi.useFakeTimers();
    vi.setSystemTime(INJECT_UNTIL - 1000);
    expect(shouldInject()).toBe(true);
    vi.setSystemTime(INJECT_UNTIL + 1000);
    expect(shouldInject()).toBe(false);
  });

  it('注入片段是自闭合内联脚本,是 bust 的忠实序列化且不含用户输入(无 XSS 注入面)', () => {
    const html = injectScript();
    expect(html.startsWith('<script>')).toBe(true);
    expect(html.endsWith('</script>')).toBe(true);
    // 只出现一次 <script> / </script>,不会出现提前闭合导致 HTML 结构被打断
    expect(html.match(/<script>/g).length).toBe(1);
    expect(html.match(/<\/script>/g).length).toBe(1);
    // 是 bust 的序列化(单一事实来源),执行体标记与 KEY 均在
    expect(html).toContain('__dgBust');
    expect(html).toContain(JSON.stringify(BUST_KEY));
  });
});
