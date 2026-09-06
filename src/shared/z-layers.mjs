// z-layers.mjs — 全站 z-index 分层登记册(2026-09-06 架构审计 P2)
// 全项目曾有 40+ 个离散 z-index 值(10/15/35/60/200/380~401/580/99998…),新增弹层全靠翻代码抢位。
// 用法:import { Z } from '../shared/z-layers.mjs'; el.style.zIndex = Z.film;
// 规则:新增层必须在此登记并落在正确分层区间,禁止裸数字。存量未迁移处可渐进接入。
export const Z = {
  // —— 世界内浮层(独立世界 Scene 之上的 DOM) ——
  worldFx: 12,      // 小世界对话气泡层(story-dialogs)
  worldHud: 15,     // 世界内小字(昆仑语录/海拔)

  // —— 主世界 HUD ——
  hudLow: 20,       // 音乐开关/底部提示
  hudPanel: 30,     // AI 配文面板
  hudBtn: 35,       // 跳跃/人称/回归/下降按钮
  quizPanel: 401,   // 答题面板(高于常规 HUD)
  navBtn: 60,       // 世界导航/拾取按钮(小世界单列导航)
  questBook: 70,    // 任务册
  guideCard: 75,    // 初见指引
  menuBtn: 80,      // 「印」菜单按钮

  // —— 引导链(加载屏 < 闸门 < 电影) ——
  gateDoc: 99,      // 闸门读协议的「‹ 返回」钮
  loading: 100,     // 加载屏(与闸门交接)
  gate: 150,        // 入口闸门
  prologue: 500,    // (保留)残镜序章
  film: 580,        // 纸飞机开幕电影

  // —— 系统 ——
  kickNotice: 9999, // 被踢出通知
  exitFade: 99998,  // 退出告别淡出
  errTrap: 99999,   // 错误捕获条
};
export default Z;
