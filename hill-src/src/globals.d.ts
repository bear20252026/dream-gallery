// globals.d.ts — 构建期常量(2026-10-14 第五轮审计 E)
// `__SOLO__` 由 hill-src/vite.config.ts 的 define 注入(默认 true;HILL_SOLO=0 出联机版)。
// 声明成全局常量而不是 import.meta.env,是为了让 Rollup 能把 `if (!__SOLO__)` 折成死分支并
// 整块删掉 —— 类型上它仍然是 boolean,所以 TS 照样检查被包住的那段代码,不会"顺手关掉检查"。
declare const __SOLO__: boolean
