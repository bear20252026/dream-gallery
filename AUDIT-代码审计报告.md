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

---

## 五、整改终验（2026-11-16 · 全量门禁复跑）

> 本章为原审计（2026-07-31）之后历轮整改的收口记录。原评分保留作历史基线，不回填改写。

### 门禁实测（main @ f760d28，本机全量复跑）

| 门禁 | 结果 |
|------|------|
| `npm run lint`（eslint 全仓） | ✅ 0 错 0 警 |
| `npm run typecheck`（tsc --noEmit） | ✅ 0 错 |
| checkJs 分层（tsconfig.checkjs.json，CI 同口径） | ✅ 2 条 = 基线 2（admin-content 2 条为 dom-typed-sites 点名唯一例外，见该文件注释） |
| 前端单测（vitest） | ✅ 121 文件 / 1408 项全过 |
| 后端回归 `npm test`（store/sqlite/backup/主回归/session/upload-security/mobile） | ✅ 全过（含 iPhone 12 仿真移动冒烟 6/6） |
| `npm run build` | ✅ 入口静态图不含 three；33 个文本资源预压缩 15.4MB→3.8MB；dist 无 importmap 裸依赖 |

### 原问题清单的落地对照（摘要）

- **P1/P2 高危**：密钥后端代理、model XSS、collect 限流 → 已修（PR 链见 git log，2026-11 上旬）。
- **P3 九项 + 挂账 C2/C7-②/C9-2/CI 覆盖** → 已修；移动冒烟从"注释声称覆盖"补成 CI 真跑。
- **工程化短板（原评分 ★★ 项）**：Vitest 1408 项单测 + 守卫测试族（ctx 漂移/写入方约定/名单钉死/入口权重/z 层）；5 个巨型文件拆分；空 catch 分级治理；localStorage 直连收口；构建可复现（哈希漂移根因已修）。
- **checkJs 类型债**：145 → 116 → 75 → 13 → **2**（本轮清掉 koi-ship 11 条；剩 2 条为测试点名刻意例外，基线同步下压，CI 超基线即阻断）。
- **R1~R8 重构挂账**：方案与验收判据见 `REFACTOR-PLAN-审计挂账项.md`；其中安全相关部分已实施，破坏性翻转点（R1 写路径切换等）仍留待主人拍板，未擅动。

### 叙事与内容侧新增（审计范围外，一并记录）

- 世界观收口为《小王子》单线；永恒展厅→星光宫殿（PR #61/#62）；粒子白方块修复（#63）。
- 锦鲤飞船「云海之鲤」飞行氛围与原作品一致（#66）；出生点移出锦鲤包络（#71）。
- 四个外部 voxel 场景（B612/狐狸麦田/玫瑰园/云海之鲤）以「星之旅程」四幕挂上故事线节拍（#67~#70、#72 星门试验、#73 改挂剧情触发）；第一幕内嵌可玩「B612 的一天」（#74），成绩进同一存档。
- 组件源包已上传 GitHub Release `voxel-scenes-2026-11-15` 附件。

**终验结论：全量门禁绿；遗留项仅剩 R 系破坏性翻转点（须主人拍板）与 admin 2 条点名类型例外。**

---

## 六、第二轮全面审计（2026-11-16 · 覆盖 PR#54~#78 新增面）

> 范围：R1 只读切换（hotread/repo）、R4 视频待审队列、星之旅程四幕、锦鲤飞行/宫殿/粒子、public/voxel 内嵌场景、B612 小游戏。
> 方法：三路并行专项（后端安全 / 前端质量 / 测试覆盖）+ 全量门禁复跑 + 实机验收。

### 门禁基线（复跑实测）

| 门禁 | 结果 |
|------|------|
| eslint 全仓 | ✅ 0 错 0 警 |
| tsc --noEmit | ✅ 0 错 |
| checkJs（CI 口径） | ✅ 2 = 基线（admin 2 条点名例外） |
| vitest | ✅ 122 文件 / **1426** 项（本轮 +5 钉） |
| 后端 npm test | ✅ 113 + 46 + 20 + 6 全过 |
| dependency-cruiser | ✅ 无环 |
| npm audit --omit=dev | ✅ 0 漏洞 |
| build | ✅ 入口不含 three；预压缩 15.4MB→3.8MB；dist 无裸 importmap |

### 发现与处置（1 P1 + 5 P2 + 若干 P3，全部已修，PR #79）

