# scripts/probe/ 探针分类索引

> 索引由 2026-10-10 审查生成(目录内 node 探针 140 个);新探针入列请同步本表。
> 分界口径:**要进 CI/门禁的回归放 `scripts/test/`,手动实机验收与诊断取证放本目录**;重剧情探针头注自声明"不进 CI 门禁"。

## 怎么跑(共同约定)

- **入口统一**:仓库根执行 `node scripts/probe/xxx.cjs`。绝大多数探针退出码 0=全绿、非 0=失败,头注释即说明书。
- **浏览器**:共用 `browser.js` —— 默认调本机 Edge(playwright-core);CI/无 Edge 机器设 `PW_BROWSER=chromium` 用注册表浏览器。少数取证探针硬编码 Edge 路径(`PW_EDGE` 可覆盖)且有头运行。
- **目标二选一**:① **自起临时服**——探针内部 spawn `server.js`,`GATE_DATA_FILE` 落系统临时目录(访客数据隔离),端口可用各自的 `XXX_PORT` 环境变量改(默认 32xx;少数固定端口);② **打已有服**——`BASE_URL=https://cloudbear.cloud`(线上)或 `http://127.0.0.1:3311`(本地已起服)。注意:2026-09 早期一批探针用 `PROBE_URL`(缺省 `http://localhost:5173`,dev server);大堂战役一批硬编码 `:3282`/`:3283`。
- **本地跑前置**:`vendor/` 同步(postinstall 自动)与模型/剧情资产齐全;本机模型不全时重剧情探针跑不动,只能打线上(见文末已知债)。
- **线上直测**:跨域模型下载慢,加大 `PROBE_WAIT_MS`(默认多为 60s)。
- **浏览器串行**:探针占真实 Edge/GPU,不要并行跑;自起服探针测完自动清理,固定端口者勿与常驻服同跑。
- **凭据/夹具**:后台类需 `ADMIN_TOKEN`;剧情类常以 sessionStorage 预置旧档(`dialogVoiceOff` 静音、chapter 预置等)加速。
- **npm 快捷**:`npm run test:smoke`(smoke-gate)、`npm run test:scene`(scene-visual-regression)、`npm run test:orbit`(verify-orbit)、`npm run debug`(debug-browser)。`npm test` 主链在 `scripts/test/`,不在此目录。

## 共用库

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| browser.js | 统一浏览器启动与 URL 解析(反回归地基) | 被 `require('./browser.js')`;`PW_BROWSER=chromium`、`BASE_URL` 可覆盖 | 缺省线上 `https://cloudbear.cloud/`;新探针一律走它 |
| png-diff.cjs | PNG 解码 + 归一化块签名对比(截图回归共用) | 被场景回归类探针 require | 零外部依赖;归一化抵消昼夜/曝光漂移,保构图差异 |

## 一、冒烟/开机健康

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| smoke-gate.js | 冒烟门禁:闸门→(?noopening 跳电影)→世界启动,断言 canvas/ctx 装配、动态光≤40、零页面异常 | `BASE_URL=… PW_BROWSER=chromium node …`(打已有服) | npm run test:smoke |
| b612-gate-probe.cjs | 入口闸门+开幕电影全链:协议→ENTER→电影→skip→标记写齐→刷新后老访客直进 | 自起临时服(默认 :3228,`GATE_PROBE_PORT`) | 头注自标"一次性归档",仍是开机链最全验收 |
| b612-preload-film-probe.cjs | 预加载与电影并行:电影期间 `__preloadState=done`、零渲染,skip 后世界秒启 | 自起临时服(默认 :3263,`PRE_PROBE_PORT`) | 2026-09-06 站点级验证 |
| enter-flash-probe.cjs | ENTER 进场闪现回归:缝A 闸门→电影淡入、缝B 电影→世界揭幕逐帧亮度体检 | `PROBE_URL` 打线上(默认 cloudbear.cloud) | 逐帧采样,2026-09-24 回归探针 |
| gate-flash-probe.cjs | 闸门恢复闪现回归:协议面板关闭后同帧闸门不透明(opacity≥0.95) | `PROBE_URL` 默认 localhost:5173 | 2026-09-24 回归探针 |
| b612-pact-probe.cjs | 三协议并列面板:标签切换/各自勾选/计数/零整页 reload/关闭后状态不丢 | `PROBE_URL=https://cloudbear.cloud node …`(线上) | 2026-09-23 闸门 UX 验收 |
| probe-cache-bust.cjs | 一次性强制刷新:首访刷一次、二访不再刷 | `BASE_URL` 默认 localhost:3283(自起) | 依赖 lib/cache-bust.js,2026-08-31 |

