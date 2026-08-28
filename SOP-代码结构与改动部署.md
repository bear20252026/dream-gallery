# 流程文档：梦幻画廊 · 代码结构与改动部署 SOP

**负责人：** 主人(产品决策)/ Kimi(改码·测试·部署执行) | **最后更新：** 2026-07-28 | **审核周期：** 每次大版本后同步

---

## 目的

给代码小白一张"看得懂的地图":

1. 知道**每个文件是干什么的**——改东西不迷路、不错删
2. 知道**改完代码必须走哪几步**——不跳步,就不会出现"视频音频全消失""白屏"这类事故
3. 知道**电脑上的文件是怎么到云端的**——部署链路一条线,不再被一堆网址搞晕

## 范围

- **包含**:本地代码结构、改动流程、测试门禁、构建部署、上线验证
- **不包含**:后台日常运营(审批/换图/链接,见 `ADMIN_GUIDE.md`);玩法设计(见 `KUNLUN_PLAN.md`)

## RACI 矩阵

| 步骤 | 执行者(R) | 决策者(A) | 咨询方(C) | 知会方(I) |
|------|----------|----------|----------|----------|
| 提需求/定玩法 | 主人 | 主人 | Kimi | — |
| 改代码 | Kimi | 主人 | — | — |
| 本地测试(两套必跑) | Kimi | Kimi | — | 主人 |
| 构建+部署到阿里云 | Kimi | 主人 | — | 主人 |
| 公网验证 | Kimi | Kimi | — | 主人 |
| 更新 AGENTS.md 规矩 | Kimi | 主人 | — | — |

> 一个人干活的项目,RACI 的价值在于:**"全绿才能部署"这条门禁,谁也不能跳。**

## 代码结构地图(2026-07-28 现状)

```
D:\b - 副本 (2)\                ← 工作区根(一切改动都在这里发生)
│
├── index.html                  开发入口(引用 /src/main.js 原生 ESM;生产不用它)
├── server.js                   后端入口:只有 require + 路由分发 + listen,逻辑全在 lib/
├── package.json / vite.config.js   工具链(npm run dev / build / test)
├── data.js                     画/视频清单(npm run gen:data 从磁盘重建)
│
├── src/                        ★ 前端源码(你改 99% 的地方)
│   ├── main.js                 总装配:按序 import 所有模块 + 主循环(相机/灯光/画质)
│   ├── ctx.js                  共享总线:跨模块只准经它传东西
│   ├── hot.js                  HMR 热更新生命周期(hotBegin/hotEnd)
│   ├── scene/                  世界本体
│   │   ├── scene.js            场景/天空/墙/渲染器
│   │   ├── player.js           玩家:移动/跳跃滑翔/相机/触摸白名单(isUiTouch)
│   │   ├── desert.js           西域沙海地形(实心山铁律 assertAboveGround)
│   │   ├── media.js            音乐地板/户外大屏视频序列/CDN 回退/TTS 钩子
│   │   └── effects.js          粒子/烟花等特效
│   ├── gallery/                展厅内容
│   │   ├── paintings.js        挂画/注册表/点击路由/AI 配文显示层
│   │   ├── mode.js             双模式展示+10 种链接模型
│   │   ├── links.js / markers.js / signs.js   外链/路标/标牌
│   ├── gate/                   门禁与访客
│   │   ├── quizgate.js         答题门禁/邀请函
│   │   ├── quiz.js             答题前端
│   │   ├── settings.js         设置面板/昵称双渠道/Esc 总管
│   │   ├── upload.js           访客上传+悬浮路标
│   │   ├── housecolor.js       分组换色
│   │   └── prologue.js         30 秒序章(残镜互动)
│   ├── kunlun/                 昆仑神话层(二期)
│   │   ├── spirits.js          六灵蕴(乱序拾取/屏顶指引 HUD)
│   │   ├── eternal.js          空中永恒展厅(零 PointLight)
│   │   ├── ark.js              灵蕴飞舟(首飞巡礼 + 手动自由飞)
│   │   ├── peaks.js            昆仑巅彩蛋 / finale.js 终章三件套
│   │   └── fireplace/snowwin/windchime/letgo/resetview.js   氛围小件
│   └── styles/main.css
│
├── lib/                        ★ 后端逻辑(server.js 只负责路由到这儿)
│   ├── config.js               env/常量        store.js    gate_data.json 持久化/通行证/指纹
│   ├── gate.js                 邀请函/放行/改名/SSE         admin.js  后台接口
│   ├── quiz.js                 答题评分/AI 阅卷双通道       files.js  静态/上传/gzip
│   ├── siteconfig.js           展示模式/媒体文件级门禁      vision.js AI 看图配文
│   ├── chat.js                 聊天室           tts.js     语音合成   track.js 错误回传
│
├── scripts/
│   ├── test/                   测试:test.js(后端 125 项) test-mobile.js(手机 6 项) verify-all.js(全链路)
│   └── probe/                  探针:debug-browser / prod-media-probe / ark-free-probe 等
│
├── photos/ videos/             媒体库(公开名才公开;门禁媒体 private,no-store)
├── questions/                  题库(含答案,公网 404)
├── vendor/                     three/hls 本地副本(importmap 用)
├── dist/                       ★ 构建产物(npm run build 生成,部署的就是它)
├── gate_data.json              运行时数据库(测试后删除,别手改)
│
├── AGENTS.md                   ★ 工程档案+血泪教训(改规矩必同步)
├── ADMIN_GUIDE.md              后台操作手册(改规则必同步)
└── KUNLUN_PLAN.md              昆仑设计文档
```

