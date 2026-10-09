# 梦幻画廊 — 项目工程档案

## 2026-10-09 空 catch 全量治理:102 处分级,危险 8+1 修复(已上线)

- **分级结论**(两个并行审计逐处打开核实,grep 只能搜到单行版,括号配平法补出 12 处跨行注释版):**危险 9 处已全部修复**;可疑 12 处已全部补 console.warn 留痕;自愿静默 84 处维持原样(氛围音频/自动播放策略/store 自兜底/`&&`+`?.` 已判空的装饰性 UI/显式回退路径/HMR 清理——全站错误静默铁律下的合理形态,分类清单存审计记录,不再逐处加注释)。
- **危险修复①——回程传送 4 处**(late-planets/scene6-king/scene7-tippler/scene7-vanity):`worldManager.back()` 是 **async**,原 `try/catch{}` 包不住异步失败;失败(切换中/飞行锁/目标未加载)时返回 false 但门已 disarm、信标已删——玩家被困外星。修法:Promise 链接住返回值,失败即 `doorArmed=true` + 重立信标(各文件现成的幂等 `armDoorBeacon()`/`armBeacon()`)+console.warn。**配套修根因**:`scene-manager.enterWithoutPush` 的 `commit().catch(() => {})` 吞掉切换半程失败(leave/enter/restore 抛错)且照返 true——现回滚 `activeWorld=source` 并按 false 返回,调用方的"未成"恢复路径才接得到信号(否则上面 4 处的恢复只覆盖返回 false、覆盖不了半程抛错)。
- **危险修复②——admin 后台 4 处**(admin.js:文档编辑器初始化失败假报"已加载"改页内报错+return;备份列表/大屏槽位/访客聊天记录三处 `adminFetch` await 失败静默 → 各自区块渲染"加载失败"提示):后台页不走访客静默铁律,失败必须页内可见。
- **可疑 12 处补 console.warn**(warn 不进访客上报、无噪音风险):quizgate 轮询连续失败≥3 一次、chat-room 渲染失败、wish-page 网络失败/非 200、dialog-voice 静音开关持久化失败(新增 `voiceOffMem` 内存兜底,修"按了静音只静一句")+播放/结束回调异常×3、media-push SSE 建立失败、audio-manager 挤出旧提示音的 onEnd 失败、store-api rawRemove 失败(旧值可能复活)、gl-lost 流畅画质写入失败、admin 在线设备 SSE 坏帧。
- **审计两处新发现(未改,存档待议)**:①error-report.js 的 console.error 上报钩子**默认关闭**(需 `__errCaptureConsole(true)` 手动开),默认开的只有 window.onerror+unhandledrejection——"console.error=进后台"的直觉不成立,后续要不要开属产品决策(有刷屏风险);②14 处箭头函数式 `.catch(() => {})`(prewarm/统计类)不在 try/catch 口径,均属自愿。
- 验证:vitest **532 全绿**;lint/typecheck/build 零错误(治理过程中 lint 抓到一处我补丁的 box 作用域错误——门禁兑现价值)。

## 2026-10-09 审查#10+#11:墙体 InstancedMesh 化(已上线)+ KTX2 运行时就绪(转码待 toktx)

- **#10 墙体 instancing(bb3b295)**:画廊 120 段墙 ×(墙体+2 踢脚线)+每墙 4 根圆角管 ≈ **840 个独立 Mesh → 4 个 InstancedMesh**(共享单位几何,实例矩阵承载位姿/长度;外围墙在婚礼拱廊下装配时直接跳过,原"建后隐藏"效果等同)。墙色走唯一共享材质——WEDDING_SHELL 常开时 120 个材质本就同色,housecolor 换色对 `houseMats.wall` 逐材质 setColor 的行为不变(休眠随机粉路径由 spec.hue 记录)。**挂画适配**:挂画系统对墙的全部依赖只有 position/rotation.y/半长(wallHalf),scene.js 按原公式预计算 `_half` 经 `ctx.gallery.wallSpecs` 直供(已登记 ctx-gallery/ctx.d.ts),paintings.js 的 BoxGeometry 遍历筛选退役。同机位实测 **573→370 draw call(−35%)**,截图逐像素一致,挂画 5 幅照常。
- **#11 KTX2 运行时就绪(2b4e16c 后续)**:gltf-loader.js 接 `KTX2Loader`(惰性单例,detectSupport 绑 ctx.scene.rnd;极早加载点 renderer 未就绪时不带 KTX2,后续 loader 正常)。转码器 basis_transcoder.js/.wasm 双路分发:开发走 vendor/basis/(sync-vendor 从 node_modules 拷),生产走 public/vendor/basis/(Vite 拷进 dist 根)——KTX2Loader 按需拉取,GLB 无 KTX2 纹理就零下载,存量 WebP 模型零成本。**native-ESM 闭包五件**进 vendor+importmap:KTX2Loader/WorkerPool/ktx-parse/zstddec/ColorSpaces(r186 新增 math/ColorSpaces)。回归:532 单测+typecheck/build 零错误+本地实跑零 pageerror(挂画/墙体全正常)。
- **#11 转码半边待办**:gltf-transform 的 etc1s/uastc 命令 shell 出 **KTX-Software 的 toktx**(未随包,本机与服务器均未装)——装好后一条命令即可转首个模型并 R2 镜像,管线脚本无需改结构(textureCompress targetFormat 换 ktx2 + AGENTS 三坑照避)。
- 排障:install 后 postinstall 可能被 npm allow-scripts 拦截,sync-vendor 手动跑即可;vendor/ 是 git-ignored,记得 public/vendor/basis/ 两文件随 git 分发。

## 2026-10-08 审查#4 专项:three 0.160.0 → 0.186.1 升级(已上线)