## 二、剧情链路验收

主线全链与世界切换:

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| b612-journey-probe.cjs | 全链主线:开场→沙漠画羊→B612 四站→退梦穿门→国王互动→回 B612 | 自起(默认 :3261,`JOURNEY_PORT`);`PROBE_URL`/`JOURNEY_BASE_URL` 打线上;`JOURNEY_MOBILE/UI_ONLY/FLIGHT_ONLY/WALK/HOME_ONLY=1` 分段;`PROBE_WAIT_MS` | 重剧情探针:本机模型不全跑不动,线上验证 |
| b612-script-fill-probe.cjs | 剧本补齐验收(全本 v2 对稿):面包树大祸句/日落四问/第4场诘问+玫瑰初醒 | 本地起服后 `BASE_URL=http://127.0.0.1:3000 node …` | 已知债:须按夜链感知重设计(见文末);不进 CI |
| b612-guide-shot.cjs | B612 岛内截图:确认王子/星球位置,为浮光箭头选锚点 | 自起(默认 :3291,`B6_GUIDE_PORT`) | 已知债:portal 按钮断言过时(见文末) |
| guide-arrow-dayphase-probe.cjs | 3D 悬浮箭头+台词⇔时间联动:晨光快切→画板→转夜信标+箭头→石门→B612 | 先 `SMOKE=1 PORT=3311 node server.js`,再 `BASE_URL=http://127.0.0.1:3311 node …` | 重剧情,不进 CI;2026-09-27 |
| b612-return-black-probe.cjs | 复现"B612 返回主世界黑屏/回弹":连续采样 activeWorld 5s+截图像素亮度 | 自起(默认 :3262,`RET_PROBE_PORT`);`BASE_URL` 可打线上 | 黑屏回归守门;2026-10-10 预置现代化 |
| b612-world-probe.cjs | 独立世界权限链 main→b612→king→b612→main | 自起(默认 :3258,`WORLD_PROBE_PORT`) | 语义级断言 activeWorld |
| b612-prod-worlds.cjs | 生产世界切换验证(两段式开机适配):闸门→skip→石门→国王星→原路返回 | 自起本地 :3259;`BASE_URL=https://cloudbear.cloud` 直测生产 | 断言小地图隐藏/恢复、模型入景 |
| b612-planets-probe.cjs | 六星章节全流程:星门传送→拾星屑→章节推进+库存→回程门 | 自起(默认 :3238,`PLANETS_PROBE_PORT`) | 头注自标"一次性归档",章节链仍可复用 |
| witness-probe.cjs | 325/326/327 见证卡片:A 卡片 UI 独验(choice/clap/count/skip/存档),B 真场景串联 | 自起(默认 :3296,`WITNESS_PORT`);`PW_BROWSER=chromium` | worldManager.enter() 直进,不需石门模型 |
| ending-portfolio-probe.cjs | 终章回收玩家画作:有/无画作的终屏 keepsake 缩略图 | 自起(默认 :3293,`ENDPF_PORT`);`PW_BROWSER=chromium` | 2026-10-04 |
| hill-ending-probe.cjs | 结局屏→"走到远处小山":按钮跳 `/hill/?lang=`,hill 页正常起、无站外请求 | 自起(默认 :3294,`HILL_PORT`);先 `cd hill-src && pnpm install && pnpm build` | 依赖 public/hill/ 构建产物 |
| sheep-companion-probe.cjs | 羊同伴专项验收(独立浏览器旧档夹具) | `PROBE_URL` 默认 localhost:3263;`SHEEP_MOBILE=1` 触屏 | 不替代真实画羊→入梦旅途探针 |
| verify-fox.cjs | 站五·狐狸:布景落位/面板/驯养仪式/原著台词/秘密记入手札 | 本地直跑;线上 `PROBE_URL=https://cloudbear.cloud PROBE_WAIT_MS=180000` | 2026-10-03 |
| verify-plane.cjs | 可驾驶 Piper PA-18:模型/真机尺寸/站位/登机 HUD/油门-离地物理 | 本地直跑;线上同上(`PROBE_WAIT_MS=180000`) | 2026-10-03 |
| b612-storybook-probe.cjs | storybook"球中球"还原:pbr 模型/SceneFull2 动画/玫瑰归位/构图比对 | 自起 :3230(固定) | 头注自标"一次性归档" |

