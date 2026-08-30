// shared/constants.js — 跨模块共享的物理/视图常量(2026-08-30 B2 架构整改)
// 眼睛高度:player.js 的 pl.p.y 存"眼睛"高度(= 地面 + EYE_HEIGHT),
// loop-manager 第三人称角色贴地、quizgate 传送都依赖此值 —— 历史上两文件
// 各自硬编码 1.6 曾导致改一处漏一处,现统一引用。

/** 玩家眼睛离地高度(米)。角色模型原点在脚底,故模型 y = pl.p.y - EYE_HEIGHT */
export const EYE_HEIGHT = 1.6;
