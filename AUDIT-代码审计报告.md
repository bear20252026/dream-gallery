# 梦幻画廊·昆仑灵鉴 代码审计报告
> 2026-07-31 | 总计 63 文件 · 13,865 行

---

## 一、项目结构总览

### 前端 src/（33 文件 · 8,384 行）

| 模块 | 文件 | 行数 | 职责 |
|------|------|------|------|
| **入口** | main.js | 358 | 导入顺序/灯光/画质/动画循环/加载屏/协议配乐/性别选择/指纹 |
| **上下文** | ctx.js | 174 | 共享状态总线（107+ 属性，7 命名空间） |
| **热更新** | hot.js | 64 | HMR 管理器 |
| **场景** | scene.js | 637 | 场景/相机/渲染器/墙壁/地板/天空/灯光 |
| | desert.js | 678 | 西域沙海：地形/水面/飞鸟/沙暴/昼夜/罗盘 |
| | media.js | 638 | 音乐演奏器/视频墙/HLS/音频管理器/TTS |
| | player.js | 531 | 玩家移动/碰撞/跳跃/小地图/传送 |
| | effects.js | 148 | 烟花/漂浮粒子 |
| **画廊** | paintings.js | 551 | 挂画/白板墙/3D 放大/视频管理 |
| | links.js | 336 | 超链接/卷轴/花园/滚动古文 |
| | mode.js | 263 | 展示区模式/链接模型 |
| | signs.js | 147 | 户外牌子/白板/音乐入口 |
| | markers.js | 140 | 标记/地板照片 |
| **门禁** | settings.js | 482 | 昵称/天穹/聊天/灵蕴/选片/画质 |
| | quizgate.js | 449 | 入馆答题系统 |
| | upload.js | 336 | 访客上传/AI 配文 |
| | quiz.js | 230 | 温柔度测试 |
| | prologue.js | 227 | 冷启动序章 |
| | housecolor.js | 114 | 房屋换色 |
| **昆仑** | ark.js | 692 | 灵蕴飞舟/GLTF/航路/飞行/结界 |
| | eternal.js | 363 | 永恒展厅 |
| | spirits.js | 292 | 六合灵蕴收集 |
| | finale.js | 257 | 终章三件套 |
| | letgo.js | 244 | 放下与召回 |
| | snowwin.js | 155 | 飘雪之窗 |
| | fireplace.js | 153 | 暖色壁炉 |
| | resetview.js | 146 | 重置视角 |
| | peaks.js | 116 | 昆仑巅彩蛋 |
| | windchime.js | 98 | 风铃回响 |
| **其他** | overlay.js | 77 | 弹层管理 |
| | store.js | 98 | localStorage 存档 |
| | mediarules.mjs | 65 | 媒体可见性决策 |
| | main.css | 69 | 全局样式 |

### 后端 lib/（15 文件 · 2,437 行）

| 文件 | 行数 | 职责 |
|------|------|------|
| files.js | 465 | 静态文件/上传/删除/NSFW/压缩 |
| gate.js | 357 | 门禁/通行证/设备指纹 |
| quiz.js | 298 | 答题系统 |
| siteconfig.js | 215 | 站点配置 |
| track.js | 188 | 埋点 |
| store.js | 157 | 服务端存储 |
| admin.js | 147 | 后台管理 |
| aichannels.js | 121 | AI 通道 |
| abuse.js | 108 | 反刷 |
| tts.js | 94 | TTS 语音 |
| chat.js | 87 | 聊天室 |
| config.js | 72 | 全局配置 |
| docs.js | 72 | 文档编辑 |
| vision.js | 56 | Vision AI |
| util.js | 45 | 工具函数 |

---

## 二、问题清单

### P0 必须立即修复

| # | 问题 | 位置 | 风险 |
|---|------|------|------|
| 1 | SVG 上传可含脚本 | lib/files.js:145 | XSS |
| 2 | 分片组装全量读入内存 | lib/files.js:277-281 | OOM（700MB 视频） |
| 3 | e.message 未转义拼入 innerHTML | quizgate.js:268,358 | XSS |

