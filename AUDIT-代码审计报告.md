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

---

## 十、C 级治本重构执行成果（2026-11-17 · 主人批准"继续下一步"，PR #85）

> 前置：PR #84（注释腐化清理 12 文件 + audio-manager 第三轮询收编，全仓 /api/files 收敛为唯一 1 条）已合并主干（merge c581ca2）。C 级三项在分支 refactor/c-arch-2026-11-17，每项独立验证。

### C10 saveGateData 队列内合并 + gate 变更才落盘（零时间窗）
- **队列合并（coalescing）**：gateData 是单一可变对象，任何排队任务写的都是同一份最新快照 ⇒ _writeChain 改"在飞 1 次 + 至多 1 个待写"，突发 N 次 save 复用 pending promise。**实测突发 50 次 ⇒ 1 次真实写盘**。onWrite 逐等待方触发、queuedMs 各算；槽位释放自校验防误清下一轮。
- **零时间窗**：无定时器/debounce，await 仍是"真实写盘后才 resolve"，SIGKILL 不新增丢失窗——这是否决时间窗 debounce 方案的理由（身份数据丢 ≤2s 不可接受）。
- **最高频写放大根治**：gate.js entryGate/autoAdmit 此前"每个静态资源请求都整库双序列化"。pushIp 返回实质变更 + 同 IP 时刻刷新 1h 节流（ipsAt 只被保留期消费，小时级足够）；lastAccess 同口径；改"新建档或实质变更才 save"⇒ 无变更请求零写盘。
- 守卫全过：store 永不 reject/结论对象/串行语义/_savedAt 仲裁/原子写；行为验证 50→1 合并/await 即写盘/onWrite 逐个触发。

### C8 ctx 多写属性收编（三属性全部处置）
- **dayTimeSource → owner=time-shift.js**：scene3-night 回退散写改经 lockDayAt 接口；d.ts 补 `| null`（releaseDay 真实写入形状）；src 内写入方收敛为 time-shift 独占。
- **groundOverride 抹链 bug 修复**（调研发现的真缺陷）：实际加载序 planets(核心链)→eternal(后台链)，eternal 裸赋值会整个抹掉 planets 浮空岛/星球地面链。改链式包装（厅内 FLOOR，未命中交还 prevOverride）+ 拆场对称解链。实机验证链完整。
- **eternalHandlers → owner=eternal-handlers.js 叶子**：registerEternalHandler(action,fn)→off（幂等、不误删顶替自己的新注册）；五模块（windchime/fireplace/snowwin/resetview/finale）散写"||{}守卫+键赋值+delete"整套改注册 API + off 配对收手。守卫测试同 commit 改钉新形态（键集恰五个/参数≤1名cg/off必接必调）+ 新增"散写形态绝迹"断言。实机 legacy 模式五键齐全/off 幂等/顶替保护 PASS。
- 完整 ground-resolver 栈式合成（物理面）风险最高，留待后续单独评审。

### C9 store.js 职责迁出
- 请求身份原语（parseBrand/decodeSamsung/trustedProxy/realIP/CF 网段/deviceKey/legacyDeviceKey/isAutomated）下沉 **lib/request-identity.js**（156 行叶子，零 gateData/磁盘依赖，仅 node:crypto）。
- store.js **603→471 行（-132）**，职责从 ≥7 收敛为持久化+会话+配额+统计；顶部同名 re-export，**零消费方改动**（全部 require('./store').realIP 等引用形状不变）。
- 部署清单守卫 ✅（57 可达模块全覆盖）。

### 验证汇总
1422 单测 / 后端 248 项 / lint / tsc / deps 全 0 / checkJs 基线 2 / 部署清单 ✅。C10 行为验证（合并/await 语义/回调）；C8 实机（链完整/lockDayAt/off 幂等/legacy 五键）；崩溃安全语义不变。

### 剩余（诚实标注）
- gateData 上帝对象本体（29 集合按域拆）与鉴权簇收敛（36 处懒 require）未动——改动面最大，须单独评审。
- ground-resolver 完整栈式合成、限流 5 套归一（语义各异）留待后续。
- 冷路径 per-collection kv 增量：当前快照 KB 级收益有限，留待数据量真正变大后与逐行化一起做。

**C 级终验结论：三项治本重构完成并验证，PR #85 待合并。写放大最高频根源已根治（无变更请求零写盘+突发合并），ctx 三个多写属性全部有了 owner（含一个真 bug 修复），store 职责收敛 -132 行。上帝对象本体拆分是下一座山。**

---

## 十一、D 级：鉴权簇收敛 + gateData 按域拆（2026-11-17 · 主人批准"先合并再继续"，PR #86）

> 前置：PR #85（C 级）已合并主干（merge a56a0c8）。D 级在分支 refactor/d-gatedata-authz-2026-11-17，7 提交，每阶段独立验证可回滚。这是第三轮审计标注的"下一座山"——改动面最大的一项。

### D1 鉴权簇收敛（五阶段，懒 require 36 → 个位数）

调研先实跑 depcruise 确认基线口径，发现审计所述四环咬尾**已被早期叶子拆分断开大部分**，现存唯一真环对是 admin↔files-upload 互指；多数懒 require 是惯性而非断环。据此分五阶段：

1. **authz.js**（阶段1）：admin 会话族（sidHash/issue/ok/cookie）+ token 判定（sameToken/tokenOk/tokenOkPage）从 admin.js 迁出为纯判定叶子（只依赖 config/util/store/local-request/crypto）。新增 **adminWrite 统一判据**（tokenOk ‖ 未配TOKEN时本地），收敛 files-upload 三处 + routes 一份共 **4 份重复表达式**；逐字保留原式（覆盖"曾配 TOKEN 签发会话后撤掉"的边缘场景）。admin re-export 保形状，6 个纯 tokenOk 消费方（abuse/track/bigscreen/client-errors/chat/siteconfig）改直依赖 authz，不再拖 admin handler 链。
2. **sse-bus.js**（阶段2）：SSE 推送通道（注册/通知/踢出+资源闸）拆叶子，**admin→gate 环核心边消失**；admin.sseNotify 与 publish.sseKick 改直依赖。
3. **r2-mirror.js**（阶段3）：镜像三门面（r2Mirror/r2HealMedia/r2PendingMedia，进程内待补推集合+持久台账接线）拆叶子，**admin↔files-upload 唯一真环对消失**；admin 批量批准/拒绝分支 9 处懒 require 顶部化。接线口径守卫测试随实现迁改钉（syncPut 必经台账断言移到 r2-mirror，语义不变）。
4. **media-access.js**（阶段4）：媒体归属/可见性门禁（isMineUpload/canServeMedia+认领合并落盘）拆叶子，security/files-upload 懒加载消除；可见性判定仍只此一处（吃 mediarules.mjs 决策表）。
5. **阶段5**：files-upload 六处 store / transcode 三处 / chunks 一处 / client-errors+tts-stats 的 clientIp（改直依赖 request-identity）/ chat ratelimit / util CORS 常量，惯性懒 require 批量顶部化。

**结果**：核心簇懒 require 从 36 处收敛至个位数（残余仅 r2outbox→r2sync 四处单测打桩刻意留 + retention 两处 store→retention 环警示保守留 + server 启动生命周期合理懒加载）。四个新叶子均只依赖低位，depcruise no-circular 硬闸每阶段验绿。

### D2 gateData 按域拆（试点 + 内容域）

调研给出 29 集合消费矩阵与独立性排序。**存储机制（kv 快照+JSON 镜像+写队列）不动，域拆是接口收窄不是存储重构**；store 导出形状一字不改，守卫测试零改动。