分站/指引验收:

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| b612-guidance-probe.cjs | 情节指引三件套:任务册进程行/互动节点提示/转夜+石门信标 | `BASE_URL` 默认线上;有头 Edge | 2026-09-26 指引闭环 |
| b612-king325-guidance-probe.cjs | 325 国王星行动指引三件套:星屑光柱信标/modeToast/即拾即撤+章节推进 | 自起(默认 :3259,`KING325_PROBE_PORT`);`BASE_URL` 可打线上;dialogVoiceOff 静音 | 全链真走 |
| b612-327-guidance-probe.cjs | 第 7 场(326 虚荣+327 酒鬼)全链:登厂台词/拍手蒙太奇/十问答链/拾取撤标/章节推进 | 自起(默认 :3279,`SCENE7_PROBE_PORT`);`BASE_URL` 可打线上 | chapter=1 预置跳过 325 |
| b612-327-voice-probe.cjs | 327 台词语音端到端:逐句真发起朗读/声线正确/全命中缓存(无 legacy 回退) | 自起(默认 :3287,`SCENE7_VOICE_PORT`);`BASE_URL` 可打线上 | 需服务端 tts 缓存已预热 |
| b612-scene6-probe.cjs | 第 6 场·书页四·325 国王:台词链/日落敕令/星屑拾取/门环换 326 | 自起 :3233(固定) | 2026-09-20 情节阶段一 |
| b612-story-chain-probe.cjs | 剧本对话链专项:叫醒词→画羊四轮→lock 互斥/打断自恢复→转夜计数链 | 自起 :3219(固定) | 场景 3 回忆层由 b612-world-probe 语义覆盖 |
| b612-dialog-voice-probe.cjs | 台词朗读端到端:prince 中文→苏打、英文→Milo、静音钮、静音后不请求 | `PROBE_URL` 默认 localhost:5173(dev) | 2026-09-26 修订音色断言 |

台词语音取证系列(2026-09-26"到底有没有声音"战役):

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| dialog-audio-truth-probe.cjs | 三重取证:音频非静音(峰值/RMS)/真在播(play+currentTime)/严格自动播放策略下被拒否 | `PROBE_URL` 默认线上 | T3 被拒=无声真根因 |
| dialog-audio-truth2-probe.cjs | 决定性取证 v2:CDN initiator 调用栈+hook Audio 构造,区分 speakLine 与 prefetch | `PROBE_URL` 默认线上 | 查明 play() 计 0 的原因 |
| dialog-audio-truth3-probe.cjs | 终极听感级:每行停留 5s 真实玩法,逐行验 play resolved 且 currentTime>0 | `PROBE_URL` 默认线上;有头 Edge | 前置:prewarm 已煮缓存 |
| tts-single-line-probe.cjs | 单行聚焦:一行台词从 play 到出声全时序+ResourceTiming 状态码/耗时 | `PROBE_URL` 默认线上;有头 Edge | 一次性诊断 |
| tts-stall-diag-probe.cjs | 台词音频卡在哪一环:真页面 new Audio 逐事件时间戳,对照组静态资源 | `PROBE_URL`;`TTS_URL` 可指定台词 | 一次性诊断 |
| tts-story-walk-probe.cjs | 终验:真实剧情链静默旁观 90s,逐秒采样每个 play 的 currentTime | `PROBE_URL` 默认线上;`WATCH_MS` | 不注入自定义台词 |

