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

---

## 七、第三轮架构健康审计（2026-11-16 · 正常性 / 优化 / 屎山评估）

> 视角切换：前两轮查"对不对"（安全/质量），本轮查"健不健康"。方法：本机量化指标 + 全量门禁 + 三路架构专项（后端分层 / 前端模块图 / 优化与死代码）。结论不粉饰。

### 7.1 代码是否正常？——是，全量门禁绿（实测）

| 门禁 | 结果 |
|------|------|
| eslint / tsc --noEmit | ✅ 0 错 |
| checkJs | ✅ 2 = 基线 |
| vitest | ✅ 122 文件 / 1426 项 |
| 后端 npm test | ✅ 113 + 46 + 20 + 6 |
| dependency-cruiser | ✅ 无环 |
| npm audit --omit=dev | ✅ 0 漏洞 |

**正常 ≠ 健康。** 门禁绿证明"没有坏"，不证明"长得好"。下面是结构判断。

### 7.2 量化体检（本机实测）

- 规模：src 243 文件 / 52,762 行；lib 52 文件 / 10,035 行；测试 143 文件 / 26,205 行（**测试/生产比 ≈ 0.42，偏高，是好事**）。641 次提交。
- 巨型文件 TOP：`koi-ship.js` **2542 行**、`story-text.mjs` 1617（纯数据）、`eternal.js` 1023、`openfilm.js` 889、`ark.js` 870、`store.js` 575。
- **ctx 上帝总线**：约 **170 个登记属性**，7 个 ctx-*.js 分片共享同一个 vault；**92 个模块 import ctx，51 个文件直写深层属性**；types/ctx.d.ts 825 行。
- **gateData 上帝对象**：单内存对象承载 **29 种集合**；`saveGateData(` 在 lib 内 **76 处 / 20 个文件**。
- 腐化味计数：函数内懒 require **33 处**（断环遮羞布，files-upload.js 独占 15）；空 catch **157 处**；环境开关 **50 个**；重复定义 clamp×8 / lerp×7 / 限流×9 / escapeHtml×4；注释掉的代码 286 行。
- 体积：public/voxel 五页 **8.0MB**（每页内联一份 three，重复 ≈3MB raw / ≈920KB gz）；dist 57MB；node_modules 294MB + hill-src 116MB；**.tmp 114MB / 650 文件**（我历轮探针残留）；AGENTS.md **524KB / 2740 行**。

### 7.3 是否屎山？——**不是失控的屎山，是"有纪律的泥球"，停在半山腰，斜率危险**

屎山的判据是"依赖失控、无人能解释、改动不可预测"。本项目**三条全不成立**：

**结构良好（真实运转的治理层，有证据）：**
- 依赖方向单向 + 硬闸：repo/_db、migrate 是纯叶子；dependency-cruiser no-circular=error 真在拦。
- 反向依赖用**参数注入**而非懒 require 遮丑：shadow.start(g)、hotread.setDisableHook、backfillFileErrors(list) 是真 DI。
- 组合根是真的：composition-root 二次 init 拒绝 / failed 不 update / 逆序 dispose；main.js 集中 register 24 系统。
- 启动真后置：three 7 条静态边改动态，闸门期不付 3D 字节；入口 102.8KB gz 不含 three（构建期硬断言）。
- 漂移测试钉"声明指向写入方真实形状"，曾消 48 条假报错——是防腐不是焊死。
- 错误处理分级：saveGateData 永不 reject 折成结论对象（防 85 处即发即忘被 unhandledRejection 杀进程）。
- 每处怪癖有审计编号 + 日期 + 为什么不能改的注释，可追溯。

