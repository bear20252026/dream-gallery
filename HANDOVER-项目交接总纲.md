# 梦幻画廊 · 项目交接总纲(2026-07-28)

> **这份文档写给接手项目的下一位开发者/AI。请先完整读完再动手。**
> 深度细节另有四份姊妹文档:`AGENTS.md`(工程档案·规矩全集)、`ROADMAP-需求对齐清单.md`(需求缺口逐项)、
> `ADMIN_GUIDE.md`(后台操作手册)、`RFC-架构深化.md`(架构演进记录)。冲突时以本总纲为索引、以 AGENTS.md 为准。

---

## 0. 30 秒看懂这个项目

《梦幻画廊：昆仑灵鉴》—— 自托管 3D 交互画廊网站。女娲补天神话包装:
访客答题攒"灵蕴"修补天穹 → 天穹 100% 后收集六枚灵蕴 → 驾驶灵蕴飞舟穿越六条航路 →
抵达空中永恒展厅 → 解锁"六合藏梦人"称号。另有白板共创、音乐地板、聊天室(AI 回帖)、
访客上传照片/视频上墙、AI 看图配文、TTS 全站语音、双模式展示区(普通/特殊)。

- **线上**:https://cloudbear.cloud(Cloudflare CDN 前置)→ 阿里云 `101.133.235.110`(pm2 进程名 `gallery`,目录 `/opt/gallery/`)
- **代码备份**:本地 git(main)+ GitHub 私有仓 `bear20252026/dream-gallery`
- **数据备份**:服务器 cron 每天 03:17(数据库+照片+音乐+代码,留 14 份)/ 每周日 04:23(视频,留 2 份)→ `/opt/backups/`

---

## 1. 技术栈与目录

- **前端**:原生 ES Modules + Three.js 0.160,`src/` 下分 scene/gallery/gate/kunlun/ui/state/shared/styles。
  开发态根 `index.html` 原生 ESM 直跑(importmap→`vendor/`);生产 Vite 8 打包 `dist/`(8 个 html 入口 + assets hash 分包)。
- **后端**:Node 零依赖,`server.js`(仅 require+路由+listen)+ `lib/` 15 个模块。
  **数据库就是 `gate_data.json` 单文件**(运行时生成,git 不跟踪,cron 每日备份)。
- **AI**:全站 AI 走 `lib/aichannels.js` 唯一入口——小米 MiMo 首选(tp 订阅 → sk 按量)→ moonshot → Kimi 会员。
- **媒体**:照片/视频/音乐在 `photos/` `videos/` `music/`;户外大屏 5 视频走 Cloudflare R2 CDN(`cdn.cloudbear.cloud`)。

```
server.js lib/            后端(路由+15 模块)
src/main.js               前端入口(按序 import 26 个模块,职责唯一权威清单)
src/ctx.js                共享总线:登记册 + 7 命名空间(ui/kunlun/player/scene/media/gallery/mode)
src/ui/overlay.js         弹层注册处(冷核心)
src/state/store.js        存档登记处(localStorage 唯一入口,冷核心)
src/shared/mediarules.mjs 媒体可见性决策表(前后端同一份)
scripts/test/             test.js(127 项) test-mobile.js(6 项)
scripts/probe/            10+ 实机探针(overlay/store/media-rules/ark-free/spirit-hud/ctx-bus/kintsugi/titlecard/security-fix…)
tools/backup-gallery.sh   云端备份脚本
```

---

## 2. 已完成清单(截至 2026-07-28,全部在线运行)

