# 液态玻璃透明 Overlay 接入（方案 B）

## 来源与许可
- `martin65536/liquid-glass-webgl`（Kyant/AndroidLiquidGlass 的 WebGL1 移植，Z.ai Agent 生成），**Apache-2.0**。
- 已 vendor 框架无关核心到 `src/liquid-glass/`（renderer/ + shaders/，纯 TS，无 React 依赖），保留 LICENSE + NOTICE（署名 Kyant / martin65536 / Z.ai）。

## 架构（方案 B：透明覆盖层，不动任何现有 z-index）
- 渲染器加 `transparent` 模式：构造 `alpha:true`；`render()` 背景 fboA 清透明（不画不透明 wallpaper），最终 default fb 清透明再 `drawCopy`（copy 着色器透传 alpha）。
- 玻璃元素用 `sampleWallpaper:true` → 折射来源 = wallpaper（实时 3D 场景），而非透明的 scene FBO。
- 加 `setBackdropCanvas` / `updateBackdrop`：每帧 `texImage2D` 把 Three.js 画布喂进 `wallpaperTexture`。
- 透明 overlay canvas 放 **z-index:5**：Three 画布(z1) 之上、游戏 HUD(z10+) 之下。透明处露出底层 3D 场景和 HUD，玻璃面板处折射 3D 场景。**无需抬升任何现有 z-index**（方案 B 优于方案 A 的关键）。

## 宿主 `src/liquid-glass/host.js`（vanilla）
- `initLiquidGlass(ctx)`：门禁 `innerWidth>=768 && !lowQuality`（移动端跳过 → test-mobile 6/0 不受影响）。
- rAF：每帧 `updateBackdrop()` + 扫 `.lg-glass` DOM 面板 `getBoundingClientRect` → `glass-shape`（sampleWallpaper）→ `setElements` → `render()`。
- 试点：`#gearPanel`（设置下拉）加 `.lg-glass`；CSS `body.lg-on .lg-glass{background:transparent!important;...}`。
- main.js 门禁后 `import('./liquid-glass/host.js')` 懒加载（host 独立 chunk 185KB，移动端不加载）。

## 质量与部署
- 构建：90 模块，`✓ built in 5.44s`，host 独立 chunk 185KB。
- 测试门禁：`test.js` **127/0**、`test-mobile.js` **6/0** 全绿。
- 部署：仅前端 `dist/`（无后端改动，**不重启 pm2**）。
- 公网探针 `debug-browser.js https://cloudbear.cloud/ 18`：**零 PAGE_ERROR**（404/视频 ERR_ABORTED 均为旧有，与本次无关）。

## 待用户验证
桌面端打开 `cloudbear.cloud`，左上角昆仑罗盘点开「设置」面板——它现在是液态玻璃，会折射背后的 3D 场景（G2 圆角、色差折射、边缘高光）。截图见 `debug-final.png`。

## 后续（任务 #35）
扩展到：永恒展厅西墙画框玻璃面片、收集灵蕴卡片、全局 `.luxury-glass` CSS 玻璃替换为液态玻璃覆盖层。每步过测试门禁 + 走 D4 画质开关 + 移动端 DPR 上限。

## 待办
GitHub push 经生产服务器 SOCKS 代理偶发 TLS EOF，正在重试；代码已本地提交，线上已部署验证。
