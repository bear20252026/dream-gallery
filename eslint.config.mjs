// eslint.config.js — 代码查错配置(2026-07-27 引入,只查"会出 bug 的错",不管风格——风格交给 prettier)
// 用法:npm run lint
// 原则:历史代码 7800+ 行不重排,规则从严选——只抓真错误(未定义变量/不可达代码/重复键/错误正则等),
// 不报"写得不够漂亮"的警。新写代码时编辑器会实时标红,按需修。
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**', 'dist/**', 'vendor/**', 'origin/**', '.tmp/**',
      'three.mjs', 'scripts/artifacts/**', '**/*.min.js',
      // 远方山丘:独立的 TypeScript 子项目(自带 tsc/vitest),产物在 public/hill/
      'hill-src/**', 'public/hill/**',
      // basis 转码器是三方 vendored 产物(emscripten 生成,几 MB,不该由本仓的查错器负责)
      'public/basis/**',
    ],
  },
  // 前端浏览器模块
  {
    files: ['src/**/*.js', 'src/**/*.mjs', 'data.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'module',
      // __B612_BUILD__ 不在这里声明:唯一的读数点 src/shared/build-info.mjs 自己在文件头写了
      // `/* global __B612_BUILD__ */`,两处都写会撞 no-redeclare(而 no-redeclare 报的是"声明重复",
      // 不是"谁对"—— 留着内联那句更能说明"这常量由 vite define 注入、不经构建跑源码时是 undefined")
      globals: { ...globals.browser, Sentry: 'readonly' },
    },
    rules: {
      ...js.configs.recommended.rules,
      // 历史代码宽松项:未使用变量/空 catch 块/赋值后未续用/正则冗余转义,历史代码里是有意为之,不报警
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': 'off',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
    },
  },
  // core/ 关键路径收紧(2026-09-24 空 catch 分级治理):对话链/游戏状态等核心模块
  // 禁止静默吞错——排障要有迹可循(9-10 对话链断链排障成本高的教训)。
  // 其余目录维持 allowEmptyCatch:true,待后续分批治理;新增空 catch 一律先写 debug 日志。
  {
    files: ['src/core/**/*.js', 'src/core/**/*.mjs'],
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  // 后端与脚本(CommonJS;探针/测试里有 page.evaluate 浏览器代码,故同时放行浏览器全局)
  {
    files: [
      'server.js',
      'landing-server.js',
      'live-verify.cjs',
      'vitest.config.js',
      'eslint.config.mjs',
      '.dependency-cruiser.cjs',
      'lib/**/*.js',
      'lib/**/*.mjs',
      'scripts/**/*.{js,mjs,cjs}',
      'tools/*.js',
      'vite.config.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      // 2026-08-31:scripts/ 下探针混用 ESM(import)与 CJS(require),统一按 module 解析;
      // require/module/exports 仍在 globals.node 中,CJS 文件不误报
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
    },
  },
  // 单元测试(src/__tests__):vitest + Node 环境,需要 process/setImmediate/require 等
  {
    files: ['src/__tests__/**/*.js', 'src/__tests__/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { ...js.configs.recommended.rules },
  },
  // vite.config.js 是 ESM
  {
    files: ['vite.config.js'],
    languageOptions: { sourceType: 'module' },
  },
  // 服务工作线程:global 是 serviceworker,不是 browser(它没有 window/document)。
  // 这条不是补风格 —— 后台凭据落盘事故(sw.js 的 /admin-media 漏拦)就出在这个文件,而它此前一条规则都没收到。
  {
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