## 三、场景/渲染回归

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| scene-visual-regression.cjs | 四检查点截图回归:main-boot→b612→king325→main-return;语义+亮度+像素签名三层断言 | 默认自起;`VR_UPDATE=1` 重建基线;`VR_STRICT=1` 严格(退出码 1);`BASE_URL` 打已有服 | npm run test:scene;基线在 `probe/baselines/` |
| minimap-probe.cjs | 羊皮纸罗盘小地图:图集预渲染/纸色等高线/箭头旋转/禁区 hatch/单帧耗时 | 自起 :3225(固定) | 2026-09-10 圆形改造验收 |
| tippler-set-shot.cjs | 327 酒鬼星布景截图:15 组酒瓶+8 罐+酒鬼+天幕上岛、摆位贴岛面 | 自起(默认 :3293,`TIP_SHOT_PORT`) | 截图供人眼判断 |
| fox-ground-probe.cjs | 狐狸 diorama(第10场)贴沙测量:逐部件世界高度 vs 地形 | 自起(默认 :3299,`FOXG_PORT`);`PW_BROWSER=chromium` | 2026-10-04 |
| prince-pos-probe.cjs | 小王子位置偏差精量取证(rigged GLB 基准点) | `PROBE_URL` 默认线上 | 2026-09-25 |
| prince-rig-probe.cjs | 小王子骨骼动画上线验收:ChibiWalk→ChibiIdle→25s 内小动作 | `PROBE_URL` 默认线上 | 2026-09-25 |
| prince-visual-probe.cjs | 小王子位置/语音/卡顿三合一现场取证 | `PROBE_URL` 默认线上 | 2026-09-25 |
| popup-archive-probe.cjs | 两弹窗归档验收:nickPop/guideCard 不自动弹、替代入口完好 | `PROBE_URL` 默认 localhost:5173 | UI 回归;静置 45s 判定 |
| verify-fountains.cjs | 户外画板清零+四喷泉:落位/碰撞 AABB/贴台/流动水材质/连拍验水动 | `PROBE_URL` 默认 localhost:5173(dev) | 2026-09-03;结构回归仍有效 |
| verify-spawn.cjs | 出生点验收:首生落点/朝向、⌂ 回家、HUD 读数一致 | 硬编码 localhost:5173 | 2026-09-03 |
| probe-gallery-door.cjs | 画廊东墙门洞:新门洞 5m 居中、旧门洞封堵、df3 木板已删 | `BASE_URL` 默认 localhost:3283(自起) | 直接查 mesh,比 bounds 可靠 |

## 四、性能/诊断

性能基准:

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| perf-probe.js | 视频卡顿归因:rAF 帧率/长任务/丢帧率/硬解支持 | `node perf-probe.js [url] [秒]`;有头 | 2026-07 视频时代 |
| perf-profile.js | CDP CPU Profiler:抓主线程 5s 长任务热点 | `node perf-profile.js [url]` | 稳态 20s 后采样 |
| perf-catwalk.js | 角色渲染开销:rAF/长任务/渲染统计/第一 vs 第三人称 | `node perf-catwalk.js [采样秒]`;硬编码线上 | SwiftShader 软渲染,数值偏保守 |
| fps-compare.js | 第一/第三人称 FPS 对比 | 硬编码线上+Edge 路径 | 早期角色开销归因 |
| light-compile-bench.js | 点光源数量 vs 着色器编译耗时(主线程阻塞) | 需 `localhost:3100/three.mjs` 同源页 | 灯光预算门禁(≤40)的数据来源 |
| load-timing-probe.cjs | 3D 加载全链路计时:导航/闸门就绪/世界就绪+资源 Top+域分布 | `PROBE_URL` 默认 localhost:5173 | 2026-09-24"加载能否更快" |

