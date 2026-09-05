# 梦幻画廊 — 项目工程档案

3D 交互画廊(Three.js)+ Node 单文件后端。建筑 + 西域沙海地形 + 跳跃滑翔 + 答题门禁 + 审批门 + 白板/音乐子页 + 双模式展示区 + 访客上传/AI 看图 + 昆仑巅彩蛋。
**访客规则与玩法机关见 `ADMIN_GUIDE.md`(后台操作手册,每次改规则同步更新)。**

## 结构

- `server.js` — 后端入口:只含 require + 路由分发 + listen。逻辑拆在 `lib/`:config(env/常量)、util、store(gate_data.json 持久化/通行证/设备指纹)、gate(邀请函页/自动放行/改名/SSE)、admin(后台接口)、quiz(答题评分/AI 阅卷双通道/特别邀请函)、files(静态/公开上传/删除)、siteconfig(展示模式/自定义链接/演示照片/访客链接)、vision(AI 看图配文)。数据库即 `gate_data.json`(运行时生成,测试后删除)。
- `src/` — 前端 ES 模块(2026-07-27 由 `js/` 迁入并分目录),经 `ctx.js` 共享状态,`main.js` 按序 import。目录:`scene/`(scene/effects/desert/player/media)、`gallery/`(paintings/signs/markers/links/mode)、`gate/`(quiz/quizgate/settings/upload/housecolor)、`kunlun/`(peaks/spirits/eternal/ark/windchime/fireplace/snowwin/resetview/letgo/finale)、`styles/main.css`(原 index.html 内嵌样式)。import 顺序注释仍在 `main.js`,是模块职责的唯一权威清单。
- `vendor/` — npm 三方库的浏览器直跑副本(three.module.js/hls.mjs),由 `scripts/gen/sync-vendor.js`(postinstall 自动跑)从 node_modules 拷贝;index.html 的 importmap 把裸包名映射到这里,**仅本地原生 ESM(非 Vite)运行用**,生产构建直接打包 node_modules。three 锁定 `0.160.0`(与旧 three.mjs 同版,已删)。
- `scripts/` — `test/`(test.js/test-mobile.js/verify-all.js/历史一次性 race/upload 测试)、`probe/`(debug-browser/perf-probe/perf-profile/daynight-probe/light-compile-bench/probe-*)、`gen/`(check.js/gen-data.js/gen-thumbs.js/sync-vendor.js)、`artifacts/`(调试截图)。一次性探针不删,归档备查。
- `public/` — sw.js + manifest.json(Vite 原样拷进 dist 根,URL 不变)。
- `admin.html` — 后台(审批/统计/历史/答题记录/展示区/文件管理)。`guide.html` — 《元素共鸣准则》访客说明书。`whiteboard.html`/`music.html`/`agreement.html`/`privacy.html`/`community.html` — 子页,全部纳入 Vite 多页构建(产物仍在 dist 根,部署路径不变)。
- `official.html` — **B612 官网**(2026-09-06 上线,取代 www 旧 React 官网):绘本式单页,默认英文 + sessionStorage 切中文,零依赖零 3D,字体自托管 `official-assets/fonts/`(国内不依赖 Google CDN),图片 `official-assets/*.webp`(主人的 Dola AI 生成图,水印已由 `dev/process-official-art.py` 去除:垂直克隆/水平镜像克隆两法)。部署见「生产部署」官网条;验收探针 `dev/official-site-probe.cjs`。

## 展示区模式(2026-07-25 主人定,详见 ADMIN_GUIDE.md)

- 判定:`GET /api/siteconfig` 按设备指纹返回 mode;「特殊访问」= `applicants[].special`,只能后台 `POST /api/admin/decide {action:'special'}` 授予,前台不可申请。
- 普通模式:图库照片/视频**框留下、内容面拿掉**(paintGroups 按 src 分级:演示/本人上传全显,图库白卡空框,他人上传整框隐藏;新上传优先换芯空框)、isLink2~13/isGarden 外链由 `ctx.linkGuard` 接管(挂自定义链接可复活)、isLink 卷轴改写为 guide.html、纹理按 `ctx.texAllowed` 逐个放行。
- 链接模型:`mode.js` `spawnLinkModel`(10 种),后台链接(icon=挂原图案/model=新建)、访客链接(gateData.userLinks 按 dk,出现在眼前,pos 由前端传)。

