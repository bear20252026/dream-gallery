// hint-queue.mjs — 提示音/台词音频队列的纯调度逻辑(2026-10-11 DG-AUDIO-001)
// 零依赖、零 DOM、零 Audio:只做「谁下一个播」的裁决,怎么播归 audio-manager.js。
// 语义(改这里必须同步改 __tests__/hint-queue.test.js):
//   submit  空闲即播,忙则排队;超出上限挤掉最旧一条,**其 onEnd 照常回调**(onEnd 驱动对话推进,丢=无声且卡)
//   finish  回调本条 onEnd 恰好一次,并把队首交给调用方(不交回=旧实现 shift 后丢弃的 bug)
//   cancel  撤掉某条(排队中或正在播),同样回调其 onEnd
//   clear   清空排队(整段对话被取消时的 teardown),逐条回调 onEnd,不动正在播的那条

/** 队列上限:第 4 条进来时挤掉最旧的在排条目 */
export const HINT_QUEUE_LIMIT = 3;

function defaultOnError(e) {
  console.warn('[hint-queue] onEnd 回调失败', e);
}

/**
 * 建一个提示音调度器。
 * @param {{limit?:number, onError?:(e:unknown, item:object)=>void}} [options]
 */
export function createHintQueue(options = {}) {
  const limit =
    Number.isFinite(options.limit) && options.limit >= 1
      ? Math.floor(options.limit)
      : HINT_QUEUE_LIMIT;
  const onError = typeof options.onError === 'function' ? options.onError : defaultOnError;
  /** @type {any[]} */
  const pending = [];
  /** @type {any} */
  let playing = null;
  const ended = new WeakSet();

  function fireEnd(item) {
    if (!item || ended.has(item)) return false;
    ended.add(item);
    try {
      if (typeof item.onEnd === 'function') item.onEnd();
    } catch (e) {
      onError(e, item);
    }
    return true;
  }

  function promoteNext() {
    playing = pending.length ? pending.shift() : null;
    return playing;
  }

  const queue = {
    /**
     * 投递一条提示音。
     * @returns {'play'|'queued'|null} 'play'=调用方须立刻播它;'queued'=等 finish 交回
     */
    submit(item) {
      if (!item) return null;
      if (!playing) {
        playing = item;
        return 'play';
      }
      // 上限:挤最旧的在排条目(正在播的那条不算队列成员,不动它)
      while (pending.length >= limit) {
        const stale = pending.shift();
        if (!stale) break;
        fireEnd(stale);
      }
      pending.push(item);
      return 'queued';
    },

    /**
     * 一条播完(或失败/超时)。回调它的 onEnd,返回下一条该播的条目(无则 null)。
     * 非当前条目 / 重复 finish / 已 cancel 过的条目一律返回 null —— 幂等。
     */
    finish(item) {
      if (!item || ended.has(item) || item !== playing) return null;
      // onEnd 里可能再投一条:此时 playing 仍指向本条,新条目排到队尾,不抢播
      fireEnd(item);
      return promoteNext();
    },

    /** 撤掉一条(排队中或正在播),回调它的 onEnd。撤的是当前条目时顺带交回下一条。 */
    cancel(item) {
      const i = item ? pending.indexOf(item) : -1;
      if (i >= 0) {
        pending.splice(i, 1);
        fireEnd(item);
        return { removed: true, next: null };
      }
      if (item && item === playing) {
        fireEnd(item);
        playing = null;
        return { removed: true, next: promoteNext() };
      }
      return { removed: false, next: null };
    },

    /** 清空排队(正在播的那条不动),返回被清掉的条数 */
    clear() {
      let n = 0;
      for (const item of pending.splice(0, pending.length)) if (fireEnd(item)) n++;
      return n;
    },

    current() {
      return playing;
    },
    /** 排队快照(只读副本:外部改动不该绕过调度器) */
    pending() {
      return pending.slice();
    },
    size() {
      return pending.length;
    },
    isPlaying() {
      return !!playing;
    },
  };

  return queue;
}