**真正的腐化信号（按严重度）：**
1. **迁移脚手架永久化（最危险）**：shadow / hotread / 归并 / 对账 / 回退本应是 R1 的**临时双轨**，如今开关、钩子、私有接口注入（生产调 `ce._getErrorList/_setErrorList`）全成了常驻承重结构。五套持久化并存（内存 gateData + kv 快照 + JSON 镜像 + 四真表 + client_errors.json + R2 台账），权威源靠运行时 _savedAt 仲裁。**再不拆脚手架，两年后就是屎山。**
2. **两个上帝对象**：ctx（170 属性 / 51 写方文件，分片是切碎不是拆，存储与耦合面一点没减）+ gateData（29 集合 / 76 处写调用共享一个序列化瓶颈）。store.js 575 行身兼 ≥7 职责（持久化 + UA 解析 + CF 网段信任 + 会话 + 配额 + 统计）。
3. **koi-ship.js 2542 行十项全能**：噪声/Vox/地形/鲤体/庭园/水/生态/天空灯光/云/氛围接管全在一文件，该拆。
4. **重复造轮子**：两套挂画同步（eternal/paintings 各 45s 轮询同一 /api/files）、两套放映（openfilm 自建渲染器 vs voyage iframe）、限流 9 套、clamp/lerp/escapeHtml 各抄多份、氛围 setAtmosphere 三处直调无仲裁（后写覆盖）。
5. **守卫把缺陷焊死**：_db.js TEXT 亲和 bug 因迁移校验和不可改，永远在读侧打补丁——测试钉住了缺陷本身。
6. **名义分层**：defineSystem 只排序不约束依赖，18 系统 11 个挤 presentation/ui，约 45 处 onTick 绕过系统体系直挂总线；mount 式 UI 裸注册不接句柄（player.js 23 add/0 remove）。

**结论**：核心是上帝总线 + 巨型文件 + 名义分层（符合屎山特征），但组合根 / 登记册 / 漂移测试 / 搁置机制 / HMR 捕获清理构成**真实运转的治理层**，每处腐化都被审计看见并部分偿还。这是"带着有效治理外骨骼的大泥球"，不是无人认领的屎山。**最大风险不是现状而是斜率**：ctx 属性与 onTick 绕过系统的数量仍在涨。

### 7.4 是否优化？——**已优化过大半（3.5/5），剩余收益集中三处**

**已做对（有实测断言护航）**：入口不含 three（102.8KB gz）；预压缩 33/33 全覆盖 + 构建期断言；热写免落盘；合并几何单 draw call + InstancedMesh；pixelRatio 上限 2 + 自适应 5 档；dispose 63 处 / 27 文件 + 贴图 8 槽去重；retention 原地裁剪保引用；烟花世界门控；10 个表索引；写盘串行队列不吞错。

**真正的缺口（按收益）**：
1. **voxel 五份重复 three**：8MB 里 ≈3MB raw / ≈920KB gz 是重复的 three。共享一份（importmap + 单本地 three.module.js）可省 ≈920KB gz + 跨页缓存 229KB/页。
2. **冷路径整库序列化**：76 处 saveGateData 每次 2 次全量 stringify + 同步 fs。当前快照 305B 可忽略，但 4MB 时 ≈38ms/次阻塞 + WAL 膨胀（已 3.9MB vs db 92KB）。增量化 + debounce 是治本。
3. **后台空转与泄漏面**：烟花无 document.hidden 闸（≈3 万粒/h 空攒）；头部文件 91 add/1 remove（世界切换闭包累积风险）；每帧小分配（loop:frame 对象 / 鹤 v3 clone）。
4. 无 .br（three 229KB gz 上再省 ≈40KB）；@aws-sdk/client-s3 仅 scripts 用可移 devDependencies；.tmp 114MB / hill-src 116MB 可回收 ≈234MB。

### 7.5 最高杠杆重构清单（分级，待主人拍板）

**A. 低风险高收益（可立即做，不破坏契约）**
1. voxel 共享 three：省 ≈920KB gz，需同步 voyage-scenes 路径回退。1~2 人日。
2. 烟花 document.hidden 闸 + 热点监听器 AbortController 统一摘除 + 每帧对象复用。≈1 人日，逐项可回滚。
3. 收敛横切原语：一个限流器 / 一个裁剪入口 / clamp/lerp/escapeHtml 归一；client_errors.json 改 tmp+rename 原子写。
4. 清理 .tmp / hill-src 残留与死代码（保守 350~900 行）。

