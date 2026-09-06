// boot-state.js — 开场链路状态登记册(2026-09-06 架构审计 P2)
// 此前开场协调靠散落的 window.__gatePassed/__gateFailed/__worldStarted/__introFired——
// 没有一处代码能回答"谁读谁写"。收编为单一模块;调试经 expose('bootState') 暴露。
// 写入方:entrygate.js(ENTER→gatePassed)/main.js catch(失败→gateFailed)/
//        main.js startWorld(worldStarted)/finishIntro(introFired)
// 读取方:main.js watchOpening(等 gatePassed/gateFailed)/诊断探针(window.__bootState)
const state = {
  gatePassed: false,   // 入口闸门 ENTER 已点
  gateFailed: false,   // 闸门模块加载失败或超时(兜底放行)
  worldStarted: false, // 3D 世界已开始构建(startWorld 幂等闸)
  introFired: 0,       // finishIntro 触发次数(诊断:应恒为 1)
};

export function get(k) {
  return state[k];
}
export function markGatePassed() {
  state.gatePassed = true;
}
export function markGateFailed() {
  state.gateFailed = true;
}
export function markWorldStarted() {
  state.worldStarted = true;
}
export function bumpIntroFired() {
  state.introFired++;
}
export default state;