- **身份处置域门面 domain/identity.js**（试点）：收编 kick/approve/note 处置（写动作内含落盘+SSE 秒级通知+踢出历史裁剪）+ blockIp/unblockIp/isIpBlocked 拉黑 + blockedList/kickLogTail 读口径。admin 处置三分支与拉黑分支改门面调用（不再内联写档案字段+各自 save）；gate.isIpBlocked 改门面读口径（判定与写入收归同一处）。**实机隔离验证 12 项全 PASS**：kick→403+历史入账 / approve→恢复放行 / block→403 / unblock→恢复 / note 写入。
- **跨域昵称读口径 nickOf**（内容域）：chat/wishes 此前各写一份**逐字同构**的 nickOf（扫 applicants 取雅号）——重复实现+跨域直读档案。收编进 identity.nickOf 单一口径，两模块改调用。**实机验证**：起名后 chat 发言与 wishes 一念同取雅号，两域一致 PASS。

### 诚实标注（本期不收，留待单独评审）
- **applicants 档案本体**：8 文件 25+ 处直写（含 gate.js 两处整档覆写），跨域引用最密，强收编改动面大、回归风险高。
- **uploads/photoCaptions**：10 文件，上传/转码/审核竞态契约密集，不宜盲动。
- **四热集合数组侧 / 四张 rate 表**：B5 双轨+回填签名 / capKeys 与 retention 清扫耦合，收益低，不动。
- watchIps 无业务写点（半死键），建议单独确认后废弃而非收编。

### 验证汇总
1422 单测 / 后端 7 组 / lint / deps 环闸 0 / 部署清单 62 可达 ✅。D2 处置流 12 项 + 昵称两域一致实机 PASS。每阶段独立跑 depcruise+vitest 可回滚。

**D 级终验结论：鉴权簇四叶子拆分完成，admin→gate 与 admin↔files-upload 两条环边消失，懒 require 36→个位数，adminWrite 4 份重复归一；gateData 按域拆落地身份处置域+昵称口径（接口收窄，存储不动）。applicants/uploads 两个最密域诚实留待单独评审。PR #86 待合并。**

---

## 十二、第五轮全方位审计（2026-11-18 · A~D 全部落地后现状复查 + 当场修复）

> PR #86 已合并（远端 merge 5b2d0e7；本地经分支快进对齐，内容一致）。同口径复测 + 全量门禁 + 三路同标准复评。**结论：五轮持续好转，评分全线上升；本轮揪出 4 个实锤问题并当场修复验证。**

### 12.1 五轮评分走势

| 维度 | 三轮(重构前) | 四轮(A+B后) | **五轮(A~D后)** |
|------|------|------|------|
| 后端架构 | 3/5 | 3.5/5 | **4/5** |
| 前端架构 | 3/5 | 3.5/5 | **3.75/5** |
| 优化 | 3.5/5 | 4.0/5 | **4.3/5** |

### 12.2 量化指标五轮对比（本机实测）

| 指标 | 三轮 | 五轮 | 判定 |
|------|------|------|------|
| 核心簇懒 require | 36 | **14**(残余全为刻意桩/保守/琐碎) | ✅ D1 收敛属实 |
| saveGateData 调用 | 76 | **56** | ✅ 持续收窄 |
| 典型会话整库写盘(1HTML+30静态) | ≈31 次 | **0 次**(同IP 1h内) | ✅ C10 最大实收益 |
| 懒 require 环边 | admin↔gate/files-upload 咬尾 | **两条环边消失**(依赖面逐行可验) | ✅ 真断环非遮羞 |
| WAL | 3.9MB≈40×db | **本轮已治**(checkpoint 5min+close TRUNCATE,实测3.94MB→0) | ✅ |
| ctx 登记属性 | ~170 | ~171(持平,3属性有owner) | ➖ 本体未动 |
| 空 catch | 157 | 157 | ➖ 未动 |
| voxel | 8.0MB | 1.2MB | ✅ 保持 |
| hill-src/node_modules | 116MB | **已删回收** | ✅ |
| .tmp | 117MB | ≈1.7MB | ✅ |
| koi-ship | 2542 | 2391(仍9职责) | ➖ |
| player.js 监听 | 23add/0remove | 23add/0remove | ❌ 泄漏面未动 |

### 12.3 门禁现状（全绿）
lint/tsc 0、checkJs 基线 2、1422 单测(122文件)、后端 7 组全过、deps 无环、audit 0 漏洞、构建可复现(212文件逐字节)、预压缩 35 资源、部署清单 62 可达 ✅。

### 12.4 本轮揪出并当场修复的 4 个实锤问题（fix/audit5-findings 分支 f16cec7）

1. **免审判据 query 收窄（历史缺陷，D1 暴露）**：handlePublicUpload 签名只收 dir/name，直传/分片 onFinish 传 `{dir,name}` 而非完整 query ⇒ `?token=` 直传视频的主人被误判匿名进待审（x-token 头/cookie 不受影响）。修复：签名透传 query + 两处改 adminWrite(req, query)。**回归验证：?token= 免审 PASS + 匿名 fail-closed 保留**。git 对照确认是历史收窄非 D1 引入，但 D1 统一判据时未察觉，本轮补上。
2. **WAL 40× 失衡**：单行 kv 反复 REPLACE 只追加 WAL，无显式 checkpoint。修复：sqlite-store 增 checkpoint(passive/truncate) + startCheckpoint(5min unref) + close 时 TRUNCATE，store 开库即启动。**行为验证：3.94MB→0、数据完整、幂等、close 干净**。
3. **eternal-handlers 热替丢回调**：表无条件新建，HMR 重求值会把未重执行注册方的回调静默丢掉。修复：`ctx.kunlun.eternalHandlers || {}` 沿用同一张表。
4. **两条漏网常驻轮询无隐藏闸**：quizgate 5s（剩余最大后台空转源）+ mode 60s。修复：照 media-files 模式补 visibilitychange 闸 + 句柄入 bag HMR 对称清（原 setInterval 无人持有，热替会叠第二条）。

另更正两处注释腐化：store 防环路径（D1 后不再经 admin）、planets 地面链加载序（旧注释说反）。

### 12.5 剩余腐化与风险（诚实标注，未动）

**后端**：gateData 上帝对象本体（25集合/56落盘点，D2 只收最窄一片）；双轨持久化+TEXT亲和焊死；table-parity.cjs 被测试与部署清单**制度性焊死**（拆除成本递增）；限流 4-5 套；store.js 472行仍兼约8职。
**前端**：ctx 171属性仅3个有owner；**dayTimeSource/groundOverride 无守卫断言**（C8 收尾欠账，回潮无告警）；groundOverride 仍4写者链式纪律（HMR 中栈热替有解链顺序隐患，dev-only）；player.js 23/0 监听 + paintings 模块级订阅不退订（泄漏面最大）；koi-ship 2391行9职责；双放映器；setAtmosphere 3直调无仲裁；~43裸onTick；shared→state 反向依赖；releaseDay 零调用方。
**优化**：冷路径双全量序列化未治本（WAL已止血）；.br 仍0、gz覆盖≈18%；@aws-sdk 仍在 dependencies；player 步态对象每帧new（微）。
**安全**：D1/D2 新代码矩阵六格等价、常量时间比较/fail-closed/裁剪全保留，**未发现漏洞**；低危观察：trustedProxy 信任一切私网 socket（换非CF反代时需复查）。

### 12.6 下一步最高杠杆（三路复评共识）
1. **ground-resolver 栈式合成**（前端）：中央栈 push/pop 带 token，一次解决 groundOverride 多写/HMR中栈热替/museum运行时接管，并补 dayTimeSource/groundOverride 守卫断言（C8 欠账）。
2. **监听/订阅对称收手专项**（前端）：player 23监听挂bag + paintings/audio-manager 退订对称——泄漏收益最大，为 ctx 按域真拆扫清生命周期障碍。
3. **D2 第二刀收 applicants 写面**（后端）：gate/abuse/track 档案字段直写收进 identity 门面，56落盘点压到域内，为按域拆存储铺路。
4. .br 预压缩 + @aws-sdk 移 devDeps（优化旧账，低风险）。

**第五轮终验结论：五轮持续好转（后端3→4/前端3→3.75/优化3.5→4.3），写放大31→0、两条环边真断、WAL失衡已治是本轮最大实收益。当场修复4个实锤问题（免审query收窄/WAL/热替丢回调/漏网轮询）并行为验证。结构性病灶（ctx与gateData本体、监听泄漏面）仍在，是下一阶段的明确目标。修复在 fix/audit5-findings-2026-11-18 分支待合并。**