| 级 | 问题 | 修法 | 验证 |
|----|------|------|------|
| **P1** | applyEnv 异步竞态：登机后立刻下机（E→Esc），else 先于 true 的 await 到达 ⇒ 背景/雾置 undefined、沙漠永久消失 | 世代闸 envGen + envApplied；await 回来世代已变即作废；else 只在真存过值时还原 | 代码审查 + 既有飞行探针 |
| **P2-1** | reject×压缩竞态：被拒视频经压缩收工 renameSync 复活，doMirror 在"无记录"时放行 ⇒ 被拒内容 PUT 进公开 CDN | doMirror 改 fail-closed（无记录/pending 一律不镜像）；落产物前复查原记录仍在，被拒丢弃产物；reject 改同步删+先删记录 | 实机：reject 后文件确删 |
| **P2-2** | confirm* 基线缺陷：COUNT 瞬时抛错返 -1，恢复后 count>-1 恒真 ⇒ 未落表也跳 save，重启丢数据 | 五个 confirm* 加 `before>=0` 守卫 | 新增 2 条单测钉住 |
| **P2-3** | 重启+回退一致性：热写免落盘 ⇒ 快照滞后；重启后 loadGateData 只读快照，真表新行从不归并 ⇒ HOT_READ=0/disable 时读旧、stats 丢计数 | mergeTablesIntoArrays 幂等并集归并；启动归并+落盘、disable 经注入钩子归并、优雅关闭 saveGateDataSync | 实机：重启后聊天 3 条全在；新增 3 条归并单测 |
| **P2** | 飞行中拆场不还原环境（dispose 只清 flightLock） | dispose 内 driving 先 applyEnv(false) 再释放 | 代码审查 |
| **P2** | koi dispose 不释放贴图（CanvasTexture 泄显存） | 遍历 material.map 等贴图槽一并 dispose，共享去重 | 代码审查 |
| **P2** | busy() 漏开场电影 b612film（不走 overlay.register）⇒ 淡出窗口自动开幕盖电影 | busy 补查 b612film | 代码审查 |
| **P2** | koi.html 移动端 canvas 缺 touch-action ⇒ 轨道拖拽被手势打断 | 补 touch-action:none | 代码审查 |
| P3 | approve 原型污染（name='__proto__'）；非待审记录可被批准；补镜像静默漏推 | hasOwnProperty；无 videoReview 拒；漏推记台账 enqueuePut | 实机：__proto__ 返 404 未污染 |
| P3 | 结算消息闭幕窗口期仍收、score 无上限；postMessage '*'；quiet 隐藏失效；裸 z-index；dispose 未置空 iframe | 状态闸+钳位 ≤1e6；targetOrigin 同源；visibilitychange 重置 quiet；删裸值；先置空 | 代码审查 |

### 确认安全（OK 项摘要）

- 路径穿越：safeJoin 前缀比较 + name 白名单 + dir 服务端写死，approve/reject 不可逃逸上传目录。
- 鉴权：approve/reject 与其他 bulk 同级（路由 auth:'token' + tokenOk 双保险）；未配 TOKEN 时 sameToken 恒 false ⇒ 本机也 401，fail-closed。
- pending 公开出口：墙面列表/直链/缩略图/R2/SSE/大屏全挡（mediarules pending 短路优先于 mt/isMine）；202 不广播不镜像。
- SQL 全参数化；请求体白名单裁剪，无原型污染 spread；新增正则线性；无新增未限流公开端点。
- postMessage 伪造：e.source===frame.contentWindow 不可由外部窗口冒充，跨源 origin 不符，无绕过面。
- 旧存档兼容：readDone 对缺 gameBest/gameWins 回退 0，三字段合写不丢 done。
- XSS：renderCap 全 textContent，innerHTML 仅静态模板。
- 入口门禁：voyage-scenes 零 three 静态依赖；public/voxel 按需加载不进入口。

### 测试覆盖缺口（已补关键项，其余列为后续）

- **已补**：confirm 负值守卫（2 条）、归并幂等并集（3 条）→ lib-hot-read.test.js 13→18。
- **后续建议**（约 40 条，非阻断）：approve/reject 的镜像/广播 mock 断言、分片视频待审、尾巴 B 非公开名待审、启动对账子进程用例、voyage-scenes 单测（storyTick/quiet/postMessage 校验/gameMode/存档往返，约 10 条）、koi applyEnv 对称性（3 条）、palace-art 纯函数（4 条）、通关探针扩四幕放映断言。

**第二轮终验结论：1 P1 + 5 P2 全部修复并实机验收 PASS；全量门禁绿（1426 单测 / 后端 185 项 / 0 漏洞）。遗留为测试覆盖补全（非阻断）与 admin 2 条点名类型例外。**