### 主线玩法(全链路可玩通)
- 冷启动互动序章(残镜四幕回放+"我愿意/再想想",3 秒默认,只播一次)
- 心象共鸣答题(神话/理科/文科三卷;9 选择+1 问答;60 分门禁;逐题批改;过渡语十句;裂纹动态背景:答对亮一丝/满分金光填满昆仑剪影;答满 5 题半程轻反馈)
- 雅号双渠道(进馆 5 秒弹窗+设置页;六灵蕴后可冠前缀)
- 天穹进度(答题+1/上传+5,11 档里程碑大字+TTS,100% 出选择对话框)
- **金缮天花板**(2026-07-28):补天 100% 后天花板半透明金缮纹理,注视时 0.55→0.95 发亮
- 第二卷文字+六灵蕴收集(乱序拾取/光柱指引/屏顶 HUD 箭头+距离/野灵感应微光/六段专属 TTS)
- 六齐终章(大字+TTS+六色光束)+罗盘六灵蕴页(进度/前缀/召回/传送)
- 灵蕴飞舟:山巅登舟、首飞自动巡礼六航路(60 秒+短诗 TTS)、手动自由飞(WASD+冲刺+能量+第三人称追尾+疆域/天顶软限制+撞地钳制)
- 空中永恒展厅(六边形浮空/底部光束/金门;零 PointLight):晨光留影/暖色壁炉(灵蕴染色)/风铃(24h 三响)/飘雪之窗/重置视角/放下与召回(上限 3,软删除铁律)
- 终章三件套:俯瞰天穹/心象投影(蒙太奇残影)/灵蕴归位(六墙印记全点→**称号解锁卡片**:六色旋光+确认/稍后修改/✕/Esc/点外圈)
- 退出/回归文案(切走留"昆仑留着你的光";老访客残镜小字"它们还在等你")

### 支撑系统
- 双模式展示区(普通:图库空框策展/特殊:全展示)+ 链接模型系统 + 访客自定义链接
- 访客上传(全格式/哈希去重/+5 进度/AI 配文四象归墙/悬浮路标指引)
- 白板共创(SSE 即时刷新)、音乐演奏器、房屋分组换色、聊天室+昆仑之灵 AI 回帖
- TTS 全链路(代理+限流+缓存)、AI 看图配文("昆仑替你记得："前缀)
- 后台 admin.html(审批/统计/历史/答题记录/展示区/文件管理/协议编辑器/预警/导出 xlsx)

### 工程与基建(2026-07-28 一天集中落地)
- **架构深化五项**:弹层注册处 overlay.js / 存档登记处 store.js(24+ 键收编)/ 分数线单一源(passScore 下发)/ 媒体规则单一源 mediarules.mjs(前后端同表)/ ctx 总线 7 命名空间+扁平写软冻结(610 处迁移)
- **OWASP 审计修复**:SVG 禁脚本/admin 引号转义 j()/vid 归属优先/限额/常量时间 token/safeJoin/安全头(XFO 后收窄为仅 admin/docs——全站 SAMEORIGIN 曾误伤主站被外链嵌套)
- **AI 通道单一源 aichannels.js**:小米 MiMo 三合一(文本 mimo-v2.5-pro/视觉 mimo-v2.5/语音 mimo-v2.5-tts)
- **备份体系**:本地 git+GitHub 私有仓、服务器 cron 每日/每周快照
- **隐性修复**:TTS spawn 双击回调→502 双写崩进程保险丝;畸形 URL 400;uploads 归属 vid 令牌
- **测试体系**:test.js 127 项 + test-mobile 6 项 + 10 个专项实机探针(全部当前全绿)

---

## 3. 未完成清单(按建议优先级;逐项细节见 ROADMAP-需求对齐清单.md)

### 快赢(≤1 天/项)
| # | 事项 | 要点 |
|---|------|------|
| C2 | **展厅选片导入**(永恒展厅从本人上传选 ≤20 幅) | 罗盘加选片页+展厅挂点位;可见性走 mediarules,不做二次判断 |
| C6残留 | 无(已完成) | — |
| B3 | 飞舟结界(0~5 颗泊位半透明结界+轮廓,靠近软推离) | 纯视觉壳,不动物理 |
| D4 | 低画质手动开关(设置页档位,复用 main.js 自适应画质) | 小 |
| B6 | TTS 音色分层(收集/航路/展厅/称号;小米 TTS voice 参数) | 只动 aichannels/tts |
| C8 | NSFW 图片审核(上传时 AI 检测,拒传提示「这片灵蕴暂时无法归位」) | 复用 aichannels 视觉通道 |

### 主力(1~2 天/项)
| # | 事项 | 要点 |
|---|------|------|
| B1 | 六齐转场(镜头拉升穿云浮现展厅轮廓,~5 秒) | 纯镜头动画 |
| B2 | 飞舟外观 1~6 颗逐级进化(材质/发光件切换) | 复用现有装饰件按收集数显隐 |
| C4 | 成就徽章 10 项(六灵蕴+六合归位+天空访客+云端归宿+补天者) | 罗盘新页+解锁钩子,复用 overlay/store |
| C5 | 航路悬浮平台(六航路中段浮空台可降落) | 复用 endFree land |
| C7 | 裂隙彩蛋(补天 30~50% 停滞时地图出小彩蛋) | 沙漠小物件+进度判定 |

