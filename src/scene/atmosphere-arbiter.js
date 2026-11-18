// atmosphere-arbiter.js — 氛围参数中央仲裁(2026-11-18 G1,第五轮审计剩余项)
// ===================== 它治什么 =====================
// 病:Bloom/曝光三方直调 postprocessing.setAtmosphere,后写覆盖先写,无所有权:
//    ① 昼夜层(light-mood)每帧写基准;
//    ② 锦鲤飞行(koi-ship applyEnv)登机写飞行调性,**下机不还原**(靠昼夜恢复后每帧覆盖兜底);
//    ③ 展厅(eternal applyHallMood)进厅写厅内调性,且必须**每帧持续压住**
//       (eternal.js 旧注释自认:"昼夜层每帧覆写 ⇒ 厅内必须持续压住,否则下一帧又被推回沙漠调性")。
//    ②③都是"无仲裁"的 workaround:各自靠每帧重写抢所有权,谁最后写谁赢,时序敏感。
// 治:base + override 栈仲裁——
//    - applyBase(opts):昼夜基准层(light-mood 经 ctx.scene.setAtmosphere 别名走这里,形状不变);
//    - pushOverride(name, opts) → off:场景接管层(锦鲤飞行/展厅),栈顶胜出;
//      off 按身份移除(不依赖 LIFO,同 ground-resolver 模式),落回 base 或下层 override;
//    - 合成结果一次性写真实 postprocessing.setAtmosphere;override 在位时 base 每帧更新
//      只记录不生效(落回时立即用上最新基准,无需等下一帧)。
// 收益:eternal 不再每帧压住(省一次每帧调用);koi 下机 off 即还原(修"不还原"缺陷);
//    所有权清晰,新增接管方走 pushOverride,不再散写。
import { setAtmosphere as ppSetAtmosphere } from './postprocessing.js';

// base/override 表跨 HMR 存活(同 ground-resolver 模式):hot.data 承接,不丢未重执行者的层。
const state = (import.meta.hot && import.meta.hot.data.atmos) || { base: null, overrides: [] };
if (import.meta.hot) import.meta.hot.data.atmos = state;

/** 合成并应用:栈顶 override 胜出,无 override 用 base;都没有则不写(保持管线现状) */
function synthesize() {
  const top = state.overrides.length
    ? state.overrides[state.overrides.length - 1].opts
    : state.base;
  if (top) ppSetAtmosphere(top);
}

/**
 * 昼夜基准层入口(2026-11-18 G1:ctx.scene.setAtmosphere 别名指向这里)。
 * light-mood 每帧调用;override 在位时只记录不生效(落回时立即用最新基准)。
 * @param {{bloomStrength?:number,bloomRadius?:number,bloomThreshold?:number,exposure?:number}} opts
 */
export function applyBase(opts) {
  state.base = opts || null;
  synthesize();
}

/**
 * 场景接管层:锦鲤飞行/展厅等推入自己的氛围调性,栈顶胜出。
 * @param {string} name 调试名(koi-flight/hall)
 * @param {{bloomStrength?:number,bloomRadius?:number,bloomThreshold?:number,exposure?:number}} opts
 * @returns {()=>boolean} off —— 按身份移除,幂等,不误删他人;落回 base/下层
 */
export function pushAtmosphereOverride(name, opts) {
  const layer = { name, opts };
  state.overrides.push(layer);
  synthesize();
  let done = false;
  return function off() {
    if (done) return false;
    done = true;
    const i = state.overrides.indexOf(layer);
    if (i >= 0) {
      state.overrides.splice(i, 1);
      synthesize(); // 落回 base(最新昼夜基准)或下层 override
      return true;
    }
    return false;
  };
}

/** 诊断/守卫用:当前生效来源与层名栈 */
export function atmosphereState() {
  return {
    active: state.overrides.length
      ? state.overrides[state.overrides.length - 1].name
      : state.base
        ? 'base'
        : null,
    overrides: state.overrides.map((l) => l.name),
  };
}

// self-accept:本模块热替自己消化(hot.data 承接+重合成),不冒泡重执行注册方。
if (import.meta.hot) import.meta.hot.accept();
