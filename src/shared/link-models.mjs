// link-models.mjs — 链接 3D 模型的合法形状枚举(单一源,2026-11-11 全面审计 P1-2)
// 背景:访客链接的 model 字段此前前后端都不校验,任意字符串可入库;后台「链接」页把未知
// model 原样拼进 innerHTML ⇒ 存储型 XSS(访客注入 <img onerror=…>,管理员开页即中招)。
// 现在:后端入库前按本表归一(非法值一律回落 sphere),前端渲染再 esc 兜底,纵深防御。
// ⚠️ 本表必须与 src/gallery/mode.js 的几何表、src/admin/admin-content.js 的显示名表一致;
//    三处同改,守卫测试 lib-link-models.test.js 钉住集合相等。
// ⚠️ 本文件是 .mjs 且被后端 require —— 必须进后端部署清单(scripts/backend-files.sh),
//    与 chat-words.mjs / mediarules.mjs 同一族,漏了就是线上 Cannot find module。
export const LINK_MODEL_KEYS = Object.freeze([
  'sphere', 'cube', 'cone', 'octa', 'torus', 'cylinder', 'icosa', 'knot', 'capsule', 'dodeca',
]);

export const DEFAULT_LINK_MODEL = 'sphere';

// 归一:只认枚举内的形状;空值/非法值(含任何注入载荷)一律回落默认形状,绝不原样放行。
export function normalizeLinkModel(m) {
  const s = String(m == null ? '' : m).trim();
  return LINK_MODEL_KEYS.includes(s) ? s : DEFAULT_LINK_MODEL;
}