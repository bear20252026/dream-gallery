// core/world-chain.mjs — 世界模块加载链的**纯逻辑**(第六轮审计 M-13,2026-10-14 自 world-loader.js 拆出)
// 为什么要拆:旧实现跑完只留一个字符串 —— 失败时把 `window.__worldPhase` 临时写成「后台:失败:x」,
// 链尾再**无条件**覆盖成「后台:完成」⇒ 探针、调试界面、以后的健康检查都分不出"全部成功"和"少了一批"。
// 这里把结论收成结构化结果:`status: ready | degraded | failed` + 三份名单,字符串由调用方自己派生
// (`__worldPhase` 的老契约一字不改,现有 6 个探针还在读它)。
//
// 三条设计约束(都是这个仓库的血泪):
//  ① 顺序即依赖:严格按 list 的先后加载,不并发(后台链内部保持原相对顺序);
//  ② 搁置规则单一源:`isShelved` 由 shared/legacy.mjs 提供,别在这里再写一遍标签判断;
//  ③ **fatal 链失败要如实抛出**,但结论先写进返回值对应的状态里,别让"抛了"变成"什么都没发生"。
export async function runChain(list, opts = {}) {
  const {
    tag = '链',
    fatal = false,
    load,
    isShelved = () => false,
    onPhase = () => {},
    onFail = () => {},
  } = opts;
  if (typeof load !== 'function') throw new Error('[world-chain] 缺少 load(label, thunk)');
  const res = { tag, status: 'ready', loaded: [], failed: [], skipped: [] };
  for (const entry of list) {
    const label = entry[0];
    const thunk = entry[1];
    if (isShelved(entry)) { res.skipped.push(label); continue; }
    try {
      onPhase(tag + ':' + label, entry);
      await load(label, thunk);
      res.loaded.push(label);
    } catch (e) {
      res.failed.push(label);
      res.status = 'degraded';
      onPhase(tag + ':失败:' + label, entry);
      onFail(label, e, entry);
      if (fatal) {
        res.status = 'failed';
        throw e; // 核心链失败:由 startWorld 兜底重试
      }
      // 后台链失败:世界已进图,记日志后继续加载剩余模块
    }
  }
  return res;
}

// 「这条链到底成不成」的唯一读法:探针/自检只看这个函数,别再各自解析 __worldPhase 字符串。
export function chainHealthy(res) {
  return !!res && res.status === 'ready' && res.failed.length === 0;
}
