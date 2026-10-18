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
    // 同一个坑的**第三半**,这次治到源头:workers 数。上面两条只是把预算放大,而 vitest 默认按核数开
    // 18 个 worker ⇒ 主人机器上浏览器/webview 常驻几十个进程时,套件每次都去抢那点空闲,于是
    // "本地恒红、CI 绿"本档已记了四次(10-14 发布四次里两次、10-15 尾巴、10-17 预算批、10-17 这批)。
    // 收法:默认最多 8 个 worker,可用 `VITEST_MAX_THREADS` 抬回去 —— 想复现"18 workers 的原始争用形状"
    // 就 `VITEST_MAX_THREADS=18 npx vitest run`,这条能力刻意留着不锁死。
    // GitHub runner 只有 2 核(那边默认本来就 <8)⇒ **CI 行为一字不变**,变的只是本机。
    // 代价要说清:并发降低 ⇒ 由"多 worker 互相抢"暴露出来的判据漂移更难被撞见;
    // 所以这类判据的正确验法仍是**注入延迟**(见 AGENTS 2026-10-17「读数不再猜毫秒」那节的教训),不是加压复跑。
    poolOptions: {
      threads: { maxThreads: Number(process.env.VITEST_MAX_THREADS || 8) },
    },
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