线上黑匣子/现场诊断:

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| debug-browser.js | 浏览器黑匣子:console/pageerror/失败请求/4xx-5xx 全抓,写 browser-debug.log | `node debug-browser.js [url] [秒] [--quiz]`;npm run debug | 日志落本目录 |
| console-capture.cjs | 抓正式站全过程控制台报错(不改行为) | `PROBE_URL` 默认 localhost:5173 | 一次性诊断,2026-09-24 |
| avatar-check.js | avatar 线上黑匣子:FBX 加载状态/CORS/网络失败 | `node avatar-check.js [url] [等待秒]` | 41MB 跨域加载 |
| live-debug.js | SSH 隧道打线上 :39000 抓全部浏览器错误 | `node live-debug.js [url]` | 2026-08-29 线上急救 |
| live-avatar.js | 线上 avatar FBX 拉取验证(CSP 修复后) | 硬编码隧道 :39000;ESM 直跑 | 同日产物 |
| live-bad-responses.js | 抓所有 ≥400 响应 URL | `node live-bad-responses.js [url]` | 同日产物 |
| live-pixel.js | room.html 画布像素采样(是否真渲染) | 硬编码线上 room.html | 多人房间时代 |
| pixel-probe.js | 采样 #room-c 画布像素(非空白判定) | 硬编码 localhost:4178 | 同上 |
| live-room-check.js | 双客户端 /ws 互通实测 | 直跑(线上 cloudbear.cloud) | 随机房间号 |
| ws-e2e.js | 多人房间 ws 端到端(服务器上跑) | `node ws-e2e.js`;`ws://localhost:3000/ws`;需 ws 包 | 服务器侧使用 |
| verify-avatar-glb.js | 线上 GLB 角色:绕协议门禁验模型+贴图+第三人称 | browser.js 默认线上;ESM | 2026-08-30 |
| prod-media-probe.js | 官网大屏视频/背景音乐真实播放状态(只读) | `node prod-media-probe.js [url]` | 线上只读 |
| diagnose-lights.js | 场景灯光构成清单(类型/位置/强度),定位灯光爆炸 | 硬编码线上+Edge | 2026-08-30 |
| diag-avatar.js | 角色世界坐标→屏幕投影(是否在视野) | 硬编码线上+Edge | 2026-08-30 线上急救 |
| diag-drag.js | 鼠标拖拽不能转视角聚焦诊断 | 同上 | 同上 |
| diag-move.js | 第三人称"卡死"三链路逐项实测 | 同上 | 同上 |

GLB/资源离线体检(不进浏览器或仅本地静态服):

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| glb-analyze.cjs | 分析 GLB 水平方向性(有没有"正面"),扇区统计 | `node glb-analyze.cjs <glb> [扇区数]` | 支持 interleaved/TRS 层级 |
| glb-group-sizes.cjs | 逐组量 GLB 道具世界尺寸(TRS 矩阵累积) | `node glb-group-sizes.cjs <glb>` | 处理嵌套 scale |
| glb-inspect.cjs | 快速体检:节点树/网格尺寸/贴图清单 | `node glb-inspect.cjs <glb>` | 不读顶点,避开压缩 accessor |
| glb-shapes.cjs | 按 mesh 输出世界空间包围盒 | `node glb-shapes.cjs <glb> [目标直径]` | — |
| inspect-glb.cjs | 动画/骨骼/网格数据速查 | `node inspect-glb.cjs <glb>` | 头注"用完即删"(留用) |
| preview-glb.js | 渲染动画多帧检查模型/贴图/蒙皮 | `node preview-glb.js <glb> [帧数]`;自起 :5202 | 截图落模型目录 |
| check-seam.cjs | 离线解析 GLB 动画首尾关键帧是否重复 | 直跑(拉 CDN catwalk) | 动画接缝检查 |
| check-skeleton-health.js | GLB 骨架 vs FBX 骨架完整度对比 | 自起 :5197 静态服 | catwalk 迁移期产物 |
| wedding-mats.cjs | 解剖 wedding-arch.glb 材质透明度/包围盒(区分实心与玻璃) | 直跑(读 models/hall/) | 为拱廊碰撞规则服务 |

