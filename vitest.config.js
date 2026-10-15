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
    // 同一个坑的第二半:2026-10-14 早上我只修了 testTimeout,于是发布脚本第 3 步当场红在
    // `Hook timed out in 10000ms`(scene-manager-rollback.test.js:105 的 beforeAll 里 dynamic import
    // 整条场景图)。⇒ 钩子有**自己**的超时,默认 10s,与 testTimeout 互不相干;84 个文件并发 transform
    // 时那 10s 根本不够。真挂死的 setup 照样会红,只是晚 10s。
    hookTimeout: 20000,
    // 开跑前收走**自己**留在 %TEMP% 的旧 `dg-*` 数据根(按 mtime 只收 6 小时前的,免得抢掉并发跑的目录)。
    // 起因:Windows 上 afterAll 的 rmSync 删得掉文件删不掉目录(SQLite 句柄要等 process.on('exit') 才放),
    // 本机实测攒了 2063 个空目录。细节与判据见 src/__tests__/global-setup.mjs。
    globalSetup: ['./src/__tests__/global-setup.mjs'],
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
