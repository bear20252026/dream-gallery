# 梦幻画廊(Dream Gallery)

> 昆仑灵鉴 · 万镜画廊 —— Three.js 3D 交互画廊 + Node 零依赖单文件后端。
> 女娲补天神话包装:答题门禁攒灵蕴 → 天穹愈合 → 六合灵蕴收集 → 飞舟自由飞 → 空中永恒展厅。

## 这是什么

一个自托管的 3D 交互画廊网站。访客在沙海昆仑之间行走、滑翔、收集六枚灵蕴,
把自己的照片挂上墙;主人通过后台审批、策展、看数据。

- **3D 场景**:建筑展厅 + 西域沙海无限地形 + 昆仑雪峰(实心山铁律)
- **玩法**:互动序章(残镜四幕)→ 心象共鸣答题(60 分门禁)→ 天穹里程碑 →
  六灵蕴收集(乱序拾取/光柱指引/HUD 箭头)→ 飞舟六航路首飞+手动自由飞 → 永恒展厅(晨光留影/放下与召回)
- **子系统**:白板共创、音乐演奏器、聊天室(昆仑之灵 AI 回帖)、TTS 语音、AI 看图配文、访客上传/链接
- **双模式展示区**:普通模式(图库空框策展)/ 特殊模式(全展示),媒体文件级门禁

## 技术栈

- **前端**:原生 ES Modules + Three.js 0.160(开发态原生 ESM 直跑,生产 Vite 8 打包)
- **后端**:Node.js 零依赖单文件路由(`server.js` + `lib/` 14 模块),数据库即 `gate_data.json`
- **基建**:Cloudflare CDN/R2(媒体)+ 阿里云源站(pm2 `gallery`)+ GitHub 私有仓(代码异地备份)

## 目录结构

```
server.js          # 后端入口(仅 require + 路由 + listen)
lib/               # 后端模块:config/util/store/gate/admin/quiz/files/siteconfig/vision/track/docs/chat/abuse/tts
src/               # 前端 ES 模块(main.js 按序 import)
  ctx.js           # 共享总线:登记册 + 7 命名空间(ui/kunlun/player/scene/media/gallery/mode)
  ui/overlay.js    # 弹层注册处(冷核心)
  state/store.js   # 存档登记处(localStorage 唯一入口,冷核心)
  shared/          # mediarules.mjs 媒体可见性决策表(前后端同一份)
  scene/ gallery/ gate/ kunlun/ styles/
scripts/           # test/(两套测试) probe/(实机探针) gen/(构建/生成器)
tools/             # backup-gallery.sh(云端备份) r2-upload.js(R2 上传)
questions/         # 题库(公网 404,含答案)
docs               # AGENTS.md(工程档案) ADMIN_GUIDE.md(后台手册) RFC-架构深化.md KUNLUN_PLAN.md
```

## 本地开发

```bash
export PATH="/c/Program Files/nodejs:$PATH"   # Windows Git Bash 必做
npm install                                   # postinstall 自动同步 vendor/
npm run dev                                   # Vite 开发服务器 :5173(API/媒体代理到 :3000)
node server.js                                # 或裸跑后端 :3000(原生 ESM 入口)
```

## 测试(上线前必跑,全绿才部署)

```bash
node scripts/test/test.js          # 后端 127 项(数据校验/API/安全边界/审批门/上传/邀请)
node scripts/test/test-mobile.js   # 手机端渲染 6 项(iPhone 模拟:着色器/JS 异常/空屏)
# 专项探针:overlay 12 · store 11 · media-rules 8 · ark-free 13 · spirit-hud 5 · ctx-bus 8 · security-fix 11
```

## 部署

```bash
npm run build                     # → dist/(index.html + assets/* hash 分包)
# dist 全量上传 /opt/gallery(先 assets 后 index.html);改 server.js/lib/ 才 pm2 restart gallery
```

详细规矩(媒体门禁/灯光限额/视频码率/HMR/弹层/存档/ctx 命名空间/安全基线)见 **AGENTS.md**;
访客玩法与后台操作见 **ADMIN_GUIDE.md**;神话文案层设计见 **KUNLUN_PLAN.md**。

## 版本与备份

- 本地 git(main)+ GitHub 私有仓 `bear20252026/dream-gallery`,每次部署前 commit + push
- 云端 cron:daily 03:17(数据库+照片+音乐+代码,留 14 份)/ weekly 周日 04:23(视频,留 2 份)→ `/opt/backups/`

---

*三千年来,第一个带着真意推开这扇门的,是你。*
