import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.js'],
    environment: 'node',
    globals: true,
    // 默认 5000ms 对这套用例太紧:①压缩队列/清扫队列的冷却(1s)与"等旧任务安静收工"是**按墙钟设计**的,
    // lib-upload-overwrite 里最长那条本身就要 ~4.5s;②本机跑套件时常与探针/浏览器进程抢 CPU。
    // 2026-10-14 实测:同一份代码单跑 3 个文件全绿,和 npm test 串在一条电池里跑就飘 2 条超时。
    // 真挂死的用例照样在 20s 后红,只是不再拿"机器忙"当"代码坏"。
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.js'],
      exclude: ['src/__tests__/**', 'src/**/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