## 五、管理后台

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| admin-errors-tab-probe.cjs | 后台"报错反馈"tab 实测:切 tab/loadErrors/抓 pageerror+4xx/截图 | `ADMIN_TOKEN=<token> [BASE_URL=…] node …` | 无 TOKEN 退出码 2;截图落本目录 admin-errors-tab-shot.png |
| admin-smoke-probe.cjs | admin.html 抽出 JS 后冒烟:无 pageerror/全局函数兜底/switchTab 可用 | 自起(默认 :3251,`ADMIN_SMOKE_PORT`) | 2026-09-24 P2-1 |
| sw-admin-bypass-probe.cjs | SW 对 /admin 系列绕过+导航网络优先:旧池清空/VER 池无 /admin 条目/后台功能完好 | 自起(默认 :3252,`SW_BYPASS_PORT`) | `VER='gallery-v14'` 与 public/sw.js 手工同步,升版易漏 |
| gate-media-probe.js | 媒体加载新规:未过答题室内媒体静默,授 VIP 后放行 | `ADMIN_TOKEN`;BASE 硬编码 `101.133.235.110:3000` | 历史 IP,换环境需改码 |

## 六、手机/触屏与输入

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| verify-input-matrix.js | 三输入矩阵:键盘/鼠标/触屏 × 开屏与视角切换逐项断言 | browser.js 默认线上;SwiftShader | 2026-08-30 反回归地基 |
| verify-mobile-flow.js | 移动端全流程触摸:轻触启程→标题层→进画廊 | 390x844 hasTouch isMobile | 卡死修复回归 |
| verify-hybrid.js | 混合设备:触屏环境(hasTouch)鼠标驱动摇杆+拖拽视角 | browser.js 默认线上 | — |
| verify-orbit.js | 第三人称轨道相机:环绕/俯仰/缩放/转向/动画无缝裁剪 | npm run test:orbit | 现役回归 |
| diag-touch.js | 触屏模式完整用户路径复现(失败资源+逐帧异常+输入实测) | 硬编码线上+Edge+hasTouch | 2026-08-30 线上急救 |
| b612-journey-probe.cjs | (手机路径)`JOURNEY_MOBILE=1` 走移动端 UI(tap 替代 click) | 见剧情分类 | 同一探针双端覆盖 |

## 七、一次性/历史归档

大堂/楼梯战役(2026-08-31~09-01,硬编码 `:3282` 本地大堂服,`window.__museum` 时代接口):scan-hall-floors / probe-stair-diag / probe-stair-diag2 / probe-stair-fine / probe-stair-map / probe-stair-numeric / probe-stair-shot / probe-stair-top / probe-stairs-fix / probe-stair-down / probe-verify-stairs / probe-balcony-scan / probe-hall-2f-check / verify-hall-collision / verify-museum / diag-museum-render(均直跑打 :3282,历史)。

拱廊/场景整备战役(2026-09-03 前后):probe-arch-bounds / verify-arch-walk / dump-arch-aabb / re-shot / scan-south / probe-spawn-area / verify-dome-towers / verify-ground / verify-visual / tp-verify-v2(已被 orbit 覆盖)/ shot-gameshell / verify-gameshell(硬编码 Vite dev :5174)。