---

## 十三、E 级：地面层栈 + 订阅对称收手（2026-11-18 · 第五轮 12.6 杠杆落地，PR #88）

> 前置：PR #87（第五轮 4 实锤修复）已合并（远端 merge dddd243）。E 级在分支 refactor/e-ground-listeners-2026-11-18，2 提交。

### E1 ground-resolver 中央层栈（12.6 第 1 项，前端最高杠杆）
- **新增 src/shared/ground-resolver.js**：`addGroundLayer(fn, name) → off`——off 按**层身份** splice 移除，不依赖 LIFO；合成函数栈顶优先、第一个返回 ≠undefined 的层胜出（与旧链语义逐字一致）；全栈未命中返回 undefined，player 回退沙漠地形。
- **四写者收编**：eternal（厅内 FLOOR）/planets（浮空岛/星球）/resetview（平台 +0.15）改注册 + off 对称退订；museum 运行时接管改 `takeGround()` 压栈顶（幂等防叠层）/`giveGroundBack()` 只摘自己——不再"捕获 prev→裸赋值→还原 prev"（旧模式在中间层热替后还原的是过期引用）。
- **根治第五轮实锤**：单独热替中间层（eternal）不再抹掉上层包装；上层 off 不再复活死链。层表经 `import.meta.hot.data` 承接 + self-accept 防注册方重执行叠层。
- **契约不变**：ctx.kunlun.groundOverride 保留合成函数只读别名（player.groundY 每帧询问、4 个探针按函数取用、ctx-bus-probe `'groundOverride' in ctx.kunlun` 全满足）。
- **守卫补 C8 欠账**：ctx-writer-shapes 新增批次 6-4b——dayTimeSource 单写方=time-shift、groundOverride 单写方=resolver 断言（剔除整行注释教学示例防误报）；四注册方 off 必接必调 + museum take/give 形态钉死。**回潮从此有告警。**
- **实机 8 项 PASS**：三层在栈/厅内 400/平台 400.15/远区 undefined/非 LIFO 先拆底层上层仍命中/off 幂等/0 错误。

### E2 订阅对称收手 + 依赖归位（12.6 第 2/4 项）
- **main.js teardownWorldWiring 增世界退订钩注册表**（expose `onWorldTeardown`）：重装配前统一摘除模块订阅，逐钩 try/catch 不阻断其余，摘后清表幂等。
- **paintings/audio-manager 接住 onMediaFiles 的 off 挂退订钩**（原丢弃 off，二次装配叠双份回调——第五轮实锤）。实机 6 项 PASS：钩子暴露/teardown 可调/不抛/幂等/接线已摘/0 错误。
- **@aws-sdk/client-s3 移 devDependencies**：仅 scripts 运维脚本用（lib/src/server 零引用），部署不跑 prod install 核实无影响；audit --omit=dev 仍 0 漏洞。
- **player.js 23 监听诚实标注不动**：核实为一次性装配模块（无 HMR accept、无重装配路径），生产是整页刷新式应用，监听随页面销毁——**非泄漏**，盲加 AbortController 是增噪不是修复。第五轮"泄漏面最大"的判断据此修正：真实泄漏面是 paintings/audio-manager 订阅（已修），player 监听是页面级生命周期。

### 验证汇总
1424 单测（+2 守卫）/ 后端 7 组 / lint / tsc / deps 0 / checkJs 基线 2。E1 实机 8 项 + E2 实机 6 项 PASS。

### 剩余（诚实标注）
- **D2 第二刀 applicants 写面**（12.6 第 3 项）：gate/abuse/track 档案字段直写收进 identity 门面——跨域引用密，留待单独评审。
- .br 预压缩 + gz 覆盖扩面（优化旧账）；ctx 171 属性本体按域真拆（最大工程）；koi-ship 2391 行 9 职责；双放映器；setAtmosphere 3 直调无仲裁；table-parity 制度性焊死。

**E 级终验结论：groundOverride 从"四写者 LIFO 纪律链"变"中央层栈单一 owner"，HMR 解链顺序病根治，C8 守卫欠账补齐；订阅对称收手落地（真实泄漏面已修，player 监听经核实非泄漏诚实不动）。PR #88 待合并。**

---

## 十四、F 级：.br 预压缩 + applicants 写面第二刀（2026-11-18 · PR #89）

> 前置：PR #88（E 级）已合并（远端 merge 557d746）。F 级在分支 refactor/f-br-applicants-2026-11-18，2 提交。

### F1 .br 预压缩 + 协商升级（优化旧账清零）
- **vite precompress**：增 .br（brotli quality 11）+ 阈值 20KB→5KB。**73 个文本资源双旁文件**（原 35 个仅 gz），gz 2969KB → br 2285KB（**再省 23%**）；中小 chunk（5-20KB）从不压变 br 压。自检扩到 three .br 必在；**repro 逐字节一致（324 文件）**——br 确定性满足 R6 不变发布前提。
- **files-static tryGzip→tryCompress**：Accept-Encoding 含 br 优先 .br 旁文件/实时 br（q5 折中防阻塞事件循环），gzip 兜底；缓存键带编码防 br/gz 串内容；mtime 陈旧防护保留（源变即实时压新内容）。
- **单元验证 9 项 PASS**：br 优先/br 可解等于源/br 比 gz 小（实测样本 42.6%）/仅 gz 客户端回 gz/identity 回原文流式/Vary 含 Accept-Encoding/源变更不送陈旧/8KB 也压。

### F2 applicants 写面第二刀（D2 续，12.6 第 3 项落地）
- **identity 门面增 7 写函数**：markSuspicious/clearSuspicious/clearAllSuspicious（反刷打标清标）、markKickedByMerge（强信号归并踢出）、applyReentry（重进申请 60 字裁剪）、attachFingerprint（指纹补采自带 save）、touchVisit（访问计数）。
- **abuse/track/gate 字段级散写收编**：abuse 三处打标清标改门面，**dismiss+清标合并一次落盘（原两次）**；track 指纹补采改门面；gate 归并踢出与重进申请改门面。
- **落盘纪律**：noSave 函数注明——调用方事务收口统一落盘，避免一请求多次整库写。
- **诚实标注不收**：整档覆写（建档/归并 Object.assign）是身份建立语义，留 gate；store.recordVisit 两行留原地（identity 依赖 store，反向 require 即成环，depcruise 硬闸）。
- **验证**：实机 4 项（指纹 fph 写入/重进受理/裁剪写入/approve 恢复）+ 预警门面直测 4 项（打标/理由/昵称读口径分离不丢/全 dismiss 清标）全 PASS。

### 验证汇总
1424 单测 / 后端 7 组 / lint / tsc / deps 环闸 0 / 构建可复现（324 文件）。

### 剩余（诚实标注）
ctx 171 属性本体按域真拆（最大工程）；koi-ship 2391 行 9 职责；双放映器；setAtmosphere 3 直调无仲裁；table-parity 制度性焊死；gateData 存储逐域表化（快照 KB 级收益有限，留待数据量变大）。

**F 级终验结论：.br 优化旧账清零（73 资源双旁文件再省 23%，repro 保持）；applicants 字段级写面收编 identity 门面（abuse/track/gate 三模块，dismiss 落盘 2→1），整档覆写与底座环约束诚实留置。PR #89 待合并。**

---

## 十五、G 级：氛围中央仲裁 + 对账脚手架退役（2026-11-18 · PR #90）

> 前置：PR #89（F 级）已合并（远端 merge 744d552）。G 级在分支 refactor/g-atmos-parity-2026-11-18，2 提交。

