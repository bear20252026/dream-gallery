# 审计挂账项 · 分级改造方案（重构类，非 bug 修复）

外部专家审计（三阶段）落地后仍剩的这一批，共同点是：**改的是数据模型/边界/流程，不是某段错码**。
它们无法靠"顺手改改"交付，所以在这里给出文件级方案、回滚点与验收判据，每项都独立可停可续。
本文不含任何"已完成"声称——除已注明"已落地"的两项外，均未动代码。

已随本轮落地的两项（不需再排期）：
- **隐私保留期与最小化清理** → `lib/retention.js`（单一保留期常量表 + 日扫 + 只标记不删）
- **AI 调用统一用量统计** → `lib/aiusage.js` + `src/admin/admin-ai.js` + `GET /api/admin/ai-usage`

---

## R1 · SQLite 真表结构化（写放大的根，优先级最高）

**现状证据**
- `lib/store.js:33` 全新库只有 `{secret, applicants, stats}`，其余容器由各模块加载时自建；
- 权威写路径 = `saveGateData()` → `sqlite.syncAll(gateData)` 把**整个 gateData `JSON.stringify` 塞进 `kv` 表单行**，再 `JSON.stringify` 一次写 `gate_data.json` 镜像（`lib/sqlite-store.js`）；
- 于是"聊天发一句 / 点一次链接"= 整库序列化 + 整库落盘。审计原话：SQLite 只换来了原子性与 WAL 崩溃恢复，没换来增量更新、索引、行级建模。
- 本轮已做的两处缓解：点击埋点改内存攒批（`lib/track.js`）、保留期清理让各集合有界（`lib/retention.js`）。**这只是止痛，不是治病。**

**目标**：高频写、无界增长、可分页查询的集合搬到真表；`gateData` 只留低频配置类数据。

| 步 | 动作 | 文件 | 回滚点 |
|---|---|---|---|
| 1 | 建表 + 迁移器（版本化 `schema_version`，启动时按版本前进，**只加表不加破坏性 ALTER**） | 新建 `lib/migrations/00x_*.sql`、`lib/migrate.js` | 无迁移即无行为变化 |
| 2 | 先搬**最热的四张**：`chat_messages` / `click_events` / `client_errors` / `visits`（都是 append-only，语义最简单） | `lib/repo/{chat,clicks,errors,visits}.js`；`lib/{chat,track,client-errors,gate}.js` 改调用 | `USE_SQLITE=0` 回纯 JSON；每表带"影子写"开关（同写新旧两处，比对一周再切读） |
| 3 | 再搬 `uploads`（有 `mt`/`mtIssuedAt`/`aid`/`pending`，需要索引与唯一约束）与 `sessions`（`authVersion` 模型已就位） | `lib/repo/uploads.js`；`lib/{siteconfig,files-upload,store}.js` | 同上 |
| 4 | `applicants` 最后搬（身份判定全压在它身上，风险最高） | `lib/repo/applicants.js` | 保留 `gateData.applicants` 读兜底一个版本 |
| 5 | 加"单条写"路径：`UPDATE sessions SET last_seen=? WHERE id=?`，禁用全量 `syncAll` 处理热集合 | `lib/sqlite-store.js` | 保留 `syncAll` 供冷配置使用 |

**验收**：一次聊天发言/一次点击的 `saveGateData()` 调用数从 1 → 0；`gate_data.json` 体积不再随消息数线性膨胀；`scripts/test/test.js` + 新增 repo 层单测全绿；`node live-verify.cjs` 通过。
**风险**：迁移期双写不一致 → 必须"影子写 + 只读切换"两步，禁止一次性换库。

---

## R2 · UploadService 统一流水线（四条上传入口共用一条道）

**现状证据**：`lib/files-upload.js` 一个文件同时承担直传、分片、审核、压缩、R2、广播、删除（审计点名的"模块过胖"）；`lib/bigscreen.js` 与白板上传各写一套 `req.pipe(createWriteStream)`；本轮已把四件套（CL 预检 / 流式计数 / 超限 destroy / 失败 unlink）补到 `bigscreen.js`，但**形态仍是复制的**。

**目标**：`上传 → 隔离区 → 校验(magic/解码) → 配额预留 → 审核 → 转码 → 落名 → 发布 → R2 outbox`，四个入口只调用不重复实现。

分步：① 抽 `lib/upload/{stream,quota,magic,moderate,transcode,publish}.js`，`files-upload.js` 退化为编排层；② 隔离区 `.quarantine/` 取代"直接写 photos/videos 再删"；③ 存储名改服务端生成（`upload_id = randomUUID()`，`original_name` 入数据库列）——这一步同时根掉本轮"跨扩展名覆盖"那一类问题的**再发可能**（本轮已用 `linkSync` 原子改名止血）；④ `bigscreen.js`/白板/通用上传全部改调 `UploadService`；⑤ 配额从"事后统计"改为"上传前预留 + 完成确认"。
**回滚点**：入口逐条切，每条独立；④ 之前旧路径长期保留。
**验收**：新增一条上传入口不写任何磁盘/限流/审核代码；`lib/upload/*` 单测覆盖 magic 校验与配额预留释放对称。

---

## R3 · 身份系统 2.0（visitor / session / 设备信号 三分）