### 立项(2~4 天)
| # | 事项 | 要点 |
|---|------|------|
| D1 | **流光路线指引**(飞舟阶段大地图发光路线 20~30 段,飞过一段消一段) | 最重工也最值;手机 Bloom 换 additive 材质替代 |
| D2 | 神殿建筑群(分期:东殿灵蕴 3D→西殿藏经→北塔→连廊广场) | 分期做,不一次吞 |
| C9 | 多人可见称号/访问他人展厅(需主人拍板范围) | 涉及可见性规则,先问主人 |

### 有意偏离设计文档(不要"纠正")
白板涂鸦上墙(文档说仅本地)、照片不可真删(数据铁律)、飞舟有物理手感、照片不走加密存储而走文件门禁。

---

## 4. 执行标准(铁律——违反任何一条都算事故)

### 4.1 测试门禁
1. **任何改动部署前必须全绿**:`node scripts/test/test.js`(127 项)+ `node scripts/test/test-mobile.js`(6 项);相关专项探针同步跑。
2. 前端语法:`node --input-type=module --check < src/文件`;后端:`node --check lib/文件`。
3. Node 必须 `export PATH="/c/Program Files/nodejs:$PATH"`(Windows Git Bash)。
4. 新功能**必须配探针**(scripts/probe/ 实机验收),探针全绿才许部署。
5. 测试屏蔽 AI key 必须连同 `MIMO_API_KEY` 和 `MIMO_TP_API_KEY` 一起屏蔽(评分用例确定性走本地细则)。

### 4.2 部署纪律
1. `npm run build` → `dist/` **整目录全量上传**(assets 哈希每版都变;只传部分会让旧包 404 白屏)。
2. 只改 src/ 不用 pm2 restart;改 server.js/lib/ 必须 `pm2 restart gallery`。
3. 部署后必跑 `node scripts/probe/debug-browser.js https://cloudbear.cloud/ 15` 确认零 pageerror。
4. **每次部署前 commit + push**(推送被家里运营商掐线时,经 GitHub MCP 的 API 通道同步,网络恢复后 `git pull --rebase` 对齐)。
5. 改 `main.js` 的 `window.__BUILD__` 值可强制刷新产物哈希(绕 CDN 缓存)。

### 4.3 代码规矩(详见 AGENTS.md 对应条目)
1. **弹层**:只许 `ctx.overlay.register()` + **`api.open()` 必须调一次**(不入 Esc 栈的弹层 Esc/点外圈全哑——血泪)。
2. **存档**:只许 `ctx.store.*`(store.js SCHEMA 登记册),**禁止直写 localStorage**(探针会扫);新键先登记。
3. **ctx**:新属性先在 ctx.js 登记册登记;新代码写命名空间路径(ctx.ui/kunlun/player/scene/media/gallery/mode);别名集已冻结。
4. **媒体可见性**:只许改 `src/shared/mediarules.mjs` 一个文件;场景"隐藏"≠文件不可下。
5. **AI**:只许走 `lib/aichannels.js`;密钥只在环境变量(.env/服务器),**永不进代码、永不进 git**。
6. **灯光**:新增灯光先算手机账(点光源手机 ≤16);装饰发光用 emissive 材质,不用 PointLight;展厅/飞舟零 PointLight。
7. **视频**:新视频先压 ≤500kbps 再传;同页多路视频必须走 vE 调度,禁止裸 autoplay。
8. **安全**:用户数据进 HTML 用 esc()/textContent;进 onclick JS 字符串用 admin.html 的 `j()`;SVG 响应必须带 `script-src 'none'`;真删接口仅后台 token(玩家只能软删除)。
9. **飞行总锁**:`ctx.flightLock` 存在时,新增"传送/位移/海拔触发"类功能必须先检查。
10. **实心山铁律**:任何摆放/传送落点必须经 `ctx.desert.assertAboveGround(x,y,z,tag)` 校验。
11. **文案通道**:反馈 toast 一律 `ctx.modeToast`;AI 配文前缀只在 paintings.js showAI 显示层加,不进库存数据。
12. **HMR**:接热更新的模块三行接入法(hotBegin/hotEnd/accept),自定义清理放 `bag.custom`。