### G1 setAtmosphere 中央仲裁（剩余项"3 直调无仲裁"清零）
- **新增 atmosphere-arbiter.js**：base + override 栈——`applyBase(opts)` 昼夜基准层（light-mood 经 ctx.scene.setAtmosphere 别名走这里，**形状不变零改动**）；`pushAtmosphereOverride(name, opts) → off` 场景接管层，栈顶胜出，off 按身份移除（不依赖 LIFO，同 ground-resolver 模式）；override 在位时 base 每帧更新只记录不生效，off 落回**最新**基准（无需等下一帧）。hot.data 承接 + self-accept 防热替丢层。
- **koi-ship**：登机推 koi-flight 层 / 下机 off 还原——**修"下机不还原氛围"缺陷**（原靠昼夜恢复后每帧覆盖兜底）；dispose 兜底 off（异常路径不残留）。
- **eternal**：进厅推 hall 层 / 离厅 off；**废除"厅内每帧压住"workaround**（旧注释自认的抢所有权写法，仲裁后不需要，省一次每帧调用）。
- **守卫批次 6-4c**：直调 setAtmosphere 只许 light-mood 基准层；两接管方 pushOverride + off 配对钉死；每帧压住 workaround 绝迹断言。
- **实机 10 项 PASS**：登机曝光 1.04 / 下机还原 / 进厅 0.92 / 离厅还原 / 0 错误。（探针需清 earth-day mission phase 锁 + 关对话 + 近机位才可登机——这是游戏真实门槛，非仲裁缺陷。）

### G2 table-parity 对账脚手架退役（净删 569 行，"制度性焊死"病根消除）
- B5 拆双轨后真表是四热集合唯一权威，数组侧只是 json/kv 旁路滞后副本，**"源 vs 表对账"失去对象**。
- `git rm scripts/admin/table-parity.cjs`（历史可恢复）；lib-hot-tables.test **⑦段（四种退出码）随脚本退役删除**，插退役说明；**⑧形状差测试保留**（钉的是真表永久性质：TEXT 亲和归一 / brand 对象归一，与对账无关）。
- backend-files.sh 删部署条目（它是"唯一被点名带上服务器的脚本"）；test-backup 造文件与恢复集断言同步；gate-write-cost-probe 历史语境注释标注退役。
- **第五轮审计"table-parity 被测试与部署清单制度性焊死，拆除成本递增"的病根就此消除**——脚手架在完成历史使命后真正退役，不再永久承重。
- AGENTS.md 历史账本段落不动（用户维护文件；其 R1 判据工具描述已过时，在此标注）。

### 验证汇总
1423 单测（⑦退役 -4）/ 后端 7 组（含备份 34 项）/ lint / tsc / deps 0 / 部署清单 62 可达 ✅。G1 实机 10 项 PASS。

### 剩余（诚实标注）
ctx 171 属性本体按域真拆（最大工程）；koi-ship 2391 行 9 职责（vox-core 已抽，余下紧耦合）；双放映器（openfilm 自建渲染器 vs voyage iframe，目的不同）；gateData 存储逐域表化（快照 KB 级收益有限，留待数据量变大）。

**G 级终验结论：setAtmosphere 从"三方抢后写覆盖"变"base+override 中央仲裁"，下机不还原缺陷修复、每帧压住 workaround 废除；table-parity 脚手架真正退役（净删 569 行），制度性焊死病根消除。PR #90 待合并。**

---

## 十六、H1：锦鲤天空子系统抽出（2026-11-18 · 并入 PR #90）

> G 级后同分支继续（PR #90 未合并期间叠加 H1，一并审阅）。commit a24b918。

### 拆分内容
- **新增 src/scene/koi-env.js**（353 行）：setSun / radialTexture / buildSky / buildLights / cloudCluster / buildClouds / 云漂移 updater 整体搬入 `createKoiEnv` 工厂——B6 调研时已认定的内聚子系统（setSun 一处驱动 sunDir/四灯/天穹 uniforms/太阳盘三层）。
- **koi-ship 2408→2085 行（-323）**：编排层只留 `createKoiEnv({voxCore, scene, koiGroup, cloudGroup, matSoft, updaters})` + 解构使用；八键对外接口（root/update/dispose/applyEnv/setSun/envGroup/cruiseLift/voxelCount）不动。
- **保真三关键**：①共享 voxCore——rnd 调用序列逐字不变，体素外观零变化；②组装顺序 sky→lights→clouds→… 原样；③sunDir 同一 Vector3 实例供水面 uniforms.uSunDir，setSun 改向即同步。
- **sunLight 实时 getter**：applyEnv 隐藏沙漠灯时须放行锦鲤自己的太阳灯；getter 在 buildLights 前返回 undefined，与原 let 提升语义一致。
- **守卫批次 6-6**：天空四函数定义只许 koi-env.js；编排层 skyMat/sunDisc/radialTexture/cloudCluster 细节绝迹（防拆分回退）；env.sunLight 实时引用钉死。

### 验证
- **实机 16 项 PASS**（.tmp/h1-koienv.cjs，含 G1 仲裁回归 9 项）：登机推层/曝光 1.04/下机还原/进厅 0.92/离厅还原 + 天穹 shader(uZenith) 在位/太阳盘双辉光 sprite=2/云簇≥40/顶点色 mesh>0/uSunDir 归一化日落向 + 0 运行时错误。
- 门禁：1425 单测（+2 守卫）/ lint 0 / **tsc 真实退出码 0**（前轮 `npm run tc` 是脚本名笔误，正确名 typecheck，本轮已用 npx tsc --noEmit 直验）/ deps 0 / 后端 7 组。

### 剩余（诚实标注）
ctx 171 属性本体按域真拆（最大工程）；koi-ship 2085 行（vox-core/koi-env 已抽，余下鲤身/庭园/水面/鹤/花瓣构建紧耦合）；双放映器（目的不同）；gateData 存储逐域表化（收益有限，留待数据量变大）。

**H1 终验结论：锦鲤最大文件再减 323 行，天空子系统单一归属且守卫防回退，rng 保序外观零变化，实机含 G1 回归全绿。PR #90（G+H 级，4 提交）待合并。**

---

## 十七、H2：锦鲤装饰子系统抽出（2026-11-18 · PR #91）

> 前置：PR #90（G+H1）已合并（远端 merge 750ae77），本地 main 快进对齐。H2 在分支 refactor/h2-koi-ambient-2026-11-18。

### 拆分内容
- **新增 src/scene/koi-ambient.js**（224 行）：buildPetals（400 粒 InstancedMesh 花瓣）/ respawnPetal / _dummy / makeCrane（体素鹤建模）/ buildCranes（5 只绕飞）及两条动画 updater 整体搬入 `createKoiAmbient` 工厂——两个纯装饰动画子系统，与鲤身/庭园构建零耦合。
- **koi-ship 2085→1895 行（-190）**：编排层只留工厂调用 + 解构；八键接口不动。**累计瘦身 2700+→1895 行**（vox-core / koi-env / koi-ambient 三模块抽出）。
- **保真关键**：①blossomEmitters **同引用注入**——buildTrees 填、respawnPetal 读，拷一份就断时序；②petals 收归模块内 let（原外层声明区内独占，dispose 走 root.traverse 释放无需外持）；③共享 voxCore 保 rng 序，组装序 cranes→petals 不变。
- **守卫批次 6-7**：四函数定义只许 koi-ambient.js；编排层 makeCrane/respawnPetal/_dummy/petals 细节绝迹；blossomEmitters.push 仍在编排层（buildTrees 归属不变）。

### 验证
- **实机 18 项 PASS**（.tmp/h2-ambient.cjs，含 H1 天空结构 6 项 + G1 仲裁回归 9 项）：花瓣 400 粒 InstancedMesh / 鹤群 5 只 / 0 运行时错误。首跑登机 2 项 FAIL 为 earth-day 旅程抢锁瞬时抖动（G1 时已知门槛），复跑全绿。
- 门禁：1426 单测（+1 守卫）/ lint 0 / tsc 真实 0 / deps 0 / 后端 7 组。

### 剩余（诚实标注）
ctx 171 属性本体按域真拆（最大工程）；koi-ship 1895 行（余下鲤身/庭园/水面构建共享 KW 剖面表与 glowVox/sheetVox 跨区缓冲，紧耦合，拆分收益/风险比下降，建议止步）；双放映器（目的不同）；gateData 存储逐域表化（收益有限）。

