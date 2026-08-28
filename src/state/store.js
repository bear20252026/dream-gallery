// store.js — 存档深模块·冷核心挂载层(2026-07-28 架构深化②,方案 B;2026-08-29 拆分)
// 本文件只做一件事:把纯持久化 api 挂到 ctx.ui.store,供全站 85 处 ctx.store.* 调用。
// 真正的实现(SCHEMA 登记册 / 类型转换 / 旧档迁移 / 异常兜底)在 store-api.js——
// 该文件**不依赖 ctx.js**,独立页面入口(如 lobby.html)可直接 import 复用,
// 无需把整个 ctx.js 拖进轻量页面。
//
// 铁律(不变):新增存档键先去 store-api.js 的 SCHEMA 登记,业务代码禁止直写 localStorage
//   (scripts/probe/store-probe.js 第 8 项会扫,只豁免 store.js 与 store-api.js)。
// sessionStorage 键(同意书/欢迎语等会话级)不进本模块。
import { ctx } from '../ctx.js';
import { storeApi } from './store-api.js';

ctx.ui.store = storeApi;
