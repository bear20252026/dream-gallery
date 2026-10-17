#!/usr/bin/env bash
# backend-files.sh — 「哪些文件算后端」的唯一出处(被 source,不单独执行)
# 调用方:scripts/backend-sync.sh(算差集 + 上传)、scripts/verify-drift.sh(部署后逐文件复核)
#
# ⚠️ 为什么不能写成 `lib/*.js`(2026-10-12 查出,发布阻断级):
#   R1/R2 把后端拆出了子目录 —— lib/repo/*.js、lib/upload/*.js、lib/migrations/*.sql。
#   glob 不递归 ⇒ 这些模块【一个都不会被传】。线上 server.js require('./lib/store')
#   → require('./shadow') → require('./repo/chat') 直接 Cannot find module,pm2 反复重启 = 全站 502。
#   老写法只在「lib 下永远只有一层 .js」这个前提下成立,而那个前提已被本轮重构废掉。
#
# 为什么扩展名写死而不用 `find lib -type f`:
#   将来 lib/ 里落出 .db / .json / .env / 备份之类**不该进 web root**的文件时,默认不跟着传。
#   传错一次就是源码或数据外泄的起点(本仓库有 .bak 被公网回传的前科)。
#   公网侧整个 lib/ 目录段由 lib/security.js 的 staticDenied() 按首段挡成 404,子目录同样在射程内。
#
# scripts/admin/table-parity.cjs 是唯一被点名带上服务器的脚本(R1"切读"的判据工具):
#   它按 __dirname/../.. 解析仓库根,只有放在 <根>/scripts/admin/ 才跑得起来,而线上读的是
#   服务器上的 gate_data.db —— 不在盒子上就没法判"能不能切读"。它只读(readonly + fileMustExist),
#   不写不锁;公网侧 `scripts` 首段与 `*.cjs` 后缀被 staticDenied() 各挡一次,双重。
# ⚠️ src/shared/*.mjs 里**被后端 require 的每一个**都必须点名在这里(2026-10-17 加 chat-words.mjs:
#   lib/chat.js 与前端 chat-room.js 共用那张召唤词表)。`find lib …` 只覆盖 lib 目录树,
#   跨到 src/ 的依赖一条都不会自动进清单 —— 这条由 scripts/admin/check-backend-manifest.cjs
#   按 depcruise 的可达集反查清单,漏一个就 exit 1(2026-10-12 那次 502 事故立的闸,正好管住这种新形态)。
backend_files() {
  printf '%s\n' server.js src/shared/mediarules.mjs src/shared/chat-words.mjs scripts/admin/table-parity.cjs
  find lib -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.sql' \) 2>/dev/null | sort
}
