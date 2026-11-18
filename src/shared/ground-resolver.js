// ground-resolver.js — 地面覆盖中央层栈(2026-11-18 E1,第五轮审计最高杠杆项)
// ===================== 它治什么 =====================
// 病:groundOverride 四写者(eternal/planets/resetview/museum)各自"捕获 prev → 包装 →
//    拆场还原 prev"的 LIFO 纪律链。三个实锤问题:
//    ① 解链假设 LIFO——单独热替中间层(eternal)会把上层(resetview/museum)包装抹掉,
//       上层随后 off 又把捕获的旧包装复活(死链回魂);
//    ② museum 运行时整体接管(裸赋值)会吞掉整条链,退出时还原的 prev 可能已过期;
//    ③ 写入方散落四文件,无守卫钉死,回潮无告警。
// 治:中央层栈。addGroundLayer(fn) → off:
//    - 合成函数从栈顶往下问,第一个返回 !== undefined 的层胜出(与旧链语义一致);
//    - off 按**层身份**移除(splice),不依赖 LIFO——中间层热替/先拆不影响其他层;
//    - 幂等 off(重复调用/已被移除返回 false),不会误删别人;
//    - HMR 重求值沿用 ctx 上已有的层表(同 eternal-handlers 模式),不丢未重执行者的层。
// 契约:ctx.kunlun.groundOverride 保留为**合成函数只读别名**(player.js groundY 每帧询问、
//    4 个探针按函数取用、ctx-bus-probe 要求 'groundOverride' in ctx.kunlun)——形状不变,
//    写入方收敛为本模块独占(ctx-writer-shapes 守卫钉死)。
// 层语义:fn(x,z) 返回 number=本层地面命中;返回 undefined/null=未命中交还下层。
//    全栈未命中 ⇒ 合成函数返回 undefined,player 回退沙漠地形(与旧行为逐字一致)。
import { ctx } from '../ctx.js';

// 层表跨 HMR 存活:用 Vite 官方 hot.data(同模块热替时保留),不污染 ctx 类型面。
// 生产无 HMR ⇒ 模块态天然常驻;本模块自身被热替 ⇒ hot.data 承接旧层表,
// 旧 off 闭包持层对象引用,splice 仍落在同一张表上,不丢未重执行者的层。
const layers = (import.meta.hot && import.meta.hot.data.layers) || [];
if (import.meta.hot) import.meta.hot.data.layers = layers;

/** 合成:栈顶(后注册)优先,第一个命中(!==undefined)的层胜出 */
function resolveGround(x, z) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const g = layers[i].fn(x, z);
    if (g !== undefined && g !== null) return g;
  }
  return undefined;
}

// 只读别名:每次求值都装同一合成函数(幂等;消费方拿到的引用永远有效)
ctx.kunlun.groundOverride = resolveGround;

/**
 * 注册一个地面层。后注册者优先(栈顶)。
 * @param {(x:number,z:number)=>number|undefined|null} fn 层函数
 * @param {string} [name] 调试名(探针/诊断可读)
 * @returns {()=>boolean} off —— 按层身份移除,不依赖 LIFO;幂等,不误删他人
 */
export function addGroundLayer(fn, name) {
  const layer = { fn, name: name || 'anon' };
  layers.push(layer);
  let done = false;
  return function off() {
    if (done) return false;
    done = true;
    const i = layers.indexOf(layer);
    if (i >= 0) {
      layers.splice(i, 1);
      return true;
    }
    return false;
  };
}

/** 诊断/守卫用:当前层名栈(底→顶) */
export function groundLayerNames() {
  return layers.map((l) => l.name);
}

// self-accept:本模块热替自己消化(hot.data 承接层表+重装别名),不冒泡重执行四个注册方
// ——它们的层还在表里,重执行会叠重复层。
if (import.meta.hot) import.meta.hot.accept();