**B. 中风险结构性（需设计 + 守卫测试护航）**
5. **完成 R1 并拆双轨**：真表定为四热集合唯一权威，删 gateData 镜像数组 / kv 整库承载 / merge / 对账 / SHADOW_WRITE / HOT_READ 矩阵；saveGateData 退化为低频集合专用。一刀消掉腐化信号 1 的大半。
6. **拆 koi-ship** 为 vox-core / koi-model / garden / sky-light，vox-core 下沉 shared，氛围写权交 light-mood 仲裁。
7. 合并挂画同步为一条数据管道（一个轮询 + SSE 源，eternal/paintings 订阅同一事件）。

**C. 高风险治本（须主人明确批准，动承重墙）**
8. **ctx 按所有权真拆**：先收编 3 个多写属性（dayTimeSource/groundOverride/eternalHandlers）给单一 owner，跨域改事件 + 只读接口，新属性一律拒登记。把 170 属性隐式耦合降为显式接口。
9. **按域拆 gateData + 收敛鉴权簇**：身份/会话、上传归属、站点配置、统计各自成模块；UA 解析与 realIP 迁出 store.js；admin/gate/siteconfig/security 合成单一 authz 模块，36 处懒 require 减到个位数。
10. saveGateData 增量化 + debounce + flush-on-exit。

**第三轮终验结论：代码正常（门禁全绿）；优化已做大半（3.5/5）；架构不是失控屎山而是"有纪律的泥球"（后端 3/5、前端 3/5），真正的病是迁移脚手架永久化 + 两个上帝对象，斜率危险。A 级可立即做，B/C 级动承重墙须主人拍板。**

---

## 八、A+B 级重构执行成果（2026-11-17 · 主人批准"先A后B"，PR #82）

> 分支 `refactor/a-b-arch-2026-11-17`，6 提交，净删 ≈500 行重复/矩阵代码。每项独立验证、可回滚。

### A 级（低风险，已完成）
- **A1 voxel 共享 three 去重**：五页 8.0MB→1.16MB（HTML 309KB + 共享 three 852KB minified）。源入库 `voxel-src/`（消除仓库外工作区依赖）；`scripts/gen/sync-voxel-three.js`（核心2+addons闭包15文件，仅minify不bundle）+ `bundle-voxel.cjs`（esm+external+相对importmap兼容双base）；`package.json` 增 `gen:voxel`。五页真浏览器验收 PASS（canvas渲染/0错误/0 404），锦鲤截图实证完整渲染；repro 逐字节一致。
- **A2 烟花后台闸+每帧复用**：`document.hidden` 并入烟花产房门控（省≈3万粒/h空攒）；`loop:frame` payload 复用（零订阅事件）；鹤 updater 复用两闭包向量（省600个/秒）。
- **A3 client_errors.json 原子写**：tmp+rename（与 gate_data 同口径），杜绝半截文件丢报错史。
- **A4 清理**：.tmp 117MB 探针残留送废纸篓。死代码/根目录md/hill-src 经核实为受管文档与有来源守卫的产物，不删（诚实标注：不为几百行冒误删承重墙风险）。

### B 级（结构性，已完成）
- **B7 挂画单管道**：新增 `src/media-files.js`（单45s定时器+单SSE+单隐藏暂停，仿media-push单例）；eternal/paintings 各删自有 fetch+定时器+visibilitychange+onMediaChanged，净删29行；onError 保真原 fallback（首次失败挂静态画/补演示照片）。实机验收：/api/files 仅1次请求（旧≥2条不同URL）、挂画5张。
- **B6 vox-core 下沉**：`src/shared/vox-core.js` createVoxCore 工厂持有 rng/颜色缓存/计数实例状态，解构同名绑定下游2300行零改动；koi-ship 2547→2392行；rng 序列逐字保真（9555体素块/199顶点色mesh/布局截图保真）。**koi-model/garden/sky-light 暂不拆**：剖面函数/glowVox/blossomEmitters/共享rng顺序/TDZ 紧耦合，强拆回归风险高收益有限（子代理最小安全建议）。
- **B5 完成R1拆双轨**（主人拍板离线降级=保留json旁路）：真表为四热集合唯一权威。shadow 写函数返回真实持久判定（confirm语义内移，fileError内移last_t校验），删SHADOW_WRITE闸，回灌改"旁路→表"（表空才灌防追加重复，哨兵只记真灌过行）；hotread 精简为六读门面（删HOT_READ/disable/setDisableHook/confirm*/count*/反向归并矩阵）；五写消费点改 shadow 返回值判持久、失败回旁路 saveGateData；server 启动删反向归并/对账/disable钩子/HOT_READ分支。**净删389行**。守卫测试按新契约重写（删旧矩阵6条、新增回灌/离线/读抛错用例）。**崩溃安全注入 PASS**：kill -9 重启后 chat3条+gate报错零丢（直查库+admin/list双证据）。

