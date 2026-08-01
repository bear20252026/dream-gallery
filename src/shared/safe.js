// ============================================================
// 安全执行层 — 统一的 try/catch 包装，防止关键路径静默崩溃
// 用法: safeCall(() => playMusic(0,0), 'music-start')
//        safeAsync(async () => await fetch(...), 'api-fetch')
// ============================================================

/**
 * 同步安全执行。出错时 toast 提示 + 控制台警告，不抛异常阻断后续流程。
 * @param {Function} fn - 要执行的函数
 * @param {string} label - 错误日志标签（便于定位）
 * @param {Function} [onError] - 自定义错误处理（覆盖默认 toast）
 */
export function safeCall(fn, label, onError) {
  try {
    return fn();
  } catch (e) {
    const msg = `[${label}] ${e.message}`;
    console.warn(msg);
    if (
      typeof window !== 'undefined' &&
      window.__ctx &&
      window.__ctx.ui &&
      window.__ctx.ui.modeToast
    ) {
      window.__ctx.ui.modeToast(label + ' 出错了');
    }
    if (onError) onError(e);
  }
}

/**
 * 异步安全执行。选项同 safeCall。
 * @param {Function} fn - 返回 Promise 的函数
 * @param {string} label
 * @param {Function} [onError]
 * @returns {Promise<void>}
 */
export async function safeAsync(fn, label, onError) {
  try {
    await fn();
  } catch (e) {
    const msg = `[${label}] ${e.message}`;
    console.warn(msg);
    if (
      typeof window !== 'undefined' &&
      window.__ctx &&
      window.__ctx.ui &&
      window.__ctx.ui.modeToast
    ) {
      window.__ctx.ui.modeToast(label + ' 出错了');
    }
    if (onError) onError(e);
  }
}
