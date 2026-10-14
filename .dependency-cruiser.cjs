/** @type {import('dependency-cruiser').IConfiguration} */
// 扫描范围 = `src server.js lib`(package.json 的 deps / depcruise 两条脚本)。
// 2026-10-14 之前只写 `src`:后端 50 个磁盘源码文件里有 49 个是被"顺路"扫到的
// ——src 下 33 个测试文件 require 了 lib/,而 src 业务代码一处都不引用后端。
// 覆盖看着在,入口却不在:server.js 自身的出边从不参与判定,测试文件哪天挪走闸就空了。
// 现在把 server.js 与 lib/ 显式列为入口,判定不再依赖测试文件的引用关系。
// ⚠️ 本文件与 scripts/admin/check-backend-manifest.cjs 是两道**不同**的闸:这里管依赖方向,
//    那边管"部署清单 ⊇ 真实依赖",别合并、也别在这里再抄一份清单逻辑。
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'src 与后端(server.js / lib/)一律禁止循环依赖',
      from: {},
      to: { circular: true },
    },
    {
      name: 'gallery-no-scene-direct',
      severity: 'warn',
      comment: 'gallery 域不要直依赖 kunlun 大场景实现,经 ctx/shared 协作',
      from: { path: '^src/gallery/' },
      to: { path: '^src/kunlun/' },
    },
    {
      name: 'gate-no-ark',
      severity: 'error',
      comment: 'gate 域禁止依赖 kunlun/ark 飞舟实现细节',
      from: { path: '^src/gate/' },
      to: { path: '^src/kunlun/ark' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules|vendor',
    },
    tsPreCompilationDeps: true,
  },
};
