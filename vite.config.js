// vite.config.js — Vite 配置:开发服务器(HMR)+ 生产构建
// 开发: npm run dev   → http://localhost:5173 热更新;API/媒体代理到 :3000 后端
// 构建: npm run build → dist/(全部 html 入口 + assets/* hash 分包),部署 dist 全部 + 后端
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  // 路径别名:@/ → src/(模块内可用,如 import {ctx} from '@/ctx.js')
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: {
    outDir: 'dist',
    // 2026-07-26 安全:不出 sourcemap——.map 能被任何人还原全部源码
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      // 多页应用:主展厅 + 各子页统一走构建(压缩/minify;产物仍在 dist 根,部署路径不变)
      input: {
        main:       resolve(__dirname, 'index.html'),
        admin:      resolve(__dirname, 'admin.html'),
        guide:      resolve(__dirname, 'guide.html'),
        whiteboard: resolve(__dirname, 'whiteboard.html'),
        music:      resolve(__dirname, 'music.html'),
        agreement:  resolve(__dirname, 'agreement.html'),
        privacy:    resolve(__dirname, 'privacy.html'),
        community:  resolve(__dirname, 'community.html'),
      },
      output: {
        // three.js 单独成块:业务代码更新时第三方库哈希不变,浏览器长期缓存(弱网关键)
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
    // 生产移除 debugger;保留 console.error(页面错误显示依赖)
    terserOptions: { compress: { drop_debugger: true, pure_funcs: ['console.log'] } },
  },
  server: {
    port: 5173,
    // 预热高频大文件:启动即编译,避免首次请求瀑布延迟
    warmup: { clientFiles: ['./src/main.js', './src/scene/scene.js'] },
    proxy: {
      // 后端 API 与媒体全部代理到零依赖 Node 服务器
      '/api': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/admin-media': 'http://localhost:3000',
      '/photos': 'http://localhost:3000',
      '/videos': 'http://localhost:3000',
      '/music': 'http://localhost:3000',
    },
  },
});
