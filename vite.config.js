// vite.config.js — Vite 配置:开发服务器(HMR)+ 生产构建
// 开发: npm run dev   → http://localhost:5173 热更新;API/媒体代理到 :3000 后端
// 构建: npm run build → dist/(全部 html 入口 + assets/* hash 分包),部署 dist 全部 + 后端
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { createHtmlPlugin } from 'vite-plugin-html';
import fs from 'fs';
import { minify as terserMinify } from 'terser';

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
        .map((f) => '<link rel="prefetch" as="script" href="/' + f + '">')
        .join('');
      const htmlPath = resolve(__dirname, 'dist/index.html');
      let html = fs.readFileSync(htmlPath, 'utf8');
      if (html.includes('core-preload-injected')) return;
      html = html.replace('</head>', links + '<!-- core-preload-injected --></head>');
      fs.writeFileSync(htmlPath, html);
      console.log('[core-preload] 已注入 ' + files.size + ' 个 prefetch');
    } catch (e) {
      console.warn('[core-preload] 注入失败(不影响产物可用性,串行链照常工作):', e.message);
    }
  },
});

export default defineConfig({
  root: '.',
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
    target: 'es2020',
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
