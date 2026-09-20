// consent-session.js — 三连协议会话签名(2026-09-18 自 main.js 外迁;结构审计 P3a)
// 闸门 60s 超时/初始化失败时放行用。会话级键不进 store(存档规矩:sessionStorage 不登记)。
// 刻意零依赖:引导阶段即可静态 import。
export function signAllConsents() {
  sessionStorage.setItem('agreementConsented', '1');
  sessionStorage.setItem('privacyConsented', '1');
  sessionStorage.setItem('communityConsented', '1');
}
