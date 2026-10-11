// hint-queue.test.js — 提示音队列调度语义(2026-10-11 DG-AUDIO-001)
// 旧实现把 shift 出来的下一条丢掉再重播当前条,且 B 的 onEnd 永不执行(对话推进卡死)。
// 这里钉死:严格 FIFO、onEnd 恰好一次、上限挤旧必回调、空队列不调度、重复 finish 幂等。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHintQueue, HINT_QUEUE_LIMIT } from '../shared/hint-queue.mjs';

/** 造一条队列项,并记录它的 onEnd 被调了几次 */
function item(id, extra = {}) {
  const onEnd = vi.fn();
  return { id, audio: { id }, onEnd, ...extra };
}

/** 按 audio-manager 的用法跑一遍投递-播完循环,返回实际开播顺序 */
function drain(q, submissions) {
  const started = [];
  for (const it of submissions) {
    if (q.submit(it) === 'play') {
      started.push(it.id);
      let next = it;
      while (next) {
        const after = q.finish(next);
        if (after) started.push(after.id);
        next = after;
      }
    }
  }
  return started;
}

describe('hint-queue', () => {
  let q;
  beforeEach(() => {
    q = createHintQueue();
  });

  it('空闲时投递即刻可播,忙时排队', () => {
    const a = item('a');
    expect(q.submit(a)).toBe('play');
    expect(q.current()).toBe(a);
    expect(q.submit(item('b'))).toBe('queued');
    expect(q.size()).toBe(1);
  });

  it('连投 A/B/C:开播顺序严格 A→B→C,三个 onEnd 各恰好一次', () => {
    const a = item('a');
    const b = item('b');
    const c = item('c');
    const started = drain(q, [a, b, c]);
    expect(started).toEqual(['a', 'b', 'c']);
    expect(a.onEnd).toHaveBeenCalledTimes(1);
    expect(b.onEnd).toHaveBeenCalledTimes(1);
    expect(c.onEnd).toHaveBeenCalledTimes(1);
    expect(q.isPlaying()).toBe(false);
    expect(q.size()).toBe(0);
  });

  it('finish 交回的是队首那条,不是当前那条(旧 bug:shift 出 next 却重播 A)', () => {
    const a = item('a');
    const b = item('b');
    q.submit(a);
    q.submit(b);
    expect(q.finish(a)).toBe(b);
    expect(q.current()).toBe(b);
    expect(a.onEnd).toHaveBeenCalledTimes(1);
    expect(b.onEnd).not.toHaveBeenCalled();
  });

  it('队列上限:第 4 条进来挤掉最旧的在排条目,并回调其 onEnd', () => {
    const onError = vi.fn();
    const qq = createHintQueue({ onError });
    const a = item('a');
    const b = item('b');
    const c = item('c');
    const d = item('d');
    const e = item('e');
    qq.submit(a); // 在播
    expect(qq.submit(b)).toBe('queued');
    expect(qq.submit(c)).toBe('queued');
    expect(qq.submit(d)).toBe('queued');
    expect(qq.submit(e)).toBe('queued');
    expect(qq.size()).toBe(HINT_QUEUE_LIMIT);
    expect(qq.pending().map((x) => x.id)).toEqual(['c', 'd', 'e']); // b 被挤掉
    expect(b.onEnd).toHaveBeenCalledTimes(1); // 挤掉不等于丢弃:对话照样推进
    expect(a.onEnd).not.toHaveBeenCalled(); // 正在播的不受上限影响
    expect(qq.finish(a)).toBe(c);
  });

  it('上限 1:每条新来的都把前一条顶掉并回调其 onEnd', () => {
    const qq = createHintQueue({ limit: 1 });
    const a = item('a');
    const b = item('b');
    const c = item('c');
    qq.submit(a);
    expect(qq.submit(b)).toBe('queued');
    expect(b.onEnd).not.toHaveBeenCalled();
    expect(qq.submit(c)).toBe('queued');
    expect(b.onEnd).toHaveBeenCalledTimes(1);
    expect(qq.size()).toBe(1);
    expect(qq.pending().map((x) => x.id)).toEqual(['c']);
    expect(qq.finish(a)).toBe(c);
  });

  it('脏 limit 回退默认上限', () => {
    const qq = createHintQueue({ limit: 0 });
    const a = item('a');
    const items = ['b', 'c', 'd', 'e'].map((id) => item(id));
    qq.submit(a);
    for (const it of items) qq.submit(it);
    expect(qq.size()).toBe(HINT_QUEUE_LIMIT);
    expect(items[0].onEnd).toHaveBeenCalledTimes(1);
  });

  it('队列排空后 finish 返回 null,不再调度', () => {
    const a = item('a');
    q.submit(a);
    expect(q.finish(a)).toBeNull();
    expect(q.current()).toBeNull();
    expect(q.isPlaying()).toBe(false);
  });

  it('重复 finish 幂等:onEnd 只一次,不会把下一条交回两次', () => {
    const a = item('a');
    const b = item('b');
    q.submit(a);
    q.submit(b);
    expect(q.finish(a)).toBe(b);
    expect(q.finish(a)).toBeNull();
    expect(q.finish(a)).toBeNull();
    expect(a.onEnd).toHaveBeenCalledTimes(1);
    expect(q.current()).toBe(b); // 下一条仍归当前
  });

  it('cancel 排队条目:回调其 onEnd 并从队列摘除;cancel 当前条目:顺带交回下一条', () => {
    const a = item('a');
    const b = item('b');
    const c = item('c');
    q.submit(a);
    q.submit(b);
    q.submit(c);
    expect(q.cancel(b)).toEqual({ removed: true, next: null });
    expect(b.onEnd).toHaveBeenCalledTimes(1);
    expect(q.pending().map((x) => x.id)).toEqual(['c']);
    expect(q.cancel(a)).toEqual({ removed: true, next: c });
    expect(a.onEnd).toHaveBeenCalledTimes(1);
    expect(q.cancel(a)).toEqual({ removed: false, next: null }); // 幂等
    expect(a.onEnd).toHaveBeenCalledTimes(1);
  });

  it('onEnd 里再投一条:排在队尾按序播出,不抢当前条的位置(对话链自续)', () => {
    const a = item('a');
    const b = item('b');
    const c = item('c');
    q.submit(a);
    q.submit(b);
    a.onEnd.mockImplementation(() => {
      q.submit(c);
    });
    expect(q.finish(a)).toBe(b); // 先排到的 b 仍在前
    expect(q.finish(b)).toBe(c);
    expect(q.finish(c)).toBeNull();
    expect([a.onEnd, b.onEnd, c.onEnd].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('onEnd 抛错不外溢:后续调度照常,错误经 onError 留痕', () => {
    const onError = vi.fn();
    const qq = createHintQueue({ onError });
    const boom = new Error('对话推进炸了');
    const a = item('a');
    const b = item('b');
    a.onEnd.mockImplementation(() => {
      throw boom;
    });
    qq.submit(a);
    qq.submit(b);
    expect(qq.finish(a)).toBe(b);
    expect(onError).toHaveBeenCalledWith(boom, a);
    expect(qq.isPlaying()).toBe(true);
  });

  it('clear 清空排队并逐条回调 onEnd,正在播的那条不动', () => {
    const a = item('a');
    const b = item('b');
    const c = item('c');
    q.submit(a);
    q.submit(b);
    q.submit(c);
    expect(q.clear()).toBe(2);
    expect(b.onEnd).toHaveBeenCalledTimes(1);
    expect(c.onEnd).toHaveBeenCalledTimes(1);
    expect(a.onEnd).not.toHaveBeenCalled();
    expect(q.size()).toBe(0);
    expect(q.clear()).toBe(0);
    expect(q.finish(a)).toBeNull();
  });

  it('pending() 是只读快照:外部改动不绕过调度器', () => {
    const a = item('a');
    const b = item('b');
    q.submit(a);
    q.submit(b);
    q.pending().push({ id: 'ghost' });
    expect(q.size()).toBe(1);
    expect(q.finish(a)).toBe(b);
  });
});
