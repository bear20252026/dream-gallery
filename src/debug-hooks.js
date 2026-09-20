// debug-hooks.js — 调试/探针钩子统一注册表(2026-08-30 复查建议④)
// 目的:window.__xxx 散落 11 个文件,无法整体摘除/盘点。现在经 expose() 注册,
// 同步写 window['__'+key](保持既有探针契约不变),并登记进注册表以便:
//   - 生产构建可整体禁用(置 DISABLE=true 后 expose 变 no-op)
//   - 控制台 window.__debugHooks.list() 盘点当前钩子
// 内部跨模块通信(prologueStarted/HMR/ytHeart 等)不属诊断钩子,不经此处。
// 2026-09-18 修正审计发现的死旗:此前 DISABLE=true 从未生效(实现未引用)。
// 现在真正生效;默认 false 保持钩子常开(BASE_URL 生产探针依赖 __ 前缀钩子;
// 钩子只暴露游戏运行态,不含密钥/用户隐私)。真要收紧时置 true 即全局 no-op。
export const DISABLE = false;
const REG =
  (typeof window !== 'undefined' && (window.__debugHooksReg = window.__debugHooksReg || {})) || {};

export function expose(key, val) {
  if (DISABLE || typeof window === 'undefined') return val;
  window['__' + key] = val;
  REG[key] = { t: Date.now(), type: typeof val };
  return val;
}
export function unexpose(key) {
  if (typeof window === 'undefined') return;
  delete window['__' + key];
  delete REG[key];
}
export function list() {
  return Object.keys(REG).map((k) => k + ':' + REG[k].type);
}
if (typeof window !== 'undefined') window.__debugHooks = { list, expose, unexpose };