### 4.4 数据与隐私
1. 玩家不能真删任何服务器数据(放下=软删除可召回;真删仅后台 token)。
2. gate_data.json 是隐私数据,不入 git(每日快照备份在服务器 /opt/backups/)。
3. dk(设备指纹)只比对不下发;聊天记录渲染一律 textContent。
4. 改门禁/权限/可见性逻辑任何一处,必须跑全套 test.js 并同步 mediarules/canServeMedia 两层。

---

## 5. 血泪教训速查(接手前必读,每条都是真金白银)

| 症状 | 根因 | 防线 |
|------|------|------|
| 手机端建筑整片隐形 | 59 盏点光源超手机 GPU uniform 上限 | 灯光限额(main.js)+ test-mobile |
| 视频卡成 PPT | 着色器同步编译冻结 + 单条 TCP 流码率卡线 | checkShaderErrors=false+compileAsync;视频 ≤500kbps |
| 门禁照片对全员公开 | Cloudflare 边缘缓存 200 | 门禁媒体 `private, no-store`+mt 令牌 |
| 弹层按钮全哑/Esc 退不出 | 手写白名单漏登记;register 后没 open() | overlay 注册处+open() 铁律+overlay-probe |
| 六灵蕴存档搬家丢数据 | 24 把 localStorage 键散落 15 文件 | store.js 登记册+旧档迁移内置 |
| 服务器进程崩溃 | spawn ENOENT 时 error+close 双触发回调 → 502 双写 | tts.js 单次保险丝 |
| 上传归属被伪造 | 身份=sha1(UA),UA 可伪造/撞车 | vid Cookie 优先(ownerAid)+mt 令牌 |
| 主站被 kimi.link 嵌不进去 | XFO 全站 SAMEORIGIN 误伤 | XFO 收窄为仅 admin/docs |
| GitHub 推不动 | 家里/阿里云到 github.com 的 TLS 都被拦截 | GitHub MCP API 通道同步;恢复后 pull --rebase |
| 开发入口瘫痪 | 共享规则文件放成 .cjs,浏览器原生 ESM 加载不了 | 双端共享只用 src/ 下的 .mjs |

---

## 6. 环境速查(照抄即用)

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm run dev          # 前后双进程(:5173 前端 + :3000 后端)
npm run build        # → dist/
npm test             # 两套测试
node scripts/probe/debug-browser.js https://cloudbear.cloud/ 15   # 公网验证
# 部署:
cd dist && tar czf /tmp/gallery-dist.tgz . && cd ..
scp -i ~/Downloads/网站私钥bear1.pem /tmp/gallery-dist.tgz root@101.133.235.110:/tmp/
ssh -i ~/Downloads/网站私钥bear1.pem root@101.133.235.110 \
  "cd /opt/gallery && rm -rf assets && tar xzf /tmp/gallery-dist.tgz"
# 改了 lib/server.js 才:pm2 restart gallery
```

- 后台:`https://cloudbear.cloud/admin?token=<见 .env>`;后台操作手册 = `ADMIN_GUIDE.md`
- GitHub 凭据:本机 Git Credential Manager(bear20252026);ima 知识库凭证:`~/.config/ima/`
- AI 密钥:本地 `.env` + 服务器 `/opt/gallery/.env`(MIMO_TP_API_KEY/MIMO_API_KEY/AI_GRADE_*)

---

## 7. 给下一位 AI 的开工建议

1. **先跑一遍全量测试**确认基线全绿,再读 `ROADMAP-需求对齐清单.md` 选任务。
2. 建议从 **C2(展厅选片导入)** 或 **B3(飞舟结界)** 入手——边界清晰、风险小、有现成模式可抄。
3. 每做完一项:配探针 → 全量测试 → 构建 → 部署 → 公网验证 → commit → 更新 ROADMAP 标记。
4. 拿不准的规则**先查 AGENTS.md 再动手**,不要凭感觉"优化"既有逻辑——这个项目所有"奇怪的设计"背后都有一次血泪。