**三条铁的关系,一句话记住:**

- `src/` 是你改的地方 → `npm run build` 变成 `dist/` → `dist/` 上传到服务器 `/opt/gallery/`
- `server.js + lib/` 是后端 → 改了它们才需要 `pm2 restart gallery`;只改前端不用
- `index.html`(根)是本地开发用的;**线上跑的是 `dist/index.html`(hash 分包)**,两个不要混

## 部署链路图(电脑文件 → 用户手机)

```
你的电脑 D:\b - 副本 (2)
   │  ① 改 src/ 或 lib/
   │  ② 测试全绿(见下方流程)
   │  ③ npm run build → dist/
   │  ④ tar 打包 dist → scp 到阿里云
   ▼
阿里云 101.133.235.110 /opt/gallery/   ← Node(pm2 进程名 gallery)跑 server.js
   │  端口 3000:直接访问 http://101.133.235.110:3000/(裸后端,调试用)
   ▼
Cloudflare(cloudbear.cloud 域名 + HTTPS 证书 + 边缘缓存)
   │  https://cloudbear.cloud/          ← 用户真正访问的网址
   ▼
用户的手机/电脑浏览器

媒体副链路:videos/户外大屏 → R2 桶(gallery-media)→ cdn.cloudbear.cloud(大视频走 CDN,源站留备份)
本地预览:http://localhost:7100/(Kimi Work 卡片)/ :5173(vite dev)/ :3000(本地后端)——只在你电脑里,外人看不到
```

## 详细步骤

### 步骤 1:说需求
- **谁**:主人 → Kimi
- **如何**:大白话描述即可;涉及玩法规则时说明"文档里哪条要对齐"
- **产出**:对齐后的目标清单(可做/不可做/风险)

### 步骤 2:改代码
- **谁**:Kimi
- **如何**(可维护约定,AGENTS.md 定):
  - 新功能优先**开新模块**(src/ 或 lib/),旧文件只加钩子
  - 跨模块共享**只经 ctx.js**
  - 新弹层三铁律:有 id、id 进 player.js `isUiTouch` 白名单、✕+点外圈+Esc 三种退出
  - 新灯光先算手机账(总额 ≲16,装饰发光用 emissive/Basic 材质,不点 PointLight)
  - 新"传送/位移"功能先查 `ctx.flightLock` 总锁
  - 埋东西进地形前必过 `ctx.desert.assertAboveGround`(实心山铁律)
- **产出**:改好的源码

### 步骤 3:语法快检
- **如何**:
  ```bash
  export PATH="/c/Program Files/nodejs:$PATH"
  node --input-type=module --check < src/改动文件.js   # 前端
  node --check server.js                               # 后端
  ```

### 步骤 4:测试门禁(全绿才能往下走)
- **如何**(2026-08-29 校准):
  ```bash
  npm test                                # = 下面三条
  node scripts/test/test-store.js         # 存档原子写 4 项
  node scripts/test/test.js               # 后端 125 项:数据校验/API/安全/审批门/上传/邀请
  node scripts/test/test-mobile.js        # 手机渲染 6 项:着色器/JS异常/空屏
  npx vitest run                          # 前端单测 82 项
  ```