**H2 终验结论：锦鲤装饰子系统单一归属，发射点同引用保时序，rng 保序外观零变化，实机含 H1/G1 回归全绿。koi-ship 拆分至此收口（三模块抽出，余下紧耦合区诚实止步）。PR #91 待合并。**

---

## 十八、I1：ctx 属性域登记册（2026-11-18 · PR #92）

> 前置：PR #91（H2）已合并（远端 merge f84e766），本地 main 快进对齐。I1 在分支 refactor/i1-ctx-registry-2026-11-18。

### 定位：真拆前的所有权制度地基（运行时零改动）
第五轮审计最大遗留"ctx 约 171 个登记属性仅 3 个有 owner"。按域真拆是最大工程，第一步先把**谁在写哪个属性**变成制度——新属性/新写方/写方变更不登记就红。

### 交付
- **scripts/admin/ctx-registry.cjs**：全量扫描 ctx 写点——直写（ctx.x= / ctx.d.x=，排除 ==）+ 全仓 6 处 Object.assign 平铺块（多行块只认恰好 2 空格缩进键行，函数值体不误收；单行块取顶层键）；注释行剔除、解构读不计、未收口块抛错不静默。`--write` 生成 / `--check` 校验漂移。
- **docs/ctx-registry.{json,md}**：**175 属性按 9 域分组**——scene 60 / kunlun 27 / _root 21 / ui 20 / media 16 / mode 13 / player 9 / gallery 8 / loop 1。**8 个多写方 ⚠️ 标出**（kunlun.spiritsState、onTick、player.quizPassed、scene.avatar、scene.renderPostProcessing、scene.s、tickers、ui.kunlunSpeak）——真拆时须先收编单一 owner 的精确清单。
- **守卫 ctx-registry.test.js 三条**：①逐键比对漂移即红（added/removed/changed 明细）；②动态键 ctx[k] 全仓保持 0（登记册口径的盲区必须绝迹）；③已知锚点抽查——G1 仲裁/E1 地面/C8 时刻单写方 + 两种 assign 块形 + 规模哨兵 >150（口径漏扫一半会红）。
- **自咬验证**：临时污染登记册（塞假属性）守卫必红，还原即绿——判据真的会咬人。

### 顺带修复：批次 6-6/6-7 守卫正则假红
pre-commit prettier 把 createKoiAmbient 长参数列表折成多行，而守卫正则钉的是单行形态——H2 提交前跑的 vitest 没看到钩子格式化后的最终形态，合并进 main 后才暴露。两处正则改 `\s+` 格式无关（H1 同型正则一并加固）。教训入册：**守卫正则钉语义不钉排版**。

### 验证
1429 单测（123 文件，+3 守卫）/ lint 0 / tsc 真实 0 / deps 0 / 后端 7 组 / 部署清单 62 可达。

### 剩余（诚实标注）
ctx 按域真拆本体（I1 已给出精确施工图：9 域 175 属性 + 8 个须先收编的多写方；建议按 loop→gallery→player 小域先行，scene 60 属性最后）；双放映器（目的不同）；gateData 逐域表化（收益有限）。

**I1 终验结论：ctx 所有权从"没人知道谁在写"变"175 属性全量在册、漂移即红、多写方精确标出"，真拆施工图就绪。PR #92 待合并。**

---

## 十九、I2：多写方收编 8→4（2026-11-18 · 并入 PR #92）

> I1 登记册标出的 8 个 ⚠️ 逐个核写点：**4 个是违规第二写方（已收编）**，**4 个是合法共写（守卫钉死语义，防被误当违规收掉）**。commit c27bc9f。

### 收编 4 项（违规共写清零）
| 属性 | 原状 | 收法 |
|---|---|---|
| `tickers` | ctx.js 建 + loop.register `if(!ctx.tickers)` 兜底再建 | 删兜底；唯一 owner=ctx.js（ESM 模块体先执行，缺失属装配序 bug 就该炸） |
| `player.quizPassed` | player.js 默认 + quizgate.js 第二份默认 | 删 quizgate 那份；分数线 quizPassScore 仍归 quizgate（服务端单源），未误伤 |
| `scene.renderPostProcessing` | scene-manager.syncCtx + main.js 直写 | **新增 `provideMainPost` 门面**（scene-manager 唯一写方）。门面覆盖两种时序：manager 已建直接转 setMainPost；未建则暂存，initSceneManager 建成后补注入——**不静默丢管线** |
| `kunlun.spiritsState` | spirits.js 注册 + planets.js 捕获 prev 覆写 | planets 改注册 `spiritsDecorate` 装饰器，由唯一 owner spirits.js **读时咨询**；bag.custom 对称退订。消除热替叠链隐患 |

### 合法共写 4 项（守卫写明语义，不许被收掉）
- `onTick`：ctx.js 建 + hot.js HMR 捕获包装 → uninstallCaptures 必须还原
- `scene.avatar`：player 程序化小人（默认）+ kunlun/avatar GLB **显式**升级（`window.__useGlbAvatar`，USE_GLB_BY_DEFAULT=false）
- `scene.s`：scene.js 首建 + scene-manager.syncCtx 世界切换换引用（46 处读者的唯一渲染入口）
- `ui.kunlunSpeak`：audio-manager 基础实现 + gameshell 对话升级 → dispose 必须还原

### 实机踩到的真坑 → 新增制度守卫（本轮最有价值的发现）
`ctx.<域>` 是 **Object.freeze 的白名单代理**，新属性不登记就**静默失败**：planets 加载报 `Cannot add property spiritsDecorate, object is not extensible` ⇒ **整个星球世界加载失败、FPS=0**。
- 补 ctx-kunlun 白名单 + types/ctx.d.ts 声明（形状取自真实写点，不猜）
- **新增批次 6-9 守卫**：登记册里的域属性必须在对应白名单内——I1 能扫出写点，但扫不出"白名单没登记"，这条补上盲区
- 守卫正则兼容紧凑首行写法（`const properties = [ 'a', 'b',`）：**首版误报 media/mode 四项，核实后确认原已登记，未误加重复条目**（一度误判为"真漏登记"并加了重复项，发现后立即撤销）。教训与 H2 同源：**守卫钉语义不钉排版**

### 验证
- **实机 11 项 PASS**（.tmp/i2-verify.cjs）：后处理管线在位（provideMainPost 未丢）/ tickers 单表 / quizPassed 布尔（gameState 绑定，服务端权威）/ 分数线兜底在位 / spiritsState 6 行 / 装饰器已注册 / **装饰生效（place 为"325 号小行星·国王"等星球版）** / 切 b612 摘管线 null / 回主世界复管线 function / 0 错误
- 探针两处假设错误已纠正（世界 id 是 `b612` 非 `space`；quizPassed 由 gameState 绑定，false 是合法值）——非代码缺陷
- 门禁：**1436 单测**（123 文件，+7 守卫）/ lint 0 / tsc 真实 0 / deps 0 / 后端 7 组 / 登记册一致 176 属性

### 剩余（诚实标注）
ctx 按域真拆本体（施工图已就绪：9 域 176 属性、多写方降至 4 且全为合法共写；建议 loop→gallery→player 小域先行，scene 60 属性最后）；双放映器（目的不同）；gateData 逐域表化（收益有限）。

**I2 终验结论：违规第二写方清零（多写方 8→4，余下全为带配对还原的合法共写）；冻结白名单盲区被实机咬出并补上制度守卫。PR #92（I1+I2）待合并。**

---

## 二十、J1：登记册假阳性治理（2026-11-18 · PR #93）

> 前置：PR #92（I1+I2）已合并（远端 merge d6466c6），本地 main 快进对齐。J1 在分支 refactor/j1-ctx-split-2026-11-18，commit f40e5f6。

