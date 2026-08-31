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
    // HTML 压缩保护:去除注释、空白、多余换行
    createHtmlPlugin({ minify: true }),
  ],
  build: {
    outDir: 'dist',
    // 安全:不出 sourcemap
    sourcemap: false,
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