### 验证汇总
1420 单测 / 后端 241 项 / lint / tsc / deps 全 0 / checkJs 基线 2。voxel/锦鲤/画廊实机截图验收；B5 崩溃注入双证据。

### 仍待主人拍板（C 级，未动）
ctx 按所有权真拆、gateData 按域拆+鉴权簇收敛、saveGateData 增量化。此三项动承重墙，须单独评审。

**A+B 终验结论：六项重构全部完成并实机/崩溃验证，PR #82 待合并。架构腐化信号1（迁移脚手架永久化）已消除，信号2（上帝对象）部分缓解（vox-core/单管道），斜率止住。C 级留待批准。**

---

## 九、第四轮全面复查（2026-11-17 · A+B 重构后好转验证）

> 同口径复测第三轮全部指标 + 全量门禁 + 三路同标准复评。**诚实结论：有好转，但集中在外围卫生；结构性病灶（ctx/gateData 上帝对象）未动。复查还揪出并当场修正了两个 A+B 自身引入的缺陷。**

### 9.1 好转了吗？——评分对比（三路复评一致）

| 维度 | 第三轮(重构前) | 第四轮(重构后) | 变化 |
|------|------|------|------|
| 后端架构 | 3/5 | **3.5/5** | +0.5 矩阵拆了,承重墙没拆 |
| 前端架构 | 3/5 | **3.5/5** | +0.5 外骨骼厚了一层,泥球本体未动 |
| 优化 | 3.5/5 | **4.0/5** | +0.5 voxel去重真实减重 |

**定性：方向正确、外围见效，但未触及结构性病灶。** 升 0.5 而非更多的理由：七大腐化信号里五个半原封未动。

### 9.2 量化指标前后对比（本机实测）

| 指标 | 重构前 | 重构后 | 判定 |
|------|------|------|------|
| voxel 五页体积 | 8.0MB | **1.2MB**(HTML 382KB+共享three 809KB) | ✅ 真好转,省≈6.8MB |
| 内联重复 three | 5 份 | **0**(grep REVISION 命中0) | ✅ 消除 |
| /api/files 轮询链 | 2 条(晨光+新媒体墙) | **1 条**(media-files单管道) | ✅ 合并 |
| koi-ship.js | 2542 行 | **2391 行** | ✅ 抽走vox-core,但仍9项职责 |
| saveGateData 调用 | 76 处 | **61 处真实调用** | ✅ 热路径条件化,冷路径56处未变 |
| SHADOW_WRITE/HOT_READ 矩阵 | 常驻承重 | **代码已删**(残留16处为注释) | ✅ 拆除 |
| client_errors.json | 非原子写 | **tmp+rename** | ✅ 落实 |
| .tmp 残留 | 117MB | **1.3MB**(本轮探针) | ✅ 清理 |
| WAL | 3.9MB | **2.2MB** | ✅ 缓解(仍23×db) |
| ctx 登记属性 | ~170 | **171** | ❌ 未动 |
| ctx 直写深层文件 | 51 | **52** | ❌ 未动 |
| 懒 require | ~36 | **~35**(files-upload仍15) | ❌ 未动 |
| 空 catch | 157 | **157** | ❌ 未动 |
| 限流套数 | 5 | **5** | ❌ 未动 |
| 裸 onTick | ~45 | **44** | ❌ 未动 |
| player.js 监听 | 23add/0remove | **23add/0remove** | ❌ 未动 |
| 环境开关 | 50 | **49** | ➖ 微减 |

