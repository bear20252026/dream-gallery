// vite.config.js — Vite 配置:开发服务器(HMR)+ 生产构建
// 开发: npm run dev   → http://localhost:5173 热更新;API/媒体代理到 :3000 后端
// 构建: npm run build → dist/(全部 html 入口 + assets/* hash 分包),部署 dist 全部 + 后端
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { createHtmlPlugin } from 'vite-plugin-html';
import fs from 'fs';
import { minify as terserMinify } from 'terser';
import { execSync } from 'child_process';

// 版本戳(2026-10-03 主人要「版本号自动更新」):每次构建从 git 读出
//   版本号 v1.<提交总数>(每发布一次 +1)、短哈希、提交日期;闸门底行「Updated … · v1.N」显示。
// release.sh 先提交再由 deploy.sh 构建,所以线上显示的就是这次发布的那个提交。
function buildStamp() {
  const git = (cmd) => execSync('git ' + cmd, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    return { n: Number(git('rev-list --count HEAD')), hash: git('rev-parse --short HEAD'), date: git('log -1 --format=%cs') };
  } catch (e) {
    return { n: 0, hash: '', date: new Date().toISOString().slice(0, 10) };
  }
}

// 构建钩子:压缩 public/sw.js,产物覆盖到 dist/sw.js(源文件不变,部署用压缩版)
const minifySw = () => ({
  name: 'minify-sw',
  buildStart() {
    const src = resolve(__dirname, 'public/sw.js');
    if (!fs.existsSync(src)) return;
    const code = fs.readFileSync(src, 'utf8');
    return terserMinify(code, { compress: { drop_debugger: true, passes: 2 }, mangle: { toplevel: true }, output: { comments: false } })
      .then(out => fs.writeFileSync(resolve(__dirname, 'public/sw.min.js'), out.code));
  },
  writeBundle() {
    // Vite 复制 public/* 后,用压缩版覆盖 dist/sw.js
    const min = resolve(__dirname, 'public/sw.min.js');
    if (fs.existsSync(min)) fs.copyFileSync(min, resolve(__dirname, 'dist/sw.js'));
  },
});

// 核心链预热注入(2026-09-25 加速):解析 world-loader.js 核心链 import 列表,
// 经 dist/.vite/manifest.json 换算真实哈希 chunk 名,在 index.html 头部注入
// <link rel="prefetch"> 低优先级预热——26 次串行 import() 瀑布(26×RTT)在电影期
// 预加载时塌缩为缓存命中。⚠️ 首版用 modulepreload 实测 HTML 解析期抢占关键路径,
// 闸门出现 5.4s→14.5s,故改 prefetch(页面 load 后才取,不挡首屏;chunk immutable
// 缓存一年,import() 链照样秒中缓存)。执行顺序仍由串行 import 链保证(顺序即依赖不破)。
const corePreloadInject = () => ({
  name: 'core-preload-inject',
  closeBundle() {
    try {
      const wl = fs.readFileSync(resolve(__dirname, 'src/core/world-loader.js'), 'utf8');
      const coreBlock = wl.slice(wl.indexOf('WORLD_MODULES = ['), wl.indexOf('WORLD_MODULES_DEFERRED'));
      const rels = [...coreBlock.matchAll(/\('\.\.\/(.+?)'\)/g)].map((m) => 'src/' + m[1]);
      if (!rels.length) return console.warn('[core-preload] 未解析到核心链模块,跳过注入');
      const manifest = JSON.parse(fs.readFileSync(resolve(__dirname, 'dist/.vite/manifest.json'), 'utf8'));
      const files = new Set();
      const walk = (key) => {
        const e = manifest[key];
        if (!e || files.has(e.file)) return;
        files.add(e.file);
        (e.imports || []).forEach(walk);
      };
      rels.forEach((k) => walk(k));
      if (!files.size) return console.warn('[core-preload] manifest 无匹配 chunk,跳过注入');
      const links = [...files]
        // ⚠️ 必须带 crossorigin:这些 chunk 稍后是被 `import()` 取的,模块请求走 CORS 模式;
        //   而 `<link rel=prefetch as=script>` **不带 crossorigin 时走 no-cors**。两种模式在浏览器缓存里
        //   是**两个不同的键**,加上本站静态响应带 `Vary: Origin`(ACAO 随 Origin 变),预取与真实导入
        //   永远互不命中 ⇒ 同一份 chunk 下两遍。本地用"像线上一样发 Vary: Origin"的静态服实测复现:
        //   43 条 prefetch 全部无 crossorigin 时,5 个 chunk 二次入网(three 874KB×2、main 343KB×2,
        //   首访多下 1224KB;线上 gzip 后实测 three 231KB×2、main 126KB×2)。带上就命中同一键。
        .map((f) => '<link rel="prefetch" as="script" crossorigin href="/' + f + '">')
        .join('');
      const htmlPath = resolve(__dirname, 'dist/index.html');
      let html = fs.readFileSync(htmlPath, 'utf8');
      if (!html.includes('core-preload-injected')) {
        html = html.replace('</head>', links + '<!-- core-preload-injected --></head>');
        fs.writeFileSync(htmlPath, html);
      }
      console.log('[core-preload] 已注入 ' + files.size + ' 个 prefetch');
    } catch (e) {
      // 环境性失败(读不到 world-loader / manifest)可以降级继续:串行 import 链本身照样工作。
      console.warn('[core-preload] 注入失败(不影响产物可用性,串行链照常工作):', e.message);
    }
    // ⚠️ 这条自检**必须写在 try/catch 外面**:第一版写在 try 里,被上面那句"注入失败不阻断"的 catch
    //   吞成一行 WARN ⇒ 构建照绿,等于又造了一个"恒开的告警 = 没有告警"(本仓库同类事故已记好几次:
    //   `cmd | tail` 的 $? 属于 tail、空远端清单被差集判成"一致")。两类失败性质不同:
    //   解析不到 manifest = 可降级;我们自己模板里丢了 crossorigin = 编程错误,必须打断构建。
    //   计数直接读**产物文件**,所以"本次没注入(已含标记)"的历史产物也会被一并核到。
    const out = fs.readFileSync(resolve(__dirname, 'dist/index.html'), 'utf8');
    const injected = (out.match(/<link rel="prefetch"/g) || []).length;
    const withCors = (out.match(/<link rel="prefetch"[^>]*crossorigin/g) || []).length;
    if (injected && withCors !== injected) {
      throw new Error(
        '[core-preload] ' + injected + ' 条 prefetch 里只有 ' + withCors + ' 条带 crossorigin:' +
        ' 模块请求走 CORS 模式,预取不带 crossorigin 就是另一个缓存键 ⇒ 同一份 chunk 下载两遍' +
        '(本地带 Vary: Origin 的静态服实测:three 874KB×2、main 343KB×2,首访多下 1224KB)。' +
        ' 要改注入模板请连这条自检一起改。'
      );
    }
  },
});