### 为什么真拆前先做这个
按施工图准备拆小域时，发现登记册里 `ctx.fillStyle` / `font` / `textAlign` / `oncomplete` 等来自 markers.js、visitor-fp.js——**这些是 Canvas2D / AudioContext 的属性名，不是总线属性**。假属性会污染真拆施工图（把 Canvas API 当总线属性去收编），故先净化口径再动刀。

### 实锤假阳性 7 个
| 来源 | 真相 |
|---|---|
| `markers.js` `canvasTexture(w,h,(ctx)=>{…})` | ctx 是 **Canvas2D 回调参数**，遮蔽了 import 进来的总线 |
| `visitor-fp.js` `var ctx = new AC(1,4410,44100)` | ctx 是 **OfflineAudioContext**（音频指纹） |

→ `fillStyle` / `font` / `textAlign` / `textBaseline` / `lineWidth` / `strokeStyle` / `oncomplete` 全部剔除。**176 → 169 属性**，差值正是这 7 个。

### 修法：行级作用域遮蔽跟踪（不整文件排除）
markers.js 是**混合身份**（既 import 总线、又在回调里遮蔽），整文件排除会连真写点一起漏掉。改为按花括号配平逐行判定三类遮蔽：
- `decl`（var/let/const ctx=）：遮蔽到**所在外层块**收口
- `block`（回调/函数形参）：遮蔽到函数体收口
- `line`（单行箭头）：仅本行

**依赖注入不算遮蔽**：boot-check / light-sweep / coord-hud / story-compass / loop-manager / dialog-replies 这 6 个文件不 import 总线，ctx 由调用方传入——传进来的就是总线本体，必须扫。

### 两次口径失误（过程如实记录，不掩盖）
1. **首版正则过宽**：把调用实参 `replyChoices(ctx,…)` / `new LoopManager(ctx)` / `constructor(ctx)` 当成绑定，误排除 **14 个合法文件**（含 ctx.js / main.js / loop-manager.js），属性数 176→145、`loop.timeScale` 直接丢失 ⇒ 收窄为只认真绑定位置。
2. **decl 收口判定错**：用 `outer<=endDepth`，而声明行无花括号时 outer 恰等于 endDepth ⇒ 当场弹出、`oncomplete` 漏剔 ⇒ 改 `endDepth=outer-1` 严格下降判定。

两次都是**先核验锚点再改**发现的（真属性丢失/假属性残留），不是靠猜。

### 守卫 3 条
7 假属性绝迹 / 9 个核心写方必须在册（防口径过宽误排除）/ 遮蔽清单钉死 + 规模哨兵 ≤12。

### 验证
**1439 单测**（123 文件，+3 守卫）/ lint 0 / tsc 真实 0 / deps 0 / 后端 7 组 / 登记册一致 **169 属性**（多写方 4，全为 I2 认定的合法共写）。

### 真拆施工图（净化后）
| 域 | 属性数 | 写方集中度 |
|---|---|---|
| loop | 1 | loop-manager 独占 ✅ 最内聚 |
| player | 9 | player.js 独占 8 + quizgate 1（分数线，已认定合法） |
| gallery | 8 | paintings 4 + scene 2 + housecolor 1 + painting-zoom 1 |
| scene | 60 | 分散，最后动 |

**J1 终验结论：登记册从"混着 Canvas API 的 176 项"净化为"169 项真总线属性"，行级遮蔽跟踪 + 3 条守卫钉死口径，真拆施工图可信。PR #93 待合并。**

---

## 二十一、K 级收口：全部剩余项一次性完成（2026-11-18 · PR #94）

> 前置：PR #93（J1）已合并（远端 merge 3c12393）。K 级在分支 refactor/k-final-2026-11-18，commit 444c348。用户指示"全部完成，一次性都完成所有"——本章是审计遗留项的总收口。

### K1 实锤修复：_root 域残留清零 + jumpHold 断链（登记册驱动的最后一刀）
- **发现**：`ctx._jumpHold` 是死写点（全仓零读者），而状态机 PlayerStates.js 读的是 `ctx.player.jumpHold`——白名单正门早有位，却没人写 ⇒ **恒 undefined，GlidingState 转移从未触发**（滑翔动画轨断链；物理滑翔由 player-physics 纯函数独立驱动所以 gameplay 没坏，坏的是状态机查询/动画轨）。
- **修法**：tickPhysics 每帧同步改走正门 `ctx.player.jumpHold = jumpHold`。物理权威不变，状态机获得真实输入。
- **_root 域收口**：根级只剩总线本体装配（ctx.js）+ 合法共写（onTick hot 捕获），**域外残留绝迹**——"171 属性仅 3 个有 owner"的原始痛点，经 I1 登记→I2 收编→J1 净化→K1 归位四步，制度性闭环。
- **守卫 2 条**：_jumpHold 绝迹 + player.jumpHold 唯一写方；_root 域写方白名单钉死。
- **实机 10 项 PASS**（.tmp/k1-jump.cjs）：idle 起步 → 按住空格 jumpHold=true → 离地 → pl.gliding → **状态机进 gliding（断链修复实证）** → 松开 → 落地回 idle；根级死键已消失；0 错误。

### K2 双放映器：核实为刻意分工，定性关闭（不动代码）
| | openfilm.js（889 行） | voyage-scenes.js（479 行） |
|---|---|---|
| 用途 | 开幕电影（一次性） | 星之旅程四幕（可反复进出） |
| 渲染 | 自建 WebGLRenderer + 60s 时间轴 | 同源 iframe 承载 public/voxel 单文件场景，独立渲染器不碰主循环 |
| 生命周期 | 播完自清理（dispose + forceContextLoss），唯一出口 onDone 交棒 startWorld | 组合根 init/dispose 对称，iframe 关闭即摘 |
| 调用 | main.js 开场链 | compositionRoot.register，剧情节拍触发 |

生命周期/渲染策略/调用时机全不同，**合并反而造耦合**。审计"双放映器"项定性为"刻意分工"关闭——这是核实后的结论，不是搁置。

### K3 gateData 逐域表化：核数据定性收益不足，留置（不动代码）
- 快照实测 **8.7KB**：最大域 aiUsage 7KB（计数聚合，单行 kv 天然适配）；applicants 890B/1 人；chat/uploads/alerts 等 **8 域全空**。
- B5 已把四热集合（applicants/chat/visits/linkClicks）切 SQLite 真表；其余域是低频小对象，逐域建表收益 KB 级、迁移风险 > 收益。**留待数据量变大再评估**——这是核过数据的定性判断，不是遗漏。

### 验证（全量门禁）
**1441 单测**（123 文件）/ lint 0 / tsc 真实 0 / deps 0 / 后端 7 组 / 登记册 169 属性一致 / 部署清单 62 可达 / build 可复现（74 资源预压缩 8783KB → br 2286KB）。

### 审计遗留项总账（全部处置完毕）
| 项 | 处置 | 落地 |
|---|---|---|
| ctx 171 属性仅 3 个 owner | I1 登记册 169 属性全量在册 + 漂移即红 | PR #92 ✅ |
| 8 个多写方 | I2 收编 4 违规 + 钉死 4 合法共写 | PR #92 ✅ |
| 登记册假阳性 | J1 行级遮蔽跟踪剔 7 假属性 | PR #93 ✅ |
| _root 域外残留 + jumpHold 断链 | K1 归位正门 + 实机修复实证 | PR #94 |
| 双放映器 | K2 核实刻意分工，定性关闭 | PR #94 |
| gateData 逐域表化 | K3 核数据收益不足，留置 | PR #94 |
| koi-ship 巨型文件 | B6/H1/H2 三模块抽出 2700+→1895 行，余下紧耦合诚实止步 | PR #90/#91 ✅ |
| setAtmosphere 无仲裁 | G1 中央仲裁 + 下机不还原缺陷修复 | PR #90 ✅ |
| table-parity 制度性焊死 | G2 脚手架退役净删 569 行 | PR #90 ✅ |

**K 级终验结论：审计遗留项全部处置完毕——能修的修（K1 断链实锤）、该收的收（ctx 所有权制度闭环）、核实后不该动的定性关闭（K2/K3）。PR #94 待合并。**

---