## 上线前必跑(自动化测试)

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm test                          # = 下面三条(test-store + test.js + test-mobile)
node scripts/test/test-store.js   # 存档原子写 4 项(并发保存/截断恢复/tmp 残留)
node scripts/test/test.js         # 后端 125 项(数据校验/API/安全边界/审批门/上传限制/邀请)
node scripts/test/test-mobile.js  # 手机端渲染 6 项(iPhone 模拟:着色器错误/JS异常/空屏)
npx vitest run                    # 前端单测 82 项(collision/EntityRegistry/GameLoop/StateMachine/events/SpatialIndex/store)
```

两个全绿才能部署。前端改动用 `node --input-type=module --check < src/某文件` 查语法;`node --check server.js` 查后端。

## 构建与效率(2026-07-25 Vite 升级)

- **工具链 Vite 8**:`npm run dev` 一键起**前后双进程**(scripts/gen/dev.js:后端 server.js :3000 + Vite :5173,Ctrl+C 同退;CLI 参数如 --port/--host 转发给 Vite;**只起 Vite 不起后端 = 媒体全 404**,2026-07-27 踩过);`npm run build` → `dist/`(**8 个 html 入口**(index/admin/guide/whiteboard/music/agreement/privacy/community,多页构建,产物仍在 dist 根)+ `sw.js`/`manifest.json`(来自 public/,URL 不变)+ assets/* hash 分包,gzip 后 ~200KB);`npm test` 跑两套测试。
- **生产部署**:**先传 assets 再传 html**,且 **`dist/` 必须整目录全量上传**(assets 哈希每版都可能变;2026-07-26 血泪:只传 index 包会让旧包 404 被 Cloudflare 边缘缓存,部分用户长时间白屏;万一中招,改 `main.js` 里 `window.__BUILD__` 的值重打出新哈希即可绕开);上传 `dist/index.html`→`/opt/gallery/index.html`、`dist/assets/*`→`/opt/gallery/assets/`、其余 `dist/*.html`/`sw.js`/`manifest.json`→`/opt/gallery/` 同名;仓库根的 `index.html` 是开发入口(引用 `/src/main.js` 原生 ESM(importmap 把 three/hls.js 映射到 /vendor/),test-mobile 直接用它),**生产用的是 dist/index.html(hash 分包)**,两者不要混。**官网部署(2026-09-06)**:`official.html`+`official-assets/` 不走 dist——`scp official.html → /opt/gallery/landing/index.html`、`official-assets/ → /opt/gallery/landing/`(www.cloudbear.cloud,pm2 `landing` :3100 静态服务,改文件不用重启);同时镜像一份到 `/opt/gallery/official.html` + `/opt/gallery/official-assets/`(主域 /official.html 直达官网,Enter 链接两处都指主域绝对地址,勿改回相对路径)。
- **HMR 分家**:`src/hot.js` 提供 `hotBegin/hotEnd` 生命周期(自动捕获场景对象/ticker/定时器/DOM,热替换时先销毁旧实例;ticker 按引用逐个移除,不会误杀后加载模块)。已接入 **10 个模块**:markers/signs/links/mode/settings/upload/housecolor/effects/peaks/quizgate——改这些文件只热替换对应模块,不整页闪动(实测见 probe-hmr.js)。player/desert/media(有玩家状态/物理/长连接)保持整页刷新。**新模块要接 HMR 就三行**:`import {hotBegin,hotEnd} from './hot.js'` + 顶部 `hotBegin('名')` + 底部 `hotEnd('名');if(import.meta.hot)import.meta.hot.accept()`。**注意**:①模块内要用 `onTick`/`s` 就在 `hotBegin` 之后再从 ctx 解构(拿到包装版);②碰撞体/iG 可交互组/全局事件监听等自动捕获管不到的,用 `const bag=hotBegin('名');bag.custom.push(()=>{...})` 注册自定义清理;③主循环(main.js)对热模块暴露的函数/数据必须调用时从 ctx 现取(如 ctx.updateFireworks、ctx.pG),不能模块顶层一次性解构。
- **gzip**:`lib/files.js` 对 >20KB 的 html/js/css/json 自动 gzip(**内存缓存 5 分钟**),媒体 Range 流式不受影响。**坑(2026-07-27)**:改完大 html 立刻验证会读到 5 分钟前的缓存,误判"没部署上"——等 5 分钟或 pm2 restart 清缓存再验。
- **可维护约定**:新功能优先开新模块(src/ 对应子目录 或 lib/),旧文件只加钩子;跨模块只经 `ctx.js` 共享;模块职责写在 `main.js` 的 import 注释和本文件。
- **开发工具(2026-07-27 引入)**:`npm run lint`(eslint 10 flat config `eslint.config.mjs`,只抓真错误不管风格,历史代码宽松项已关);`npm run format`(prettier,**不批量重排历史文件**——只排版新写/正在改的文件);`.env` 加载走 dotenv(lib/config.js,生产无 node_modules 自动回退手写解析,行为不变)。

## 优化资产(2026-07-25 九大优化落地)

- **照片缩略图**:`node scripts/gen/gen-thumbs.js`(服务器/本地,需 ffmpeg)→ `photos/thumbs/*.webp`(1024px);前端优先拉缩略图,404 回退原图。上传后记得重跑。
- **纹理距离懒加载**:`loadTexCapped(url,onErr,pos)` 带坐标时 35m 内才加载。
- **data.js 同步**:`npm run gen:data` 从磁盘重建 P/V,旧条目顺序与 AI_DESC 配对不变。
- **PWA**:`manifest.json`+`sw.js`(媒体缓存优先 LRU80/静态 SWR)。**注意:公网 HTTP 下 SW 无法注册,需 HTTPS 才生效**(上域名+证书后自动激活)。
- **自适应画质**:main.js 每 2 秒评估帧率,<35fps 降 pixelRatio 档,>52fps 回升,3s 冷却。
- **错误回传**:`POST /api/track/error`(onerror/promise rejection 信标),后台「展示区→访客端报错」可见。
- **白板 SSE**:保存白板作品 → `sseKick` 全端即时刷新,60s 轮询兜底。
- **HLS**:3 号长视频切片 `videos/户外大屏/hls/户外大屏3号.m3u8`(hls.js 动态加载,不进主包;Safari 原生;不行回退 mp4)。换片后需重切:`ffmpeg -i 户外大屏3号.mp4 -c copy -hls_time 10 -hls_playlist_type vod -hls_segment_filename "hls/seg_%03d.ts" hls/户外大屏3号.m3u8`。
- **R2 CDN(2026-07-26)**:户外大屏 5 视频 + HLS 切片全部走 Cloudflare R2(桶 `gallery-media`),前端源在 `src/scene/media.js` 顶部 `CDN` 常量,现为 r2.dev 公开域名;**自定义域名 `cdn.cloudbear.cloud` 在 Dashboard 连好后,把常量改为 `https://cdn.cloudbear.cloud/` 即可多一层缓存加速**。源站 `videos/` 保留作备份。上传用 `node tools/r2-upload.js videos videos`(零依赖 SigV4;**家里网络到 r2.cloudflarestorage.com 的 TLS 被运营商拦截,须 scp 到阿里云服务器上跑**;密钥走环境变量 R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY,不落盘)。桶级 CORS 已放行 cloudbear.cloud 与 localhost:3000。血泪:SigV4 的 URI 必须把 `!'()*` 也百分号编码,否则文件名带括号就 SignatureDoesNotMatch。

## 血泪教训:手机 GPU 灯光数量上限(2026-07-24)

- **症状**:手机端建筑/地形"整片隐形"(碰撞还在、物理正常、无 JS 报错),只剩水面等自定义 shader 可见;电脑完全正常。
- **根因**:手机 GPU 片元 uniform 上限(128~224 vec4)远低于电脑(1024+)。场景当时有 **59 个点光源**,three.js 的 MeshStandardMaterial 着色器链接失败(`THREE.WebGLProgram: too many uniforms`)→ 所有标准材质网格不渲染。
- **关键认知**:着色器编译/链接错误**只走 console.error,不进 window.onerror**,普通错误捕获器抓不到。`index.html` 里的捕获器已同时接管 console.error,报错直接显示在屏幕左下角。
- **防护**:`main.js` 有「灯光限额」——手机端吊顶灯每 3 留 1、装饰氛围光全移除(总额≈13);电脑端每 2 留 1 + 移除 `userData.deco` 装饰灯(总额≈30,见下条)。
- **规矩**:**新增灯光先算手机账**。手机端点光源总额不得超过 ~16 个;装饰性发光优先用 `emissive` 材质,不要 `PointLight`。加灯之后必须跑 `node scripts/test/test-mobile.js`。

## 血泪教训:视频"卡成 PPT"的两个真凶(2026-07-24)

- **真凶一:着色器同步编译冻结主线程(已修复)**。three.js 默认 `debug.checkShaderErrors=true`,每次编译都同步调 `getProgramInfoLog` 阻塞主线程直到 GPU 驱动编完;59 盏点光源的 shader 巨大,单程序编译 0.8~5 秒(实测占主线程 50.8%),材质"首次入镜才编译"→ 走动/切视角时反复冻结,视频丢帧 88%。**修复**:`scene.js` 里 `rnd.debug.checkShaderErrors=false`(排障时 URL 加 `?shaderdebug` 恢复,`test-mobile.js` 依赖它);`main.js` 启动时 `compileAsync` 预编译全部着色器,加载屏淡出等编译完成(15s 兜底)。
- **真凶二:视频码率顶到单条 TCP 流的天花板(已转码治理)**。服务器是 200Mbps 按流量计费,总管道没问题(8 并发合计实测 ~605KB/s);但**单条 TCP 流**跨省跨网仅 ~155KB/s,晚高峰拥塞时会塌到 ~20KB/s(2026-07-24 22:57 实测)。视频播放是单流,大屏1号原码率 1269kbps(≈159KB/s)正好卡线 → 高峰时段必然"缓冲-播放-再缓冲"。裸视频(无 3D)从云端拉流同样卡,与前端无关。**治理(2026-07-24)**:5 个大屏视频已全部转码为 H.264 720p ~400kbps(+AAC 64k,faststart),总码率 ≈475kbps,单流 3 倍余量;原码率备份在本地与云端的 `videos/户外大屏/backup_原码率/`。教训:**新增视频一律先压到 ≤500kbps 再上传**(参考命令:`ffmpeg -i 源 -c:v libx264 -preset fast -b:v 400k -maxrate 480k -bufsize 960k -vf "scale='min(1280,iw)':-2" -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart 出`)。若以后上 CDN 可进一步根治跨网质量。
- **灯光与编译的关系**(实测):点光源 59盏→单程序编译≈822ms,24盏≈208ms,13盏≈103ms。电脑端限额 ≈30 盏既为编译速度也为弱 GPU 视频带宽余量。
- **媒体加载规则(2026-07-24 主人定)**:①答题通过(`ctx.quizPassed`)前,室内图片(`loadTexCapped` 统一拦截挂起)与室内挂画视频(`preload='none'`)一律不加载,带宽全留给室外大屏;通过后图片统一放行、永久保留(地板照片同此),挂画视频按距离调度(近 18m 播/远 22m 停)。②室外大屏(media.js)始终按序轮播;**唯一闸口(2026-07-27):三连读会话标记未齐时 1 号原地循环不推进,签完才从 1 号完整轮播**;**普通模式全线下架大屏 2 号(只播 1/3/4/5),特殊模式完整五个**——清单 `VID_ALL` 在 startVidSeq 按 `ctx.siteMode` 现取,模式切换下一轮循环生效(2026-07-26 主人定)。③同页多路视频同时起播会拖垮弱网/解码,新增挂画视频必须走 `vE` 调度,禁止裸 `autoplay+play()`。
- **诊断工具**:`scripts/probe/perf-probe.js`(rAF 帧率/长任务/视频丢帧/解码能力,`SETTLE_S=秒 node perf-probe.js <url> [采样秒]`)、`perf-profile.js`(CDP CPU Profiler 热点)、`daynight-probe.js`(昼夜相位×卡顿关联)、`light-compile-bench.js`(灯光数 vs 编译耗时,均在 `scripts/probe/`)。页面里 `window.__vidEl/__v45El/__rnd/__ctx` 是探针钩子。`scripts/test/verify-all.js` 是大版本全链路验收(门禁→模式→邀请函→特殊访问→彩蛋,改 UA 可当新访客)。

## 环境

- Windows + Git Bash;Node 必须 `export PATH="/c/Program Files/nodejs:$PATH"`。
- 云端:阿里云 `101.133.235.110`,pm2 进程名 `gallery`,目录 `/opt/gallery/`。SSH 密钥:`~/Downloads/网站私钥bear1.pem`。部署:`scp -i <密钥> <文件> root@…:/tmp/ && ssh -i <密钥> … "mv … /opt/gallery/"`(只改 src/ 静态文件不用 pm2 restart;改 server.js/lib/ 才需要)。
- **AI 通道单一源(2026-07-28 主人定)=lib/aichannels.js**:全站 AI 能力(文本/视觉/语音)唯一入口,**小米 MiMo 首选**(MIMO_API_KEY 走环境变量,不落盘):文本 mimo-v2.5-pro → moonshot kimi-k2.6 → kimi-for-coding;视觉 mimo-v2.5 → moonshot-v1-8k-vision → kimi-for-coding;语音 mimo-v2.5-tts(限免)→ edge-tts 本地兜底(在 tts.js synth 内)。消费方:quiz.js 阅卷/vision.js 配文/chat.js 昆仑之灵/tts.js 语音。**新增/调整 AI 通道只许改 aichannels.js**;测试屏蔽 key 必须连同 MIMO_API_KEY 一起屏蔽(test.js 评分用例确定性走本地细则)。
- 无头浏览器验证:`node scripts/probe/debug-browser.js <url> [秒]`(抓 console/pageerror/失败请求);截图注意无头环境加载比真机慢,等 15s+ 再操作。

## 约定

- **弹层规矩(2026-07-28 深化⑤,取代手工三铁律)**:新弹层只需 `ctx.overlay.register(el,{x:'#✕选择器',...})`(src/ui/overlay.js 深模块,冷核心)——✕(事件委托,重渲染不失效)+点外圈+Esc 栈(后开先关)+触摸白名单(data-overlay 标记)**全部自动**,**禁止再手写** isUiTouch id 清单/点外圈监听/Esc 监听。配置项:`canClose(reason)` 拦截('esc'/'outside'/'x'/'api',如答题中禁点外圈)、`onOpen/onClose`(副作用钩子,如聊天轮询)、`touchOnly`(非弹层只过白名单:飞舟 HUD/序章/一次性弹窗)。热模块注册后必须 `bag.custom` 里 `unregister()`。**register≠入栈:DOM 显示后必须 `api.open()` 一次**(2026-07-28 称号卡片血泪:只 display:flex 不入 Esc 栈,Esc/点外圈全哑,titlecard-probe 抓获)。Esc 优先级:overlay.js 在 main.js 最先 import,有弹层先关弹层,栈空才轮到飞舟飞行/画作放大/设置面板。居中独立三级页、不准往设置面板里塞——这条不变。验收:scripts/probe/overlay-probe.js(12 项)。
- **存档规矩(2026-07-28 深化②)**:前端 localStorage **唯一入口是 `ctx.store`**(src/state/store.js 深模块,冷核心,main.js 紧随 overlay import)——键名字符串只允许出现在 store.js 的 SCHEMA 登记册,业务代码**禁止直写 localStorage**(探针第 8 项会扫)。接口:`num/setNum`(等价 `+(getItem||0)`)、`str/setStr`、`json/setJson`(坏数据回退 def,不抛)、`flag/mark`(一次性标记)、`getSpirits/addSpirit`(灵蕴库存,内置旧档迁移:顺序时代数量键→前 n 颗;addSpirit 同步写兼容数量键)、`houseColor/setHouseColor/clearHouseColor`(动态组键)。**新增存档键先去 SCHEMA 登记**(未登记键调用即抛「未登记」);sessionStorage 会话级键不进 store。验收:scripts/probe/store-probe.js(11 项)。
- **ctx 总线规矩(2026-07-28 深化①,阶段二/三已上线)**:ctx.js 是全量登记册 + 7 个命名空间(`ctx.ui` 反馈 / `ctx.kunlun` 神话层 / `ctx.player` 玩家门禁 / `ctx.scene` 场景内核 / `ctx.media` 媒体户外 / `ctx.gallery` 挂画房屋 / `ctx.mode` 展示模式,共 107 个映射属性)。**扁平写已软冻结**:映射属性扁平写仍放行但 dev 环境(localhost/?ctxdebug)告警一次;全 src 610 处已迁完、扁平写零残留。规矩:①新挂属性必须先在 ctx.js 登记册对应分组登记;②能收进深模块(overlay/store/mediarules)的不挂总线;③新代码写命名空间路径,别名是 get/set 活委托、扁平读永久等价;④命名空间已冻结,不许往别名集塞新键;⑤dev 控制台「ctx软冻结」告警=走老路,改命名空间。批量迁移用 `node scripts/gen/ctx-alias-codemod.js <目录> all --dry` 先演练。验收:scripts/probe/ctx-bus-probe.js(8 项)。
- **写路径单入口规矩(2026-08-29 Stage4,组合根 + 单向状态,详见 RFC-架构深化.md 候选①阶段四/五)**:运行时可变状态的**唯一写入口是 `gameState.set(prop, val)`**(`import {getGameState} from '<按目录层级>/core/game-state.js'`,如 `src/gallery/mode.js` 用 `'../core/game-state.js'`、`src/ctx.js` 用 `'./core/game-state.js'`),写完自身 state 后经 `bindNamespace` 的 write-through 回写 `ctx.<ns>.<prop>` 并发 `${ns}:changed:${prop}` / `${ns}:changed` 事件;**读者照旧 `ctx.<ns>.<prop>`,经 vault 零改动**。已绑定(在 `ctx.js` 命名空间创建处**早注册**,早于模块导入期):`mode` 7 个配置下发 prop(siteMode/customLinks/demoPhotos/myUploads/myUploadTokens/myLinks/myCaptions)、`player`(quizPassed/viewMode)、`kunlun`(flightLock)。**委托冻结**:已绑 prop 的命名空间 set 陷阱委托 `gameState.set`,故 legacy 直写 `ctx.mode.x=v` 仍可用但**自动收归单入口**(幂等守卫防回环,apply 直写 vault 不经陷阱防递归)。**三类刻意不绑,别手贱去绑**:①每帧高频 prop(`pl`/`jD`/`ks`/`mv`/`drM`/`dayHour`——绑了每帧刷事件+存储);②初始化期能力/函数注册(`applyMode`/`texAllowed`/`eternalHandlers`/`hangOne`…,一次性注册非运行期状态);③集合原地变异(`houseMats`/`paintGroups`/`myUploads` 的 `.push`——不触发 set 陷阱,本就不发事件)。**新系统**按 `defineSystem({layer,phase,order,deps,init,update,dispose})` 契约写在 `src/core/`,并在 `main.js` 组合根 `compositionRoot.register(...)`;层序 platform→engine→gameplay→presentation。诊断钩子:`window.__compositionRoot.list()` / `window.__gameState` / `window.__ctx`。验收:`node live-verify.cjs`(生产双路径探针:gameState.set 写回 + legacy 直写漏斗 + 烟花逐帧回归,`EXIT=0` 才算过)。
- **昆仑灵鉴文案层(2026-07-26)**:全站神话包装已上线(详见 KUNLUN_PLAN.md)。规矩:①AI 配文前缀「昆仑替你记得：」只加在 paintings.js `showAI` 显示层(幂等),**不写进库存数据**;②反馈 toast 一律走 `ctx.modeToast`,不新造组件;③答题门槛 **60 分**(原 95,2026-07-26 主人定),三档反馈=满分/≥60/<60 邀请函;**分数线单一源=lib/quiz.js `QUIZ_PASS_SCORE`**(2026-07-28 深化③):test.js 与前端(player.js 提示/quizgate)全部自动跟随——前端经 `/api/quiz/state` 与 `/api/quiz/start` 的 `passScore` 字段下发,改分数线只需同步 lib/quiz.js + ADMIN_GUIDE.md 两处;④逐题批改走 `POST /api/quiz/judge`(只回布尔、每题每会话限判一次),**正解字母永不下发浏览器——神话卷(track=shen)除外**:该卷题库独立(questions/shenhua.json),判后公开正解+解析,主人特批;⑤答题入口永不关闭,答对题数计入天穹(`kunlunQuiz`)。
- **聊天室(2026-07-26)**:lib/chat.js,全员 100 条;`@昆仑之灵` 触发 AI 回帖(复用 AI_GRADE 双通道)。规矩:消息渲染一律 textContent(防 XSS);dk 只比对不下发;清理聊天记录须改库后 pm2 restart。
- **安全基线(2026-07-28 OWASP 审计,2🔴+5🟡 已全部修复并上线)**:①SVG **已从公开上传白名单移除**(2026-07-31 起,`lib/files.js` 的 `PUBLIC_IMG_EXT` 不含 `.svg`,上传直接 400——SVG 可含脚本,直开即同源 XSS,链:`/admin-media?token=` 偷管理 token;直接禁格式比 CSP 兜底更彻底、免维护);**存量 SVG** 仍经 files.js `sec` 强制 `Content-Security-Policy: script-src 'none'` 兜底——新增响应头只许走 files.js `sec` 集中处;②admin.html 用户数据进 onclick JS 字符串**一律 `j()` 不用 esc()`**(esc 不转引号;文件名/URL 可含引号,公开上传即可种后台 XSS);③上传归属 **vid Cookie 优先**(uploads[name].aid,ownerAid();dk=sha1(UA) 仅兜底——UA 可伪造/撞车);④`linkClicks` 5000 上限(防存储 DoS);⑤vision 每设备日限 20 次(防 AI 费用被刷);⑥token 用 `timingSafeEqual`;⑦safeJoin 必须带 `path.sep` 比较;⑧JSON/静态统一 `X-Content-Type-Options: nosniff`+`Referrer-Policy`,HTML 加 `X-Frame-Options: SAMEORIGIN`。复验:scripts/probe/security-fix-probe.js(13 项;2026-08-29 起含「SVG 上传被拒 + 白名单无 .svg + 存量 SVG 仍有 CSP 兜底」三条,取代已过时的「SVG 仍可上传」)。遗留(运维):阿里云安全组应只放行 Cloudflare IP 段访问 3000/3443,后台强制走 HTTPS——主人手动在控制台配。
- **TTS 语音(2026-07-26)**:`GET /api/tts?text=…`(lib/tts.js 代理 + edge-tts,服务器 venv `/opt/tts-venv`,中文女声 `VOICE`)。规矩:浏览器**永不直连**语音服务(mixed content);前端一律 `ctx.kunlunSpeak(文案)`(media.js),失败必须静默;限流(30 次/天/设备)/缓存在 lib/tts.js,勿绕过,`.tts-cache/` 可整目录清;引擎迁移(如换 Kokoro)只许动 synth(),接口形状不变。
- js 文件静态托管 `Cache-Control: no-cache`;媒体分级:公开名(演示/白板/户外大屏)1 天,**门禁媒体(本人上传/特殊模式)`private, no-store`**(2026-07-27 血泪:200 被 Cloudflare 边缘缓存后对全员公开,门禁形同虚设;canServeMedia 标 `req._mediaPublic`,serveStatic 按此分级)。清边缘缓存:Dashboard→缓存→Purge Everything(R2 令牌无 purge 权限)。
- **空中永恒展厅(2026-07-27 二期①,详见 KUNLUN_PLAN.md)**:src/kunlun/eternal.js。规矩:①展厅**零 PointLight**(亮窗/光柱/光束/光晕全 MeshBasicMaterial;仅光束与光晕 fog:false,是地面唯一可见件);②高空功能只靠三个钩子,不侵入旧逻辑——paintings.js `eternalAction` 交互钩子(厅内交互经 `ctx.eternalHandlers[action]` 分发,各模块自注册)、player.js `ctx.groundOverride`(厅内地面)/`ctx.eternalKeepOut`(小地图禁区),peaks.js 海拔彩蛋用 eternalKeepOut 跳过展厅;③展厅图片只吃 `/api/files`(服务端 canServeMedia 已过滤),客户端不做二次可见性判断;④晨光画框 isPainting 复用放大但**不进 paintGroups**。
- **数据保留铁律(2026-07-27 主人定)**:玩家不能删除服务器任何数据(含本人上传的照片);「从展厅移除/放下」只做软删除(隐藏标记、文件保留、可召回),真删接口仅后台 token。后续任何"删除"类需求都按此落地。
- **灵蕴飞舟(2026-07-27 二期②,详见 KUNLUN_PLAN.md)**:src/kunlun/ark.js。规矩:①`ctx.flightLock` 是飞行期总锁——凡新增"传送/位移/海拔触发"类功能,必须先检查此锁(现有四处:player 移动/物理/小地图/回家键 + peaks 海拔彩蛋);②飞舟/航线全零 PointLight,变色走 DOM 着色罩,**不碰** 3D 天空/雾系统;③粒子一律柔光圆点纹理+环带分布(默认方点糊屏是血泪);④罗盘传送按钮只在六灵蕴集齐后渲染,功能入口判存在再调(`ctx.eternalTeleport&&...`)。
- **飞舟自由飞(2026-07-27 P2,飞机骨+飞舟皮)**:首飞(无 `localStorage.arkFlew`)登舟=电影化巡礼(不动);已首飞登舟=`startFree()` 手动自由飞。规矩:①物理全在 `freeTick`——四元数姿态/灵蕴自动油门(巡航 24m/s,空格或冲刺钮 ×1.9 耗能量)/控制权限随速度缩放(温和无失速)/撞地钳制不死(`desert.getH+3`,实心山铁律)/疆域 720m+天顶 480m 软限制;②相机是**第三人称追尾**——主循环相机同步在 ticker 之前执行,freeTick 末尾覆盖 `ctx.cam` 即生效,同时 `pl.p` 同步 FF.pos(小地图/天空/沙漠区块依赖);③`endFree(mode)` 三态:ground(化光回山巅)/land(低空低速原地降落,E 键)/dock(静默,dock() 统一落位);dock() 已通用化(`flying||FF.on` 皆可停靠);④HUD 容器 `#arkHud`(pointer-events none,子控件 auto)已注册 overlay(touchOnly,2026-07-28 深化⑤起白名单机制废止);手机左下虚拟摇杆+右下冲刺钮;⑤模型船头 +x、物理船头 +z,渲染用 `QMODEL`(rotY -π/2)对齐,改模型朝向必须同步;⑥古典装饰(云雷纹舷带/鹤首灯笼/祥云小帆)全 MeshBasicMaterial 零 PointLight;⑦tickPhysics 在 flightLock 下吞掉排队跳跃(`jumpPressed=false`),防落地弹跳;⑧探针钩子 `window.__arkFF`,验证脚本 scripts/probe/ark-free-probe.js。
- **实心山铁律(2026-07-27 主人定)**:昆仑峰顶已削成半径 14m 平台(desert.js computeHeight,海拔≈126m,14~26m 收坡);昆仑与沙海是高度场,没有"山里面"——任何物体只允许摆在地表之上。规矩:①所有新增摆放/传送落点必须经 `ctx.desert.assertAboveGround(x,y,z,tag)` 校验(埋入即 console.error+toast 拦截),禁止手写海拔,一律走 `getH/groundY`;②峰顶平台区(距 KX,KZ ≤14m)是玩家可站立走动的广场,不得再放置阻挡物;③改山形必须重跑 `scripts/probe/spirit-terrain-probe.js` 与 `flame-spot-probe.js` 验坡度。
- **乱序提前拾取(2026-07-27,设计文档)**:spirits.js 灵蕴库存改为 `kunlunSpiritsKeys`(key 数组,顺序无关),`kunlunSpirits` 仅作数量兼容旧读取;玩家可提前拾取未揭示灵蕴(3m 判定对全部未收集生效,25m 内未揭示灵蕴浮现柔光团),拾取后揭示目标=下一颗未收集。改收集逻辑必须保持 ark/finale/settings 三方的 `got()/isDone()/spiritsState` 契约不变。
- **冷启动序章(2026-07-27,设计文档序幕)**:src/gate/prologue.js。规矩:①只播一次(`kunlunPrologueDone`),URL 加 `?noprologue` 可跳过(探针/测试依赖);②法规层优先——三连读协议未签完前静候,签完才播;③全 DOM/CSS 零 3D 资产零 PointLight,TTS 走 `ctx.kunlunSpeak` 失败静默;④「我愿意」后自动 `window.startQuiz()` 拉开答题卷轴(仅未过门禁);⑤退出保障:右下角"跳过序章"+Esc,跳过后右下角留小残镜可重新抉择;⑥`#prologueOv` 已注册 overlay(touchOnly,2026-07-28 深化⑤起白名单机制废止)。
- 静态黑名单(2026-07-26;2026-07-27 增补 scripts/dist/vendor):公开静态经 server.js `staticDenied()` 拦截——点文件、`lib/`、`node_modules/`、`origin/`、`tools/`、`questions/`(题库含答案)、`scripts/`、`dist/`、pem/bat/sh/md/log、`gate_data.json`、`package*.json`、`admin.html`、根级除 `data.js`/`sw.js` 外的 js;**`src/` 与 `vendor/` 目录(可读源码)公网一律 404,仅 localhost 放行(本地开发/test-mobile 依赖,按 Host 头判定)**。新增敏感文件必须进黑名单;`/admin` 与 `/admin-media` 走独立 token 通道不受影响。
- **媒体可见性规矩(2026-07-28 深化④,单一源)**:**下载放行与墙面上墙共用一张决策表 `src/shared/mediarules.mjs`**(纯函数零依赖)——服务端 `canServeMedia` 经 Node≥22.12 的 require(ESM) 取用,客户端 mode.js(上墙/纹理)/paintings.js(配文/视频调度)经 ESM import 取用;**改可见性规则只许改这一个文件**(旧规矩"改可见性必须同步服务端 canServeMedia"已由此落地)。「归类」各侧自备(服务端按 dk/mt 指纹,客户端按 siteconfig 下发的 myUploads),「归类之后怎么办」全在决策表:`wallDecision`(演示/本人/图库/他人)、`contentAllowed`、`captionAllowed`、`serveDecision`(下载+CDN 公开标记)。验收:scripts/probe/media-rules-probe.js(8 项)+ test.js 媒体门禁段。
- **媒体文件级门禁(2026-07-26 紧急堵口;2026-07-27 增补 mt 令牌)**:上传即签发 `uploads[name].mt`(hex20),`/api/siteconfig` 下发 `myUploadTokens`,`loadTexCapped` 给本人上传的 URL(含缩略图)拼 `?mt=`——QQ/UC 浏览器图片代理改用代理 UA 请求 `<img>` 也能认出本人(否则粉框"Photo Loading");存量上传服务端启动时自动补发。`/photos/*`、`/videos/*` 经 siteconfig.js `canServeMedia()` 判定(决策表见上条);`/api/files` 无 token 时同规则过滤,带 token 全量。**场景里的"隐藏"不等于文件不可下**。
- 公开上传禁止覆盖同名文件(409);白板与后台(token)上传仍可覆盖。
- **分片上传(2026-07-28 晚高峰应急,主人定)**:Cloudflare 边缘→源站回源带宽被运营商压到 ~12-40KB/s 时,>1MB 直传撑满 100s 超时 → 524(2026-07-28 19 点实测)。方案:前端 >384KB 自动按 **256KB/片** 走 `POST /api/upload/chunk?(dir,name,seq,total)`,服务端 `.chunks/` 暂存、最后一片重组+直传同一后处理(aid/mt/compressJob/abuseCheck 全走);规则与直传一致(409 禁覆盖/413 总量与单片 400KB 上限/24h 残片自动清扫)。验收:scripts/probe/chunk-upload-probe.js(9 项,含 md5 一致性)。
- sw.js 不拦截带 `Range` 头的请求:Cache API 禁止存 206,拦截即视频全挂。
- 畸形 URL 必须 400 而不是崩进程:`decodeURIComponent` 已包 try/catch,新增路径解析同样要接异常。
- 门禁/权限逻辑改任何一处都要跑 `node scripts/test/test.js`(含审批门/VIP/答题评分回归)。
- **版本与备份(2026-07-28 主人定;2026-08-29 修正)**:①本地已是 git 仓库(main 分支,`.gitignore` 挡 .env/origin/*.pem/*.tgz/gate_data.json/videos/tools/ffmpeg)并同步到 **GitHub 仓 `bear20252026/dream-gallery`** —— ⚠️ **该仓为 PUBLIC(公开)**,经 `gh repo view` 实测确认(此前文档误记为"私有仓",已更正)。因此**任何密钥/凭据都不得入库**:SSH 登录私钥(`gk.pem` 等)、TLS 私钥、API token、PAT 一律禁止提交;`.gitignore` 已加 `*.pem`/`*.key`/`*私钥*` 兜底。私钥一旦误提交须**立即在云平台吊销轮换**。(2026-07-28,凭据存于本机 Git Credential Manager;推送即异地备份)——**每次部署前必须 commit + push**(部署后跑 `node scripts/probe/debug-browser.js https://cloudbear.cloud/ 15` 确认无 pageerror);回滚=`git checkout <commit> -- <文件>` 后按正常流程部署。**2026-07-28 脱敏**:后台密码从 _setup_server.sh/verify-all.js/perf-probe.js/gate-media-probe.js 清除(改读环境变量 ADMIN_TOKEN/TOKEN),历史已压平重签。②云端 cron 自动备份:`/opt/backups/backup-gallery.sh`,**每天 03:17 daily**(gate_data.json+photos+music+代码文本 → `/opt/backups/daily/`,留 14 份)、**每周日 04:23 weekly**(videos → `/opt/backups/weekly/`,留 2 份;大屏另有 R2+本地原码率双备份),日志 `/var/log/gallery-backup.log`。改备份内容必须同步改 `tools/backup-gallery.sh`(本地 git 跟踪)并重新 scp 到 `/opt/backups/`。
