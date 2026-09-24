// typing-rhythm.mjs — 打字机逐字节奏(2026-09-24 剧情流畅度优化)
// 旧实现 38ms/字恒速,中文标点毫无停顿,台词像"机关枪"不像说话。
// 现按"刚显示的字符"决定到下一个字符的等待:普通字恒速,标点驻留 ——
// 逗号轻顿、句末重顿,文字节奏对齐台词朗读的呼吸。

/** 普通字符基础节奏(ms),与历史手感一致 */
export const BASE_MS = 38;
/** 弱标点(句中气口)驻留 */
export const WEAK_MS = 150;
/** 强标点(句末)驻留 */
export const STRONG_MS = 260;

const WEAK = new Set(['\uFF0C', '\u3001', '\uFF1B', '\uFF1A', ',', ';', ':']);
const STRONG = new Set(['\u3002', '\uFF01', '\uFF1F', '\u2026', '\u2014', '!', '?']);

/**
 * 显示字符 ch 之后,到显示下一字符前的等待毫秒数。
 * 未知/空字符 → BASE_MS(纯函数,单测钉死)。
 */
export function dwellFor(ch) {
  if (!ch) return BASE_MS;
  if (STRONG.has(ch)) return STRONG_MS;
  if (WEAK.has(ch)) return WEAK_MS;
  return BASE_MS;
}
