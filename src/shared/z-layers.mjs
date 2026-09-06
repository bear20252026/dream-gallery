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
  prologue: 500,    // 残镜序章(prologue.js #prologueBlack)
  film: 580,        // 纸飞机开幕电影

  // —— 世界切换过渡与全屏弹层(2026-09-07 P3 收编,原散值 380~400) ——
  modal: 380,       // 设置面板二级弹层(画質/上传/聊天/灵蕴页/愿望页共用基线)
  veilFx: 390,      // 过渡特效:金色传送光环(sky-progress)/境暗晕影(letgo)
  veilLock: 391,    // 遮罩交互层:天穹进度全屏遮罩(sky-progress)
  teleport: 400,    // darkTeleport 传送黑幕/答题面板 #quizOv(压过一切游戏内 UI)
  worldToast: 500,  // 世界级提示条(答题门禁 toast,浮在遮罩上)

  // —— 系统 ——
  kickNotice: 9999, // 被踢出通知/浮层提示(ui.kit toast、上传拖罩)
  exitFade: 99998,  // 退出告别淡出
  errTrap: 99999,   // 错误捕获条
};
export default Z;