### P1 高优先级

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 4 | **超大文件**（>500行） | ark.js(692) desert.js(678) scene.js(637) media.js(638) settings.js(482) | 难维护 |
| 5 | **全局变量泄露** | quiz.js 5个 window.* 函数 | 应迁入 ctx |
| 6 | **内存泄漏** | desert.js HUD/罗盘 DOM 无清理; media.js document 事件无清理 | 持续增长 |
| 7 | **性能** | desert.js 沙暴 200 粒子逐帧 getH | 手机帧率杀手 |

### P2 中优先级

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 8 | console.log 残留 | main.js:88,91,350 | 生产代码 |
| 9 | 重复代码 | Canvas 指纹(2处) rippleAt(2处) HUD弹窗(2处) 传送遮罩(2处) | 应合并 |
| 10 | 命名不一致 | ctx.js/scene.js/player.js 大量单字母变量 | 可读性差 |
| 11 | 错误处理缺失 | 多处 fetch 链 catch 不完整 | 静默吞错 |
| 12 | 小地图性能 | player.js 逐像素 getH 采样 | 频率过高 |

### P3 低优先级

| # | 问题 | 说明 |
|---|------|------|
| 13 | JSDoc 缺失 | 仅 ctx.js 有完整注释 |
| 14 | 测试覆盖不足 | 无自动化测试框架 |
| 15 | vendor 管理 | three.module.js 手动复制 |

---

## 三、架构优化建议

### 3.1 大文件拆分方案

**ark.js (692行) → 3 个文件：**
- `ark-model.js` — GLTF 加载/材质/动画
- `ark-flight.js` — 飞行物理/HUD/结界
- `ark-route.js` — 航路系统/荧光路线

**desert.js (678行) → 4 个文件：**
- `desert-terrain.js` — 区块地形/高度缓存
- `desert-sky.js` — 天空/昼夜/云团
- `desert-particles.js` — 飞鸟/沙暴/风行粒子
- `desert-hud.js` — 罗盘/HUD DOM

**media.js (638行) → 3 个文件：**
- `music-player.js` — 2D 音乐演奏器
- `video-wall.js` — 视频墙/HLS/切换
- `audio-manager.js` — 音频管理器/TTS

**settings.js (482行) → 4 个文件：**
- `nickname.js` — 昵称系统
- `sky-progress.js` — 天穹进度
- `chat-room.js` — 聊天室
- `spirit-page.js` — 六灵蕴页

### 3.2 消除重复代码

| 重复 | 建议 |
|------|------|
| Canvas 指纹 | 提取到 `shared/fingerprint.js` |
| rippleAt | 复用 paintings.js 中已有的函数 |
| HUD 大字弹窗 | 统一为 `ctx.ui.bigText()` |
| 传送遮罩 | 统一为 `shared/teleport-mask.js` |

### 3.3 性能优化

| 优化 | 预期效果 |
|------|----------|
| 沙暴粒子降频 getH（每 3 帧取一次） | CPU -30% |
| 小地图 getH 采样降低到 50x50 | CPU -80% |
| drawMusicCanvas 空闲时跳过（无触摸不绘制） | GPU -20% |
| desert.js 风行粒子用 InstancedBufferGeometry | 批量更新更快 |

### 3.4 安全加固

| 修复 | 方法 |
|------|------|
| SVG XSS | 移除 .svg 上传，或强制 CSP header |
| e.message XSS | 过 `escH()` 再拼入 innerHTML |
| 分片 OOM | 改用流式拼接（fs.createWriteStream + pipe） |
| 聊天输入 | 服务端二次校验 + 特殊字符过滤 |

---

## 四、代码质量评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ★★★★★ | 11 个核心模块全部上线，功能丰富 |
| 代码可维护性 | ★★☆☆☆ | 大文件多、命名混乱、职责混合 |
| 性能 | ★★★☆☆ | 桌面端流畅，手机端有优化空间 |
| 安全性 | ★★★☆☆ | 基础防护有，但 XSS 和 OOM 需修复 |
| 测试覆盖 | ★★☆☆☆ | 有门禁测试但无单元测试框架 |
| 文档 | ★★★☆☆ | 交接文档齐全，代码注释不足 |

**综合：3.0/5 — 功能优秀，工程化需加强**