灵蕴/昆仑系统验收(2026-07 底,均自起临时服):ark-free-probe(:3217,需 arkFlew=1)/ spirit-hud-probe(:3216)/ spirit-terrain-probe(:3215)/ flame-spot-probe(一次性选址)/ kintsugi-probe(:3224)/ titlecard-probe(多端口)。

架构深化验收(2026-07-28 系列,均自起):store-probe(:3219,键名唯一出口断言)/ overlay-probe(:3218,弹层三铁律)/ media-rules-probe(:3221)/ ctx-bus-probe(:3222)/ security-fix-probe(部分断言与 test.js 重叠)。

上传/修复一次性验证:probe-fix4(:3214)/ probe-hint(:3216)/ chunk-upload-probe(:3228)/ probe-hmr(会临时改源文件)/ probe-covenant-dom / dbg-portal / dbg-portal2(:3241)/ pos-deep / b612-full-opening-probe / b612-opening-sample-probe / b612-map-dive-probe(file:// 打 dev 小样)/ rapier-spike(:5210)/ rapier-hf-test(:5211)/ oneoff-tts-warm.sh(服务器上跑,非 node)。

子目录(非探针):`archive/` 为 2026-09-18 结构审计归档的一次性/陈旧探针;`baselines/` 为 scene-visual-regression 的四张截图基线(`VR_UPDATE=1` 重建)。目录内 `admin-errors-tab-shot.png`、`browser-debug.log` 为探针运行产物,非脚本。

## scripts/test/ 边界说明

`scripts/test/` 是**能进门禁的服务端/数据层回归**,与本目录"浏览器实机探针"分工:

| 文件名 | 用途 | 用法要点 | 备注 |
|---|---|---|---|
| test.js | data.js 数据校验+服务器 API 行为+安全边界 | `node test.js`;自起 :3210/3211 | npm test 主链 |
| test-store.js | gate_data 原子写回归:并发保存不截断/截断恢复 | GATE_DATA_FILE 指临时文件 | npm test 主链 |
| test-store-sqlite.js | SQLite 持久层:迁移/_savedAt 仲裁/USE_SQLITE=0 回退 | 直跑;临时目录 | 不在主链,手动跑 |
| test-session.js | 会话机制:惰性补发/滑动续期/过期/吊销换发 | 直跑;临时 GATE_DATA_FILE | 不在主链,手动跑 |
| test-mobile.js | 手机端渲染自动化:模拟 iPhone 触发灯光限额路径,防"too many uniforms 整片隐形" | `node test-mobile.js`;自起 :3212 | npm test 主链 |

`scripts/test/archive/` 为一次性测试归档。

## 已知预置债/限制(2026-10-10 时点)

1. **b612-script-fill-probe.cjs 与 b612-guide-shot.cjs 须按"夜链感知"重设计**:入口自愈已修(2026-10-10),但两探针内的 portal 按钮断言已过时,现在直接跑会误报——重设计完成前,这两个探针的失败结论不可信。
2. **全链剧情探针本机跑不动**:b612-journey、b612-327-guidance/voice、witness、b612-story-chain、king325/327 guidance 等重剧情探针依赖完整模型与剧情资产,本机模型不全起不来,只在云端/线上(`BASE_URL=https://cloudbear.cloud`)验证。
3. 其他:一批早期探针硬编码线上域名或本机 Edge 绝对路径(gate-media-probe 硬编码旧服务器 IP `101.133.235.110:3000`),换机不可复现;大堂楼梯系列依赖 `:3282` 与 `window.__museum` 时代接口,仅作历史参考;多个自起服探针用固定端口(3215-3252 等),并行会撞端口;`sw-admin-bypass-probe` 的 `VER` 常量与 `public/sw.js` 靠人工同步,SW 升版时易漏改。
