// core/system.js — System 接口约定(积木插槽,2026-08-27 起)
// 每个玩法/设施是一个独立积木,只声明自己需要什么(deps)、暴露 init/update/dispose,
// 彼此通过事件通信,绝不直接读写全局可变对象(ctx)。
//
// ★ 分层(Layer)—— 依赖方向自上而下,下层不知上层存在:
//   platform(0)     平台/基础设施:输入、主循环、时间
//   engine(1)       引擎:场景/渲染、音频、相机、动画
//   gameplay(2)     玩法:玩家、灵蕴、飞舟、挂画、序章、交互
//   presentation(3) 表现:提示、HUD、小地图
//
// ★ 定相(Phase)—— 每帧的执行次序,确定性不依赖注册顺序:
//   bootstrap(0) 装配期一次性(无每帧逻辑)
//   input(1)    采集输入 → 产生本帧输入快照
//   simulate(2) 玩法逻辑 → 只改 game-state,不改渲染对象
//   animate(3)  动画/混合器/相机 → 由 game-state 驱动视觉
//   render(4)   渲染(由 LoopManager 负责,系统一般留空)
//   ui(5)       HUD/提示 → 由 game-state 同步显示
//
// init: 注册事件、建网格、绑定输入 —— 一次
// update(dt): 每帧逻辑,dt 单一来源(由单一主循环驱动);无逐帧逻辑可省略
// dispose: 清理,支持热替换/孤立测试
export const LAYERS = { platform: 0, engine: 1, gameplay: 2, presentation: 3 };
export const PHASES = { bootstrap: 0, input: 1, simulate: 2, animate: 3, render: 4, ui: 5 };

export function defineSystem(def) {
  if (!def || typeof def.name !== 'string') {
    throw new Error('[system] 缺少 name');
  }
  // 层/相位既可传字符串键('engine'/'animate'),也可传数值(PHASES.animate),统一归一为字符串键
  const layerKey =
    typeof def.layer === 'string'
      ? def.layer
      : Object.keys(LAYERS).find((k) => LAYERS[k] === def.layer) || 'engine';
  const phaseKey =
    typeof def.phase === 'string'
      ? def.phase
      : Object.keys(PHASES).find((k) => PHASES[k] === def.phase) || 'simulate';
  return {
    name: def.name,
    layer: layerKey,
    phase: phaseKey,
    order: Number.isFinite(def.order) ? def.order : 0,
    deps: def.deps || {},
    init: typeof def.init === 'function' ? def.init : () => {},
    update: typeof def.update === 'function' ? def.update : null,
    dispose: typeof def.dispose === 'function' ? def.dispose : () => {},
  };
}

// 系统排序:**字典序比较**(层 → 相位 → 同相位内次序),组合根据此确定性 init/update/dispose。
// ⚠️这里以前是"把三个数加权成一个数"(`l*1000 + p*10 + order`),那个写法**默认 order 落在 (-10,10) 之内**,
// 而实际注册并不满足:2026-10-14 实扫 `src/` 得到 |order|≥10 的系统 **9 条**(10/11/12/13/14 都有)、
// `core/loop.js` 还是 **order:-1000**。于是同一层内"phase=input, order=14"会算得比"phase=simulate, order=0"
// 更大 ⇒ 相位次序被 order 悄悄推翻;-1000 更能把一个系统直接搬进别的层。
// 本次改动**不改变今天的实际顺序**(我把 21 条真实注册按旧权重与新字典序各排一遍,**换位 0 条** ——
// 量过这张表才敢动装配最底层),它防的是"下次有人再加一个 order=15,排序就静默跨相位"。
// 同层同相同 order 时交给 Array.sort 的稳定性 ⇒ 按注册先后,仍然确定。
const layerOf = (s) => (LAYERS[s.layer] != null ? LAYERS[s.layer] : 1);
const phaseOf = (s) => (PHASES[s.phase] != null ? PHASES[s.phase] : 2);
const orderOf = (s) => (Number.isFinite(s.order) ? s.order : 0);

export function compareSystems(a, b) {
  return layerOf(a) - layerOf(b) || phaseOf(a) - phaseOf(b) || orderOf(a) - orderOf(b);
}

// 排序位置的可读串(调试用;顺序的唯一判据是上面那个比较器,别再在这里造第二个)
export function systemKey(s) {
  return layerOf(s) + '/' + phaseOf(s) + '/' + orderOf(s);
}
