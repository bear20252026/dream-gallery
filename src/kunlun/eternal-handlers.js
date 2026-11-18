// eternal-handlers.js — 厅内交互回调表的单一 owner(2026-11-17 C8 收编)
// 病:五个模块(windchime/fireplace/snowwin/resetview/finale)各自对
//     ctx.kunlun.eternalHandlers 做"||{} 守卫 + 键赋值 + delete 收手",表格无主、
//     注册纪律靠测试外钉,任何一处忘了 delete 就留活引用。
// 治:表由本模块建一次并持有;注册走 registerEternalHandler(action, fn) → off,
//     off 幂等(重复调用/新注册顶替旧值都不会误删别人的回调)。
//     ctx.kunlun.eternalHandlers 保留为**同一张表的引用**(派发方 eternal.js 与探针照常读),
//     但写入方收敛为本模块独占——散写形态被 ctx-writer-shapes 测试钉死禁止。
// 为什么独立成文件而不是放 eternal.js:五模块 import 本叶子零环风险;
//     eternal.js 体量大且带建模副作用,让它当注册入口会把加载序耦合进每个交互模块。
import { ctx } from '../ctx.js';

// 表建一次,挂上 ctx(派发契约不变:eternal.js `const h = ctx.kunlun.eternalHandlers[act]`)
const handlers = {};
ctx.kunlun.eternalHandlers = handlers;

/**
 * 注册一个厅内交互回调。
 * @param {string} action 交互键(chime/fireplace/snowwin/resetview/spiritmark)
 * @param {(cg: import('three').Object3D) => void} fn 回调(派发时收被点对象 cg)
 * @returns {() => void} off —— 拆场/HMR 时调用;幂等,且不会误删顶替自己的新注册
 */
export function registerEternalHandler(action, fn) {
  handlers[action] = fn;
  let done = false;
  return function off() {
    if (done) return;
    done = true;
    if (handlers[action] === fn) delete handlers[action]; // 只删自己:被顶替后不误删新值
  };
}
