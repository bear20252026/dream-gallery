/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'src 内禁止循环依赖',
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