### 9.3 复查揪出并当场修正的两个缺陷（A+B 自身引入）

**缺陷1：A2 烟花后台闸是"假修复"**（两个独立子代理一致抓到）
- 病因：闸放在 rAF 驱动的 update() 内,标签页隐藏时 rAF 停摆⇒闸代码不可达,setInterval 后台照常产粒——正是声称要治的病。
- 修正：改 visibilitychange 监听直接清定时器(init挂/dispose摘)+ autoFirework 自身 hidden 守卫双保险。
- **行为验证 PASS**：hook setInterval/clearInterval,启动 created=1→隐藏 cleared=1(定时器真被清)→回前台 created=2(惰性重启)。

**缺陷2：B5 回灌丢数据窗口**
- 病因：原"表空才灌"在"运行中 SQLite 失效→旁路攒增量→重启表非空"场景会静默丢弃旁路增量,与"一条不丢"矛盾。
- 修正：改幂等并集回灌——读表全量内容签名,旁路有表无的才补入(chat/clicks/visits/gate-errors 按业务唯一字段去重;file-errors 走 upsert 天然幂等)。errors repo 增 readGateAll。
- **守卫验证 PASS**：新增用例"表非空+旁路增量⇒补入一条不丢",47 守卫测试全绿。

修正提交 `ae72a19`(本地,网络故障待推送)。门禁全绿：1421 单测/后端7组/lint/tc/deps 0/checkJs基线2。

### 9.4 剩余腐化信号（未动,按严重度）

**后端**：① gateData 上帝对象+整库写放大(store.js 575行未减,冷路径56处双全量stringify)；② 六套持久化并存,热数组与真表长期双份；③ 鉴权簇咬尾懒require35+；④ 限流5套/clip4份/isNum3份；⑤ **注释腐化**(shadow/store/chat/track/client-errors/admin/retention 仍教人用已拆除的 SHADOW_WRITE/HOT_READ 闸)；⑥ _db.js TEXT亲和补丁焊死+table-parity.cjs脚手架残留。
**前端**：① ctx上帝总线原样(171属性/52直写文件)；② koi-ship仍9项职责,applyEnv在其内；③ 双放映器+setAtmosphere≥3直调无仲裁；④ 44裸onTick+player 23/0监听；⑤ shared/legacy反向依赖；⑥ **audio-manager第三套/api/files轮询**(60s,无隐藏暂停不可清理,B7漏网)；⑦ rng顺序契约无自动化护栏。
**优化**：① 冷路径56处整库双序列化(收益最大)；② hill-src/node_modules≈116MB未回收；③ 无.br；④ @aws-sdk仍在dependencies；⑤ 单页首访体积(共享three全量minify非tree-shake,首访略亏,五页总账大赚)。

### 9.5 新引入风险（诚实标注,除已修两个外）
- paintings 模块级订阅丢弃退订函数⇒media-files管道永不停(隐藏暂停仅部分兜底)。
- loop:frame 共享payload：未来订阅方持有引用即读脏数据(已注释告知,暂无实害)。
- 读回落滞后视图：hotread读抛错回数组,数组受截断且落盘滞后,故障时后台见残缺历史无告警区分。
- 清空不回滚：client-errors/track 先清数组+save再清表(吞异常),清表失败则"清空"后错误复活。

**第四轮终验结论：有好转(后端3→3.5/前端3→3.5/优化3.5→4.0),voxel去重/单管道/矩阵拆除/原子写是真实收益;但ctx与gateData两个上帝对象、鉴权簇、重复实现等结构性病灶未动,属外围卫生工程。复查揪出并修正了烟花闸假修复与B5回灌丢数据窗口两个自身缺陷。下一步最高杠杆：冷路径整库序列化增量化(C级)、ctx按所有权真拆(C级)、注释腐化清理与audio-manager第三轮询收编(低风险)。**
