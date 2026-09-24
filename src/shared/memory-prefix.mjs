// memory-prefix.mjs — 画作配文前缀单一源(2026-09-24 自 paintings.js 抽出)
// 2026-07-26《B612灵鉴》:配文统一加前缀「B612 替你记得：」,AI=B612 的记忆回声。
// **前缀幂等**:HMR 重载/重复调用不会叠两层 —— 这条防过真实回归,勿改成无脑拼接。
export const MEMORY_PREFIX = 'B612 替你记得：';

/** 给配文加前缀;已带前缀的原样返回(幂等) */
export function withMemoryPrefix(text) {
  const t = String(text ?? '');
  return t.startsWith(MEMORY_PREFIX) ? t : MEMORY_PREFIX + t;
}