- 专项探针(改动涉及对应领域时跑):
  ```bash
  node scripts/probe/overlay-probe.js       # 12 项 弹层三铁律
  node scripts/probe/store-probe.js         # 11 项 存档单一出口
  node scripts/probe/media-rules-probe.js   #  8 项 媒体可见性
  node scripts/probe/ctx-bus-probe.js       #  8 项 ctx 命名空间契约
  node scripts/probe/spirit-hud-probe.js    #  5 项 灵蕴指引
  node scripts/probe/ark-free-probe.js      # 13 项 飞舟自由飞(含撞地钳制/疆域回推)
  node scripts/probe/security-fix-probe.js  # 13 项 安全基线
  ```
- 大版本加跑:`node scripts/test/verify-all.js`(门禁→模式→邀请函→特殊访问→彩蛋全链路)
- **产出**:全绿记录(九套专项合计 201 项 + vitest 82 项)。**任何一项红,回到步骤 2,不准部署。**
- **探针跑不起来先查开发入口**:本地门禁探针走的是仓库根 `index.html` 的**原生 ESM + importmap**
  路径。若全部卡在 `waitForFunction` 超时,多半是 `vendor/` 缺文件——跑
  `node scripts/gen/sync-vendor.js` 重建;新增 `three/examples/jsm/**` 依赖时须同时登记
  `sync-vendor.js` 的 `THREE_EXAMPLES` 与 `index.html` 的 importmap(详见 AGENTS.md 相关铁律)。

