// eslint.config.js — 代码查错配置(2026-07-27 引入,只查"会出 bug 的错",不管风格——风格交给 prettier)
// 用法:npm run lint
// 原则:历史代码 7800+ 行不重排,规则从严选——只抓真错误(未定义变量/不可达代码/重复键/错误正则等),
// 不报"写得不够漂亮"的警。新写代码时编辑器会实时标红,按需修。
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**', 'dist/**', 'vendor/**', 'origin/**',
      'three.mjs', 'scripts/artifacts/**', '**/*.min.js',
    ],
  },
  // 前端浏览器模块
  {
    files: ['src/**/*.js', 'data.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'module',
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
  // 后端与脚本(CommonJS;探针/测试里有 page.evaluate 浏览器代码,故同时放行浏览器全局)
  {
    files: ['server.js', 'lib/**/*.js', 'scripts/**/*.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'commonjs',
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
  // vite.config.js 是 ESM
  {
    files: ['vite.config.js'],
    languageOptions: { sourceType: 'module' },
  },
];