## 二十二、第六轮全方位审计（2026-11-19 · PR #95）

> 前置：PR #94（K 级）已合并，主干 99f7677。第六轮三路并行复评（后端/前端/工程优化，同前五轮标准）+ 本机全量门禁与量化指标；发现逐项核实后 **8 项实锤当场修复**（commit 56141d0），核实后不动的定性记录。

### 22.1 六轮评分走势
| 维度 | 一 | 二 | 三 | 四 | 五 | **六** |
|---|---|---|---|---|---|---|
| 后端 | 3 | 3 | 3.5 | 3.5 | 4 | **4.5** |
| 前端 | 3 | 3 | 3.5 | 3.5 | 3.75 | **4** |
| 工程优化 | 3.5 | 3.5 | 4 | 4 | 4.3 | **4.5** |

### 22.2 量化指标（本机实测，2026-11-19）
| 指标 | 第五轮 | 第六轮 | 说明 |
|---|---|---|---|
| vitest | 1422 | **1444**（123 文件） | R6 +3 守卫；K1 +2；J1 +3 等累计 |
| 后端 7 组 | 全绿 | 全绿（上传安全 20→**27**） | R6 +7 回归 |
| lint / tsc / deps | 0/0/0 | 0/0/0 | tsc 真实退出码直验 |
| checkJs 基线 | 2 | 2 | 硬闸 |
| npm audit --omit=dev | 0 | **0** | |
| 构建 repro | 可复现 | **328 文件逐字节一致** | 守卫转硬闸 |
| 部署清单 | 62 可达 | 62 可达（清单 63） | |
| 登记册 | — | **169 属性一致** | J1 净化后口径 |
| 最大文件 | koi-ship 2085 | **koi-ship 1901** | eternal 1027 / openfilm 889 / planets 870 |
| saveGateData 调用 | 56 | **63**（口径含 gate/） | 注释"85 处"已过时→更正 |
| 懒 require（lib+server） | 14 | 24（口径含 gate/ 全量） | 绝大多数刻意桩，坏味道仅 3 处惰性 crypto/fs |
| 空 catch | 157 | 前端 101 + 后端 75 | 唯一安全相关者（quota）已修 |
| WAL | 3.9MB 失衡已修 | **0 字节**（checkpoint 在位） | db 196KB / 快照 12KB |
| .tmp | 1.7MB | 2.5MB / 39 探针 | token 均测试值，无真实凭据 |

### 22.3 当场修复 8 项（全部核实后动手）
1. **quota 反刷 fail-open→fail-closed**（lib/upload/quota.js:62,70）：abuse 判定抛错原 `catch(e){}` 吞成 null 静默放行——全仓 75 处后端空 catch 中**唯一安全相关者**。改硬拒（bigfile/rate）+ console.error 出声。注入故障回归钉死。
2. **publish 归属落盘读结论**（lib/upload/publish.js:69）：原即发即忘，持久失败仍回 201，重启丢归属。改 await 结果，写坏带 warning（与 DELETE 路径 M-11 同纪律），201/202 两出口都带。
3. **chat 管理员 query token 透传**（lib/chat.js:64 + routes.js:60）：`tokenOk(req,{})` 丢 query ⇒ 管理员 ?token= 发言误标访客。改透传 c.query（第五轮免审修复同口径）；TOKEN_QUERY=0 公网仍拒，fail-closed 纪律不放松。
4. **SM Walking→Gliding 补 jumpHold 门槛**（PlayerStates.js:57）：与物理权威 player-physics.js:60 三条件逐字对齐。原无按键坠崖也进 GlidingState 置 pl.gliding=true，下一帧被物理覆写 ⇒ 单帧动画抖动（Airborne 分支本来就带，Walking 是漏网）。
5. **main.js SM tick 接住 unregister**（main.js:325）：原匿名注册丢弃 ⇒ 二次装配叠双份 SM tick。teardown 摘除 + 装配前摘旧 + worldWiringState.smTick 暴露（与 rootTick 同纪律，E2 同病收尽）。
6. **video-wall 订阅 off 挂 teardown**（video-wall.js:53）：E2 注册表收尽第三家（原仅 paintings/audio-manager），防重装配叠双份 reloadBigscreen。
7. **repro 守卫转硬闸**（test.yml:126）：本地实测 328 文件逐字节一致，"非阻断起步先积累稳定性"前提已满足，摘 continue-on-error；backup-gallery.sh 陈旧"不可复现"注释同步更正。
8. **store.js 过时计数注释**："85 处"→"数十处"（实测 63），文档可信度。

### 22.4 核实后不动（定性记录，非搁置）
- **bigscreen 内层 tokenOk 弱于 adminWrite**（lib/bigscreen.js:72,116）：现靠 routes.js:174-175 auth:'write' 外层兜住——**潜在非现行**，若改挂 public 即成洞，已在报告钉住前提。
- **stats 聚合 SIGKILL 丢计数**（store.js:454）：server.js:162-164 已自认，崩溃回灌保明细不保聚合——已知取舍，非新发现。
- **arbiter base=null 边缘**：off 时 base 必已由 light-mood 每帧 applyBase 填充，核实非缺陷。
- **three/hls.js 在 dependencies**：vendor 同步链（sync-vendor.js:17）需要，刻意归位。
- **gate_data.json 泄漏面**：git 全历史核查**从未提交**（.gitignore:25 覆盖），secret 零泄漏。
- **koi-ship 1901 行止步**：余 ~29 个建造函数纯组装+几何，职责单一，拆分收益/风险比已到拐点（H2 结论维持）。
- **类型债**：ctx.d.ts 394 成员行中 typeof import 仅 12 处（~3%），手写形状占多数——checkJs 基线 2 硬闸兜底，真拆时逐域换装（I1 施工图已就绪）。

### 22.5 测试过程踩坑（如实记录）
authz 的 TOKEN 是 config **模块加载时捕获的常量**——R6 回归首版在 require 链之后设 env 无效（config 已固化空 TOKEN），隔离验证定位后把预设挪到文件头（任何 require 之前）。教训：**测试 env 必须赶在被测模块的常量捕获之前**。

### 22.6 验证
1444 单测 / lint / tsc 真实 0 / deps 0 / 后端 7 组（上传安全 27 项）/ 登记册 169 一致 / 部署清单 62 可达 / **实机 10 项 PASS**（SM 滑翔全链：idle→空格→离地→gliding→松开→回 idle，0 错误）/ repro 328 文件一致。

### 22.7 剩余欠账（第六轮后）
| 项 | 性质 | 建议 |
|---|---|---|
| 空 catch 前端 101/后端 75 | 多数良性（audio.play/localStorage），危险点已修 | 按域分批收编，error-report.js 自身吞错优先 |
| 类型债 typeof import ~3% | checkJs 基线 2 硬闸兜底 | ctx 真拆时逐域换装 |
| ctx 真拆本体 | 施工图就绪（169 属性 9 域，多写方 4 全合法） | loop→gallery→player 小域先行 |
| publish 其余 5 处 saveGateData | 低频管理操作（复核/删除），失败面小 | 下轮按需收编 |
| .tmp 39 探针无回收机制 | 均测试值无凭据，.gitignore 覆盖 | 会话结束清理约定 |
| 报告 vN 副本 12 份 ~660KB | 交付历史，git 未跟踪 | 用户决定保留/归档 |

**第六轮终验结论：三路评分全线上升（4.5/4/4.5），8 项实锤当场修复（含唯一安全相关空 catch 的 fail-closed 收编），repro 转硬闸，核实后不动项全部定性记录。PR #95 待合并。**

---

## 二十三、R6 后：§22.7 剩余欠账处置（2026-11-20 · 分支 fix/r6-audit-2026-11-18）

> 用户指示「继续全部」。逐项处置如下，**三项核实后确认无实债**（不改代码，只给证据），两项已落地，一项启动。

### 23.1 核实后无实债（三项）