- **版本**:three `0.160.0→0.186.1`(与 hill-src 同版,主人点名的现成参照),`@types/three ^0.185.4→0.186.0` 运行时/类型对齐。升级之所以平顺:全库**零个** r152 后废弃 API(useLegacyLights/outputEncoding/.encoding 均无,colorSpace 时代写法)——此前 typecheck 就是用 0.185 类型过的,0.186 类型零错误直接通过。
- **唯一机制改动**:sync-vendor.js 补拷 `build/three.core.js` —— r170 起构建拆分,`three.module.js` 顶部相对导入 `./three.core.js`,漏拷则 importmap 直跑模式(native ESM/test-mobile)全站白屏;Vite 生产打包自动解析不受影响。vendor 全量重建**零跳过**(既有 22 个 jsm 文件在 0.186 全部还在)。⚠️ 0.186 的 package.json exports 不再暴露 `./package.json`,`require('three/package.json')` 会 ERR_PACKAGE_PATH_NOT_EXPORTED,读版本用 fs 直读。
- **验证链**:vitest 532 全绿;typecheck/build 零错误;本地 native-ESM 实跑零 pageerror(夜空着色器/GLTF 模型/阴影/对话管线全部正常,`.tmp/three-upgrade-shot.cjs` 截图人工核);**线上**版本戳核对 + `/healthz` ok + 实景截图正常 + `b612-return-black-probe` 全绿(后处理管线/avatar 迁回/防回弹/落点,真 GPU 全模型环境)。本地像素 VR 对比不可仲裁(本机模型不全 + 旅途卡叠加层盖世界,changedRatio 74-92% 但 maxΔ 仅 5.6/255=整体微移),基线**未重建**;语义检查点(世界/亮度/无异常)全过。
- **顺带修 return-black 探针预置(欠账三连)**:①夹具缺失(全新访客的开机对白链会堵死传送)补 VR 同款存档夹具;②石门 revealStarGate+自愈循环(选项→旅途卡`#voyage .vy-stay`→继续,全收束才进圈——旅途卡是 PR#3 新增的 blocker,老探针都不知道它);③按钮文案「返回主世界」早已改名「返回沙漠/Back to the desert」,双语匹配。**script-fill 探针的完整重构仍挂待办**(同一族欠账,卡在旅途卡之后的跑站段)。
- 排障记录:本机 curl localhost 走了系统代理返回空响应(exit 52)——本地测试一律 `curl --noproxy '*'`;后台 Bash 任务与常规调用的 localhost 网络不互通,服务器+探测须同一条命令内联。

## 2026-10-08 审查第四批:每帧分配治理 + P2 卫生七件(已上线)

- **#8 每帧分配两处**:① `core/composition-root.js` 的 `ordered()` 原每帧 slice+sort(~40 系统),改排序缓存 + register/dispose 时置 null 惰性重建;dispose 从 `.reverse()`(会原地改共享缓存)改倒序下标遍历。② `kunlun/freeflight-physics.js` 拆成 `stepFlightInto`(原地变异核,模块级 scratch 向量/四元数/欧拉角,每帧约 10 个分配归零;生产 ark.js 改走它,freeFlight 就地推进)+ `stepFlight`(克隆包装,2026-08-30「纯函数/输入不被修改」契约与 8 项单测逐字保留)。scratch 单线程无重入(groundHeightAt 回调 desert.getH 不回本模块),安全。
- **P2 七件**:① dexie 死依赖删除(全库零 import);② package.json 补 `engines: node>=22.12`(与 CI Node 22 对齐);③ lint-staged 补 `lib/**/*.js`/`server.js`/`scripts/**` 的 eslint --fix(后端漂移重灾区此前完全不设防;当日全量 eslint 已绿,历史文件无碍);④ Vite `target: es2020→es2022`(build 验证过);⑤ 100vh→100dvh 带回退(main.css 全局 + agreement-swipe 协议面板两处;admin.html 桌面后台跳过);⑥ `public/sw.min.js` 构建产物退出 git 跟踪(与 sw.js 双源真相;零引用,`scripts/minify-sw.js` 一并删,历史在 git);⑦ depcruise 接入 CI(`.dependency-cruiser.cjs` 9 月建好却从未跑,现 `npm run depcruise` 本地/CI 同闸,309 模块 942 依赖零违规)。
- 验证:vitest **532 项全绿**;lint/typecheck/depcruise 零错误;`npm run build`(es2022)通过。
- 部署:deploy.sh 全量(前端改动进 dist;本批无后端文件变更)。

## 2026-10-08 审查第三批:静态资源 304 协商缓存 + 优雅关闭 + /healthz(已上线)

- **304 协商缓存(#5,报告称"全站最大性能改进点")**:`lib/files-static.js` 此前无任何 ETag/Last-Modified——no-cache 资源(含几十 MB 的 .glb 模型与全部 html/js)每次回源都全量 200 重下。现统一发 `Last-Modified`(mtime 秒级截断),条件 GET 命中即 304(Cache-Control/安全头照发,含 Vary);gzip 路径与 200/206 响应头都补了 Last-Modified;**Range 请求刻意不做 304 短路**(视频拖动不受影响)。Cloudflare 边缘与浏览器两侧同样受益——no-cache 的"每次校验"从重下变真校验。
- **优雅关闭(#9)**:`server.js` 捕获 SIGTERM/SIGINT → `server.close()` 收束在途请求(最长 6 分钟的 AI 阅卷/大上传不再被腰斩),8s 兜底硬退;deploy.sh 与 backend-sync.sh 的 `pm2 restart` 加 `--kill-timeout 9000` 配合。存档无缓冲不补 flush(每次变更本就同步落盘,SQLite 为权威)。
- **/healthz(#3 后半)**:路由单表新增公开 GET(契约快照 57→58),返回 `{ok, uptime, ts}`;部署验证以后可从"curl 首页 200"升级为探活不依赖静态资源。
- 验证:vitest **532 项全绿**(路由快照同步);后端 **102 项**(原 97 + 304×4 + healthz×1,用 /data.js 测协商缓存避开首页强刷注入路径)+ 4 + 6 全过;eslint 零错误。saveGateData 防抖合并**刻意未做**(改持久化语义,SQLite 权威下收益小风险大,报告项保留待议)。
- 部署:backend-sync 同步 lib/files-static.js、lib/routes.js、server.js,md5 双端一致;线上实测见当日探针记录。

## 2026-10-07 审查修复:烟花粒子只产不消 + planets.js 清理 + store 读缓存 + release.sh 补后端测试(本地,待发布)

- **烟花粒子只产不消**(`core/effects-system.js`):`update()` 在非主世界直接 return,但 `autoTimer`(每 2.8s 产 24 粒子)永不停——小世界挂机 1 小时攒约 3 万粒子,回主世界当帧全部爆发。修法:非主世界分支连 `autoTimer`/`autoFirst` 一起 clearInterval/clearTimeout 并置 null,回主世界由既有惰性分支重启(与「开场电影期间惰性启动」同一风格)。顺手把粒子死亡的 `splice(i,1)` 改为反向遍历下安全的 swap-remove(末位交换+pop);粒子对象池未做(diff 会变大,收益小)。
- **planets.js 三连清**:① 星屑旋转+点灯人亮灭的逐字重复块(原 tick 头部与太空分支各一份,非主世界两块都执行 → 转速×2、`setLampLit` 每帧两次)删太空分支那份,保留 tick 头部一份(它还管呼吸浮动,全世界每帧一次);② keydown/keyup/blur 监听清理死代码(removeEventListener 读从未赋值的 `spaceKeys._kd/_ku`,blur 监听从未移除)改为具名函数 `onSpaceKeyDown/Up/Blur`,`bag.custom` 真正移除三个监听(ark.js `onKey` 同款范式);③ 每帧 `p.clone()` 改模块级 scratch `_prevHome`(ark.js `_v2/_v3/_camPos` 范式;`model-surface.place()` 只同步读 `previous.x/z` 不持有引用,复用安全)。此段是场景接线,无单测钉住(逻辑单测全在 shared/planet-logic.mjs)。
- **store 读缓存**(`state/store-api.js`):`rawGet` 原每帧同步 `localStorage.getItem`(planets ticker 每帧读 page1/planetsChapter)。写路径本就单入口(SCHEMA 登记制),故加模块级 `Map` 内存镜像:读先查内存,`rawSet`/新增 `rawRemove`(unmark/clearHouseColor 改走它)同步更新;写失败(隐私模式)不缓存;跨标签页经 `storage` 事件失效(`typeof window` 守卫,node 测试环境跳过)。登记豁免写入方(index.html 开机块 kunlunVer、music.html musicHistory)均在缓存惰性填充前/异页,不受影响。**测试配套**:`storeApi._dropCache()` 测试钩;store-api.test.js / store.test.js 的 beforeEach 与两处「直写 mock 后再读」断言前调用;新增缓存行为单测(重复读只打一次 getItem、写/删同步、直写失效)。scene6/7 的 `chapterCached` 0.5s 粒度缓存照旧保留(语义不同,不合并)。
- **release.sh 补后端测试**:第 2 步原来只跑 `npx vitest run`;现为 `npm test`(= test-store.js 存档原子写 + test.js 后端 130 项 + test-mobile.js 手机渲染,定义在 package.json)+ `npx vitest run`,对齐「上线前必跑」节。场景截图回归 `test:scene` 需本机模型与基线,仍按文档手动跑,不进 release.sh。
- **AI 接口洪水防护(#2,同日第二批)**:2026-09-24 拆除的是「按设备**日**配额」(正常访客用不到的量级);本次补的是另一维度——按 **realIP 每分钟**的洪水防护(主人 10-07 贴出审查报告点名「公开 AI 接口=无上限成本攻击面,建议按 realIP 每分钟限流」)。新模块 `lib/ratelimit.js`(固定窗口计数,内存 Map,MAX_KEYS 5000 防伪造 IP 撑爆):**tts-synth 20/分**(只对真触发合成的请求计数,`/tts-audio/<key>` 与缓存命中不占额)、**tts-batch 60/分**(客户端预热 53s 发 44 批,阈值放宽到不误伤;滥用上限仍由服务端队列 400+TTL 兜底)、**quiz-ai 6/分**(`gradeQAWithAI` 超限**静默返回 null** → 自动回退本地细则,访客交卷零感知)、**chat-bot 6/分**(超限跳过本次召唤,发言照常入库)。身份用 `store.realIP`(仅可信反代才采 CF-Connecting-IP,直连伪造头无效回退 socket 地址);**运维配套**:安全组仍须只放行 CF IP 段,否则直连可绕过。**配套修 realIP 缺口**:CF 回源边缘 IP 是公网段(172.64.0.0/13 等),原 realIP 只认私网网段 → 经 CF 的请求永远取不到访客真 IP,上线首测 61 连发不触发即此根因(服务器本机直打 60/1 精确触发,机制无恙);现把 CF 官方公布段(www.cloudflare.com/ips,零依赖 CIDR 匹配)加入可信名单——经 CF 取到真 IP,绕 CF 直连源站伪造头依旧无效;顺带 gate.js blockedIps/client-errors 从此记到真访客 IP。测试:`lib-ratelimit.test.js` 6+5 项(超限拒/分 IP/分桶/窗口滚动/直连伪造无效/空头 unknown 桶 + realIP 的 CF 段内外边界/伪造无效/私网照旧/畸形地址)。验证:vitest **527 项全绿**;后端 4+97+6 全过;eslint 零错误。
- 验证:vitest **521 项全绿**(520 +1:store-api 新增缓存行为用例;既有 store 用例做缓存适配);eslint 五个改动文件零错误;改动文件语法检查全过。

## 2026-10-06 台词三合一 + 中英对照测试(本地,待发布)

- 主人要求对齐 hill-src 范本(「远方把所有台词放在一个文件里,还有一个测试检查中英文是否对应」):`src/shared/story-text-late.mjs`(460 行)与 `ending-text.mjs`(539 行)整体并入 `story-text.mjs`(现 ~1610 行,26 个数据导出名一字未改),两文件删除;WHO 说话人表上移到说话人区,late/ending 各自的 `const P/S/C` 简写收拢为 WHO 之后的一份共享解构块(P,S,C,B,L,G);late 节内私有的 SNAKE/FLOWER/ECHO/ROSES 保留原地。`tt()/retranslate` 机制与其唯一消费者零改动。
- 消费方 10 处改 import:late-planets/earth-day/voyage/ending-journey/book-pages/dialog-prewarm/warm-all-voices + 三个测试文件;`dialog-prewarm.js` 与 `warm-all-voices.mjs` 的三键模块表收敛为单键 `'story-text'`(warm 统计的 by-module 维度随之合并,音频内容零变化)。
- **新增 `src/__tests__/story-text-parity.test.js`**(对齐 hill-src/tests/story.test.ts 的结构性遍历):①凡有 en 必有非空 zh、反之亦然,空串只许成对(如 WHO.caption);②裸字符串台词数组一律违法(旧 DIALOG_LINES.prince 那种纯英文数组就是漏译温床);③who.spk ∈ 声线登记集(说话人 id / edge-tts 原生音色名 / 空串);④音频条目 ≥870 护栏。今后加台词漏译、漏声线,单测直接红。
- 顺带补齐对照测试逼出的缺口:`DIALOG_LINES.prince` 4 条纯英文 idle 台词(原本无运行时消费方、无中文)补译成 {en,zh},新增 8 条音频键(870→878),已煮齐并镜像 R2(878/878 全 200)。补译首稿「帽子终究只是帽子」的「究」不在字体子集,按预案改「帽子不过是帽子——除非你用心去看。」(究 在完整字体里有,子集待下次重做时自然覆盖)。
- 验证:vitest **520 项全绿**(516 −2 字体扫描项 +6 对照测试);`npm run build` 通过;本地页面启动零报错。`b612-script-fill-probe` 在本机「等石门现身」超时——**stash 前后 A/B 实证合并前同样卡死**,属本机环境限制(模型 404、全链剧情探针只在云端/线上验证过),与合并无关。
- **发布 v1.394(2026-10-06)**:deploy.sh 上线,版本戳 `2bb9d75` 双端核对,首页/`/hill/` 200、0 pageerror,878 条音频服务器+R2 全 200。线上探针深挖(诊断脚本 .tmp/gate-diag2.cjs 端到端实证:**合并代码在线上从老档开机→数数链→石门→入梦 B612 全程零报错**),顺带查明 `b612-script-fill-probe` 自 09-27 石门出场规矩后欠三层预置:①门需 `revealStarGate()` 手动现身;②主线对白 autoHide:0 后要点「继续 →」推进(点选器只会点选项);③对白收束前落进门圈会被 padBtn 对白守卫吃掉 fire 且 disarm。三层已修两层半写入探针(reveal/点继续/去抖 1.5s+出圈重武装),但完整 9 项语料断言仍未走通——**探针需按 post-09-27 演出流程重新设计(待办)**,合并质量由单测+诊断脚本+线上健康度兜底。

## 2026-10-05 Releases now update the server code too (PR #5, released 2026-10-05 as v1.393)

- Problem: `server.js`, `lib/*.js` and `src/shared/mediarules.mjs` (required by the server) are not in `dist/`, so they were uploaded by hand, and the server copy drifted (`lib/config.js` was missing four MIME lines for weeks).
- New `scripts/backend-sync.sh`: compares md5 of those files with `/opt/gallery`, lists each differing file with its line counts (`-` lines exist only on the server, so a manual server hotfix shows up before it is overwritten), asks `y/N`, backs up each server file as `*.bak-<time>`, uploads, re-checks md5, then restarts `gallery`. `--dry` only lists; `--yes` skips the question; with no terminal it skips the upload and says so.
- `deploy.sh` step 5 now runs it before its single restart (`BACKEND_SYNC_NO_RESTART=1`). `--no-backend` skips it. A refusal or failure never stops the rest of the deploy.
- Not covered on purpose: `gate_data.db` and `.env` (data and secrets stay manual).
- Tested in the cloud against a fake local server (ssh/scp/pm2 shims): dry run, y, N, no terminal, nothing to do, and the deploy mode. **First real run 2026-10-05: `--dry` listed exactly `lib/config.js` (+6/-0, no server-only lines), `--yes` synced it, md5 verified.**

## 2026-10-05 Story thread: one voice from the desert to the hill (PR #3, released 2026-10-05 as v1.392)

- bear: the scenes felt loosely joined, and the faraway hill felt like a different game. Layout untouched; only words changed. Finalized book lines inside the memories are unchanged.
- **Night cards**: each voyage stop now has its own `kicker` (`VOYAGE.<stop>.kicker` in `shared/story-text-late.mjs`, rendered by `ui/voyage.js` as `v.kicker || VOYAGE.ui.kicker`): the pilot's desert days with the water running out (day four … day eight, "I drink the last drop of water"), so the planets read as one countdown.
- **The hill is the pilot's dream six years later** (book's epilogue). `HILL_TEXT.note`, `hill-src/src/game/story.ts` and the hill i18n (`caption.arrive`, `game.tagline`, laughing-star counters, "The Fox"-style speaker names, default name Pilot/飞行员) were rewritten so every character remembers the journey: the fox smells the sheep in the box, the rose knows the one who drew the sheep, the sheep looks like the one in the box, the tapir ate the sad part of the dream, the guardian keeps its post like the lamplighter. Chinese reuses the game's existing phrasing (仪式 / 用心看 / 眼睛看不见 / 负责).
- Release: PR #3 merged (bebf11d), `deploy.sh` shipped it, then `warm-all-voices` cooked the 7 new kickers (14 audio files, en+zh); `--check` and an R2 HEAD sweep both came back all-covered (870/870).

## 2026-10-05 全量发布 + 台词音频预煮收尾:v1.390 上线,顺修一处缓存键口径 bug

- **同步**:本地 main 从 e57611c(385) fast-forward 到 ed1810d(390,远端两个 PR:voice 预渲染 + faraway hill);`npm run test:unit` 514 项全过后 `deploy.sh` 部署,`server.js`(/hill 路由)按盲区流程单独 scp + md5 比对 + pm2 restart。线上 `/hill/` 200、`/hill` 301、版本戳 `ed1810d`(v1.390)。
- **预煮**:`node scripts/dev/warm-all-voices.mjs https://cloudbear.cloud` 把 370 条缺失台词(全部 story-text-late + ending-text)煮齐,新合成由 lib/tts.js 自动镜像 R2。
- **顺带修的 bug(缓存键口径)**:全库 856 条台词里唯一超 220 字符的 328 章国王心算句(247 字符)永远「缺一条」——根因:lib/tts.js 的 handleTts/handleTtsBatch 收到文本**先 trim 再 slice(0,220)** 才算 ttsKey,而客户端 `dialog-voice.mjs` 两处 key 计算与回退 URL、`voice-lines.mjs` 收集器都只 slice 不 trim;该句截断处(第 220 字符)恰是空格 → 客户端 key(220 带尾空格)与服务端落盘 key(219)永远差一拍,`/tts-audio/<客户端key>` 永远 404、warm 脚本永远报缺、回退通道每次多打一轮。修法:客户端统一 **trim→slice→trim**(dialog-voice `normTtsText` 三处 + voice-lines 收集器),服务端不动;其余 855 条 key 不变,该句归位到服务端已煮好的键。回归测试 dialog-voice/voice-lines 各 +1。
- **运维记录**:①`~/.ssh/gk-deploy.pem`(从交接笔记提取)是本次会话重建的部署密钥,比 /tmp 临时文件耐久,后续手工 ssh 可复用;②服务器 `lib/config.js` 与本地有历史漂移(仅缺 .glb 等 MIME 四行,2026-09-23 的改动从未单独 scp)——本次未动它,盲区文件同步流程照旧须人工 diff;③`src/ui/agreement-music.js` 顶层 `new Audio('.../00001.m4a')` 仍会发起一次注定 ERR_ABORTED 的预加载(配乐已退役,无用户影响),日后顺手清理。

## 2026-10-05 The faraway hill: where the player stays after the story (released as part of v1.390; "Leave the hill" button added in PR #4, v1.393)

- Owner decision: the whole Faraway scene from `bear20252026/faraway-game` (the cloud-sea hill, the guardian robot with the red ribbon, fox, rose, sheep, box, baobab sprouts, hat stone, plane, **tapir and shoebill kept on purpose**) becomes the place after the ending, like a victory screen. The player can stay there.
- It is a separate TypeScript sub-project in `hill-src/` (its own three 0.186 + Rapier, tsc and vitest), not merged into our three 0.160 code. `cd hill-src && pnpm install && pnpm build` writes `public/hill/`; Vite copies public/ to dist/, so production serves it at `/hill/` with no change to `deploy.sh`. **The built `public/hill/` is committed**, so a normal release ships it; rebuild only when `hill-src/` changes.
- Inside Dream Gallery the hill runs alone: `hill-src/manus-auth.js` is an offline stand-in (no Manus sign-in), the room and drawing notes never start (no request leaves the site), and `body[data-solo]` hides the account chip, presence pill and note key. `?lang=en|zh` sets its language from the story.
- Entry points: the end screen's first button "Walk on to the faraway hill" (`ending-journey.js goToHill()`), plus a button on the finished ending row of the chapter map. Text and URL in `shared/ending-logic.mjs` (`HILL_TEXT`, `hillUrl`, unit-tested). `server.js` redirects `/hill` → `/hill/` (the hill loads `./assets/` relatively) and serves `/hill/` as `hill/index.html`.
- Acceptance: `PW_BROWSER=chromium node scripts/probe/hill-ending-probe.cjs` (8 checks: final screen, button first, note, URL with the story language, hill title card, no sign-in/online parts, no off-site requests, no page errors). The local server serves the repo root, so the probe answers `/hill/*` from `public/hill/` itself.

## 2026-10-04 Line voices: pre-render everything at release time, keep it on the device (pushed to the work branch, not yet released)

- Problem ("some line voices load extremely slowly"): the voices were cooked by the *visitors' sessions* (`core/dialog-prewarm.js` POSTs lines to `/api/tts/batch`; the server cooks 2 at a time, ~4.5 s a line, queue cap 400), and the prewarm walked only `story-text.mjs`. Of the 856 unique audio files, 446 (52%) — all of `story-text-late.mjs` (328-330, Earth day, voyage) and `ending-text.mjs` — were never pre-cooked, so the first player to reach them waited for a live synthesis.
- Fix 1, coverage: `shared/voice-lines.mjs` (`collectVoiceLines`, `prioritizeLines`; unit-tested) is the one collector for all three text modules. `dialog-prewarm.js` uses it, so the browser prewarm and the release script always cover the same lines. **A new text module with voiced lines must be added to that collector's module list** (in `dialog-prewarm.js` and `scripts/dev/warm-all-voices.mjs`).
- Fix 2, release step: `node scripts/dev/warm-all-voices.mjs <BASE_URL>` cooks every missing line in paced chunks (it respects the 400-job queue cap), waits, and repeats until all exist; `--check` lists what is missing without queuing anything, `--dry` only counts. Run it after any change to the story text or a voice mapping, **before** announcing a release. Cooked files are mirrored to R2 by `lib/tts.js`. Cooking takes about 856 × 4.5 s / 2 ≈ 32 min from empty.
- Fix 3, device cache: `warmBlobByKey` (dialog-voice.mjs) now reads/writes Cache Storage (`tts-audio-v1`) before touching the network, so a returning player downloads nothing and every line opens at once. Falls back silently if Cache Storage is unavailable. Bump the cache name suffix to drop old files.
- Not changed: the Fox's `who.spk` is `'en-US-RogerNeural'` (an edge voice name, not a speaker id), so `voiceFor` gives it the default female voice (Mia / 茉莉), like the sheep and the rose. Changing it is a voice decision and would make that character's cached audio cold.
- Not verified from the cloud sandbox: the real R2/CDN coverage (the sandbox gets 403 from the CDN) and actual download times. The numbers above come from counting the text.

## 2026-10-04 The fox diorama now rests on the sand (pushed to the work branch, not yet released)

- Bug: in the Earth-day fox scene (`kunlun/scene10-fox.js`, at `SITE` = (-46, 34) in the main world) the Sketchfab diorama kept its own origin, so the rocky stage ("the map") hovered ~0.7 m above the sand, the fox, prince, grass and wheat ~1.1 m up, a strip of cloud ~3.7 m up, and the glowing seat marker hung in the air at 1.1 m.
- Fix: `groundDiorama()` runs once after the model loads. The stage (`Escenario_0`) sinks to 0.12 m under the lowest sand in its footprint (moving the whole model, trees included); the fox, prince, grass and wheat (`Zorro_5`, `Principito_4`, `Pasto_8`, `Trigo_9`) each rest on the sand under them; the seat marker is a low lantern 0.35 m above the sand.
- Look ("make it normal and beautiful", same day): the diorama's painted backdrop looked wrong in an open desert, so these parts are hidden (`HIDDEN_PARTS` in `shared/fox-ground-logic.mjs`): the grey stone wedge `Object_4`, the spiky sheets `Object_6`, the flat slabs `Object_5/7/8` and the cloud strip `Nubes_2`. The leafy trees (`Object_9` trunks, `Hojas_3` leaves), the fox, the prince, the grass and the wheat stay. A soft green-to-gold meadow disc (`foxMeadow`, built from `meadowDisc()`, vertex heights follow the dunes, 4 cm above the sand, alpha fades to nothing at the rim) sits under the fox and the prince.
- Arithmetic, part names and the meadow geometry live in `shared/fox-ground-logic.mjs` (unit-tested). To restore a hidden part, remove its name from `HIDDEN_PARTS`.
- Acceptance: `PW_BROWSER=chromium node scripts/probe/fox-ground-probe.cjs` (10 checks: each part's gap to the terrain, hidden/kept parts, meadow never below the sand, seat marker height). Before the fix the same measurements were 0.7-3.7 m off the ground.

## 2026-10-04 Witness cards for 325 / 326 / 327 (pushed to the work branch, not yet released)

- Owner decision: **the player stays a ghost in the memories** (finalized script rule one). The King, the Vain Man and the Tippler never see or answer the player, and no finalized line changes. Instead a small private paper card appears after the dialogue (`ui/witness-card.js`, `ctx.ui.witness.ask(id, {target})`, rules and text in `shared/witness-logic.mjs`, unit-tested):
  - 325 King: "If the King had given you an order" — obey / ask for a reason / refuse (shown at the last step, before the stardust pickup).
  - 326 Vain Man: "Clap along" — 12 taps fill the five minutes (replaces the plain 4 s wait after the clap toast).
  - 327 Tippler: "Count the bottles" — one tap per bottle at his feet (3), after the silence.
- Every card can be skipped; a world change cancels an open card; the card hides under any dialogue (`body[data-dialog-open]`) and the movement controls, compass and lesson card step aside while it is open (`body[data-witness]`, rule in `ui/hud-layout.js`). Answers are only recorded (store key `witness` = `b612Witness`): `{king325:{value}, vain326:{taps}, tippler327:{taps}}`. **Nothing branches on them yet**; the ending/rose/fox could read them later.
- Probes that wait for the stardust pickup in 325/326/327 now auto-skip the cards (an interval clicking `#witnessCard .wc-skip`): b612-journey, b612-king325-guidance, b612-scene6, b612-327-guidance, b612-327-voice.
- Acceptance: `PW_BROWSER=chromium node scripts/probe/witness-probe.cjs` (26 checks: card UI on its own, then the real 326, 327 and 325 scenes entered with `worldManager.enter()` — no stone gate needed). Cloud note: the older king325/327 guidance probes cannot run in the cloud sandbox (the stone-gate teleport needs model files that are not in git); they fail the same way without these changes.
- Caveat: the new Chinese card strings are not in the Chinese story-font subset's coverage test; if a character is missing it falls back to a system font. Re-run `scripts/gen/subset-zh-font.py` when you next touch the font.

## 2026-10-04 The ending brings back the player's own drawings (pushed to the work branch, not yet released)

- The epilogue question ("Has the sheep eaten the flower?") now shows the player's own box drawing in a paper frame, with an interface note ("The box you drew for him. The sheep he asked for was inside."). The final screen shows a strip of small copies of every drawing the player actually made; each opens the portfolio. If the player never drew the box, nothing is shown (no empty frame).
- Pure logic `keepsakeIds` / `epilogueKeepsake` in `shared/portfolio-logic.mjs` (unit-tested). `ctx.ui.portfolio.thumb(id)` returns a small SVG copy or null. The finalized epilogue lines are untouched; the note is interface text.
- Not done on purpose: a "laughing stars" line conditional on a drawing. The player draws only the boa, sick sheep, ram and box (the muzzle at the well is a canned sketch), so there is no star drawing to key it on.
- Acceptance: `PW_BROWSER=chromium node scripts/probe/ending-portfolio-probe.cjs` (runs a local server; with and without a saved portfolio). Cloud note: `npm ci` is blocked, but `node node_modules/vitest/vitest.mjs run` works after a partial install, and `vendor/` must be generated with `node scripts/gen/sync-vendor.js` (git-ignored) before a browser probe can load the page. Model files are not in git, so some 3D models 404 locally; the epilogue screens do not need them.

## 2026-10-03 屏幕布局收口:手机不再挤成一团(本地,待发布)

- 新增 `ui/hud-layout.js`(main.js 开机 `mountHudLayout()`):一张样式表统一排位,用 id + !important 覆盖各模块写死的位置。**以后新增屏幕按钮,先来这里排位,不要再各自写 top/right。**
- 所有尺寸:小地图下移到菜单钮下方(top 70),时刻/地名挪到小地图下面(原来时刻压在任务卡下沿);AI 配文框空着时不显示;滑翔能量格只在跳起/滑翔/回充时出现。
- 手机(≤600px):隐藏 B612 标题、底部氛围小字、时刻/地名、AI 配文框;「?」、语言钮、音乐钮收进菜单(菜单新增「怎么走动 / Language / Music」三项,`.m-phone` 只在手机显示,点了转点原钮)。小地图 112px。底部:左摇杆,右跳跃(84px),上面依次「View」「⌂」;中间大按钮(石门 `#gateBtn`、世界导航)抬到 150~160px,不压摇杆/跳跃,文字不换行。操作小课卡挪到大按钮上方。对白进行时摇杆/跳跃/视角/⌂/大按钮/罗盘/小课全部让位。小羊按钮手机上去掉说明小字。
- 旧昆仑罗盘修正:之前的 `visibility:hidden` 被后面的 cssText 覆盖,左上仍显示「Highland」;现改为 cssText 之后 `display:none`。
- 验收(云端 390×780 手机 + 1024×640 桌面截图):沙漠对白、对白后、菜单、B612 导航各状态无重叠。

## 2026-10-03 版本号随发布自动更新(本地,待发布)

- 闸门底行原来是手写的「Revised Sep 5, 2026」,永远不变。现在 `vite.config.js` 构建时从 git 读出 `{n: 提交总数, hash: 短哈希, date: 提交日期}`,经 `define` 注入 `__B612_BUILD__`;`shared/build-info.mjs` 拼成「Updated Oct 3, 2026 · v1.<提交总数>」(中文「更新于 2026-10-03 · v1.N」),悬停显示 `build <hash>`。每发布一次提交数 +1,版本号自动 +1。
- release.sh 先 commit 再跑 deploy.sh(其第 1 步重新构建),所以线上戳就是这次发布的提交。源码直跑(本地 server.js、单测)没有 define,显示「dev build」。eslint globals 与 `types/ctx.d.ts` 已声明该常量。

## 2026-10-03 剧情背景音乐(五首,本地,待发布)

- 主人提供五首并要求放进公开仓库当游戏配乐,版权由主人自行处理(见 `CREDITS.md`)。原文件在主人 `Downloads/`;发布版在 `public/music/story/*.mp3`(ffmpeg loudnorm -18 LUFS,112k MP3——MP3 各浏览器都能放,开源版 Chromium 不支持 AAC)。Vite 把 public/ 拷进 dist 根,线上地址 `/music/story/<名>.mp3`。
- 编排(纯逻辑 `shared/story-music-logic.mjs` + 单测):闸门/开场电影/坠机/画羊/羊箱之夜 = Turnaround;B612 = Our Corner of the Universe;国王/虚荣/酒鬼 = Equation;家走完后的沙漠与开飞机 = Salvation (Remix);结局画册页/告别/尾声 = Somewhere Only We Know;**找井那段静音**(玩法靠听水声)。
- 播放 `ui/story-music.js`:模块级单例,开机就挂手势监听(组合根要到 ENTER 后才装配),main.js 在 ENTER 回调里 `startStoryMusic()`;100ms 定时器选曲、2.5s 交叉淡入淡出、对白时压到 40%。右下 `#ab` 钮改为「♪ Music on/off」(存档 `musicOff`)。`av-switch` 新增 `music` 豁免(默认开,`?av=0` 仍全静)。
- 退役(legacy 下仍在):闸门协议配乐 00001.m4a、`#ab` 的随机背景乐轮播、进 B612 的 GARGANTUA。探针钩子 `__ctx.ui.storyMusic.{now,cue,debug}`。

## 2026-10-03 英文为默认,中文为可切换备选(本地,待发布)

- 主人定:**英文是默认**,中文只是可选切换。剧情语言本来默认 en;这次把界面上残留的中文固定文字也接上语言切换。
- 新增 `ui/i18n-dom.js`:`i18nText(el,{en,zh})` / `i18nAttr(el,name,{en,zh})` 绑定一次,`script:lang` 时自动换;`bindStaticDom()` 在 main.js 开机绑定 index.html 静态节点(跳过链接、内嵌面板、音乐钮、AI 配文标签、画布/小地图 aria),并同步 `<html lang>`。index.html 默认 `lang="en"`、`<body data-script-lang="en">`,开机出错文案按存档语言(默认英文)。
- 已改为双语:音乐钮状态、右下氛围小字、B612 唱歌提示、地名/海拔 HUD(Salt flat / Dunes / Gobi… · Elev.)、人称钮(View)、⌂ 回出生点、跳跃/下降钮、视角切换提示、台词静音钮与「语音加载中/已静音」提示、世界切换提示、凝视提示、世界加载失败页、任务卡折叠钮/菜单钮、小地图北标(N)。罗盘 `story-compass` 的中文判定改为「=== 'zh'」才算中文。
- 「远方高地罗盘」(左上,点开旧设置面板)属于搁置的旧玩法:默认隐藏(`?legacy=1` 恢复)。任务卡里「展厅挂画 x/20」行同样只在 legacy 时显示。
- 仍是中文的:搁置的旧玩法模块(飞舟/展厅/答题等)、旧设置/上传面板内部、画廊建筑里的 3D 招牌与印章字、协议子页。以后加界面文字一律走 tt / i18nText,不要再写单语中文。

## 2026-10-03 第二批测试建议:好上手的移动 + 菜单 + 章节地图/存档码 + WebGL 失效页 + 作品集 + 线稿重画(本地,待发布)

- **移动太难**:罗盘条新增「▶ 自动走过去 / Walk there」(`ui/story-compass.js`):角色自己转向当前目标、推虚拟摇杆 `jD` 走过去(主世界与太空世界共用这个输入源);按移动键/摸摇杆/开对白/弹层/到达(≤1.5m)即停,3 秒没靠近就停并提示绕路。不传送、不跳过行走。操作小课第三步文案同步提到它。
- **小地图**:放大档从 260 改为随视口(桌面 320,最小 220);⤢ 按钮放大到 30px;小图上点一下 = 放大(首次放大提示「点地图任意处就去那里」),放大后再点才传送(此前小图一点就被传走)。`minimap-probe` 断言同步。
- **「印」看不懂**:菜单键改为「☰ 菜单 / Menu」药丸(id 不变 `#gsMenuBtn`);语言钮 `#hudLang` 右移到 132px,「?」到 184px;画板期间语言钮挪到左下。菜单去掉与「操作指引」重复的「问昆仑」,新增「章节地图」「作品集 · n/4」。菜单卡在矮屏可滚动。
- **章节地图 + 存档码**:`ui/chapter-map.js` + `shared/chapter-map-logic.mjs`(单测)。章节 = 坠机 → B612 家 → 已建成星球(built)→ 结局;状态 done/current/locked,只能去已完成或当前章(不许跳章)。「去这一章」走正常世界切换(必要时先回沙漠、再进 B612、再进星球)。结局已完成可「再看一次尾声」(endingApi.epilogue)。存档区:进度本就每段自动存;「复制存档码」= `B612-1-` + base64(JSON),字段见 `SAVE_FIELDS`;「粘贴存档码」页内二次确认后写回并刷新。注意:`index.html` 的「跳到画廊」只是无障碍跳转链接,不是章节功能,保持不动。
- **WebGL 失效**:`ui/gl-lost.js`。上下文丢失不再立刻 reload(白屏一闪/反复刷),改为纸面提示页 +「继续」「换流畅画质再继续」(写 lowQuality);3 分钟内反复丢失则把流畅画质设为主按钮。浏览器起不来 WebGL 时显示设备/浏览器建议;`world-err` 在提示页存在时不再叠加。新 z 层 `glLost 990`。
- **作品集「未完成的画」**:`gate/scene2-draw.js` 每轮定稿时把玩家笔迹存进 `portfolio`(store 键 `b612Portfolio`,`shared/portfolio-logic.mjs` 清洗/封顶,单测);`ui/portfolio.js` 原著线稿淡底 + 玩家笔迹,可「存为图片」。菜单打开;结局落版新增「翻开我的作品集」按钮与一句「每一幅未完成的画,都在等一个人」。新 z 层 `portfolio 575`、`chapterMap 574`。ctx.ui 新登记 `portfolio`/`chapterMap`。
- **线稿太粗糙**:病羊/公羊/箱子三幅重画(羊毛云朵轮廓、垂头闭眼病羊、卷角公羊、手绘透视箱子 + 三个气孔),数据移到 `shared/scene2-sketches.mjs`(画板与作品集共用),生成器 `scripts/gen/scene2-sketches.py`。玩家笔迹改为顺滑二次曲线(去抖 1.5 单位),定稿线 `stroke-linejoin:round`。
- 验收(云端 SwiftShader 640×400):从闸门玩到 B612——新线稿、菜单/章节地图/作品集 4/4、地图「从这里继续」进 B612、「自动走过去」到达火山站、`loseContext()` 出提示页;单测 controls-lesson 8、portfolio 5、chapter-map 7 全过;checkJs 408(基线 409)。

## 2026-10-03 新手引导:去掉陷阱按钮 + 一次一条指令 + 首次操作小课(本地,待发布)

- 首访实测(云端无头浏览器从闸门玩到 B612 火山站)找到的问题与修法:
  - **陷阱按钮**:B612 家的回忆(page1 前)屏幕正中挂着「返回沙漠」大按钮,恰在叫玩家去火山时出现 → 测试者「突然退出、剧情接不上」。现在回忆进行中(B612 page1 前、国王星本站未完成前)不挂 worldNav;离开改走菜单(印)新增的「离开这段回忆 / Leave this memory」(只在非主世界显示,进度按段已存)。
  - **石门按钮**:「✦ 进入 B612」改双语;对白/弹层期间不亮;亮着时 `body[data-gate-ready]` 让罗盘条让位(不再「转身 15m」与「进入」两条指令打架)。
  - **一次一条指令**:对白中任务卡只留一行(有选项时写「轮到你 · 在下方选一句回应」,不再写「点继续」);画板期间任务卡/罗盘/任务面板/印章全部让位;罗盘条去掉与任务卡重复的目标名(读屏仍可读),距离行不换行;小羊「摸摸」按钮在罗盘指路或石门按钮亮着时不出现。
  - **首次操作小课**:`ui/controls-lesson.js`(组合根装配)+ 纯逻辑 `shared/controls-lesson-logic.mjs`(单测 `controls-lesson.test.js`)。画完羊、无对白/弹层/画板空闲 1.5s 后出现,三步「走动(离起点 2m)→ 看看(累计转头 0.6rad)→ 跟指引(点知道了)」,做到才打勾;键盘/触屏两套文案;存档键 `controlsLesson`。右上「?」随时重看(三步全文)。旧的淡色中文提示 `#hp` 不再显示(去掉了 data-world-ui,避免切世界时被 scene-manager 还原出来)。
- 验收(云端 SwiftShader,640×400 与手机 390×780):画板干净;羊箱选项时任务卡写 Your turn;小课走/看两步真实输入打勾;石门按钮亮时罗盘隐藏;B612 火山站无「返回沙漠」、无小羊气泡;菜单「离开这段回忆」回沙漠后石门可再进。

## 2026-10-03 切换语言时台词也跟着换(本地,待发布)

- 问题:点语言钮只换了按钮/任务册,正在显示和排队中的台词仍是旧语言(场景开对话时已把文本 tt() 成字符串)。
- 修法:`story-text.mjs` 的 `tt()` 记住「显示文本→双语条目」,新增 `retranslate()`;`core/gameshell-dialog.js` 监听 `script:lang`,把当前台词、说话人、选项和排队中的台词就地换语言并重新显示(用新语言朗读)。结局线行动卡与尾声字幕同样跟随。硬编码的单语文本保持原样。

## 2026-10-03 剧情字体:中文志莽行书补全 + 英文 Satisfy 自托管(本地,待发布)

- 问题:中文子集只有 318 字(台词用到 1500+ 字),一句话半行书半雅黑;英文剧情继承任务册的楷体,开场 Satisfy 走 Google Fonts(国内常被墙→回退系统 cursive)。
- 现在:`src/styles/main.css` 一处定义两套「剧情文字」字体(对白/选项/气泡/电影字幕/画册页/尾声),按 `body[data-script-lang]` 自动切换;画册页/尾声的第二语言小字用另一种语言的字体。按钮、任务册仍用楷体(小字可读)。
- 字体文件在 `src/styles/fonts/`(不在 public/):Vite 打包时加内容哈希,换字表后访客立刻拿到新版,不被一天缓存挡住。
- **改台词后**:`python scripts/gen/subset-zh-font.py <完整 ZhiMangXing-Regular.ttf>` 重做子集(完整字体在主人电脑 `Downloads/ZMX_extract/`);`src/__tests__/zh-font-coverage.test.js` 会在缺字时让单测失败。完整字体本身缺 稊窣窸茀 四字,允许回退。

## 2026-10-03 测试反馈修复:火山选择卡死 + 「摸摸小羊」看不懂(本地,待发布)

- **卡死根因**:`ui/overlay.js` 给 touchOnly 层也装了「点外圈关闭」(e.target===el)。任务卡 `#journeyTask` 是 touchOnly,手机上点到卡片空白处 → `display:none`,任务仍在进行 → 火山三选一按钮消失,剧情无法继续。修法:touchOnly 层一律不装外圈关闭(同时修好飞行控件/天穹进度/飞舟 HUD 的同类隐患);任务卡显式 `closeOnOutside:false`;journey update 加自愈(任务进行中卡片被藏 → 重画)。旧版本已用探针复现卡死,新版本同一操作后可选火山并推进到下一站。
- **摸摸小羊**:文案改为「摸摸小羊(可选) / Pet the sheep (just for fun)」,说明写明只是好玩、不影响故事;任务卡打开时不显示,避免与任务按钮混淆。`sheep-companion-probe.cjs` 断言文案同步更新。
- **发布模板**:`scripts/release.sh` + 根目录 `release.bat`(通用版)。每次发布前把 commit 信息写进 `.tmp/release-msg.txt`;脚本按 对齐 GitHub → vitest → build → 暂存(只收代码目录,拦截疑似密钥)→ commit/push → deploy.sh 顺序执行,任一步失败即停,日志 `.tmp/release.log`。

## 2026-10-03 先做结局 + 开门 + 旧玩法搁置（本地，尚未发布）

- 主人批准:①开头不再勾选协议;②328/329/330 与地球五站先用「临时画册页」接上,结局先做完;③旧玩法先放一边,不删除。
- **开门**:`gate/entrygate.js` ENTER 始终可点,底部只留三个协议链接。同意改在把内容交给服务器的那一刻请求:`consent-session.askConsent()`(上传面板打开、回声壁发言)。旧的雅号弹窗/初见指引卡依赖会话同意键,因此不再在开场弹出。
- **旧玩法搁置**:`shared/legacy.mjs` 的 `LEGACY_MODULE_LABELS`(答题门/温柔度/远方山巅/塔楼/永恒厅/飞舟/风铃/壁炉/雪窗/重置视角/放下/终章)默认不进 world-loader 加载链;`?legacy=1` 恢复并记住,`?legacy=0` 关闭。存档键 `legacy` 已登记。启动自检(boot-check)仍全绿。
- **结局线**:`kunlun/ending-journey.js`(组合根装配)+ 纯逻辑 `shared/ending-logic.mjs` + 台词 `shared/ending-text.mjs`(逐字 Woods,中文照定稿)+ 画册阅读器 `ui/book-pages.js`。存档 `endingStep` 0..4(画册页读完/井/告别/尾声),只前进;`endingAnswer` 记尾声是/否。门槛 = page1 且 chapter≥3(327 完成)。**328–330 建成 3D 后,把 `ENDING_GATE_CHAPTER` 改为 6,并从 `BOOK_PAGES` 删掉对应页。**
- 书页映射:`readPages` 吸收 endingStep(画册页读完→8 页,告别→9 页);`storyBeat/storyNext` 在 327 后改走结局节拍,不再指向未建成的空岛。planets 罗盘:327 后主世界不再指石门;journey goal 带 `hidden:true` 时罗盘熄灭(找井用)。scene3-night 在 327 后不再立「再次穿门·准备拜访国王」。
- 找井:井在 `WELL_POS`(48,118),靠水声左右声像 + 屏幕边缘水光导航,静止越久越清楚。剧情机制音走 `avAllowed('story')`(新豁免,`?av=0` 仍可关)。告别后坠机点王子与羊箱隐藏,羊同伴不再出现(羊跟他回家了)。
- 新 z 层:endingTint 11 / endingAction 72 / bookPages 377 / endingStage 570。ctx.scene 登记 `endingApi`(探针用:state/openBook/act/epilogue/skipTo)。
- 验收(云端 SwiftShader,源码直跑):结局全程探针桌面 20/20、手机 390×780 20/20,零页面错误;story-progress 40 例、ending-logic 23 例通过。真 vitest/生产构建未在云端跑(npm 被网络策略拦截),发布前必须本机 `npm run test:unit` + `npm run build`。
- 已知:狐狸 3D 站(scene10-fox)仍无玩家入口(只有 foxApi.open),画册页书页八已含狐狸台词;日后接入时驯养多日仪式必须可跳过,不能挡结局。

## 2026-10-03 发布范围：首次旅程与小羊同行

- 本次发布包含下述首次旅程第四轮、小羊同行，以及源站/R2缺失的Piper和狐狸模型补齐；后续未建成章节不在交付范围内。以下“本地”段落保留为开发记录。
- 发布前验证：后端97项、原子存储4项、手机6项、安全16项、单元417项、类型/代码检查/依赖边界/生产构建通过；压缩模型手机同伴专项24项通过。四个画面基准按本轮实际外观更新并人工检查。
- 安全探针跟随9月24日已上线的去除设备额度规则，断言自有照片请求成功与缓存命中；所有权、令牌及SVG检查保留。
- 先提交并推送GitHub，再按独立发布包备份服务器、上传模型和R2、安装新分包、更新HTML。保留旧哈希资源与访客数据；发布后验证网站完整手机路线及小羊互动。

## 2026-10-03 小羊同行（本地，尚未发布）

- 用户确认添加小羊同行。现实保留羊箱，回忆中的3D羊是仅玩家可见的想象投影；这是获用户认可的游戏表达，原定稿角色对白、回忆旁观规则不改。不要让投影影响过去人物、吃掉玫瑰或提前解锁章节。
- `scene/sheep-companion.js`经组合根装配；`shared/sheep-companion-logic.mjs`集中开放世界与跟随步长。仅画羊完成且在已建成b612/king325–327显示，未建成328–330不放同伴。世界切换搬同一个root、清声音；dispose撤订阅、触摸控件和GPU资源，晚到的模型回调不能复活。
- 羊采用用户`Downloads/sheep (1).glb`，下载原件不动。发布副本`models/b612/sheep-companion.glb`经过`build-sheep-assets.cjs`的meshopt压缩/量化，787976→158264字节，不简化网格。原作者Kinga Kroliczek、CC BY4.0，元数据保留，来源说明见同目录md与游戏帮助。`scene/sheep-model.js`先把量化属性解码为浮点再做矩阵变换，保留网格轮廓、三角形和材质，精确包围盒归一0.72m；已有四腿网格分片程序迈步、头部统一带动眼耳鼻，不冒称资产自带骨骼动画。
- 贴原B612曲面并沿法线站立；无碰撞阻挡/导航新机制，不接管玩家、罗盘或世界镜头。只有主动抚摸会转望羊。对白/弹层/入场全景安静等待，日落预览近距离坐下。通过journey:observed/remembered事件回应，不插入新对白；音效用既有AudioListener，尊重avAllowed总闸，默认只给动作/文字反馈。
- 小羊及羊箱抚摸按钮走overlay触摸白名单且closeOnOutside:false，有距离守卫和冷却。专项`node scripts/probe/sheep-companion-probe.cjs`、手机加`SHEEP_MOBILE=1`；使用已完成路线的独立浏览器夹具，入场必须带spawnFor(world)位置，不能把沙漠坐标直接带到小星球。完整故事验收仍用b612-journey-probe，从真实画羊触发同伴。

## 2026-10-03 首次旅程第四轮（本地，尚未发布）

- B612四站到达后由玩家点罗盘行动按钮或E开场，不再靠距离自动打开对白。`journey.setGoal`可携带`action/onActivate`，实际交互仍检查当前世界、距离、弹层与飞行锁；不可通过点击远处按钮跳过行走。
- 火山观察在场景中圈记；幼苗手札显示不同草图与花苞/叶片线索；日落在观察后转向真实场景太阳，由玩家点“记下这一幕”或E确认，再开放下个位置。原星球模型与原著对白保留。
- `journeyTaskCheckpoint`登记在store-api，保存当前任务的观察数量、幼苗步骤和历书刻度；完成清除，中途退出保留。家的再次入场跳过已读段落，沙漠石门目标在退梦后重建；不自动恢复刷新前的世界。
- 飞机只在沙漠且首次国王章节完成、无对白/任务/弹层、真实靠近且模型已加载时登机。`allowPlaneBoard`集中边界；W加油门，S减油门。增加触摸按住操作、切视角和返回停机处按钮；离开世界取消飞行，不覆盖传送后的角色坐标。
- 飞行垂直速度在物理核中限幅，避免短暂抬头立即到320m天顶；仍保留起飞、爬升、失速与下降。主线探针同时采集页面与着色器/uniform异常。
- 触摸按钮登记overlay时必须用`closeOnOutside:false`，否则按钮自己的click会触发弹层关闭并隐藏出口。飞行状态不再用CSS遮掉正在阅读的对白。
- E/J通过InputManager的`onKeyPress`订阅，并由统一input facade转发；不再按帧轮询边沿，避免低帧率漏掉短按。消费过的E标记`defaultPrevented`，飞机不得再处理关闭对白的同一次按键；dispose撤销订阅。
- 复验完整路线：`JOURNEY_WALK=1 node scripts/probe/b612-journey-probe.cjs`，手机加`JOURNEY_MOBILE=1`。`JOURNEY_FLIGHT_ONLY=1`仅补测已完成国王的飞行UI，不可作为完整剧情验收；`verify-plane.cjs`也采用完成国王的旧档夹具并使用W加油门。

## 2026-10-02 旅途交互（本地改造）

- 原著来源为桌面`小王子/the-little-prince.txt`，施工依据为`B612-剧本-定稿全本.md`；设计差异及范围见`B612-旅途交互设计.md`。严格保留开场→沙漠现实→B612家的回忆→国王星的顺序、原著角色对白、幽灵旁观规则和退梦再入梦。
- `core/journey-system.js`通过组合根装配，输入由facade注入；`shared/journey-logic.mjs`集中观察点、任务和手札文案。`ctx.ui.journey`及`cancelDialogScope`已登记，`journeyMemories`通过store-api持久化。新目标优先接入既有剧情罗盘。
- scene3-memory四站增加观察互动；scene6-king在历书与老耗子台词之后加入互动。任务期间与对白期间收起worldNav，B612的page1未完成前隐藏325入口；坐标默认隐藏，F3恢复，任务册默认紧凑。画羊取消静默倒计时，玩家主动确认。
- 离开回忆世界时取消所属scope的台词与交互；心跳在对白仍开着时继续等待。新增脚本`node scripts/probe/b612-journey-probe.cjs`验收完整路线、错误输入、退出重入、手札和语言；`FULL_OPENING=1`完整播放开场，默认选答后主动跳过电影。画面回归只测渲染，预置scene2/page1，完整剧情交给旅途探针。
- `JOURNEY_MOBILE=1`复验手机尺寸完整旅途；`JOURNEY_UI_ONLY=1`仅补测触摸、时钟排版、手札滚动关闭与弹层停止移动（预置已完成剧情）。正式旅途探针不能设置UI_ONLY。手札的关闭按钮在滚动时保持可见，菜单和观察卡随语言切换。
- **引导与对白修正（同日第二轮）**：主线对白`autoHide:0`，由“继续”或E推进；主线锁定时背景提示不得替换对白。世界切换同时撤销当前、排队和已排定的旧世界对白。规则集中在`journey-guidance.mjs`；本条取代下文旧版“非lock可打断lock”的语义。
- 用`journey.setPhase`显示当前章节、站数和持续行动提示；用`journey.transition`在进入家的回忆、退梦与拜访国王前明确交接。`homeMemoryStep`/`kingMemoryStep`保存完成段落，并兼容已有手札记录；不自动恢复最后所在世界。
- **原星球保留（2026-10-03，第三轮）**：B612原兼容GLB整体放大2倍，保留球形轮廓、材质、人物、玫瑰与动画比例；撤除第二轮`homeWalkGround`。`scene/model-surface.js`只采样原`PlanetLP_1/2`地形网格，角色眼高使用共享`EYE_HEIGHT`；四站与光点落在实际曲面上，限制陡边，不实现整球翻转重力。325仍使用原平面规则。
- 初访B612展示3.6秒全景，竖屏拉远镜头，结束后恢复视角；新站位短暂转向引导。B612相机在曲面位移后同步，全景时由入场镜头接管，第三人称允许负高度地表。导航按当前观察点更新，箭头向上为正前方；“看向目标”只转镜头，不传送。离观察点较远时收起大卡片。
- `JOURNEY_WALK=1`让B612与325的位移使用真实W输入，沙漠门口仍由测试夹具设置站位；手机UI补测还验证对白持续等待、背景提示保护、帮助不推进剧情与旧世界排队取消。浏览器探针串行运行，避免多份无头3D渲染争抢资源。
- `JOURNEY_HOME_ONLY=1`只补测沙漠到B612的全景、第一/第三人称镜头与曲面步行；配合`JOURNEY_MOBILE=1 JOURNEY_WALK=1`也验证真实触摸摇杆，不替代完整路线验收。
- 发布验收可用`PROBE_URL=https://cloudbear.cloud PROBE_WAIT_MS=180000 JOURNEY_MOBILE=1 JOURNEY_WALK=1 node scripts/probe/b612-journey-probe.cjs`，使用独立浏览器新存档测试完整路线，不改服务器访客存档。截图以`journey-online-`开头。手机渲染测试等待跳过按钮绑定与真实世界启动，不能仅凭入口已有canvas判定初始化完成。

3D 交互画廊(Three.js)+ Node 单文件后端。建筑 + 西域沙海地形 + 跳跃滑翔 + 答题门禁 + 审批门 + 白板/音乐子页 + 双模式展示区 + 访客上传/AI 看图 + 昆仑巅彩蛋。
**访客规则与玩法机关见 `ADMIN_GUIDE.md`(后台操作手册,每次改规则同步更新)。**

## 结构

- `server.js` — 后端入口:只含 require + 路由分发 + listen(2026-09-18 安全策略下沉 lib/security.js 后名副其实)。**路由已声明式单表化(2026-09-02 起)**:全部 **52 个端点**声明在 `lib/routes.js`,每项带 `{method, match, auth, guard?, fn}`,**新增端点=在表里加一行并声明 auth,server.js 不再改**;契约测试 `src/__tests__/lib-routes.test.js` 带端点数快照兜底(增删路由要同步改快照)。其余逻辑在 `lib/`:config(env/常量 + MIME 表)、util、store(**持久化/通行证/设备指纹**)、gate(邀请函页/自动放行/改名/SSE)、admin(后台接口)、quiz(答题评分/AI 阅卷双通道/特别邀请函)、files*(静态/公开上传/删除,已拆 files-static/files-upload)、siteconfig(展示模式/自定义链接/演示照片/访客链接)、vision(AI 看图配文)、security(安全策略集中处)、aichannels(AI 通道单一源)、wishes、multiplayer、bigscreen、r2sync、cache-bust、track、tts、chat、abuse、client-errors、docs。
  **持久层真相(2026-09-01 起,⚠️ 旧文档写的"数据库即 gate_data.json"已过时)**:权威存储在 **SQLite**(`gate_data.db`,WAL 模式,better-sqlite3 v13.0.3),`lib/sqlite-store.js` 是适配层,`lib/store.js` 的 `SQLITE_ENABLED` 开关控制;**`gate_data.json` 降级为实时镜像兜底**(每次写同步落一份)。回滚开关:环境变量 `USE_SQLITE=0` 后 pm2 restart 即回纯 JSON;better-sqlite3 缺失时也会自动降级。**`lib/store.js`/`lib/sqlite-store.js` 改动必须单独 scp**(见「生产部署」盲区条)。
  **配额身份键与限流**:`quotaKey(req)` 优先用不可猜的 **vid Cookie(HttpOnly)**,无档案才退回 `deviceKey(req)`=sha1(UA);`capKeys(obj, max)` 防伪造身份无限增键(时间戳表删最旧,日配额表随机淘汰)。**AI 配额闸已全部拆除(2026-09-24 主人令)**:tts/vision/quiz 阅卷/聊天机器人召唤的按设备日限全部移除,AI 调用不再设配额 —— 成本防线只剩:文案长度上限、缓存(同句/同照片永不重复合成)、聊天室 3 秒/条发言限流、vision 仅本人照片且每张只分析一次。新增 AI 端点时按需自选防线,勿再照抄已删除的日限闸。
- `src/` — 前端 ES 模块(2026-07-27 由 `js/` 迁入并分目录),经 `ctx.js` 共享状态;**装配走唯一组合根 `core/composition-root.js`(按"层→相位→次序"确定性 init),严禁在 main.js 散点 import 副作用**。目录:`core/`(组合根/composition-root、game-state、game-loop、light-budget、boot-state、gameshell-dialog…)、`scene/`(scene/effects/desert/player/media)、`gallery/`(paintings/signs/markers/links/mode/fountains…)、`gate/`(entrygate/quizgate/settings/upload/housecolor/**agreement-swipe**/consent-session/guide-card/openfilm…)、`kunlun/`(peaks/spirits/eternal/ark/windchime/fireplace/snowwin/resetview/letgo/finale)、`state/`、`ui/`、`shared/`(story-text/z-layers)、`types/ctx.d.ts`(ctx 类型权威)、`styles/main.css`。**世界模块两段渐进加载(2026-09-24)**:`core/world-loader.js` 把 36 个世界模块拆 **核心链 26(串行阻塞揭幕;含星球世界 planets.js——它顶层创建 worldManager 世界注册表与石门传送垫,延后会让 boot-check 假报缺项)** + **后台链 10(永恒厅/飞舟/风铃/壁炉/雪窗/第6场/回忆层/重置视角/放下/终章,进图后补载不阻塞)**;后台链安全靠「core 后段顶层对后台链 ctx 登记零引用」,新增后台模块前照此核查;后台完成态挂 `window.__deferredWorldReady`。
  **ctx 总线规矩**:`src/ctx.js` 是跨模块共享通道,属性收进 **7 个命名空间**,有**登记册**防膨胀(新属性先登记);类型权威在 `types/ctx.d.ts` 的 `GalleryCtx`(6 个 `ctx-*.js` 分片合并)。
  **写路径单入口**:运行时可变状态的唯一写入口是 `gameState.set(prop, val)`(详见下方「写路径单入口规矩」条)。
- `vendor/` — npm 三方库的浏览器直跑副本(three.module.js/hls.mjs),由 `scripts/gen/sync-vendor.js`(postinstall 自动跑)从 node_modules 拷贝;index.html 的 importmap 把裸包名映射到这里,**仅本地原生 ESM(非 Vite)运行用**,生产构建直接打包 node_modules。three 锁定 `0.160.0`(与旧 three.mjs 同版,已删)。
- `scripts/` — `test/`(test.js/test-mobile.js/verify-all.js/历史一次性 race/upload 测试)、`probe/`(debug-browser/perf-probe/perf-profile/daynight-probe/light-compile-bench/**b612-*-probe.cjs** 系列/**verify-***/**probe-***)、`gen/`(check.js/gen-data.js/gen-thumbs.js/sync-vendor.js/dev.js)、`dev/`(一次性截图/处理脚本)、`optimize/`(模型压缩)、`artifacts/`(调试截图/baselines 截图回归)。**探针即验收**:新功能配套 `scripts/probe/` 探针,线上跑 `PROBE_URL=https://cloudbear.cloud node scripts/probe/<名>.cjs`。`scripts/blender-fbx2glb.py`(Blender 转换)、`scripts/deploy.sh`(一键部署)、`scripts/r2-upload*.cjs`(R2 同步)。一次性探针不删,归档备查。
- `public/` — sw.js + manifest.json(Vite 原样拷进 dist 根,URL 不变)。
- `models/` — **3D 模型持久资产库(~495M)**,代码按 `/models/xxx.glb` 绝对路径加载,**server.js 经 safeJoin 直接服务 `/opt/gallery/models/`**(线上实测 206 + Range 正常)。⚠️ **Vite 只复制 `public/` 进 dist,`models/` 不在 dist 里** → 见「生产部署」盲区条。**线上读取已走 R2 CDN(2026-09-24)**:`src/scene/gltf-loader.js` 用 `LoadingManager.setURLModifier` 把 `/models/...` 重写到 `https://cdn.cloudbear.cloud/models/...`(R2 桶 `gallery-media` 镜像,immutable 头);CDN 失联置 `window.__modelCdnDown` 本会话回退源站,localhost 豁免。镜像补传用 `scripts/r2-upload-models-rest.cjs`(CF REST 通道,Bearer token 走服务器 .env)。
- `admin.html` — 后台(审批/统计/历史/答题记录/展示区/文件管理)。**正确入口是 `/admin?token=<TOKEN>`;直接开 `/admin.html` 是 404**(静态黑名单拦截)。**后台脚本 `src/admin/admin.js` 里 `tk()/tk2()/tkq()` 恒返空串(token 已统一走 `x-token` 请求头,2026-09-18 审计)**——带查询串的接口必须自起 `?`(如 `/api/admin/client-errors?type=`),**禁止 `+ tk() + '&...'` 拼接**(2026-09-25 血泪:报错 tab 因此拼出 `client-errors&type=` 畸形 URL 404、后台长期空白;验收 `scripts/probe/admin-errors-tab-probe.cjs`,带 ADMIN_TOKEN 实点 tab)。`guide.html` — 《元素共鸣准则》访客说明书。`whiteboard.html`/`music.html`/`agreement.html`/`privacy.html`/`community.html`/`lobby.html`/`room.html` — 子页,全部纳入 Vite 多页构建(产物仍在 dist 根,部署路径不变)。
  **三协议阅读(P1-1,2026-09-23 起)**:闸门底行三个协议名点开的是**并列三协议面板**(`src/gate/agreement-swipe.js`),同一面板内三标签切换、每份各自勾选、三份签毕自动点亮 ENTER,**全程零整页 reload**(旧实现是三次整页跳转 + 收尾 `parent.location.reload()` 把 3D 世界推倒重来)。三份 html 被内嵌时带 `?embed=1`,各自的 consentBar / 固定返回键自动隐藏。验收 `scripts/probe/b612-pact-probe.cjs`。单份文档直开(`agreement.html?from=gate`)仍走原逻辑。
- `official.html` — **B612 官网**(2026-09-06 上线,取代 www 旧 React 官网):绘本式单页,默认英文 + sessionStorage 切中文,零依赖零 3D,字体自托管 `official-assets/fonts/`(国内不依赖 Google CDN),图片 `official-assets/*.webp`(主人的 Dola AI 生成图,水印已由 `dev/process-official-art.py` 去除:垂直克隆/水平镜像克隆两法)。部署见「生产部署」官网条;验收探针 `dev/official-site-probe.cjs`。

## 展示区模式(2026-07-25 主人定;2026-09-06 特殊模式整体删除)

- **2026-09-06 主人定:特殊模式删除**——`/api/siteconfig` 恒返 `mode:'normal'`(设备 special/全局 special 不再参与决策),admin 后台模式切换 UI 移除,`mediarules.mjs` 决策表按普通模式单轨:演示/本人上传可见,其余(图库/他人)整框隐藏,下载门禁同理拒绝。
- **照片全库退役**:data.js P 仅剩 5 张演示照片(201~205),其余 69 张已从 data.js/photos/服务器全部删除(挂画循环改为内容填完即止,不再绕圈重复挂);非大屏视频退役:data.js V/VIDEO_WALL_SOURCES 清空,服务器 videos/ 根目录仅剩 户外大屏/(大屏 1~5 号轮播走 /api/bigscreen + R2,完全不受影响)。访客上传仍可动态上墙。
- 链接模型:`mode.js` `spawnLinkModel`(10 种),后台链接(icon=挂原图案/model=新建)、访客链接(gateData.userLinks 按 dk,出现在眼前,pos 由前端传)。

## 上线前必跑(自动化测试)

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm test                          # = 下面三条(test-store + test.js + test-mobile)
node scripts/test/test-store.js   # 存档原子写 4 项(并发保存/截断恢复/tmp 残留)
node scripts/test/test.js         # 后端 130 项(数据校验/API/安全边界/审批门/上传限制/邀请/协商缓存/健康检查)
node scripts/test/test-mobile.js  # 手机端渲染 6 项(iPhone 模拟:着色器错误/JS异常/空屏)
npx vitest run                    # 前端单测 245 项(物理/碰撞/状态机/游戏状态/存档/路由契约/配额/灯光预算/剧情纯逻辑等 24 文件)
npx vitest run --coverage         # 覆盖率基线(2026-09-24 建):已测纯逻辑模块普遍 82-100%(game-state 94/collision-resolve 96/light-budget 100/store 100/vertical-physics 92);
                                  # 全库 2.02% 是**假低**——3D/浏览器模块在 node 里跑不了,由探针层(scripts/probe/)兜住,勿用全库数字评判
npm run test:scene                # 场景截图回归 4 检查点(主世界/B612/国王星球/返回;见「场景自动化测试」节)
```

两个全绿才能部署。前端改动用 `node --input-type=module --check < src/某文件` 查语法;`node --check server.js` 查后端。

## 架构整改(2026-09-07 审计 P1→P4 全项落地)

- **P1 时序**:世界导航按钮过 navGuard(切换中 toast、被拒不静默);startWorld 失败出「世界没能落进画里」重试层(#worldErr)。
- **P2 结构**:剧情台词单一源 `shared/story-text.mjs`(FILM 字幕+DIALOG_LINES 气泡;星球 tts 仍在 planet-logic);主世界石门归 `gallery/portal.js`(石门自动传送+padBtn+world:changed 解除武装/落点外推),planets.js 只管太空侧。**planet-logic.mjs 已迁 shared/**(gallery 域可用,零跨域违规)。
- **P3 可维护**:启动自检 `window.__bootCheck`(关键装配缺项 console.error,防模块清单漏载静默);UI 世界归属双轨——新 UI 创建处标 `data-world-ui="main"/("space"+data-world-ui-display)`,scene-manager 扫属性,旧 MAIN_ONLY_UI 清单留兜底;内联 z-index ≥380 已收编 Z 登记册(modal/veilFx/veilLock/teleport/worldToast)。
- **P4 复杂度**:昼夜时间源可注入 `ctx.media.dayTimeSource=()=>12`(测试/剧情不必再 patch dayNight);建筑布局尺寸唯一源 `src/scene/layout.mjs`(ctx.scene.layout 可读);开场电影笔画数据外置 `gate/film-strokes.mjs`。

## 场景自动化测试(2026-09-07,三层防线)

3D 场景文件(planets/scene/openfilm)是"拍戏"代码,产出是画面,没有尺子量对错。三层补救:

- **第一层 纯逻辑拆出(能算账的交给机器人算账)**:场景文件里纯计算的部分拆成零依赖模块,vitest 直测——
  - `src/kunlun/planet-logic.mjs`:六星章节数据/岛面几何/石门武装状态机(gateStep)/返回落点外推(exitGateNudge,含 2026-09-06 零向量回归用例)。planets.js 只做场景接线,**改数值、改规则去这里**。
  - `src/core/light-budget.js`:灯光限额选择算法(selectLightsToRemove,手机/桌面/豁免名单)。main.js 只执行删除。
  - `src/gate/film-gate.mjs`:开场电影收束状态机(三路 finish 幂等/skip 幂等/dead 守卫/收束定时器后来居上)。openfilm.js 只管 DOM 表现。
  - **改这三块的行为必须同步改对应测试**;`scripts/test/test-mobile.js` 的静态检查盯 main.js↔light-budget 的接线存在。
- **第二层 专项探针(关键路径剧本化)**:`scripts/probe/` 下按用户真实路径写断言脚本——smoke-gate(开机健康)、b612-return-black(返回主世界防回弹+像素亮度+后处理/avatar 断言,支持 BASE_URL 直测线上)、b612-preload-film(电影期预加载零渲染)、b612-world-probe(六世界导航链)。
- **第三层 截图回归(拍照对比兜底)**:`npm run test:scene` = `scripts/probe/scene-visual-regression.cjs`。四检查点各断言三层:activeWorld 语义 → 亮度非黑非白 → 与基线(`scripts/probe/baselines/vr-*.png`,已入库)的**归一化块签名**对比(昼夜/曝光漂移被抵消,构图变化保留)。阈值/裁剪窗在探针头部常量;同机噪声实测 <1%,WARN 10%,VR_STRICT=1 时超 25% 硬失败。**有意改画面后跑 `VR_UPDATE=1 npm run test:scene` 重建基线**。局限:整帧对比抓构图级变化(建筑/门/星球消失),小物件回归靠第二层专项探针。CI 已接(非严格模式:语义硬门禁+像素警告)。

## 构建与效率(2026-07-25 Vite 升级)

- **工具链 Vite 8**:`npm run dev` 一键起**前后双进程**(scripts/gen/dev.js:后端 server.js :3000 + Vite :5173,Ctrl+C 同退;CLI 参数如 --port/--host 转发给 Vite;**只起 Vite 不起后端 = 媒体全 404**,2026-07-27 踩过);`npm run build` → `dist/`(**10 个 html 入口**(index/admin/guide/whiteboard/music/agreement/privacy/community/lobby/room,以 `vite.config.js` 的 `rollupOptions.input` 为唯一权威,多页构建,产物仍在 dist 根)+ `sw.js`/`manifest.json`(来自 public/,URL 不变)+ assets/* hash 分包,gzip 后 ~200KB);`npm test` 跑两套测试(`npx vitest run` 单测 245 项 + scripts/test/)。
- **生产部署**:标准流程 = `node scripts/deploy.sh`(见下「deploy 全套流程」),脚本已把历史血泪固化进步骤。**先传 assets 再传 html**,且 **`dist/` 必须整目录全量上传**(assets 哈希每版都可能变;2026-07-26 血泪:只传 index 包会让旧包 404 被 Cloudflare 边缘缓存,部分用户长时间白屏;万一中招,改 `main.js` 里 `window.__BUILD__` 的值重打出新哈希即可绕开);脚本会上传 `dist/index.html`→`/opt/gallery/index.html`、`dist/assets/*`→`/opt/gallery/assets/`、其余 `dist/*.html`/`sw.js`/`manifest.json`→`/opt/gallery/` 同名,并清理历史 main chunk(只留最新 3 个);仓库根的 `index.html` 是开发入口(引用 `/src/main.js` 原生 ESM(importmap 把 three/hls.js 映射到 /vendor/),test-mobile 直接用它),**生产用的是 dist/index.html(hash 分包)**,两者不要混。
  ⚠️ **部署盲区(不进 dist,必须单独传)**——共四块,`scripts/deploy.sh` 覆盖 dist + ①后端(2026-10-05 起经 `scripts/backend-sync.sh`,问 y/N)+ ③models,②④仍靠流程:
    ① **后端文件**:`server.js`、`lib/*.js`、`gate_data.json` 等;
    ② **SQLite**:`gate_data.db`(WAL/SHM 一并);
    ③ **`models/` 目录**(~495M):deploy.sh **第 6 步自动补传**(md5 清单比差集,只传缺的/改过的;⚠️ 不用 rsync——Windows Git Bash 没有 rsync);加 `--no-models` 可跳过;
    ④ **`.env`**(私钥不进库)。
  后端文件标准更新流程:①scp 下载线上同名文件 → diff 确认差异只含本次改动、无线上独有内容 ②服务器 `cp x.js x.js.bak-$(date +%Y%m%d-%H%M%S)` 备份 ③scp 上传 ④两边 md5sum 比对 ⑤`pm2 restart gallery --update-env` ⑥curl 线上验证。
  **deploy 全套流程(2026-09-03 起标准)**:①`git commit` ②`bash scripts/deploy.sh`(构建+传 dist+同步 models+pm2 restart) ③单独 scp 受影响的盲区文件(后端/SQLite/.env) ④md5 比对 ⑤`PROBE_URL=https://cloudbear.cloud PROBE_WAIT_MS=180000 node scripts/probe/<对应验收>.cjs` 跑线上探针全绿。
  **线上服务事实**:pm2 进程 `gallery` 监听 **3000(http)/3443(https)**,`landing` 监听 3100;站点根 `/opt/gallery`(**不是 git 仓库**,代码同步靠 scp,不能 git pull);前端 chunk 只保留最新 3 个 `assets/main-*.js`,server.js 直接服务 `/opt/gallery/assets/`(不是 dist/assets/)。
  **官网部署(2026-09-06)**:`official.html`+`official-assets/` 不走 dist——`scp official.html → /opt/gallery/landing/index.html`、`official-assets/ → /opt/gallery/landing/`(www.cloudbear.cloud,pm2 `landing` :3100 静态服务,改文件不用重启);同时镜像一份到 `/opt/gallery/official.html` + `/opt/gallery/official-assets/`(主域 /official.html 直达官网,Enter 链接两处都指主域绝对地址,勿改回相对路径)。
- **HMR 分家**:`src/hot.js` 提供 `hotBegin/hotEnd` 生命周期(自动捕获场景对象/ticker/定时器/DOM,热替换时先销毁旧实例;ticker 按引用逐个移除,不会误杀后加载模块)。已接入 **26 个模块**(2026-09-18 核数;旧清单所列 effects 已被 core/effects-system.js 取代且未接 HMR):dome-towers/housecolor/fountains/links/markers/quizgate/eternal/signs/mode/ark/crash-site/spirits/snowwin/tower-orb/windchime/story-dialogs/settings/letgo/upload/fireplace/resetview/planets/finale/museum/peaks 等——改这些文件只热替换对应模块,不整页闪动(实测见 probe-hmr.js)。paintings.js/openfilm.js/avatar.js/scene.js 为高频改动未接 HMR 项(2026-09-18 审计)。player/desert/media(有玩家状态/物理/长连接)保持整页刷新。**新模块要接 HMR 就三行**:`import {hotBegin,hotEnd} from './hot.js'` + 顶部 `hotBegin('名')` + 底部 `hotEnd('名');if(import.meta.hot)import.meta.hot.accept()`。**注意**:①模块内要用 `onTick`/`s` 就在 `hotBegin` 之后再从 ctx 解构(拿到包装版);②碰撞体/iG 可交互组/全局事件监听等自动捕获管不到的,用 `const bag=hotBegin('名');bag.custom.push(()=>{...})` 注册自定义清理;③主循环(main.js)对热模块暴露的函数/数据必须调用时从 ctx 现取(如 ctx.updateFireworks、ctx.pG),不能模块顶层一次性解构。
- **gzip**:`lib/files-static.js`(2026-09-18 自 files.js 拆分;上传/压缩/审核在 files-upload.js,files.js 为聚合门面)对 >20KB 的 html/js/css/json 自动 gzip(**内存缓存 5 分钟**),媒体 Range 流式不受影响。**坑(2026-07-27)**:改完大 html 立刻验证会读到 5 分钟前的缓存,误判"没部署上"——等 5 分钟或 pm2 restart 清缓存再验。
- **可维护约定**:新功能优先开新模块(src/ 对应子目录 或 lib/),旧文件只加钩子;跨模块只经 `ctx.js` 共享;模块职责写在 `main.js` 的 import 注释和本文件。
- **开发工具(2026-07-27 引入)**:`npm run lint`(eslint 10 flat config `eslint.config.mjs`,只抓真错误不管风格,历史代码宽松项已关);`npm run format`(prettier,**不批量重排历史文件**——只排版新写/正在改的文件);`.env` 加载走 dotenv(lib/config.js,生产无 node_modules 自动回退手写解析,行为不变)。

## 模型压缩管线(2026-09-20 审计 v3-P0 落地)

全部 GLB 经 @gltf-transform/cli 压缩(meshopt 几何+webp 纹理+量化+prune,182.6MB→39.3MB,生产开机传输 20MB→4.5MB)。**规矩:①任何 GLB 加载点禁止直接 `new GLTFLoader()`,一律 `import { createGLTFLoader } from '../scene/gltf-loader.js'`(MeshoptDecoder 统一接线,漏接=解析失败);②新模型入库必须过 scripts/optimize 管线压缩;③模型不入 git,服务器 /opt/gallery/models 为源,本地改用 .models-staging 流程后回填双端;④重压缩前先备份(server /tmp tar 或 /opt/backups)。
  **⚠️ 自写 gltf-transform 脚本必踩的三坑(2026-09-28 酒鬼星实锤:三件套"压过"后仍是裸 PNG,5.85MB 一点没少)**:
  ① `new NodeIO()` **不注册扩展 = 静默产出完全没压缩的文件**,控制台只给一句软提示
  `Some extensions were not registered for I/O, and will not be written.`——必须
  `.registerExtensions(ALL_EXTENSIONS)`(含 `EXT_texture_webp`);
  ② meshopt 还要 `.registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder})`,漏了几何/量化也全不落地;
  ③ **`targetFormat` 写字符串 `'webp'`,不是 `Format.WEBP`** —— 该枚举只有 `GLTF/GLB`,`Format.WEBP === undefined`,传进去 `textureCompress` 静默不转格式(产物仍是 PNG)。
  **每次压缩后必须自检**:跑 `node scripts/optimize/scan-uncompressed.cjs [目录]`(默认 `models/`)——列出所有"仍是 PNG 纹理"的可疑文件;原理就是产物里搜 `WEBP` 字节为真、搜 PNG 魔数为假、搜 `EXT_meshopt_compression` 为真,三条齐了才算压过(也可用 `npx gltf-transform inspect` 看 TEXTURES 表 mimeType 是不是 `image/webp`)。2026-09-28 全库体检(本机 17 个 / 服务器 18 个)**仅酒鬼星三件套中招**,其余均真压缩。修好后酒鬼星三件套 5.85MB→0.75MB(**-87%**)。
  **镜像单个模型到 R2**:`node scripts/r2-upload-models-rest.cjs hall/xxx.glb`(路径相对 `models/`,可多个;不带参数=全量)。在服务器上跑(__dirname 决定 ROOT,须放在 `/opt/gallery/scripts/` 下),凭据从 `/opt/gallery/.env` 取。

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

## 剧本补全:旅途卡 + 328~330 + 地球之日(2026-10-04)
- **衔接**:每段回忆结束(家的回忆/每颗星拾起星屑)→ `ctx.ui.voyage.offer()` 翻出夜色书页卡(`ui/voyage.js`,Z.voyage 565),点「继续」直达下一站(`ui/world-travel.js` 的 `travel()`,章节地图共用)。下一站算法 `shared/voyage-logic.mjs nextStop()`。「再待一会儿」后星球底部导航主按钮 = 「继续旅途 →」。经旅途卡到达的场景用 `voyage.arrived(world)` 跳过自己的开场过渡卡。
- **328/329/330**:`kunlun/late-planets.js` 一个文件三颗星,流程 chainA → 小玩法(`#planetGame`,Z.planetGame 73)→ chainB → 星屑 → `setChapter(4/5/6)`。台词在 `shared/story-text-late.mjs`。
- **地球之日**:`kunlun/earth-day.js`,七站(蛇/花/回声/玫瑰园/狐狸/再看玫瑰/秘密),进度 `earthStep`,走完写 `earthDay`;狐狸用 `foxApi.open({earth:true,onRite})` 压缩版 + `foxApi.secret()`。
- **结局门槛** `ENDING_GATE_CHAPTER = 6`;老存档(chapter≥3 且 endingStep>0)按 `LEGACY_GATE_CHAPTER` 照旧走完。ending-journey 第 0 步不再翻临时画册页,等 `earthDay` 后直接找井。
- **星图**(`ui/star-map.js`,菜单「✦ 星图」,Z.starMap 573):八颗星手绘 SVG,点亮着的星直接飞过去;解锁同章节地图。
- **世界切换不再黑屏**:`core/scene-manager.js` 走 `shared/warp-fx.js` 星流过场(`runWarp`);多跳旅行 `ui/world-travel.js` 用 `holdWarp/releaseWarp` 托住一段、`lockWarpLabel` 锁定终点名。目的地名/色在 `shared/warp-labels.mjs`。
- **真模型(2026-10-04 主人提供)**:`scripts/optimize/build-rose-lamp-assets.cjs` 产出 street-lamp(329 路灯,亮灭经 `planet-props.js setLampLit`)、garden-rose(玫瑰园内圈实例化,外圈仍是低模远景)、hero-rose + rose-dome(只取玻璃罩;原底座有铭牌字样)。高精度玫瑰用 `simplifySloppy` 减面(常规 simplify 被 UV 接缝锁死)。新模型未镜像到 R2 前列在 `scene/gltf-loader.js NOT_ON_CDN_YET`,直接走源站。
- 改台词后重跑 `scripts/gen/subset-zh-font.py`(缺 brotli 时可用 node zlib 做 shim)。

## 环境

- Windows + Git Bash;Node 必须 `export PATH="/c/Program Files/nodejs:$PATH"`。
- 云端:阿里云 `101.133.235.110`,pm2 进程 `gallery`(:3000/:3443)、`landing`(:3100),目录 `/opt/gallery/`(⚠️ **不是 git 仓库**,代码同步靠 scp,不能 git pull)。SSH 密钥:`~/Downloads/网站私钥bear1.pem`(另有一份从 `C:/Users/17296/Desktop/梦幻画廊-交接笔记.md` 提取的等价私钥,`deploy.sh` 走这条)。**日常部署直接用 `node scripts/deploy.sh`**,别手搓 scp(脚本已固化构建/上传/清理/模型同步/重启/验证全套)。
- **盲区四块**(不进 dist,`deploy.sh` 不覆盖,改动必须单独 scp + md5 比对):① 后端文件 `server.js`/`lib/*.js`;② SQLite `gate_data.db`(WAL/SHM 一并);③ `models/`(deploy.sh 第 6 步已 **md5 清单比差集**增量同步,⚠️ **不用 rsync —— Windows Git Bash 没有 rsync**,用过它 + `set -e` 会直接中止在第 6 步);④ `.env`。详见上文「生产部署」条。
- **AI 通道单一源(2026-07-28 主人定)=lib/aichannels.js**:全站 AI 能力(文本/视觉/语音)唯一入口,**小米 MiMo 首选**(MIMO_API_KEY 走环境变量,不落盘):文本 mimo-v2.5-pro → moonshot kimi-k2.6 → kimi-for-coding;视觉 mimo-v2.5 → moonshot-v1-8k-vision → kimi-for-coding;语音 mimo-v2.5-tts(限免)→ edge-tts 本地兜底(在 tts.js synth 内)。消费方:quiz.js 阅卷/vision.js 配文/chat.js 昆仑之灵/tts.js 语音。**新增/调整 AI 通道只许改 aichannels.js**;测试屏蔽 key 必须连同 MIMO_API_KEY 一起屏蔽(test.js 评分用例确定性走本地细则)。
- 无头浏览器验证:`node scripts/probe/debug-browser.js <url> [秒]`(抓 console/pageerror/失败请求);截图注意无头环境加载比真机慢,等 15s+ 再操作。

## 约定

- **小地图羊皮纸罗盘规矩(2026-09-10 主人定圆形方案)**:src/scene/minimap.js 是全站手绘语言(纸底/墨线/朱砂印章)的地图实现——圆形 ⌀150/放大⌀260,墨环+刻度+北针画在 bezel 静态层;建筑区=260² 纸质静态底图(S=2.6px/m,zone 外沿内切于圆),沙漠区=启动时一次性预渲染的全沙漠等高线纸图图集(1600×1400,1px=1m,22k 采样+marching-squares,替代旧版每帧 1200+ 次 getH 网格重绘,单帧 <0.5ms)。**坐标变换单一源=`bMap/bUnmap(w,x,z)`**(S=w/100):绘制与点图传送共用,禁止再手写 px/m 换算;**border-radius:50% 会把圆外点击裁掉**——面板内任何按钮必须放在圆内(⤢ 在底部居中)。POI=朱砂印章 `seal()`;玩家=墨色箭头;B612=四芒星屑;万镜画廊禁区=hatch 圈+镜印。z 已收编(z-layers: mapPanel:20/mapBtn:21)。验收:scripts/probe/minimap-probe.cjs(17 项)。房间页 room.html 独立小地图不在此列。
- **剧本对话链规矩(2026-09-10 容错改造;同日二次修复:丢弃改排队)**:凡剧本台词(crash-site 叫醒词/scene2 画羊/scene3 转夜与回忆层)一律经 `ctx.openDialog` **带 `lock:true`**(互斥+**FIFO 排队补播**:上一条 lock 对话未收束时,后来 lock 进队等锁空自动补播——**静默丢弃是断链根因**,2026-09-10 主人报「无衔接无触发」即此:旧档开机桥段台词被叫醒词吞掉+chainBusy 永不归零站桩检测全停)与 **`speakerType`**(story-text.mjs who 常量的 `spk` 字段,经 `whoSpk()` 取;prince 金/pilot 蓝/sheep 粉/rose 红,[data-spk] CSS 换装);**链式对话必须带心跳守护**——**`ctx.ui.dialogOpen()`**(⚠️ 2026-09-26 P0 实锤:必须走**命名空间路径**,扁平 `ctx.dialogOpen` 是 undefined——运行时挂载到命名空间的属性没有扁平别名,六处守护曾因此首跳抢跑/无差别到点收束)每 2.6s 余量轮询一次,onDone 意外丢失时兜底推进,且每步 `spent` 幂等守卫防 onDone 与守护双推进。**事件解耦的跨模块发射要可靠投递**(2026-09-26 实锤:`story:scene2` 瞬事件偶发丢落=画板永不来玩家黑站——wakeFinish 发射后自检 `#scene2Board`,没起来 1.5s 补发×3;`__crashWakeDone` 兜底已改对话感知:对话框开着就等,链死才置位=真收束信号)。**禁止在调用方手写 onDone 循环**(scene2 finale 曾自造循环无类型无守护,已归并 speakSeq)。打断语义:非 lock openDialog 可打断 lock 链,被打断项的 onDone 由 gameshell-dialog 延后一拍补发(链自恢复)。**剧情重置入口 `?storyreset`**:清 scene2/page1 标记重走全链(store-api `unmark()`,验收/演示用)。**情节指引规矩(2026-09-26 主人报「对话对情节的指引不清晰」)**:①带 choices 的对话=剧情在等玩家,`showChoices` 必须亮 `GLOBAL.turnHint`(「轮到你开口——点一句回应」)+ `gs-await` 呼吸动画(只动 box-shadow 不动 transform,与 hover 不打架;renderDialog/closeDialog 摘除类);②台词说完后要玩家**走位**的场,必须有**行动指引三件套**——光柱信标(零 PointLight 铁律:MeshBasicMaterial 圆柱 fog:false,scene3-night `makeBeacon`)+ `ctx.ui.modeToast` 直说下一步 + 到达即撤信标(scene3:羊箱信标 counting 即撤/石门信标 `SCENE3.gotoGate` toast+信标 page1 撤);③新剧情节点照此办理,不许只靠台词暗示;④**任务册「进程」行**(2026-09-26 主人报「情节推进理解困难」):羊皮卷首行显示「现在讲到哪」——单一权威 `story-progress.mjs storyBeat(flags)`(纯函数单测钉死:开场两节拍 → 六星按「已完成数=chapter,当前章=下一颗」给 325-330 章名 → 终章;**改章名/加节拍只许动它**),gameshell-system 0.5s 节拍自动刷新,tt 双语随语言切换。验收:scripts/probe/b612-story-chain-probe.cjs(两场景 28 项,支持 BASE_URL 直测线上;场景二=旧档开机全链串行回归)+ scripts/probe/b612-guidance-probe.cjs(指引层 9 项:进程行/turnHint/gs-await/双信标生命周期/石门 toast;信标断言靠 addInitScript 挂 scene.add/remove 钩子记录历史存在,羊箱信标旧档只存活几秒,事后查场景必输)+ scripts/probe/b612-king325-guidance-probe.cjs(325 章指引 17 项:全链四节拍 chain1→sunset→chain2→pickup/星屑信标 storyBeaconMote/「去拾起它」toast/拾取即撤/章节推进/**回程石环四件套**(拾星后石环亮+storyBeaconDoor 光柱+「走进石环回 B612」toast+进门传送回 B612 即撤)/B612 首进「下一步」指引;台词静音走纯文本节奏,本地起服或 BASE_URL 直测线上)。**325 章血泪(2026-09-27)**:星屑原摆 z=2.6,距出生点 z=4 仅 1.4m——落在 3m 拾取判定圈内,台词播完同帧自动拾取,信标闪没、三条 toast 同步连发互相顶替,三件套形同虚设;已挪至 z=9(出生点正后 5m,「转身走过去拾」真实存在),**星屑坐标单一源=planets.js 网格 `name='sproutMote'`**(scene6 信标/判定现取,勿再双写硬编码),拾取后完成 toast 延 1.6s 防「拾获/完成」互顶。**回程石环(2026-09-27 点亮死代码)**:planets.js 的回程石环此前 visible 恒 false 从未点亮;现拾星后 setChapter 点亮+启动按进度还原,scene6 立回程光柱+toast、走进石环 3m 内 worldManager.back() 回 B612(含重访);**石环坐标单一源=网格 `name='sproutDoor'`**。**场景回归探针新规矩**:checkpoint 截图前等 #modeToast 退场(opacity≠1+0.4s 余量)——瞬态指引 toast 漂进帧曾致 b612 检查点 25.5% 假报警。
- **石门出场规矩(2026-09-27 主人令:石门不能一开局就摆在那)**:主世界星门+石台垫开局一律隐藏(老档含在内——老档的 exitBridge 每会话重播一次,收束时现身,无死路),`scene3-night` 在"石门亮起/再进一次石门"台词点经 `ctx.kunlun.revealStarGate()` 现身(只进不出;全完成退役照旧);`portal.js` 凭 `ctx.kunlun.isStarGateOut()` 决定按钮与自动传送是否生效,未现身走近不传且守卫消武装(防现身瞬间误传)。探针 `guide-arrow-dayphase-probe.cjs` 带隐身/现身两断言。
  **⚠️ 探针预置两坑(2026-09-28 第7场线上验收实锤,直测后期章节的探针必须补)**:① **石门**——先 `ctx.kunlun.revealStarGate()`,并**在远离石门处(出生点即可)等一帧**再传送到 `GATE_POS`;`gateStep` 只有 `near=false` 才把 `gateArmed` 恢复 true,直接落进 4m 圈会因 armed=false 永不 fire(表现为 waitForFunction 超时)。② **羊箱计数行**——探针跳过 scene3,途经羊箱 5.5m 内会触发 `SCENE3.counting` + `choices`,**该对话永不自动关闭**,lock 队列会把后面整条台词链全堵死(表现为 stage 停在 chainB 不动);须挂一个每 1.2s 点 `.gs-choice` 的 interval 模拟玩家开口,第 6/7 场自身零 choices,不会误伤。③ **CI 的 VR 回归探针同样吃①这坑**(2026-09-30 修复:`scene-visual-regression.cjs` 第②检查点直接传送石门等 b612,因门未现身 20s 超时 → **CI 从 9-27 起连挂 8 次**),已加 `revealStarGate()` + 800ms 再传送;**新增任何"进 B612/星球"的探针,先补这三步预置**。
- **诚实指引规矩(2026-09-27 主人报"无法准确推进":325 之后是空岛,指引却照指不误)**:`PLANETS` 每颗星带 `built` 位(眼下仅 325 true),`storyNext` 对没建成的站只许说"在路上"+给可做的事(回主世界/重返 325),不许指空门;B612 导航按钮同规则("前往"变"重返"),新站上线只翻 `built` 位,指引/按钮/toast/入场白自动跟随(`story-progress.test` + `planet-logic.test` 钉死 `built` 分布)。另 `travelTo(idx)` 目前零调用,是死路入口,动它前先问主人。
- **台词⇔天光规矩(2026-09-27 主人问"昼夜为什么不跟台词",技术挑战如实记录)**:①多世界切割——`dayNight` 只跑主世界,B612/国王星是 baked 太空光,靠演出(veil/暖灯)不靠时钟,两套光路别混用;②锁时不释放——转夜锁 22 点后主世界永夜是设计(每晚听一段),`releaseDay()` 留作出口,改前先问;③回忆层日落站配烧幕 veil(定稿"天幕烧红",`scene3-memory` 开站漫起播完即退,与 king 的 `sunsetShow` 同 z 不同时)。
- **第7场规矩(2026-09-27 情节阶段二:326+327 连夜双星,不可跳岛)**:`scene7-vanity.js`(326:登场四句+拍手蒙太奇 toast+帽子六句,拾取推 chapter=2)+`scene7-tippler.js`(327:十问答+沉默 2.2s,拾取推 chapter=3=书页五完成);入口按 chapter 顺序守(326 守≥1,327 守≥2),跳岛指路即自相矛盾(单测曾实锤抓获一次)。资产主人供:43MB 酒瓶组拆 3 只威士忌(`tippler-bottles.glb` 1.72MB)+酒鬼本人(`tippler-man.glb`)+银河天幕(`tippler-sky.glb`,DoubleSide 保底);**易拉罐版弃用**(现代罐配 1940s 寓言跳戏);流水线 `scripts/optimize/build-tippler-assets.cjs` 复跑幂等。验收 `scripts/probe/b612-327-guidance-probe.cjs`(31 项:326 全链→交接变 327→327 全链→回程)。**2026-09-28 部署上线,线上 31 项全绿**;同批修复石门/羊箱两处探针预置后,`b612-king325-guidance-probe.cjs` 线上 17 项亦全绿。
- **剧本台词补齐规矩(2026-09-27 主人问"进 B612 难道没台词")**:定稿全本 v2 有、实现漏的三段——面包树大祸句(`SCENE3.baobab` 末)/日落等待四问(`SCENE3.sunset` 中,44 次之前)/第4场开篇诘问 7 句 + 眼泪字幕 + 玫瑰初醒(玫瑰站前置,此前从"你多美啊"开场)。改词只动 `story-text.mjs`(全表双语 walk + 补齐回归断言自动覆盖),改顺序动 `scene3-memory.js doStep`。验收 `scripts/probe/b612-script-fill-probe.cjs`(9 项,老档直进回忆四站,语料库断言)。
- **B612 入场白规矩(2026-09-27 主人报"进 B612 后没有任何台词")**:回忆演出只播一次,此后 B612 是哑巴 —— `planets.js` 在 worldChanged(to b612) 处王子亲口欢迎一句(`story-text B612_RETURN`)+ 第二句配 `storyNext` 下一步(任务册同源);回忆演出期(page1 未完成)不打扰,每章每会话一次,不上锁不阻塞。验收:guide-arrow-dayphase 探针第⑤段(注 page1 后穿门→两行入场白)。
- **3D 悬浮箭头 + 台词⇔时间规矩(2026-09-27)**:一信标一箭——光柱管远看,金色下指锥(`src/scene/guide-arrow.js`,零 PointLight 铁律,fog:false)管精确落点,同立同撤;时序数学在 `src/shared/guide-arrow-logic.mjs`(单测钉死),改手感只动逻辑文件。台词说早上/黄昏/夜,天光必须对上:经 `src/scene/time-shift.js shiftDayTo(hour,ms)` 3~5 秒最短路径快切后锁定,**禁止再手写 `dayTimeSource=()=>h` 瞬跳**(天光"咔"一下变黑);时刻目标唯一源 `src/shared/dayphase-logic.mjs DAY_HOURS`(MORNING 7.5/NOON 12/SUNSET 17.6/NIGHT 22,单测钉死)。接线现状:坠机/画板→早晨,转夜→5s 滑入 22;B612/国王星是独立太空光不走 dayNight,日落用 veil 演出。验收 `scripts/probe/guide-arrow-dayphase-probe.cjs`(7 项,本地服+台词静音跑,不进 CI 门禁)。
  **⚠️ 剧情浮光指引接线全景(2026-09-28 主人报「3D 地图没有浮光箭头指引情节发展」后补齐)**:现存五段——①主世界夜(scene3-night:羊箱/石门/回门);②各星球岛内(scene6/scene7:星屑+回程石环);③**主世界章节期星门**(planets.js `updateStoryGuides`:星门现身+page1 完成+chapter<6+离门 12m 外→金色信标+箭,近了自动撤——白天没有 scene3 夜信标,逛远找不到回故事的路);④**B612 岛小王子锚点**(同函数:chapter<6+离原点 5m 外→小王子头顶信标+箭,此前落岛只有屏底按钮 3D 无锚)。③④与①的互斥靠 `page1` 旗(夜信标期不重复立);星球岛内不立(有自己的一套)。验收 `scripts/probe/b612-guide-shot.cjs`(三断言+截图,支持 BASE_URL 直测线上;**B612 岛内截图自查先行**—— prince/星球位置是截图定的,勿凭想象挪锚点)。
  **⚠️ 剧情罗盘(2026-09-30 主人报「剧情引导仍混乱」,联网取证原神定式后落地)**:原神解法=①追踪单目标→地图标记+世界黄色光柱(**≥50m 才给**,走近交近距离线索:NPC 感叹号/物件闪光);②屏幕侧**常驻任务追踪栏**(任务名+实时距离+方向);③一步一目标。落地:`ui/story-compass.js` 左中常驻条(目标名+实时距离+方向指针,10Hz,≤3m「就在眼前」),目标点单一权威在 planets.js `updateStoryGuides`(main=星门/b612=小王子/岛屿=当前章星屑 moteW),经 `ctx.ui.storyTarget`(ctx-ui.js 已登记)注册;光柱改按距离门控(主世界 15m,原神 50m 的本世界缩放)。指针角度公式:目标所需 yaw=`atan2(-dx,-dz)`,相对角取负进 CSS rotate(yaw 增大=向左)。
- **弹层规矩(2026-07-28 深化⑤,取代手工三铁律)**:新弹层只需 `ctx.overlay.register(el,{x:'#✕选择器',...})`(src/ui/overlay.js 深模块,冷核心)——✕(事件委托,重渲染不失效)+点外圈+Esc 栈(后开先关)+触摸白名单(data-overlay 标记)**全部自动**,**禁止再手写** isUiTouch id 清单/点外圈监听/Esc 监听。配置项:`canClose(reason)` 拦截('esc'/'outside'/'x'/'api',如答题中禁点外圈)、`onOpen/onClose`(副作用钩子,如聊天轮询)、`touchOnly`(非弹层只过白名单:飞舟 HUD/序章/一次性弹窗)。热模块注册后必须 `bag.custom` 里 `unregister()`。**register≠入栈:DOM 显示后必须 `api.open()` 一次**(2026-07-28 称号卡片血泪:只 display:flex 不入 Esc 栈,Esc/点外圈全哑,titlecard-probe 抓获)。Esc 优先级:overlay.js 在 main.js 最先 import,有弹层先关弹层,栈空才轮到飞舟飞行/画作放大/设置面板。居中独立三级页、不准往设置面板里塞——这条不变。验收:scripts/probe/overlay-probe.js(12 项)。
- **协议签收规矩(2026-09-23 P1-1 定)**:三份协议(用户协议/隐私保护指引/社区公约)的阅读入口是**并列三协议面板** `src/gate/agreement-swipe.js`,**不是三次整页跳转**。规矩:① 面板内三标签切换,**每份各自勾选**(三份独立签署,换标签勾选框复位);② 签收键仍是 `agreementConsented`/`privacyConsented`/`communityConsented` 三个 sessionStorage 键(**契约不变**,`guide-card.js`/`settings.js` 读者零改动),写键时机收拢在闸门这一处;③ **禁止 `location.reload()` / `parent.location.reload()`** —— 整页刷新会把已加载的 3D 世界推倒重来,是"加载到可操控角色"耗时的大头,还会丢昵称;关闭面板只关面板(iframe 复位 `about:blank`);④ 内嵌协议页带 `?embed=1`,页内自带的 consentBar / 固定返回键自动隐藏(避免两套 UI 打架)。**新增协议文档**:加进 `agreement-swipe.js` 的 `DOCS` 表 + `story-text.mjs` 的 `GLOBAL.pact` 文案 + 闸门底行链接,并确认新 html 有 `?embed=1` 分支。验收:`scripts/probe/b612-pact-probe.cjs`(24 项,含 **framenavigated 计数验证零整页导航**)。
- **AI 成本闸规矩(2026-07-28 起 vision;2026-09-23 补 quiz;⚠️ 2026-09-24 主人令已整体拆除,本节仅作历史存档,勿再照抄)**:凡**真实消耗 AI 额度**的访客可触发端点,必须加**每设备日限**,照 `lib/vision.js` 的模板:`quotaKey(req)` 取身份(优先不可猜的 vid Cookie,无档案退回 `deviceKey(req)`=sha1(UA)),按 UTC 日期分桶,超限返回 429。两条已落地:**vision 看图配文 20 次/天**、**quiz AI 阅卷 20 次/天**(quiz 特殊:**超限不拦截交卷**,降级本地细则兜底,体验不中断)。键数上限用 `capKeys(obj, max)` 防伪造身份无限增键。**现状(2026-09-24 主人令,以此为准)**:上述日限闸**已全部拆除**——tts/vision/quiz 阅卷/聊天机器人召唤的按设备日限一并移除,AI 调用不再设配额。现存成本防线只有四条:文案长度上限、缓存(同句/同照片永不重复合成)、聊天室 3 秒/条发言限流、vision 仅本人照片且每张只分析一次。**新增 AI 端点按需自选防线,勿再照抄已删除的日限闸**(详见「结构」节后端条)。
- **存档规矩(2026-07-28 深化②)**:前端 localStorage **唯一入口是 `ctx.store`**(src/state/store.js 深模块,冷核心,main.js 紧随 overlay import)——键名字符串只允许出现在 store.js 的 SCHEMA 登记册,业务代码**禁止直写 localStorage**(探针第 8 项会扫)。接口:`num/setNum`(等价 `+(getItem||0)`)、`str/setStr`、`json/setJson`(坏数据回退 def,不抛)、`flag/mark`(一次性标记)、`getSpirits/addSpirit`(灵蕴库存,内置旧档迁移:顺序时代数量键→前 n 颗;addSpirit 同步写兼容数量键)、`houseColor/setHouseColor/clearHouseColor`(动态组键)。**新增存档键先去 SCHEMA 登记**(未登记键调用即抛「未登记」);sessionStorage 会话级键不进 store。验收:scripts/probe/store-probe.js(11 项)。
- **ctx 总线规矩(2026-07-28 深化①,阶段二/三已上线)**:ctx.js 是全量登记册 + 7 个命名空间(`ctx.ui` 反馈 / `ctx.kunlun` 神话层 / `ctx.player` 玩家门禁 / `ctx.scene` 场景内核 / `ctx.media` 媒体户外 / `ctx.gallery` 挂画房屋 / `ctx.mode` 展示模式,共 148 个映射属性,2026-09-20 情节阶段一收编后核数)。**扁平写已软冻结**:映射属性扁平写仍放行但 dev 环境(localhost/?ctxdebug)告警一次;全 src 610 处已迁完、扁平写零残留。规矩:①新挂属性必须先在 ctx.js 登记册对应分组登记;②能收进深模块(overlay/store/mediarules)的不挂总线;③新代码写命名空间路径,别名是 get/set 活委托、扁平读永久等价;④命名空间已冻结,不许往别名集塞新键;⑤dev 控制台「ctx软冻结」告警=走老路,改命名空间。批量迁移用 `node scripts/gen/ctx-alias-codemod.js <目录> all --dry` 先演练。验收:scripts/probe/ctx-bus-probe.js(8 项)。
- **写路径单入口规矩(2026-08-29 Stage4,组合根 + 单向状态,详见 RFC-架构深化.md 候选①阶段四/五)**:运行时可变状态的**唯一写入口是 `gameState.set(prop, val)`**(`import {getGameState} from '<按目录层级>/core/game-state.js'`,如 `src/gallery/mode.js` 用 `'../core/game-state.js'`、`src/ctx.js` 用 `'./core/game-state.js'`),写完自身 state 后经 `bindNamespace` 的 write-through 回写 `ctx.<ns>.<prop>` 并发 `${ns}:changed:${prop}` / `${ns}:changed` 事件;**读者照旧 `ctx.<ns>.<prop>`,经 vault 零改动**。已绑定(在 `ctx.js` 命名空间创建处**早注册**,早于模块导入期):`mode` 7 个配置下发 prop(siteMode/customLinks/demoPhotos/myUploads/myUploadTokens/myLinks/myCaptions)、`player`(quizPassed/viewMode)、`kunlun`(flightLock)。**委托冻结**:已绑 prop 的命名空间 set 陷阱委托 `gameState.set`,故 legacy 直写 `ctx.mode.x=v` 仍可用但**自动收归单入口**(幂等守卫防回环,apply 直写 vault 不经陷阱防递归)。**三类刻意不绑,别手贱去绑**:①每帧高频 prop(`pl`/`jD`/`ks`/`mv`/`drM`/`dayHour`——绑了每帧刷事件+存储);②初始化期能力/函数注册(`applyMode`/`texAllowed`/`eternalHandlers`/`hangOne`…,一次性注册非运行期状态);③集合原地变异(`houseMats`/`paintGroups`/`myUploads` 的 `.push`——不触发 set 陷阱,本就不发事件)。**新系统**按 `defineSystem({layer,phase,order,deps,init,update,dispose})` 契约写在 `src/core/`,并在 `main.js` 组合根 `compositionRoot.register(...)`;层序 platform→engine→gameplay→presentation。诊断钩子:`window.__compositionRoot.list()` / `window.__gameState` / `window.__ctx`。验收:`node live-verify.cjs`(生产双路径探针:gameState.set 写回 + legacy 直写漏斗 + 烟花逐帧回归,`EXIT=0` 才算过)。
- **昆仑灵鉴文案层(2026-07-26)**:全站神话包装已上线(详见 KUNLUN_PLAN.md)。规矩:①AI 配文前缀「昆仑替你记得：」只加在 paintings.js `showAI` 显示层(幂等),**不写进库存数据**;②反馈 toast 一律走 `ctx.modeToast`,不新造组件;③答题门槛 **60 分**(原 95,2026-07-26 主人定),三档反馈=满分/≥60/<60 邀请函;**分数线单一源=lib/quiz.js `QUIZ_PASS_SCORE`**(2026-07-28 深化③):test.js 与前端(player.js 提示/quizgate)全部自动跟随——前端经 `/api/quiz/state` 与 `/api/quiz/start` 的 `passScore` 字段下发,改分数线只需同步 lib/quiz.js + ADMIN_GUIDE.md 两处;④逐题批改走 `POST /api/quiz/judge`(只回布尔、每题每会话限判一次),**正解字母永不下发浏览器——神话卷(track=shen)除外**:该卷题库独立(questions/shenhua.json),判后公开正解+解析,主人特批;⑤答题入口永不关闭,答对题数计入天穹(`kunlunQuiz`)。
- **聊天室(2026-07-26)**:lib/chat.js,全员 100 条;`@昆仑之灵` 触发 AI 回帖(复用 AI_GRADE 双通道)。规矩:消息渲染一律 textContent(防 XSS);dk 只比对不下发;清理聊天记录须改库后 pm2 restart。
- **安全基线(2026-07-28 OWASP 审计,2🔴+5🟡 已全部修复并上线)**:①SVG **已从公开上传白名单移除**(2026-07-31 起,`lib/files.js` 的 `PUBLIC_IMG_EXT` 不含 `.svg`,上传直接 400——SVG 可含脚本,直开即同源 XSS,链:`/admin-media?token=` 偷管理 token;直接禁格式比 CSP 兜底更彻底、免维护);**存量 SVG** 仍经 files.js `sec` 强制 `Content-Security-Policy: script-src 'none'` 兜底——新增响应头只许走 files.js `sec` 集中处;②admin.html 用户数据进 onclick JS 字符串**一律 `j()` 不用 esc()`**(esc 不转引号;文件名/URL 可含引号,公开上传即可种后台 XSS);③上传归属 **vid Cookie 优先**(uploads[name].aid,ownerAid();dk=sha1(UA) 仅兜底——UA 可伪造/撞车);④`linkClicks` 5000 上限(防存储 DoS);⑤vision 每设备日限 20 次(防 AI 费用被刷);⑥token 用 `timingSafeEqual`;⑦safeJoin 必须带 `path.sep` 比较;⑧JSON/静态统一 `X-Content-Type-Options: nosniff`+`Referrer-Policy`,HTML 加 `X-Frame-Options: SAMEORIGIN`。复验:scripts/probe/security-fix-probe.js(13 项;2026-08-29 起含「SVG 上传被拒 + 白名单无 .svg + 存量 SVG 仍有 CSP 兜底」三条,取代已过时的「SVG 仍可上传」)。遗留(运维):阿里云安全组应只放行 Cloudflare IP 段访问 3000/3443,后台强制走 HTTPS——主人手动在控制台配。
- **TTS 语音(2026-07-26)**:`GET /api/tts?text=…`(lib/tts.js 代理 + edge-tts,服务器 venv `/opt/tts-venv`,中文女声 `VOICE`)。规矩:浏览器**永不直连**语音服务(mixed content);前端一律 `ctx.kunlunSpeak(文案[, voice])`(audio-manager.js),失败必须静默;缓存在 lib/tts.js,勿绕过,`.tts-cache/` 可整目录清;引擎迁移(如换 Kokoro)只许动 synth(),接口形状不变。
  **⚠️ kunlunSpeak 已缓存键化(2026-09-28)**:入梦导语/氛围线/欢迎语不再直拼经典 `/api/tts` 动态合成 —— 改走与台词同一套三级路径:`warmBlob`(兼做预取+R2 在位探测)→ `ttsUrl`(blob 内存常驻 → R2 `cdn.cloudbear.cloud/tts-audio/<key>.mp3`)→ 未命中退经典通道触发合成并自动镜像。键算法与 `lib/tts.js ttsKey()` 契约一致(空 voice 两边同为空串)。验收:`b612-327-voice-probe.cjs` legacy=0。
  **⚠️ 台词声线分层(2026-09-28 主人令「语音要真朗读」)**:新角色 who 常量**必须带 `spk`**,并在 `dialog-voice.mjs` 的 `SPK_VOICES_ZH/EN` 登记声线 —— 漏了就走默认女声(虚荣人/酒鬼曾全程女声)。声线分配:prince/pilot=苏打(云希) / sheep/rose=茉莉 / king=白桦(云扬,英文 en-GB-RyanNeural) / vain=云健(YunjianNeural,英文 RogerNeural) / tippler=白桦跨场复用(英文 EricNeural)。**约束**:MiMo 预置音色仅 8 个(中文 冰糖/茉莉/苏打/白桦,英文 Mia/Chloe/Milo/Dean),男声不够分 → 新角色可用 edge-tts 原生音色名直传(lib/tts.js `MIMO_VOICES` 集合外的 voice 跳过 MiMo 直接本地合成,省必败调用;中文自定义名须在 `EDGE_VOICE_MAP` 登记映射)。**换声线=缓存键全冷**(键含 voice)→ 跑 `node scripts/dev/warm-planet-voices.mjs <BASE_URL>` 批量预热(新角色的句子中英双版入 batch,煮完自动镜像 R2)。edge-tts 可用音色用 `ssh 服务器 /opt/tts-venv/bin/edge-tts --list-voices` 查。
- **台词音频边缘缓存(2026-09-26 取证定案)**:`/api/tts?text=` 响应 Cloudflare **恒不缓存**(`cf-cache-status: DYNAMIC`,URL 无缓存扩展名)→ 每条音频跨境回源,晚高峰单流拥塞 16KB 爬 10s+,台词链被 onVoiceEnd 15s 兜底拖着走 =「无声/太快」(探针 `tts-stall-diag-probe.cjs`/`dialog-audio-truth3-probe.cjs` 实锤;源站缓存命中本身 ~2ms)。修法:台词朗读改走 **`GET /tts-audio/<key>.mp3`**(lib/tts.js `handleTtsAudio` 纯只读:命中回文件、未煮 404;`.mp3` 在 CF 默认缓存扩展名清单 → 边缘自动 HIT)。**key 算法是前后端契约**:`sha256('tts1|voice|text截断220')` 前 20 位,服务端 `ttsKey()` / 客户端 `dialog-voice.mjs ttsUrl()`(crypto.subtle)两端复算,契约测试 `lib-tts.test.js` + `dialog-voice.test.js` 钉死;**改键必须两端同步 + 升 KEY_VER**(旧缓存成孤儿,预热自动重煮)。冷台词 404 由客户端 `playFail` 自动回退经典 `/api/tts` 触发合成(落盘后下次 .mp3 命中);`handleTts`/`handleTtsBatch` 同用 ttsKey(回退合成的文件本路由能接力命中)。缓存键版本化前的 388 个旧键文件成孤儿,可整目录清 `.tts-cache/` 旧文件。
- **台词交付链终态(2026-09-26 晚,主人报「部分没声/加载慢/被截断」三连定案)**:①音频本体走 **R2 镜像** `cdn.cloudbear.cloud/tts-audio/<key>.mp3`(607→652 全量镜像零缺失,合成成功自动 r2Put;主人到主域链路慢、R2 已被模型加载证明快);**⚠️ r2Heal 镜像自愈(2026-09-28)**:r2Put 只在新合成时 fire-and-forget,静默失败后该文件永远缺席 R2(实测 'The Tippler' 导语键 404、服务端盘上有)——`handleTts`/`handleTtsBatch` 缓存命中时每键补推一次(进程内 Set 去重,失败解标记重试;单测 lib-tts.test.js 钉死);②**onVoiceEnd 语音驱动语义**(dialog-voice.mjs,取代一切固定兜底):未开播 → 30s 放行(覆盖跨境开播实测最坏 21s);已开播 → 等 `ended`,防挂死兜底=开播时按 `duration+20s` 重置;行被替换/对话已关(`cur !== audio`)→ 守卫自动失效,旧守卫永不掐新行;**禁止监听 `error` 触发 fin**——R2 冷 404 的 error 会在回退通道开播前就断链。后台实锤:固定 24s 兜底把 ok(ms=16047)同秒 cut、加载 >24s 的行 play 被掐死(fail 全部 26 条=AbortError)。③加载慢是**时段性跨境拥塞**(CF-RAY=LAX,13:05/16:16 秒开、16:02-16:05 全 16-21s,物理极限治不了根),缓解=对话框亮「(♪ 语音加载中…)」提示(`isVoiceStarted`/`onVoiceStart`)+ 语音驱动节奏(等得起,播得完整);④**blob 内存常驻**(终验再实锤:Audio load 预热在拥塞下会被浏览器节流/HTTP 缓存逐出,播放期仍 15.9s 开播,且台词小包与模型大资产共用 cdn 连接池被 h2 挤兑)——batch 回键后 `warmBlobByKey`(fetch+CORS,R2 桶 `Access-Control-Allow-Origin: *`)拉成 blob 常驻内存,`ttsUrl` blob 优先 → R2 直链 → 经典通道三级;`prefetchLine` blob 失败退 Audio load。验收:`scripts/probe/tts-story-walk-probe.cjs`(真实剧情链,逐行 startMs/truncated/audible)。
- js 文件静态托管 `Cache-Control: no-cache`;媒体分级:公开名(演示/白板/户外大屏)1 天,**门禁媒体(本人上传/特殊模式)`private, no-store`**(2026-07-27 血泪:200 被 Cloudflare 边缘缓存后对全员公开,门禁形同虚设;canServeMedia 标 `req._mediaPublic`,serveStatic 按此分级)。清边缘缓存:Dashboard→缓存→Purge Everything(R2 令牌无 purge 权限)。
- **空中永恒展厅(2026-07-27 二期①,详见 KUNLUN_PLAN.md)**:src/kunlun/eternal.js。规矩:①展厅**零 PointLight**(亮窗/光柱/光束/光晕全 MeshBasicMaterial;仅光束与光晕 fog:false,是地面唯一可见件);②高空功能只靠三个钩子,不侵入旧逻辑——paintings.js `eternalAction` 交互钩子(厅内交互经 `ctx.eternalHandlers[action]` 分发,各模块自注册)、player.js `ctx.groundOverride`(厅内地面)/`ctx.eternalKeepOut`(小地图禁区),peaks.js 海拔彩蛋用 eternalKeepOut 跳过展厅;③展厅图片只吃 `/api/files`(服务端 canServeMedia 已过滤),客户端不做二次可见性判断;④晨光画框 isPainting 复用放大但**不进 paintGroups**。
- **数据保留铁律(2026-07-27 主人定)**:玩家不能删除服务器任何数据(含本人上传的照片);「从展厅移除/放下」只做软删除(隐藏标记、文件保留、可召回),真删接口仅后台 token。后续任何"删除"类需求都按此落地。
- **灵蕴飞舟(2026-07-27 二期②,详见 KUNLUN_PLAN.md)**:src/kunlun/ark.js。规矩:①`ctx.flightLock` 是飞行期总锁——凡新增"传送/位移/海拔触发"类功能,必须先检查此锁(现有四处:player 移动/物理/小地图/回家键 + peaks 海拔彩蛋);②飞舟/航线全零 PointLight,变色走 DOM 着色罩,**不碰** 3D 天空/雾系统;③粒子一律柔光圆点纹理+环带分布(默认方点糊屏是血泪);④罗盘传送按钮只在六灵蕴集齐后渲染,功能入口判存在再调(`ctx.eternalTeleport&&...`)。
- **飞舟自由飞(2026-07-27 P2,飞机骨+飞舟皮)**:首飞(无 `localStorage.arkFlew`)登舟=电影化巡礼(不动);已首飞登舟=`startFree()` 手动自由飞。规矩:①物理全在 `freeTick`——四元数姿态/灵蕴自动油门(巡航 24m/s,空格或冲刺钮 ×1.9 耗能量)/控制权限随速度缩放(温和无失速)/撞地钳制不死(`desert.getH+3`,实心山铁律)/疆域 720m+天顶 480m 软限制;②相机是**第三人称追尾**——主循环相机同步在 ticker 之前执行,freeTick 末尾覆盖 `ctx.cam` 即生效,同时 `pl.p` 同步 FF.pos(小地图/天空/沙漠区块依赖);③`endFree(mode)` 三态:ground(化光回山巅)/land(低空低速原地降落,E 键)/dock(静默,dock() 统一落位);dock() 已通用化(`flying||FF.on` 皆可停靠);④HUD 容器 `#arkHud`(pointer-events none,子控件 auto)已注册 overlay(touchOnly,2026-07-28 深化⑤起白名单机制废止);手机左下虚拟摇杆+右下冲刺钮;⑤模型船头 +x、物理船头 +z,渲染用 `QMODEL`(rotY -π/2)对齐,改模型朝向必须同步;⑥古典装饰(云雷纹舷带/鹤首灯笼/祥云小帆)全 MeshBasicMaterial 零 PointLight;⑦tickPhysics 在 flightLock 下吞掉排队跳跃(`jumpPressed=false`),防落地弹跳;⑧探针钩子 `window.__arkFF`,验证脚本 scripts/probe/ark-free-probe.js。
- **实心山铁律(2026-07-27 主人定)**:昆仑峰顶已削成半径 14m 平台(desert.js computeHeight,海拔≈126m,14~26m 收坡);昆仑与沙海是高度场,没有"山里面"——任何物体只允许摆在地表之上。规矩:①所有新增摆放/传送落点必须经 `ctx.desert.assertAboveGround(x,y,z,tag)` 校验(埋入即 console.error+toast 拦截),禁止手写海拔,一律走 `getH/groundY`;②峰顶平台区(距 KX,KZ ≤14m)是玩家可站立走动的广场,不得再放置阻挡物;③改山形必须重跑 `scripts/probe/spirit-terrain-probe.js` 与 `flame-spot-probe.js` 验坡度。
- **乱序提前拾取(2026-07-27,设计文档)**:spirits.js 灵蕴库存改为 `kunlunSpiritsKeys`(key 数组,顺序无关),`kunlunSpirits` 仅作数量兼容旧读取;玩家可提前拾取未揭示灵蕴(3m 判定对全部未收集生效,25m 内未揭示灵蕴浮现柔光团),拾取后揭示目标=下一颗未收集。改收集逻辑必须保持 ark/finale/settings 三方的 `got()/isDone()/spiritsState` 契约不变。
- **冷启动序章(2026-07-27 建;2026-09-18 结构审计后移除)**:互动序章已被「闸门→电影→游戏」唯一链路(openfilm/entrygate)取代,src/gate/prologue.js 与 `prologueDone` 存档位已删,`?noprologue` 参数仍由开场链识别。原规矩存档:①只播一次(`kunlunPrologueDone`),URL 加 `?noprologue` 可跳过(探针/测试依赖);②法规层优先——三连读协议未签完前静候,签完才播;③全 DOM/CSS 零 3D 资产零 PointLight,TTS 走 `ctx.kunlunSpeak` 失败静默;④「我愿意」后自动 `window.startQuiz()` 拉开答题卷轴(仅未过门禁);⑤退出保障:右下角"跳过序章"+Esc,跳过后右下角留小残镜可重新抉择;⑥`#prologueOv` 已注册 overlay(touchOnly,2026-07-28 深化⑤起白名单机制废止)。
- 静态黑名单(2026-07-26;2026-07-27 增补 scripts/dist/vendor):公开静态经 server.js `staticDenied()` 拦截——点文件、`lib/`、`node_modules/`、`origin/`、`tools/`、`questions/`(题库含答案)、`scripts/`、`dist/`、pem/bat/sh/md/log、`gate_data.json`、`package*.json`、`admin.html`、根级除 `data.js`/`sw.js` 外的 js;**`src/` 与 `vendor/` 目录(可读源码)公网一律 404,仅 localhost 放行(本地开发/test-mobile 依赖,按 Host 头判定)**。新增敏感文件必须进黑名单;`/admin` 与 `/admin-media` 走独立 token 通道不受影响。
- **媒体可见性规矩(2026-07-28 深化④,单一源)**:**下载放行与墙面上墙共用一张决策表 `src/shared/mediarules.mjs`**(纯函数零依赖)——服务端 `canServeMedia` 经 Node≥22.12 的 require(ESM) 取用,客户端 mode.js(上墙/纹理)/paintings.js(配文/视频调度)经 ESM import 取用;**改可见性规则只许改这一个文件**(旧规矩"改可见性必须同步服务端 canServeMedia"已由此落地)。「归类」各侧自备(服务端按 dk/mt 指纹,客户端按 siteconfig 下发的 myUploads),「归类之后怎么办」全在决策表:`wallDecision`(演示/本人/图库/他人)、`contentAllowed`、`captionAllowed`、`serveDecision`(下载+CDN 公开标记)。验收:scripts/probe/media-rules-probe.js(8 项)+ test.js 媒体门禁段。
- **媒体文件级门禁(2026-07-26 紧急堵口;2026-07-27 增补 mt 令牌)**:上传即签发 `uploads[name].mt`(hex20),`/api/siteconfig` 下发 `myUploadTokens`,`loadTexCapped` 给本人上传的 URL(含缩略图)拼 `?mt=`——QQ/UC 浏览器图片代理改用代理 UA 请求 `<img>` 也能认出本人(否则粉框"Photo Loading");存量上传服务端启动时自动补发。`/photos/*`、`/videos/*` 经 siteconfig.js `canServeMedia()` 判定(决策表见上条);`/api/files` 无 token 时同规则过滤,带 token 全量。**场景里的"隐藏"不等于文件不可下**。
- 公开上传禁止覆盖同名文件(409);白板与后台(token)上传仍可覆盖。
- **分片上传(2026-07-28 晚高峰应急,主人定)**:Cloudflare 边缘→源站回源带宽被运营商压到 ~12-40KB/s 时,>1MB 直传撑满 100s 超时 → 524(2026-07-28 19 点实测)。方案:前端 >384KB 自动按 **256KB/片** 走 `POST /api/upload/chunk?(dir,name,seq,total)`,服务端 `.chunks/` 暂存、最后一片重组+直传同一后处理(aid/mt/compressJob/abuseCheck 全走);规则与直传一致(409 禁覆盖/413 总量与单片 400KB 上限/24h 残片自动清扫)。验收:scripts/probe/chunk-upload-probe.js(9 项,含 md5 一致性)。
- sw.js 不拦截带 `Range` 头的请求:Cache API 禁止存 206,拦截即视频全挂。
- **sw.js /admin 绕过(2026-09-25 血泪)**:sw.js 的 HTML 判定**必须包含 `mode==='navigate'`**——`/admin` 这类不带 .html 的美化路径曾被当静态资源走 SWR,后台发新版后主人首屏仍是 SW 缓存里的旧 admin.html(「报错反馈 文件不存在」久修不愈的第二层真凶);且 `/admin?token=` 整 URL 落盘=凭据持久化,故 `/^\/admin(\/|$)/` 整体绕过 SW。**后台页面永远不要进 SW 缓存**;新增美化路径页面时核对 sw.js 三段分流。升版 VER(现 v14)以清旧池。验收 `scripts/probe/sw-admin-bypass-probe.cjs`(6 项,本地临时拷 public/sw.js 到根模拟服务)。
- 畸形 URL 必须 400 而不是崩进程:`decodeURIComponent` 已包 try/catch,新增路径解析同样要接异常。
- 门禁/权限逻辑改任何一处都要跑 `node scripts/test/test.js`(含审批门/VIP/答题评分回归)。
- **版本与备份(2026-07-28 主人定;2026-08-29 修正)**:①本地已是 git 仓库(main 分支,`.gitignore` 挡 .env/origin/*.pem/*.tgz/gate_data.json/videos/tools/ffmpeg)并同步到 **GitHub 仓 `bear20252026/dream-gallery`** —— ⚠️ **该仓为 PUBLIC(公开)**,经 `gh repo view` 实测确认(此前文档误记为"私有仓",已更正)。因此**任何密钥/凭据都不得入库**:SSH 登录私钥(`gk.pem` 等)、TLS 私钥、API token、PAT 一律禁止提交;`.gitignore` 已加 `*.pem`/`*.key`/`*私钥*` 兜底。私钥一旦误提交须**立即在云平台吊销轮换**。(2026-07-28,凭据存于本机 Git Credential Manager;推送即异地备份)——**每次部署前必须 commit + push**(部署后跑 `node scripts/probe/debug-browser.js https://cloudbear.cloud/ 15` 确认无 pageerror);回滚=`git checkout <commit> -- <文件>` 后按正常流程部署。**2026-07-28 脱敏**:后台密码从 _setup_server.sh/verify-all.js/perf-probe.js/gate-media-probe.js 清除(改读环境变量 ADMIN_TOKEN/TOKEN),历史已压平重签。②云端 cron 自动备份:`/opt/backups/backup-gallery.sh`,**每天 03:17 daily**(gate_data.json+photos+music+代码文本 → `/opt/backups/daily/`,留 14 份)、**每周日 04:23 weekly**(videos → `/opt/backups/weekly/`,留 2 份;大屏另有 R2+本地原码率双备份),日志 `/var/log/gallery-backup.log`。改备份内容必须同步改 `tools/backup-gallery.sh`(本地 git 跟踪)并重新 scp 到 `/opt/backups/`。
