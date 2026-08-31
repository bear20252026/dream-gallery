// 一次性强制刷新(2026-08-31):验证「每个浏览器只刷一遍」,既不能漏刷也不能无限循环刷
import { describe, it, expect, vi, afterEach } from 'vitest';
import vm from 'node:vm';
import { BUST_KEY, INJECT_UNTIL, shouldInject, injectScript } from '../../lib/cache-bust.js';

// 在沙箱里跑注入脚本:返回 { reloadCount, markWritten }
function runScript(initialStore, opts = {}) {
  const store = new Map(Object.entries(initialStore || {}));
  let reloadCount = 0;
  const sandbox = {
    window: {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    location: {
      reload: () => {
        reloadCount++;
      },
    },
    Date,
    JSON,
    Promise,
    console,
  };
  if (opts.withCaches) {
    const deleted = [];
    sandbox.window.caches = {
      keys: () => Promise.resolve(['c1', 'c2']),
      delete: (k) => (deleted.push(k), Promise.resolve(true)),
    };
    sandbox.__deleted = deleted;
  }
  const html = injectScript();
  const code = html.replace(/^<script>/, '').replace(/<\/script>$/, '');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { reloadCount, mark: store.get(BUST_KEY), sandbox };
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
    const sandbox = {
      setTimeout: () => 0,
      location: {
        reload: () => {
          throw new Error('不该 reload');
        },
      },
      Date,
      JSON,
      Promise,
    };
    const code = injectScript()
      .replace(/^<script>/, '')
      .replace(/<\/script>$/, '');
    vm.createContext(sandbox);
    expect(() => vm.runInContext(code, sandbox)).not.toThrow();
  });

  it('有 Cache Storage 时会被清空(清掉旧版本 Service Worker 缓存)', async () => {
    const r = runScript({}, { withCaches: true });
    // caches.keys() 是 Promise,清空发生在微任务里 → 让出一次事件循环再断言
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.sandbox.__deleted).toEqual(['c1', 'c2']);
  });

  it('注入窗口内 shouldInject 为真,窗口后为假', () => {
    vi.useFakeTimers();
    vi.setSystemTime(INJECT_UNTIL - 1000);
    expect(shouldInject()).toBe(true);
    vi.setSystemTime(INJECT_UNTIL + 1000);
    expect(shouldInject()).toBe(false);
  });

  it('注入片段是自闭合内联脚本,不含用户输入(无 XSS 注入面)', () => {
    const html = injectScript();
    expect(html.startsWith('<script>')).toBe(true);
    expect(html.endsWith('</script>')).toBe(true);
    // 只出现一次 <script> / </script>,不会出现提前闭合导致 HTML 结构被打断
    expect(html.match(/<script>/g).length).toBe(1);
    expect(html.match(/<\/script>/g).length).toBe(1);
    // KEY 经 JSON.stringify 转义后嵌入,不含引号截断
    expect(html).toContain(JSON.stringify(BUST_KEY));
  });
});