**现状证据**：本轮已把"UA 参与授权"从私有媒体可见性上摘掉（`authVid` 只认本人有效 vid），并让 `isMineUpload` 对无 `aid` 存量做一次性迁移。但**识别与授权仍混在一套键里**：`vid` / `pass` / `dk` / `localId` / `fpSet` 互为兜底，`gate.js:findVisitorId` 里 UA 归并仍是"完全匿名未认领档案"的兜底通道。审计原则：**UA/Canvas/WebGL/IP 只可用于风险识别，绝不可用于授权**。

分步：① 新建 `visitor`（256-bit 随机、HttpOnly Cookie、服务端行）与 `session`（`authVersion` 已有）两张真表（依赖 R1 第 3-4 步）；② `isMineUpload` 只查 `uploads.owner_visitor_id = session.visitor_id`，**存量迁移窗口结束后彻底删除 dk 兜底**（这会让清过 Cookie 的人认领不回历史上传——需主人明确批准，本轮就是按这条做的，代价已记 ADMIN_GUIDE）；③ 提供"身份认领"自助流：让老访客用一次性口令/后台核对重新绑定，替代 UA 猜测；④ `fpSet/localId` 降级为风险信号列，不再出现在任何授权表达式里。
**回滚点**：②③ 各自独立；②未做完前保留现有一次性迁移。
**验收**：全仓 grep 无 `=== dk` 出现在授权判定；同 UA 两访客互不可见（本轮测试已钉）；清 Cookie 用户有自助恢复路径而非只能找管理员。

---

## R4 · 内容审核前移 + 视频审核

**现状**：图片降采样送样、三态裁决、公开展品 fail-closed 已落地；**视频完全不审**（需 ffmpeg 抽帧 + 多模态调用成本）。
分步：① 抽 3 帧（首/中/尾）走同一 `imgB64Sample`；② 只对**公开面**内容启用（白板已是公开，视频目前都在受门禁的展示区，普通模式下对外不可见 → **收益需先确认再花这笔钱**）；③ 审核结果入 `moderation_jobs` 表，失败走 R5 的 outbox 重试。
**代价明示**：每条视频 3 次视觉调用 + 服务器 ffmpeg CPU（2 核小机）。建议先只做"待审队列 + 人工批准"（后台已有批准语义），零 AI 成本。

## R5 · R2 持久 outbox（本轮在途，与本文件 R1/R2 对齐）

媒体对象同步已有超时与进程内重试；持久台账（独立小文件 + 退避 + pump + 统计）由本轮并行实现。
待接：`stopOutbox()`/`flush()` 进 `server.js` 优雅关闭；`.gitignore` 收台账；后台"R2 待发队列"面板（需 R1 的表或沿用台账文件）。

## R6 · 不变发布目录（immutable release）

已单独成文：`scripts/release-symlink-plan.md`（`releases/<sha>` + `current` 符号链接原子切换 + 失败回滚 + 只部署 CI 验过的 artifact）。本轮已完成的相邻改进：CI 闸门（`release.sh` 读 `conclusion` 才部署）、`--no-prune` 差集清理、后端备份移出 web root、`accept-new` + 可固定 `known_hosts`。**未做**：服务器目录结构与 pm2/nginx 指向改造（需停机窗口）。

## R7 · CSP nonce 化

**现状**：`script-src` 仍含 `'unsafe-inline'`（AGENTS 记为"全站多页内联脚本去 nonce 化是独立工程"）。本轮相关改进：`wasm-unsafe-eval` 已替代完整 `unsafe-eval`、SVG 上传已禁、后台媒体 URL 不再携带令牌。
分步：① 先消灭**内联事件属性**（后台 30+ 处 `onclick` 是最难的一块，改成 `addEventListener` + `data-*`，与本轮 `Object.assign(window,…)` 装配契约冲突需一并设计）；② Vite 构建期注入 nonce（`transformIndexHtml` 钩子 + `nonce="***"` 占位替换）；③ 每页 `style-src` 同理。
**风险**：任何漏网内联脚本都会静默失效——必须逐页配探针，不能一把梭。**建议排到最后**，与 R2 的后台改造合并做。

## R8 · RBAC（多管理员分级）

**现状**：单一 `TOKEN` + 8 小时 HttpOnly 会话（本轮）；`adminSessions` 只存哈希。审计建议 `content_admin / media_admin / analytics / super_admin` 四级。
**判断**：本项目是**单人运维**，RBAC 的边际价值低于其引入的会话/授权面复杂度；且真正放大数据泄露后果的是"TOKEN 进 URL"和"备份在 web root"，这两条本轮已修。
**建议**：不做通用 RBAC，若将来加协作者，直接实现 R3 的 account+role 两列 + 端点级 `auth` 枚举（`routes.js` 已经是声明式单表，加一档 `auth:'mediaAdmin'` 成本很低）。

---

## 需要主人拍板才能继续的三点

1. **R1 迁移节奏**：是否接受"影子写 + 只读切换"的两步走（多写一份数据一段时间，换零停机）。
2. **R2 的存储名改造**：物理文件名从"用户可影响的名字"改成服务端 UUID 后，服务器目录与 R2 对象键会整体换貌，**现有分享链接/后台列表需重算**，且历史文件需一次性重命名。
3. **R4 成本**：视频审核是持续真金支出（抽帧 + 多模态调用 + 2 核机器 CPU）；还是先用"待审队列 + 人工批准"零成本方案。
4. **IP 最小化**：审计建议 IP 存 `/24` 或 `HMAC(ip, rotatingSalt)`。会削弱"同设备重进申请"的判定与 `blockedIps` 精度，属安全↔隐私取舍，未经批准本轮**未做**。
