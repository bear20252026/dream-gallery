// admin-state.js — 后台共享可变状态(2026-10-10 admin 第二阶段切出)
// DATA/RANGE/CAL_DATE 原为 admin.js 模块级 let,横跨 8 个分区读写。ESM live binding:
// 各分区 `import { DATA }` 读到的是同一绑定的最新值;重绑只经 setData(唯一 rebind 点是 load())。
export let DATA = null;
export function setData(d) {
  DATA = d;
}
export let RANGE = 'day';
export function setRangeValue(v) {
  RANGE = v;
}
export let CAL_DATE = null;
export function setCalDate(v) {
  CAL_DATE = v;
}