### 步骤 5:构建
- **如何**:`npm run build` → 确认 `dist/assets/` 里主包哈希变了
- **产出**:`dist/`(index.html + assets/*)

### 步骤 6:部署
- **如何**(2026-08-29 校准,密钥路径已更新):
  ```bash
  # ① 打包(必带 --exclude=models:服务器 /opt/gallery/models 已有 311MB 且不常变)
  cd dream-gallery && npm run build
  cd dist && tar czf "../gallery-dist.tgz" --exclude=models . && cd ..

  # ② 上传(注意:scp/ssh 是 Windows 原生 exe,源路径必须用 Windows 绝对路径)
  scp -i "C:/Users/17296/gk.pem" "C:/Users/17296/<你的路径>/dream-gallery/gallery-dist.tgz" root@101.133.235.110:/tmp/

  # ③ 服务器解包(server.js 直接服务 /opt/gallery 根目录,index.html 与 assets 都在根)
  ssh -i "C:/Users/17296/gk.pem" root@101.133.235.110 "cd /opt/gallery && rm -rf assets && tar xzf /tmp/gallery-dist.tgz"

  # ④ 只有改了 server.js / lib/ 才需要:ssh ... "pm2 restart gallery"
  ```
- **铁律**:`dist/assets/` **整目录全量替换**——哈希变了,只传 index.html 会让旧包 404 白屏
- **纯前端改动无需 pm2 restart**:静态文件即时生效(已线上验证)。只有后端文件变更才重启。
- `--exclude=models` 不可省:`public/models/`(约 138MB)会被打进 `dist/models/`,但
  `remielle.glb`/`strawberry_ship` 从本地 `/models` 加载、avatar 走 CDN,服务器现有 models 保持不动。
  改了模型才需整包重传。

### 步骤 6.5:服务器登录方法(2026-08-29 补)
- **连接方式**:SSH 密钥登录,无密码
  | 项 | 值 |
  |---|---|
  | 主机 | `101.133.235.110`(域名 `cloudbear.cloud`) |
  | 用户 | `root` |
  | 私钥 | 本机 `C:/Users/17296/gk.pem`(**绝不入库**,见下方安全红线) |
  | 应用目录 | `/opt/gallery/`(pm2 进程名 `gallery`) |
- **登录与常用命令**:
  ```bash
  ssh -i "C:/Users/17296/gk.pem" root@101.133.235.110      # 登录
  ssh -i "C:/Users/17296/gk.pem" root@101.133.235.110 "pm2 status gallery"   # 查进程
  ssh -i "C:/Users/17296/gk.pem" root@101.133.235.110 "pm2 logs gallery --lines 50"  # 查日志
  ssh -i "C:/Users/17296/gk.pem" root@101.133.235.110 "pm2 restart gallery"  # 重启(仅后端改动需要)
  ```
- **🚨 安全红线(公开仓,务必遵守)**:
  1. **私钥 `gk.pem` 永不提交**——本仓库 visibility=**PUBLIC**,私钥入库等于把服务器交给全网。
     `.gitignore` 已拦 `*.pem` / `*.key` / `*私钥*` 兜底。
  2. 私钥路径用 `-i` 传入即可,**不要把密钥内容粘进任何文档、对话或 issue**。
  3. 一旦怀疑私钥泄露(误提交/误粘贴/电脑外借),**立即在云平台控制台吊销并重新签发密钥**,
     然后更新本机 `gk.pem`,旧密钥即刻失效。
  4. 服务器 IP 与部署细节本就已随公开仓可见,因此**密钥是唯一的防线**——它绝不能进库。
- **Windows 路径坑**:`scp`/`ssh` 是 Windows 原生 exe,**必须用 `C:/Users/17296/gk.pem` 形式**;
  用 Git Bash 的 `/c/Users/...` 会报 `Identity file ... not accessible`。

### 步骤 7:上线验证
- **如何**(推荐用 `live-verify.cjs`,一次覆盖全部关键面):
  ```bash
  node live-verify.cjs   # EXIT=0 才算过(生产无头探针)
  ```
  它覆盖:零 pageerror · 组合根 9 系统注册齐全 · game-state 种子可用 · effects 烟花逐帧动画 ·
  Stage4 双路径写回(gameState.set 写回 + legacy 直写漏斗)· **交互冒烟(真实登舟进自由飞)**。
- 补充核对:
  ```bash
  curl -s https://cloudbear.cloud/ | grep -o 'assets/main-[^"]*\.js'   # 是新哈希
  ```
- **注意**:html 有 5 分钟 gzip 内存缓存,刚部署读到旧版本不代表没传上——等 5 分钟或 pm2 restart 再验
- **为什么要交互冒烟**:纯加载探针抓不到"只在用户操作时才执行"的代码路径。
  2026-08-29 的 `spiritCount` 无限递归(栈溢出)就藏在飞舟可见性判定里,
  加载期不触发、生产探针一直零报错,直到补上真实登舟才暴露。

### 步骤 8:归档
- **如何**:新规矩/新坑写进 `AGENTS.md`;涉及后台操作的同步 `ADMIN_GUIDE.md`
- **产出**:文档与代码同版本

## 异常与边界情况(全是血泪换来的)

| 场景 | 处理方式 |
|----------|-----------|
| 部署后部分地区白屏 | 只传了 index 没传全 assets,404 被 Cloudflare 边缘缓存。改 `main.js` 里 `window.__BUILD__` 的值重打出新哈希,整目录重传 |
| 改完大 html 立刻验证还是旧的 | gzip 内存缓存 5 分钟。等 5 分钟,或 `pm2 restart gallery` 清缓存再验 |
| 视频卡成 PPT | 单条 TCP 流天花板。新视频一律先压 ≤500kbps 再传(命令见 AGENTS.md) |
| 本地预览视频/音乐"消失" | 本地走 CDN 被 CORS 拦后会自动回退源站副本,属正常;真消失先查 prod-media-probe |
| 手机端建筑整片隐形 | 点光源超手机上限(≈16)。新灯换 emissive/Basic 材质,跑 test-mobile 验证 |
| 门禁照片被所有人看到 | 媒体门禁缓存分级:门禁媒体必须 `private, no-store`;出事就 Dashboard→缓存→Purge Everything |
| 新上传覆盖同名旧文件 | 公开上传禁止覆盖(409),换个文件名 |
| 玩家要"删除"功能 | 数据保留铁律:只做软删除(隐藏+可召回),真删仅后台 token |
| 答题分数线/门禁逻辑改动 | 必须三处同步:lib/quiz.js + test.js + ADMIN_GUIDE.md,并跑全量 test.js |
| 畸形 URL 把进程搞崩 | 新增路径解析必须 try/catch,返回 400 而不是崩 |
| 敏感文件要不要公开 | 进 server.js `staticDenied()` 黑名单;`js/ 源码`公网一律 404 |

## 指标

| 指标 | 目标值 | 衡量方式 |
|--------|--------|----------------|
| 后端测试 | 125/125 绿 | `node scripts/test/test.js` |
| 手机渲染测试 | 6/6 绿 | `node scripts/test/test-mobile.js` |
| 主包体积 | gzip ≈ 195KB 量级 | `npm run build` 输出 |
| 公网健康 | 0 pageerror | `debug-browser.js https://cloudbear.cloud/ 15` |
| 部署到验证完成 | ≤ 10 分钟 | 步骤 6+7 计时 |

## 相关文档

- `AGENTS.md` — 工程档案:结构、规矩、血泪教训(本 SOP 的上位文件,冲突时以它为准)
- `ADMIN_GUIDE.md` — 后台操作手册(审批/换图/链接/规则)
- `KUNLUN_PLAN.md` — 昆仑神话层设计文档