**① 类型债「typeof import ~3%」—— 报告口径与现状不符，实为 1 处。**
`types/ctx.d.ts` 394 个属性行里，`typeof import` 的**类型位**只有 **1 处**（`audioManager`），占 0.25%，不是 12 处/~3%。回溯 git 历史：自 802efd0 起该数一直是 1，从未是 12。这唯一一处还是**刻意设计**——`ctx-writer-shapes.test.js:109` 把它钉死为 `typeof import('../src/scene/media/audio-manager.js').audioManager`，并在同用例里明令禁止手写形状（"手写形状就是回到 mA: Material[] 那条路"），即声明必须指回唯一写入方。**无债可收；改了反而破刻意设计 + 破钉死测试。**

**② 空 catch（前端 101 / 后端 75）—— 逐域核实全良性，危险点确已修完。**
- `src/error-report.js` 的 5 处空 catch **是模块契约**（模块头：「上报本身绝不再抛错、不阻塞游戏」）。它们都在"报"的路上，改成出声会在上报失败时刷屏、甚至递归回本文件包装的 `console.error`。本轮把每处理由写到行内（3e410e5），后来者不必重新推导。
- 后端高风险域逐条核过：`upload/stream.js`（release/destroy 的 best-effort，模块注释明写"重试就可能是双扣"）、`upload/chunks.js`、`upload/quota.js`、`upload/names.js`、`upload/transcode.js`（unlink 残片）、`admin.js`（广播失败不该让批准失败）、`gate.js`（内联 HTML 串里的客户端轮询）、`abuse.js`（stat 容错）、`media-access.js`、`vision.js`、`r2outbox.js`、`sse-bus.js` —— 全部是清理类 best-effort。
- **系统性静默风险已闭环**：即发即忘的 `saveGateData()` 全站有 ~60 处（store.js:146 已论证为何必须即发即忘：Node ≥15 未处理 rejection 会杀进程），其失败由 `store.js:123` 的 `[store] 保存未完全落盘` 在**写盘任务内**出声，不依赖调用方读结论。

**③ 报告副本 —— 已归档去重。**
`AUDIT-代码审计报告.v1~v11.md`（11 份 648K）移入 `AUDIT-archive/`；`.v12.md` 与 git 跟踪的 `AUDIT-代码审计报告.md` md5 完全相同（3b0bb3e1…，同一份内容），重复副本删除，仓库只留一份当前版。另补 `.gitignore` 忽略 `.DS_Store`（654da7f）。

### 23.2 已落地（两项）

**④ publish 其余 5 处 saveGateData —— 收编完成（419357a）。**
原先 6 处 `try { saveGateData(); } catch (e) {}` 即发即忘，持久失败被完全藏起（重启后归属/待审回滚，后台看不到）。新增 `saveGateDataWarn()`：await 结论、读 `jsonOk`、失败 `console.error` 出声、把 warning 交给调用方。`publishAnonUpload` 2 处（反刷回滚 429 / 归属落账）、`publishWhiteboardSave` 5 处（归属/待审标记/摘除/反刷回滚/非公开视频待审）全部接上，202/201/429 响应带 `warning`。新增 `scripts/test/test-publish-persist.js`（基线 + `GATE_DATA_FILE` 指向不存在目录的注入，7 条断言钉死"失败不抛 / jsonOk 如实 / 仍回 202 / 带 warning"），并接入 `npm test`（7 组 → 8 组）。

**⑤ .tmp 探针 —— 已清空。**
51 文件 1.8MB 清空（保留空目录，`.gitignore:66` 覆盖）。

### 23.3 已启动（一项）：ctx 真拆 L1 —— loop 域

施工图建议「loop→gallery→player 小域先行」。**loop 域已拆完（8b800a8）**：整个域只有 `timeScale` 一个属性，而全仓唯一读写方就是 `LoopManager` 自己——单 owner 可变状态躺总线，是"隐式耦合"最纯粹的形态。

- `LoopManager` 新增私有 `this.timeScale`；`pause`/`resume`/`_frame`/`getPerformanceInfo` 四处改读自有字段。
- `ctx.loop` 与 `src/loop.js` 的 `GameLoop` 容器一并退场（其 `pause/resume` 从未被调用，是死代码）；`src/__tests__/GameLoop.test.js` 同删，timeScale 语义由 `loop-manager.test.js` 的 pause/resume 用例覆盖。
- 登记册 169 → **167** 属性（`--write` 重生成）；锚点守卫改挂同样由注入型文件写入的 `media.dayHour`。
- **新增守卫**：`ctx` 上不得再出现 `loop` 容器（防真拆回流）。

**L2 已补做（1d76098）：gallery 域的放大状态。** 复查时发现 §22.7 的"27 读写点"只是**直写口径**，实际形态更典型：`zG`（当前正放大的画框）唯一写方是 `painting-zoom.js`，却被 5 个文件 9 处直读；`zoomIn` 则是**全仓无消费者的死挂载**（paintings.js 自己 import 直接用）。已处置：

- `zG` 收进 `painting-zoom.js` 私有，只经两个显式接口外泄——`currentZoom()`（要"是哪一个"）与 `isZoomed()`（只做"是否"判断）；9 处外部读点全改走接口（paintings.js 4 处、kunlun/resetview.js、kunlun/letgo.js、scene/player.js）。
- `zoomIn` 的总线赋值与命名空间条目一并删除。登记册 **167 → 165**，`types/ctx.d.ts` 的 `GalleryNamespace` 同步。
- 新增 `src/__tests__/ctx-gallery-l2.test.js` 四条守卫，其中两条是这次特有的：**全 src 不得再出现命名空间/扁平两条路径的 `zG`/`zoomIn`**（扁平别名层会为所有命名空间属性在 ctx 根建访问器，只查命名空间会漏），以及 **`zG` 的写点必须只在 `painting-zoom.js`**（防状态分叉成两份）。
- 实机复验：命名空间与扁平层均已无这两员；`zoomIn` 后 `isZoomed()=true`、`currentZoom()` 命中该画且**总线仍 undefined**；`zoomOut` 后双双复位；全程无页面异常。

**未做（诚实标注）**：gallery 域余下 `paintGroups` / `wallSpecs` / `houseMats` / `hangOne` / `openHouseColor`，以及 player 域（9 属性 / **219 读写点 / 47 文件**）。具体依据如下（不是"懒"，每条都指向一处真实约束）：

- **`wallSpecs` 是模块顶层直读**：`paintings.js:56` 在导入期读它构建 `hW` 快照，所以装配顺序被隐式钉死（scene.js 必须先于 paintings.js 跑完）。收进私有必须改成惰性读取——那是**行为改动**，不是同义改写。
- **`houseMats` 撞启动时序**：写方 `scene.js` 在 `WORLD_MODULES`，读方 `gate/housecolor.js` 在 `WELCOME_MODULES`（启动更早）。让 housecolor 直接 import scene.js 会把世界模块提前拉进预加载链——正是本审计最在意的启动顺序风险。要拆得先给这个接口找个不加重依赖的落点（独立小模块或注册式），属于设计题。
- **扁平别名层 + 顶层解构快照**：`scene/player.js:7` 在导入期一次性解构 `onC3D`/`zoomOut`，扁平层会为所有命名空间属性在 ctx 根建访问器——任何"收进私有"都得同时清这两处，否则拿到 undefined。
- player 域是承重墙：报告第 364 行本就写明"此三项动承重墙，须单独评审"。

### 23.4 验证

本地：lint 0 / tsc 0 / checkJs 2（=基线）/ Vitest **123 文件 1447 通过** / 后端 **8 组**通过 / `vite build` 通过 / 本地冒烟 5 项全绿（实机确认 `ctx.loop` 已消失、`lm.timeScale` 为数字、世界正常启动；L2 复验见 §23.3）。本机 swiftshader 仅 ~1fps，b612 旅程探针在"曲面步行后镜头同帧同步"一步 60s 未收敛——**判定为本机性能问题，非改动引入**（timeScale 恒为 1，`dt *= this.timeScale` 与原先 `dt *= (ctx.loop.timeScale ?? 1)` 行为等价；实测 `camY === plY`，dt 非 NaN）。CI 复验为准。