export default defineConfig({
  root: '.',
  define: { __B612_BUILD__: JSON.stringify(buildStamp()) },
  // 路径别名:@/ → src/(模块内可用,如 import {ctx} from '@/ctx.js')
  resolve: { alias: {
    '@': resolve(__dirname, 'src'),
    // Three.js 加载器(不存在于 node_modules,指向 vendor)
    'three/examples/jsm/loaders/FBXLoader.js': resolve(__dirname, 'vendor/examples/jsm/loaders/FBXLoader.js'),
    'three/examples/jsm/libs/fflate.module.js': resolve(__dirname, 'vendor/examples/jsm/libs/fflate.module.js'),
    'three/examples/jsm/curves/NURBSCurve.js': resolve(__dirname, 'vendor/examples/jsm/curves/NURBSCurve.js'),
  } },
  plugins: [
    minifySw(),
    corePreloadInject(),
    // HTML 压缩保护:去除注释、空白、多余换行
    createHtmlPlugin({ minify: true }),
  ],
  build: {
    outDir: 'dist',
    // 安全:不出 sourcemap
    sourcemap: false,
    // 产物清单(core-preload-inject 用来把核心链源路径换算成哈希 chunk 文件名)
    manifest: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main:       resolve(__dirname, 'index.html'),
        admin:      resolve(__dirname, 'admin.html'),
        guide:      resolve(__dirname, 'guide.html'),
        whiteboard: resolve(__dirname, 'whiteboard.html'),
        music:      resolve(__dirname, 'music.html'),
        agreement:  resolve(__dirname, 'agreement.html'),
        privacy:    resolve(__dirname, 'privacy.html'),
        community:  resolve(__dirname, 'community.html'),
        lobby:      resolve(__dirname, 'lobby.html'),
        room:       resolve(__dirname, 'room.html'),
      },
      // 分包:three.js 独立(browser 缓存 600KB,永不重复下载);业务代码 ~280KB 单独变
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
      // 2026-08-31 修复:默认 tree-shake 把仅有副作用导入的模块(如 museum.js)删除,
      // 显式标记所有 src/* 模块为有副作用,确保 hotBegin/portals.push 等一定被打包
      treeshake: {
        moduleSideEffects(id) {
          if (id.includes('/src/')) return true;
          return false;
        },
      },
    },
    // JS 强混淆:顶层变量名随机化、2 轮压缩、剥离所有注释和 console.log
    terserOptions: {
      compress: {
        drop_debugger: true,
        pure_funcs: ['console.log'],
        passes: 2,
      },
      mangle: {
        toplevel: true,
      },
      output: {
        comments: false,
      },
    },
  },
  server: {
    port: 5173,
    warmup: { clientFiles: ['./src/main.js', './src/scene/scene.js'] },
    proxy: {
      '/api': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/admin-media': 'http://localhost:3000',
      '/photos': 'http://localhost:3000',
      '/videos': 'http://localhost:3000',
      '/music': 'http://localhost:3000',
    },
  },
});
