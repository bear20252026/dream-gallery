# 梦幻画廊 — 项目工程档案

## 2026-10-14 第六轮外部审计(两份:M-01…M-10 可维护性 + M-11…M-19 底层工程)——先核实再动手

主人令「按专家意见改」,照旧**逐条回读代码后才动**,并且按专家自己的排序开工:先证明"测试到底能不能证明失败",再动生命周期。

### 本批核实过的断言(5/5 属实,无误报)

| 断言 | 结论 | 关键证据 |
|---|---|---|
| M-12 `system.js` 加权排序不保证层级 | **属实,但今天没有真排错** | 权重式 `l*1000+p*10+order` 隐含假设 order∈(-10,10);实扫 src/ 得 \|order\|≥10 共 **9 条**(10/11/12/13/14),`core/loop.js` 还是 **-1000**。⚠️量化:把 21 条真实注册按旧权重与新字典序各排一遍 ⇒ **换位 0 条**。正因为有这张表才敢动装配最底层;它防的是"下次再加一个 order=15 就静默跨相位",不是修当前的火 |
| M-13 后台链部分失败仍报"完成" | **属实** | 失败只把 `__worldPhase` 临时写成「后台:失败:x」,`loadWorldModules` 链尾**无条件**覆盖成「后台:完成」⇒ 探针/调试界面/未来健康检查分不出"全成功"与"少了一批" |
| M-16A test-store.js 恒真断言 | **属实** | 第 54 行是 `ok(true, …)`,消息里还印着算好的 stray 大小 ⇒ 看着像在判,实际永不失败 |
| M-16B SQLite 恢复测试顺序与声明不符 | **属实,本轮最典型** | 场景 2(58-61 行)声称"删掉 JSON、只留 DB,从 DB 完整恢复",而 `fs.unlinkSync(json1)` 写在**第 64 行的场景 3 里** ⇒ 前置条件从未成立 |
| M-16C 该专项测试没进 npm test 与 CI | **属实** | 全仓只有 `scripts/probe/README.md` 提过它;`package.json` 的 test 链与 test.yml 都没有 —— 而 SQLite 正在做 R1 迁移 |

### PR1 已落地(测试可信度 + M-12 + M-13)

- **M-12**:删掉 `systemRank`(加权成一个数),改 `compareSystems(a,b)` 字典序 + `systemKey()` 调试串;唯一消费点 `composition-root.js:22` 改成 `sort(compareSystems)`。新增 `src/__tests__/system-order.test.js`(7 条):审计给的三条反例(input+order=20 不得越过 simulate、order=-1000 不得跨层、完整序列等于层→相→序且与注册先后无关)、数值/字符串层相归一、非法层相归默认档不产生 NaN 序、缺 order 当 0、同键稳定、**全序传递性**(60 个层×相组合两两判定与排出顺序一致)。
- **M-13**:链逻辑拆成纯模块 **`src/core/world-chain.mjs`**(`runChain` + `chainHealthy`),`world-loader.js` 只做接线。结论结构化:`{tag, status: ready|degraded|failed, loaded[], failed[], skipped[]}`;**「后台:完成」从此只在真的没有失败时说**,否则打「后台:降级:点名」。三条对外契约:`__worldPhase`(字符串,6 个探针还在读,**一字未改**)、`__worldStatus`(新增)、`__deferredWorldReady`(以前 resolve undefined,现在 resolve 结构化结果)。**搁置规则收成单一源**:`legacy.mjs` 新增 `isShelved()`,`activeModules()` 与加载链共用(原来是两处各写一遍 Set 判断 —— 正是 M-10 那类"同一规则两份实现")。新增 `src/__tests__/world-chain.test.js`(7 条)。
- **M-16 三件**:①test-store.js 那条恒真换成三条真断言(正式文件存在且可解析 / 内容完整 / 不留 `.tmp`),并且**由测试自己先埋一个 `.tmp` 残留** —— 不埋的话"没有残留"是空话,哪天有人改成直写正式文件也照样绿;②test-store-sqlite.js 场景 2 改成"先删档 → **断言此刻真的只剩 DB** → 再起子进程"(并写明子进程自己会把镜像 JSON 写回来,所以前置断言必须放在起进程之前);③该脚本进 `npm test`(5→**6 条,198 项**)与 CI 的 `build-and-test` **step**(纪律不变:required context 名是 job id,新增 job 会把保护打成永远 pending)。
- **每条都做了反向验证**(专家的验收原话:"人为破坏被验证条件时,相关测试确实失败"):
  · `compareSystems` 换回旧加权 ⇒ 7 条里恰好**那两条反例红**;
  · world-chain 去掉 `status='degraded'` ⇒ degraded 那条红;
  · store 改成直写正式文件(不产生也不搬走 tmp)⇒ 残留那条红(6 通过 1 失败);
  · **test-store-sqlite 去掉 unlink ⇒ 只有"前置条件成立"那条红,旧的"从 SQLite 完整恢复"照样绿** —— 这一条把"假通过"的本质演示得最清楚:断言文案没错,错的是它前面的世界状态。
  全部还原后复绿。
- 门禁:npm test 6 条脚本 198 项 / vitest **978 项**(964+14)/ eslint 0 / tsc --noEmit 0 / `npm run build` 0 且 `[entry-weight]`、`[no-importmap]`、`[core-preload] 45 条` 三条构建断言照旧 / checkJs **308 = 基线**(新增 0 条)。
- ⚠️**要记住的三条纪律**:①**"断言写对了"不等于"测到了"** —— 凡是"从 X 状态恢复"这类测试,必须先断言 X 状态此刻成立;②**否定式断言要自己造反例**(说"没有残留"就先把残留埋进去),否则它永远绿;③改**加权排序**这类最底层之前,先把"当前真实影响"量成一张表(换位几条),否则说不清这次是"修 bug"还是"改行为"。

### PR1 已上线(2026-10-14 12:48 合并 f71a0d8 / DEPLOY_OK f71a0d8)

- **发布链**:PR **#21**(head `5173adf`)由 ruleset 的 required checks 自动合并 ⇒ merge `f71a0d8`。合并前逐字核过 **CI 验的树 == 要部署的树**:`git rev-parse 5173adf^{tree}` = `f71a0d8^{tree}` = **`f47e9267aa51a72ff23210ee45fb7ea353d4753c`**;两个 required context(build-and-test 57s、smoke 1m54s)都 pass。
- **线上复验(全过)**:首页 200、`/healthz` `{"ok":true,"uptime":66}`、首页引用的 chunk 与本地 dist 同名且 200、漂移复检 **OK 198 / DRIFT 0 / MISSING 0**;`csp-stage-probe --prod` = **CSP_STAGE_OK**(三页各 1 条内联,全归 CF,我方 0 条);`boot-cost-probe` 沙箱 **670KB / 资源 55 / prefetch 45 条全带 crossorigin**;`BASE_URL=prod b612-prod-worlds` **六条断言全绿**(activeWorld=main → 小地图在场 → 进 B612 → 非主世界小地图隐藏 → storybook 入景 → 国王星 + kingStoryScene 入景),第 ④ 段仍卡在探针头写明的那条已知失效(等返回钮超时),**失败点与描述逐字对上**才判为旧红而非回归。
- **新契约在生产真的工作**(这是 M-13 唯一的正面证据,光看单测不算):`.tmp/worldstatus-probe.cjs` 走闸门进世界后读到
  `__worldStatus = {tag:"后台", status:"ready", loaded:5, failed:[], skipped:8}`、`__worldPhase = "后台:完成"`、`__deferredWorldReady` 已是 object(以前 resolve undefined)。skipped 的 8 项正是搁置的旧玩法(永恒厅/飞舟/风铃/壁炉/雪窗/重置视角/放下/终章),loaded 的 5 项是仍在演的(第6场国王/第7场虚荣/第7场酒鬼/第8-9场/回忆层)⇒ **`isShelved()` 收成单一源之后,两条链都按同一规则数得出来**。
- 顺带入库 `scripts/known_hosts`(deploy 的 SSH 主机信任锚,此前只在本机):ED25519 指纹 `SHA256:R5xJj0fcpba1a94Y9ZnZr6anApzUYXWtlqJYd7lnlww` 与**已跟踪的** `scripts/hostkey-fingerprint.txt` 逐字一致,该 IP 早就写在 deploy.sh/AGENTS.md 等多处已跟踪文件里 ⇒ 没有新增任何披露;入库后新克隆走"锁定"而不是 accept-new 的 TOFU。
- ⚠️**这一批发了四次才发出去,原因全在本机侧,结论一条没打折**(发版的机械动作是对的,失败都停在闸门里):
  · 第 1 次:vitest 两条**超时**(scene-manager-rollback 的 beforeAll hook 20s、no-secrets 的用例 60s)红 ⇒ 停第 3 步。单独重跑 **86 文件 / 978 项全绿,43.5s** ⇒ 是争用不是回归;争用来源之一就是我自己并发跑的递归 grep。日志里 `import 406s / tests 241s` 而墙钟只有 90s,就是超线程调度的形状。
  · 第 2 次:跑到第 6→7 步之间被**我的工具 10 分钟超时**杀掉(PR 已建、`--auto` 已挂)⇒ GitHub 随后自动合并,**但没部署**。教训:长流程用 `nohup … & disown` 脱离,别让工具超时咬断发布;而 wrapper 的 exit code 一律不算数(`cmd | tail` 的 $? 属于 tail)。
  · 第 3 次:`test-mobile.js` 等 `#b612Gate` 60s 超时(前两次同一条都 6/6 过)⇒ 又是本机负载,停第 3 步。
  · 第 4 次:`release.sh` 正确报「相对 GitHub 的 main 没有任何新内容 ⇒ 未构建、未开 PR、未部署」——**因为它真的没有新内容**(已合并)。照脚本自己给的口径走 `deploy.sh --yes` 补发,并在部署前手工做上面那次树哈希核对。
  · 三条可复用的规矩:①发布期间**不要并发跑别的重活**(grep/探针都算);②发布失败先看它停在哪一步 + 读自己的结论行,再决定要不要重跑;③若 PR 已被 CI 自动合并而线上没动,就**核对树哈希**后直接 deploy,不要为了"走一遍流程"再烧一次构建。

### PR2 + PR3 已落地(2026-10-14 下午,本地全绿待发)

**PR2 = 资源所有权(M-14 剩的那半 + M-15 唯一实例)**

- `src/hot.js` 给捕获路径补上**代次守卫**:`installCaptures` 先问 `isLiveBag(bag)`,不在任就**不装**;
  `bag.async` 改成"装了才卸"。理由写在那段注释里 —— 迟到回调如果照旧装补丁,对象会落进一个
  `dispose` 时已 `length = 0` 的死 `bag.objs`,再没人释放;而"不装"时这些对象由**现任世代**的捕获接管,归它释放。
- ⚠️**写基线测试时撞出一个比审计说得更重的真缺陷**:原实现把"装之前是什么"记在 `bag._prevAdd` /
  `_prevAppend` / `_prevSetInterval` / `_prevOnTick` **四个单槽**里。`bag.async()` 进出会再压一层,
  内层 install 覆盖单槽、内层 uninstall 又把单槽**置 null** ⇒ 轮到 `hotEnd()`/`dispose()` 时
  `if (bag._prevAdd)` 已经是假,**外层那层补丁永远卸不掉**:每次热更都在 `s.add`/`appendChild`/`onTick`
  上留一层壳,壳还越叠越厚。现在改成**安装栈**(`bag._captureStack`,install 压一层、uninstall 弹一层,
  `dispose` 用 `drainCaptures` 吐干净)。仍然只影响 dev/HMR。
- `src/gallery/portal.js` 原来**完全在 HMR 生命周期之外**(M-15 全站唯一真实例):顶层 `eventBus.on(...)`
  把退订函数直接丢,外加 window 监听 / head style / `ctx.onTick` 各一份。现按站内 26 个模块同一套约定
  接 `hotBegin('portal')` + `bag.custom` 登记三件捕获管不到的清理 + `hotEnd`/`accept`。
- 新增 `src/__tests__/hot-generation.test.js`(6 条,`vi.hoisted` 桩掉 `ctx.js` 才跑得动 node 环境):
  基线(本轮存活期间一直捕获、`hotEnd` 之后停)/ 迟到回调不落死 bag 且由现任接管 / 不许把现任摘走 /
  `register` 与捕获**共用同一个代次判据**(把 `REG[name]` 与 `REG[bag.name]` 两份实现合成一份)/ DOM 同规则 /
  `hotEnd` 卸干净(专门钉上面那个单槽缺陷)。

**PR3 = 持久化的结果契约(M-11 + M-17)**

- `lib/store.js`:`saveGateData()` 现在**返回结论对象**
  `{ ok, savedAt, sqliteOk, sqliteReason, jsonOk, errors[], ms, queuedMs }`,SQLite 与 JSON 镜像**各记各的**
  (`sqliteReason` 分 `ok|disabled|unavailable|error`,后两种之一;`unavailable` = 原生模块没装成,是设计内回退,
  不算失败,否则每次保存都红)。`_savedAt` 从"入队时取"改成"**任务体内取**"——排队严重时镜像里记的会比真正写盘更早,
  而加载仲裁正是按 `_savedAt` 取较新一方。另加 `saveGateDataSync()`(同步收尾,优雅关闭用)与 `lastSaveResult()`;
  `onWrite` 探针回调现在同时给 `ms`(纯写)与 `queuedMs`(排队等待)——以前只量得到后者。
- ★**这条链永不 reject**:失败一律折成 `{ok:false}` 的**已解决**结果。原因不是风格 —— 全站 **85 处**
  `saveGateData()` 是不 await 的即发即忘,Node ≥15 对未处理 rejection **直接终结进程**,所以"诚实的 reject"
  等于给每次磁盘故障配一次全站崩溃。诚实体现在**结论可读**,不体现在把异常抛给不接的人。
- `lib/aiusage.js`:①`flush()` 那句"写失败不清 dirty(台账不能静默丢账)"原本是**空的** —— try/catch 包的
  是异步入队那一下,永远捕不到;现在按结果把条数**退回 pending**。②`stop()` 改走 `saveGateDataSync()`
  并返回 `{ok, pending, error}`:关闭路径上"入队"等于赌进程还活着,而 pm2 grace 到点就 SIGKILL。
- `lib/r2outbox.js`:`writeNow()` 返回 `{ok, wrote, error}` 并留 `lastWrite` 观测位(`outboxStats().lastWrite`);
  `flush()` 不再"把落盘前排着的条数当返回值"(`{ok, wrote, pending, entries, error}`);
  `stopOutbox()` 不再把结论丢掉 ⇒ 优雅关闭第一次能区分"没抛"与"已落盘"。
- 接线的调用方(只接**用户可见的那一个** + 关闭路径,其余 80+ 处保持即发即忘,不改行为):
  `lib/files-upload.js` 的 `DELETE /api/files/...` 现在 await 结论 —— 文件已删但记录没落成时回
  `200 {ok:true, warning:…}` 并打错误日志(不假装成功,也不让客户端重试删除);`server.js` 的
  `beginShutdown` 对 AI 用量台账与 R2 台账都按结论打日志。

**反向验证(专家的验收原话:破坏被验证条件时测试确实失败)**
- `isLiveBag` 恒真 ⇒ hot-generation 恰好 **2 红**(迟到回调那条 + DOM 那条);
- `uninstallCaptures` 弹层后清栈(模拟旧单槽缺陷)⇒ **2 红**(基线那条 + "hotEnd 卸干净"那条);
- `r.ok = true`(谎报成功)⇒ test-store-sqlite **3 红**(SQLite 注入 / 镜像注入 / 同步路径三条)。
全部还原后复绿。**注**:这一轮做反向验证时我用 `git checkout -- src/hot.js lib/store.js` 收尾,把两个文件
**整套未提交的新工作抹回了 HEAD** —— `src/hot.js` 靠事先的 `.tmp` 备份救回,`lib/store.js` 凭上下文重写。
教训已入本机 memory(有未提交工作的文件不许用 checkout/restore/stash/clean 回退,改用"备份 + 对称 replace")。

**门禁(这一批的数字)**:npm test 6 条脚本 **7 / 22 / 108 / 46 / 20 / 6 = 209 项 0 失败**(test-store-sqlite 从 11 项涨到 22 项,
新增的就是四个失败注入场景:基线前置 / SQLite 影子写坏 / 镜像 ENOENT 且进程必须还活着 / 同步收尾路径);
vitest **987 项 / 87 文件**(978 + hot-generation 6 + aiusage 2 + outbox 1);eslint 0;tsc --noEmit 0;
`npm run build` 通过且三条构建断言照旧(45 prefetch / 入口不含 three / dist 无 importmap);checkJs **308 = 基线**(新增 0)。


### PR4 已落地(2026-10-14 晚,本地全绿待发)

**M-19 = `depcruise` 的入口里没有后端**(`package.json:32,34` 两条脚本 → `depcruise src server.js lib`)
- **审计原文说重了,按实测修正**:「`lib/` 的依赖方向完全没人守」不成立。`depcruise src` 实测已覆盖
  **50 个后端磁盘源码文件中的 49 个** —— 靠 `src/__tests__/` 下 33 个测试文件 require 了 `lib/*`
  (grep 全仓:`src/` 业务代码**一处都不引用**后端)。真正缺的是**入口**:覆盖面寄生在测试文件的引用关系上,
  测试一挪走闸就静默变窄;而 `server.js` 完全不在图里(没有任何模块引用它 ⇒ 传 `src` 时它连"依赖"都当不上)。
- 数字:改前 **382 模块 / 1288 边**,改后 **383 / 1309** ⇒ 净多的就是 `server.js` 本体 + 它的 21 条出边;两者都 0 违规。
- CI 不用动:test.yml:95 跑的就是 `npm run depcruise`。**没有新开 job** —— ruleset 25039505 的必需上下文按
  job id(`build-and-test`/`smoke`)匹配,新 job 会永远 pending。与 `check-backend-manifest.cjs` 各管各的
  (那边 `--no-config`,只管"清单 ⊇ 真实依赖"),没造第二道平行闸;复跑仍 ✅(可达 51 / 清单 53)。
- **反向验证**:造一对没有任何引用者的后端循环文件 `lib/__rv_a.js ↔ lib/__rv_b.js` ⇒
  旧范围 **382/1288、0 违规(绿灯)**;新范围 **385/1311、`error no-circular`、exit 1**。删回原位复绿。
  这就是这条审计项的全部价值:**测试文件没引用到的后端文件,以前根本不在判定范围内**。

**M-18 = `stream.guard()` 的还位保证从调用方收归本地**(`lib/upload/stream.js`)
- 实测双调是**常态不是边角**:一次**成功**上传 `release()` 被调 **2 次**(`ws finish` + `req close`);
  一次**越限中止** **2~3 次**(abort 内一次、`ws error` 一次、`req close` 一次);一次**客户端断连** **2 次**
  (线上 IncomingMessage 是 `aborted` 然后 `close`)。今天没炸**只因为**四个调用点传的都是 `quota.js` 里带
  `freed` 牌的 `slot.release`(`abuse.releaseUploadSlot` / `chunks.releaseInflight` 自身也幂等)
  ⇒ 与审计自陈一致:**不是现役漏洞,是保证放错了地方**。
- 改法:guard 内加 `released` 标志,**先立牌再调用**(`opts.release()` 抛了也不重试 —— 重试就可能是双扣);
  文件头"四条结束路径"那段补一句"这四条**会交汇**,不是四选一"。行为对今天四个调用点零变化。
- 测试新增 4 条断言:`src/__tests__/lib-upload-modules.test.js`。判据**必须用朴素非幂等计数器** ——
  传 `slot.release` 去断言"只还一次"等于什么都没测(它被调 3 次也只减 1 次位)。
- **反向验证**:摘掉 flag ⇒ **3 红**,全部是 `expected 2 to be 1`(成功路 / 越限路 / 断连路各多还一次);
  用 `.bak` + 对称还原(md5 比对一致)后 31 项复绿。
  ⚠️ 断连那条**第一版是假绿**的:手工 `Readable` 只 fire `close` 不 fire `aborted`,所以只走一条路,
  摘掉 flag 也照样通过 ⇒ 改成按线上形态补一次 `req.emit('aborted')` 才真正测到双路。
  这一处要是没做反向验证就会带进仓库当"已覆盖"。

**门禁(PR4 之后)**:npm test 6 条脚本 **7 / 22 / 108 / 46 / 20 / 6 = 209 项 0 失败**(未涨,新断言都在 vitest 侧);
vitest **991 项 / 87 文件**(987 + M-18 那 4 条);eslint 0;tsc --noEmit 0;`npm run build` 通过且三条构建断言照旧
(45 prefetch / 入口不含 three / dist 无 importmap);checkJs **308 = 基线**(新增 0);
`npm run depcruise` + `check-backend-manifest.cjs` 双绿。
⚠️ prettier 对 `lib/upload/stream.js` / `package.json` 报 warn **不是本轮引入**:`git show HEAD` 版同样报
(stream.js 后端一贯紧凑单行 `try{…}catch(e){}`,且 lint-staged 对 `lib/**/*.js` 只 eslint --fix 不 prettier;
CI 无任何 prettier 步骤),package.json 那 90 个 CR 是本地签出的 CRLF、我动的只有 2 行 ⇒ 不顺手重排这两个文件。

### 稳定性包 A 已落地(2026-10-14 深夜,M-01 + M-05,本地全绿待发)

**本批核实(M-05 三条全部属实,而且比原文更硬;M-01 三条字面属实但定性要改)**

| 断言 | 结论 | 关键证据 |
|---|---|---|
| M-05 `enter()`/`enterWithoutPush()` 两套重复实现 | **属实** | 62 行 vs 45 行,commit/runWarp/rollback 骨架近乎逐行相同,真差异只有 4 处:压栈与否、来源相机缓存、恢复哪份快照、回滚带不带 `options` |
| M-05 后者缺 finally ⇒ 切换锁死 | **属实,且可达** | 旧 `enter` 把 `runWarp` 整段包在 try/catch(231-266),旧 `enterWithoutPush` 只有 `await runWarp(...)`(349),而 `warpOpts(id)`(363)与 `this.capture()`(329)都落在保护之外 ⇒ 过场/标签/快照任一抛错,`transitioning` 永不复位。量化:`transitioning` 被 **7 个导航入口**当闸门读(portal:54 / earth-day:379 / late-planets:572 / nav-buttons:40 / star-map:266 / voyage:65 / world-travel:13);更糟的是 4 处星球回程传送(scene6-king:226、scene7-tippler:261、scene7-vanity:137、late-planets:544)写成 `Promise.resolve(wm.back()).then(ok=>…).catch(()=>{})` ⇒ 抛错进 reject 分支被**静默吞掉**,而此时门已 disarm、信标已删 ⇒ 玩家被困外星、零信号;`back()/toMain()` 里 `if (!ok) 还原栈` 这条既有防线在该路径上根本执行不到 |
| (审计没说)**回滚可能滚两次** | **属实** | 旧 `enter` 的 commitError 分支把 `await this.rollbackEnter(...)` 写在 try **内**(243),它自己抛错会被外层 catch(254)接住 ⇒ **再滚一次、第二次 pop**,把无关的合法历史 `[main, b]` 也掏空 |
| M-01 `initialized=true` 写在循环前 / 一个系统 init 抛错仍装后面的 / 之后注册只告警 | **字面属实,但三条都是有意的既有设计**(注释在案) | ①是重入防护:把它挪到循环之后,单测里"系统在自己的 init 里再调 init"直接 RangeError。②是刻意的容错:一个玩法模块炸了不该把整个世界带走。真缺口是**外面读不到**:`main.js:286` 把 `init()` 返回值丢掉、失败只落 console.warn,且 `initialized` 一次置真后二次 init 一律被拒,连"上次砸了哪几个"都无处可查 ⇒ 与 PR1 的 **M-13 同一类**(告警代替结构化结论),故沿用同一套结论形状,**不改装配语义** |
| (审计没说的连带后果) | **记录,本批不改** | init 失败的系统仍在 `systems` 里,`update(dt)` 每帧照调 ⇒ 半装配态持续跑 + 每帧一条告警。要跳过 failed 系统属于新的生命周期语义(= M-06 显式生命周期试点),本批只把它做成**可见**(点名进 `failed`) |

⚠️**编号对账**:`AGENTS.md` 里"加权排序"一直是 **M-12**,而 PR1 的 commit 标题把它写成了「(M-01)」—— 以本文件为准:**M-01 = 组合根**。不改写已发布的历史,记在这里免得后人以为 M-01 已在那一批做完。

**落地**

- **M-05**:`src/core/scene-manager.js` 新增单一核心 `transition(id, {back, snapshot, options})`,`enter()` / `enterWithoutPush()` 退成两个薄适配(对外名称、签名、`ctx.scene.enterWorld/leaveWorld/toMainWorld` 契约一字未动)。三条纪律:**finally 复位 transitioning** / **失败一律按 false 返回、不外抛**(调用方那套 `if (!ok)` 才接得到信号) / **回滚只一次**(`dropStackEntry: pushedSource`,capture 就炸 ⇒ 不 pop)。三条既有日志前缀逐字保留(push 路 `world enter failed:`、`world enter failed(过场):`,back 路 `世界切换提交失败:`),只有 back 路过场炸是新的一条 `世界切换过场失败:`。统一时把 back 路的 `rollbackEnter` 也开始透传 `options`(旧 enter 那半没传,leave 拿到的上下文与正常切换不一致)—— 现状生产世界都没注册 enter/leave 钩子(planets.js:108/319 只给 scene/ground/meta)⇒ 线上打不着,记在此处以便行为变更有据可查。
- **M-01**:`src/core/composition-root.js` 的 `init()` 返回并记录 `{status:'ready'|'degraded'|'failed', loaded[], failed:[{name,message}], skipped[]}`,新增 `initStatus()` 读出口(`window.__compositionRoot.initStatus()` 现成可达,不开新全局、不动 boot 接线);init 之后注册的名字进 `skipped` 并把 status 拉到 `degraded`;出去的是**冻结副本**;`dispose()` 令结论作废(→ null)。`initialized = true` 仍在循环前,并由新单测把"为什么"钉成契约。
- **新增测试**:`src/__tests__/scene-manager-transition.test.js`(6 条:进入路过场炸 / 回程路过场炸(逐字复刻 scene6-king 的 `Promise.resolve(…).then(ok…)` 形态,断言拿到的是 `false` 而不是 `rejected:…`)/ 回滚自身炸只 pop 一次 / 回程成功仍按条目快照恢复且不写来源相机缓存 / 过场未落期间闸门不误清 / capture 炸不 pop 别人历史)+ `src/__tests__/composition-root-assembly.test.js`(8 条:点名与确定性顺序 / 一个炸其余照装 + degraded / 全炸 = failed / 空根 = ready 而非 failed / 迟到注册进 skipped 且每帧仍 update / dispose 作废可重装 / **重入防护** / 副本不可污染)。合并前那份 `scene-manager-rollback.test.js` 8 条**未改一行**,正好当"两份合一没改行为"的回归网。
- **反向验证 9 条**(`.tmp/rv-packA.mjs`:改坏 → 跑 → 还原 → md5 复核):
  R1 不点名失败系统 ⇒ 2 红 · R2 抛错就 break ⇒ 2 红 · R3 迟到注册不进账 ⇒ 2 红 · R4 `initialized` 移到循环之后 ⇒ **恰好 1 红**(只有重入那条,RangeError)· R5 交内部对象而非副本 ⇒ 1 红 ·
  R6 摘掉 finally ⇒ 4 红 · R7 回滚再滚第二次 ⇒ 1 红 · R8 回程路也缓存相机 ⇒ 1 红 · R9 `dropStackEntry` 硬写 true ⇒ 2 红。全部还原后复绿。
  ⚠️其中两条是**我自己的预期算错**,按事实改档而不是改测试:R4 第一版替换实际把 `initialized = true` **整个删掉**了(4 红),那不是审计说的写法;R9 预期 1 红、实际 2 红(back 那条也会因多 pop 而栈错位)。
- 门禁:npm test 6 条脚本 **7/22/108/46/20/6 = 209 项 0 失败**(exit 0);vitest **1005 项 / 89 文件**(991+14);eslint 0;tsc --noEmit 0;`npm run build` 0 且三条构建断言照旧(45 prefetch / 入口不含 three / dist 无 importmap);`npm run depcruise` 0 违规(385 modules / 1314 deps,+2 个测试文件);checkJs **308 = 基线**(中途一度 313:解构参数 `options = {}` 被推成 `{}` ⇒ 5 条 TS2339,补 JSDoc 参数类型后回到基线,**没有动基线数字**)。
- ⚠️**要记住的三条**:①**"补了 catch"不等于"补了 finally"** —— 查这类锁死要按「从置真到复位之间有几条出口」数,旧 `enterWithoutPush` 的 commit 是有错误处理的(10-09 治理过),漏的正是过场自身那一路;②**合并两份实现时每条差异都要判定"是缺陷还是契约"**,判据是"谁消费它"(`world.camera` 只有 planets.js:140 读 ⇒ 保留差异;leave 钩子的 `options` 上下文 ⇒ 统一);③**新增 checkJs 错误不要靠抬基线过关**,一行 JSDoc 参数类型就能回到基线。
- ⚠️prettier 这次与 PR4 相反:`composition-root.js` 改完 `--check` 报 warn,而 **HEAD 版是干净的** ⇒ 是我引入的排版偏差,不是历史遗留,已 `prettier --write` 修回(该文件本地签出是 CRLF,prettier 写回 LF,`core.autocrlf` 让 `git diff` 仍只显示我动的 46 行)。反向验证 9 条在排版之后**整批重跑一遍**,仍然 9/9 且还原 md5 逐字节一致 ⇒ 表上的数字对应最终这棵树。

### 稳定性包 B 已落地(2026-10-14 深夜,M-02 + M-03 + M-04,本地全绿待发)

**本批核实(三条断言都回读过代码;两条的定性要改,一条比原文更硬)**

| 断言 | 结论 | 关键证据 |
|---|---|---|
| M-04 存档码导入吞失败、撤销不可靠 | **属实,但机制不是"会抛异常"** | `store-api.js` 的 `mark/unmark/setNum/setStr/setJson` 一律**返回布尔**(`rawSet/rawRemove`),旧 `applySave` 把返回值整个丢掉 ⇒ 落盘失败静悄悄、UI 照样 `location.reload()`。真不可逆的是**备份那一步没人检查**:`setJson('saveBackup', snap)` 失败后仍然覆盖进度 ⇒ 玩家点「撤销」时无据可依。⚠️顺带纠正一个我的初判:`delete obj.missing` 返回 **true**,"撤销一个不存在的键"不会被误记成失败 |
| M-02 write-through 先通知后写回 / 抛错被吞 | **字面属实,现役打不着 ⇒ 定性=潜在债** | `gameState.subscribe` 在生产里**零消费者**;10 个绑定 prop 的 `apply` 全是纯赋值,不会抛。值得修的是另一条:**同值早返回把写回粘死** —— 一次失败后再 `set(key, 同一个值)` 永远不补写,ctx 与 gameState 长期不一致 |
| M-03 剧情链裸 `setTimeout`,离场后台词弹到新场景 | **属实,但要说清是"谁关的对话框"** | `gameshell-dialog.js` 的 `cancelWorld` 走 `closeDialog(suppressDone)` **跳过 onDone** ⇒ 链子只剩心跳守护,而心跳判的是 `dialogOpen() === false`:「这句说完了」和「玩家走人了」在那个布尔上**同形** ⇒ 下一句在新场景弹出。全仓 9 份 `speakSeq`,3 份已带 `ticket = visit`(scene3-night:241 / scene3-memory:307 / scene6-king:47),5 份没有(earth-day / late-planets / scene2-draw / scene7-tippler / scene7-vanity),`ending-journey.js` 只有 `speakGen`、**全文件零 world 判定** |
| (审计没给的边界) | **遵守** | 对话系统已有统一票据 ⇒ 本包一行没动 `gameshell-dialog.js` |

**落地**

- **M-04**:`src/shared/chapter-map-logic.mjs` 把"顺序"做成可测的纯函数 —— `applySave`(:176)回报 `{ok, failed[]}`,判据严格 `=== false`(写 `!ok` 会把 `setNum(k, 0)` / `setStr(k, '')` 误判成失败);`importSave`(:203)**先落快照再覆盖**,快照落不下去就 `noBackup` 一个字段都不动;`restoreSave`(:215)撤到一半**不清快照**(那是唯一的重试依据)。`src/ui/chapter-map.js` 按 `noBackup / partial / reload` 三分支收口,前两支**不刷新**、按钮 disarm、文案点名几条没落盘。
- **M-02**:`src/core/game-state.js` 改成**先 write-through、后 notify**(订阅者回头读 ctx 已是新值);写回失败进 `pendingWrite`,`set(key, 同值)` 的早返回分支(:50)**补写欠账但不重复通知**。早返回本体一个字不拆 —— 它是 `state-system` 镜像回写的防回环闸,拆了就无限递归,新增单测把这条契约钉住。
- **M-03**:新增纯模块 `src/shared/story-ticket.mjs`(`later / wait / cancel / bump / here / onTeardown / leaks`)。票据化三章:`scene7-vanity.js:30`、`scene7-tippler.js:153`、`ending-journey.js:233` —— 所有 `setTimeout` 改 `story.later`、`clearTimeout` 改 `story.cancel`、裸 `await wait(ms)` 改 `if (!(await story.wait(ms))) return`,离场(`prevWorld` 判定)与 `dispose()` 各 `bump()` 一次。**另三处单世界短链只补守卫、不上票据**(earth-day:60 `inDesert()` / late-planets:53 `speakSeq(…, home)` / scene2-draw:390):它们没有跨场 await、没有需要复位的幕布,加票据只是多一套要维护的账 —— 写在这里免得下一个人当漏改。
- **ending-journey 的收尾是本批唯一"枚举完才看得见"的一块**:`tick` 的 switch 只接 `idle / well / farewell-wait`(switch 的三个 case),而 `wait / wake / busy / muzzle / farewell` 五个全是"有链子在飞或行动提示挂着"的瞬态;离场时 `tick` 还会 `hideAction()` 把提示收走 ⇒ 被打断又不交回 `idle`,玩家回沙漠就**永久站着不动**(比原缺陷更死)。第一版我只写了 `busy / farewell` 两条,是靠把全文件 15 处 `mode =` 逐条对回 switch 才发现的(:134 那行注释里的取值表本身就是过时的 —— 既没写 `busy` 也没写 `wait`,读注释会漏)。铃铛(`ending-audio.js:124` `bellsOn` 内部自递归 `setTimeout`)票据够不到,只能在 teardown 里显式 `bellsOff()`。

**新增测试**:story-ticket.test.js(10 条,新文件)、chapter-map-logic.test.js(11 → **19**)、game-state.test.js(7 → **12**,原 7 条一字未改全过 ⇒ 没动既有契约)。

**反向验证 16 条**(`.tmp/rv-packB-m03.mjs` / `.tmp/rv-packB-m03-probe.mjs` / 包内 m04、m02 各一份;改坏 → 跑 → 还原 → md5 逐字节复核):

- M-04 5 条、M-02 5 条 —— 全部按预期变红。
- 票据 8 条:S2 摘在场闸 2 红 · S3 bump 不判挂起 await 1 红 · S4 bump 不清账 1 红 · S5 不跑 teardown 1 红 · S6 cancel 不清 timer 1 红 · S7 `here()` 恒真 1 红 · S8 不登记计时器 1 红 · **S1 信息项(允许全绿)**:只摘"轮次闸"单测抓不到,因为 `bump()` 已把计时器全 `clearTimeout` —— 轮次闸是给"以后有人加了不记账的计时器"上的第二道保险,如实记成"单测够不到",不写成已覆盖。
- 接线 3 条(驱动真浏览器):P1 整条链退回老写法 ⇒ **主判据变红**,漏出来的正是审计那句话的现场:`That is a queer hat you are wearing.` 弹在 b612;P2 只撤 `bump()`、P3 只把心跳换回裸 `setTimeout` ⇒ 均**全绿**(信息项):症状需要"裸心跳 + 无入口守卫"这对同时缺席,单留一半就被另一半挡住。⇒ 探针钉的是**这一对**,不是某个单点。

**新增探针**:`scripts/probe/b612-chain-leak-probe.cjs`(7 条断言,自起 :3281,chapter=1 预置直测 326)。链路:清场对话(开局有等玩家回应的带选项对话 ⇒ lock 队列会把后面每一环堵死,石门按钮也不亮)→ 圈外重新武装再走进门半径(`planet-logic.gateStep` 触发即解除,直接把人摆到门上传不动)→ 进 326 → **等「仰慕者」那句真的在屏幕上** → `ctx.scene.leaveWorld()` → 16s 采样窗判"没有 326 的台词弹到 b612 + stage 仍停在 chainA" → 重回 326 判"台本从头再讲"(bump 不许把这一章钉死)。指纹用 `story-text.mjs` 的双语子串,不用"有没有对话框"(B612 自己会说话,必误报)。

- 门禁:npm test 6 条脚本 **7/22/108/46/20/6 = 209 项 0 失败**(exit 0,未涨);vitest **1028 项 / 90 文件**(1005 + 10 票据 + 8 存档码 + 5 写回);eslint 0;tsc --noEmit 0;`npm run build` 0 且三条构建断言照旧(45 prefetch / 入口不含 three / dist 无 importmap),main chunk 269,574 B(< 512 KB 闸);`npm run depcruise` 0 违规(**387 modules / 1319 deps**,较包 A +2/+5);checkJs **308 = 基线**(新增 0)。
- ⚠️**要记住的四条**:①改字符串状态机之前**先把所有 `mode =` 列一遍**,再逐个问"switch 接不接得住"—— 这轮的死锁风险(`wait/wake/busy/muzzle/farewell`)不在审计的清单里,是数出来的;②"两道闸互相冗余"要如实写成信息项,**不要**为了凑红数去编一条抓不到的用例,也**不要**因为单测抓不到就把闸拆掉;③探针的前置条件读 **DOM**,别读 200ms 采样器 —— 第一版就是这么假报了一次「台词没上屏」;④`story.later(fn, ms)` 刻意与 `setTimeout` 同签名,回退成裸写法只需换函数名,这条设计让 P1/P3 那类反向验证能一行改坏。
- ⚠️**本批未做、已记档**:①`ending-epilogue.js` 仍吃 `ending-journey.js:226` 注入的那个裸 `wait` —— :161-194 一共 11 处 await(9 处 `stageCaption` + 2 处 `CTL.wait`),尾声自有一套字幕排期,动它属于另一包;②`applySave` 对 `json` 字段仍是 `v != null` 才写 ⇒ 存档码里为 `null` 的字段**不会清掉本地值**(导入一份旧码,`portfolio`/`journeyMemories` 可能残留)—— 属语义变更,留给结构包一起判;③`chapter-map.js` 那三个 UI 分支在 node 环境下不可单测,只能通过 `importSave`/`restoreSave` 的返回值间接钉住。

### 结构包 C 已落地(2026-10-15,M-06 + M-07 + M-08 + M-09 + M-10 + 山丘产物溯源,本地全绿待发)

**本批核实(六个条目拆成七行断言,逐行回读过代码;三行的数量或定性与审计原文不同)**

| 断言 | 结论 | 关键证据 |
|---|---|---|
| M-06 系统生命周期没有显式状态 | **属实,而且正是包 A 写下"记录,本批不改"的那一条** | 包 A 只做成了**可见**:`init` 失败的系统仍在 `systems` 里、`update(dt)` 每帧照调 ⇒ 半装配态一边跑一边刷告警。这批就是那条语义:`uninit / ready / failed` 三态 + update 只调 ready + dispose 只拆 ready/failed |
| M-07 光柱信标重复(审计点名 5 份) | **实测 7 份** | 5 份 `makeBeacon`(scene6-king:115 / scene7-vanity:65 / scene7-tippler:188 / scene3-night:50 / late-planets:84)**之外**还有 `earth-day.js:300` 内联一根(顶口手写 0.24)与 `story-guides.js:19 makeGuideBeacon`。七份几何与材质**逐字相同**(`CylinderGeometry(r*0.55, r, h, 10, 1, true)` + `MeshBasicMaterial 0xffd9a0` + DoubleSide + `depthWrite:false` + `fog:false`),差别只有"底面 y 从哪来"和"挂哪个场景" |
| M-07「stardust 三份 tryPickup/tryDoorTeleport 该合并」 | **不合并,是决定不是漏做** | 三份逐行 diff 过:除场景名与日志前缀外**行为一致**,合并要每章注入 4~5 个回调 ⇒ 收益为负。**真病是数在漂**:四章各写死字面量 `9`(=3²),而 `planet-logic.mjs` 里早就备好的 `PICK_RADIUS` **一处都没被引用**,`DOOR_RADIUS` 还写着 2.5(与现实 3m 不符) |
| M-08 类型渐进 | **病不在"缺类型",在"声明与唯一写入方互相矛盾"** | 最大簇 `scene/media/video-wall.js` 26 条:24 条是 `playVideo` 借 `<video>` 元素本身记账的四个句柄,2 条来自 `types/ctx.d.ts` 的假声明。三条假声明各有出处(mA / houseMats / worldManager),其中 `mA: Material[]` 是从 `src/ctx.js` 那行「houseMats/mA 房屋材质分组」**抄错**来的,而 checkJs 自己就在 audio-manager.js:187 报 TS2740 打这条声明的脸 |
| M-09 `tt()` 带全局注册副作用 | **属实,且数据层有 8 组真歧义** | `_shown` 以**显示文本**为主键、后写覆盖前写(`story-text.mjs`,唯一消费方 `gameshell-dialog.js:37~40`)。普查走真实导出:**497 条双语、0 条半截、唯一 en/zh 各 433、64 条良性重复、8 组撞键**(同 en 不同 zh 4 + 同 zh 不同 en 4) |
| M-10 legacy 过滤用中文标签 | **属实** | `LEGACY_MODULE_LABELS` 让标签同时是**显示文字和身份键**:把「远方山巅」改一个字,那条搁置规则静默失效、模块重新开始加载(旧玩法回魂),而**全仓没有一条测试会红** |
| 山丘产物无溯源 | **属实,但 git 里一直有,只是没跟着产物走** | `public/hill` 的最后一个提交 == `hill-src` 的最后一个提交 == `29822c073d7171373bbfc754c43598539fc0ebde`(2026-10-14 03:07:34 +0800),而 14 个产物文件里没有任何版本戳(主站有 `shared/build-info.mjs` + `__B612_BUILD__`,山丘没有) |

**落地**

- **M-06**:`src/core/composition-root.js` 用 `lifecycle` Map 给每个系统记 `'uninit' | 'ready' | 'failed'`(`stateOf()` 读),`update()` 只调 ready,`dispose()` 只拆 ready/failed —— **failed 要拆**(init 到一半建出的资源,清理比不清理好)、**uninit 不拆**(它的 dispose 是按"init 已完成"写的,没 init 就拆可能造出新异常);`initStatus()` 结论加 `states[]`(冻结副本),新增 `lifecycleOf(name)` 单点读数。动手前提先量过:**生产里没有任何系统在 init 之后注册**(main.js 的顺序是先 `loadWorldModules` → register 全部 19 → init),所以"跳过 uninit"实际只改探针/HMR/误用三条路径 —— 这条前提写在测试文件头,免得下一个人以为是行为大改。
- **M-07**:新增 `src/shared/beacon-manager.js`(`createBeacon` / `arm`「一格 named slot 只立一根」/ `removeBeacon` / `pulseBeacon`),7 处建柱点改为 import ⇒ 那条**零 PointLight 铁律**(光柱一律自发光、不进光照预算,由 `core/light-budget.js` 兜底扫)从此只写在一个地方 —— 它的代价不是行数,是"谁在某一份里顺手加个 PointLight,灯光预算就在那颗星上被悄悄吃掉,而且没有测试会红"。`story-guides.js` 的呼吸是 `0.75+sin(t*1.7)*0.25`(远距门指引,节奏本就与拾取信标的 `0.8+sin(t*1.9)*0.25` 不同)⇒ **只并几何与拆除,不并 pulse**,决定写在文件头。边界:模块不知道世界名、星屑坐标、探针用的信标名,那些留在各章(是剧情)。
- **半径单一源**:`src/shared/planet-logic.mjs` `PICK_RADIUS = 3` / `DOOR_RADIUS = 3`(2.5 那个值从没和现实对上),四章(scene6-king / scene7-vanity / scene7-tippler / late-planets)全部 import;`325 星屑因为 3m 圈离出生点太近被整体挪过位`,所以这两个数是剧情调过的,测试注释里钉明"别顺手改大改小"。
- **M-08**:四处**纯声明**改动,运行时一行未动 —— ① `video-wall.js` 给 `playVideo` 加 `TaggedVideo = HTMLVideoElement & {_vGen?, _vEndedFn?, _vCanPlayFn?, _vPollId?}` typedef(句柄挂在元素上是有意的:下一次调用要靠它们摘掉上一轮还挂在同一个元素上的监听器),消 24 条;② `types/ctx.d.ts` `mA: Material[]` → `HTMLAudioElement`(唯一写入方 `audio-manager.js:96 let mA = new Audio()` / `:187 ctx.media.mA = mA`,读者 audio-manager:174~197 / video-wall:282 / upload:229),消 3 条;③ `houseMats: Material[]` → `Record<string, MeshStandardMaterial[]>`(写入方 `scene.js:913` 给的是 `{wall,base,deco,ceil}` 对象、`housecolor.js:55/121/125` 按组名索引,选 Record 就是因为键是字符串),消 5 条;④ `worldManager?: unknown` → `SceneManager`,用 `import type` 指向 `src/core/scene-manager.js:55` **真实导出的类**而不是另手写一份 interface,消 16 条(getWorld 9 / back 4 / transitioning 2 / enter 1,而那些方法本来就在类上)。`src/ctx.js` 登记册两行改正(mA 归媒体、houseMats 归挂画)并保留事故记录。⇒ checkJs **258 = 新基线**(见下)。**明确不做整仓 .js→.ts**;`ctx.d.ts` 里其它 `: unknown` 成员(`planeApi/foxApi/scrollLink/audioManager/loopManager`)**一个字没动** —— 它们的唯一权威是各模块里的对象字面量,没有现成类型可指,手写一份形状等于给消费方一个假保证(`mA: Material[]` 就是这条路的下场),理由写在那份 d.ts 里。
- **M-09**:只做"看得见"的三件事 —— ①登记已知 8 组(连两处出处),②拦住新增(新撞键即红,**修好一组不会变红**),③用合成用例钉住"后写覆盖"这个机制本身(不依赖具体译文,改译文不误红)。**没有擅自改写任何译本文案**:8 组里有 5 组看着"该统一"(书页八标题、狐狸标题、地理学家大小写…),但统一成哪个是主人的文学决定。真修法只有一个:行 ID 化,让 `_shown` 的键从译文文本换成 ID —— 全仓 `tt(` **336 处 / 46 个文件**,是独立一批。
- **M-10**:`legacy.mjs` 的 `LEGACY_MODULE_LABELS` → `LEGACY_MODULE_IDS`(12 条,ASCII、与所加载文件同名)+ `isShelved(entry)` 成为**唯一判定**;`world-chain.mjs` / `world-loader.js` 只接线,不在别处再写第二遍判定。`label` 退回纯显示文字与 `__worldPhase` 读数(6 个探针在读,措辞是对外契约,由测试钉住)。
- **山丘产物溯源**:`scripts/hill-artifacts.cjs`(`record` / `check`)+ 生成物 `scripts/hill-artifacts.json` —— 14 个产物的 sha256 与字节数、`built.command = 'cd hill-src && pnpm build'`、`ciRebuilds: false`、`artifactCommit == hillSrcCommit == 29822c073d71…`、`worktreeClean: true`。清单**住在 `public/hill` 之外**,因为 `hill-src/vite.config.ts` 是 `outDir: '../public/hill', emptyOutDir: true`,放进产物目录会被下一次构建删掉。
  - ⚠️**这条闸门第一版在 CI 上红、本地绿,而 CI 是对的**:摘要原本按**本机检出的字节**算,Windows 把多行文本检出成 CRLF(Linux 是 LF)⇒ 三个 `fonts/*-OFL.txt` 加 `index.html` 被打成"内容变了但清单没更新";压缩过的单行产物没有换行所以不受影响 —— 正因为只红四处、且红的是 license 文本,它看起来更像"CI 上的产物被谁改过"。现文本类先 `\r\n → \n` 归一再算摘要(woff2/png 等二进制不参与),清单重新 record(只有那 4 条 bytes/sha 变,其余 10 条一字未动)。
  - 不变量做成**与平台无关的可测命题**(第 6 条测试):借 `HILL_ARTIFACTS_DIR` / `HILL_ARTIFACTS_MANIFEST` 在临时目录造一份 CRLF 检出的产物集 `record`,再把同一份内容换成 LF 检出 `check` ⇒ 必须 `✓`;反向随手一条:真加一字节必须红(否则"归一"就是放宽)。摘掉归一 ⇒ **2 红**(这条 + 真目录那条),还原后 6 绿。这条在两台形状上都会红,不会再靠某一台机器的行尾风格蒙过去。

**新增测试**(7 个文件 / **58 项**):composition-root-lifecycle(7)、world-loader-shelving(12)、beacon-manager(16)、planet-radius-single-source(4)、types-ctx-writer-agreement(7)、story-text-collision(6)、hill-artifacts-provenance(**6**,含 CI 抓到的行尾那条)。vitest 90 文件 1028 项 → **97 文件 / 1086 项**。

**反向验证 36 条**(每条都是"改坏 → 跑 → 还原 → md5 逐字节复核"):

- **M-06 / M-10 共 7 条**(`.tmp/rv-m06-m10.sh`):L1 摘掉 update 的 ready 闸 ⇒ 2 红 · L2 dispose 连 uninit 一起拆 ⇒ 1 红 · L3 init 抛错也标 ready ⇒ 3 红 · S1 搁置判定退回按 `entry.label` ⇒ 红的正是「改标签不改加载行为」(审计那条病的现场)· S2 搁置集合塞一个不存在的 id ⇒ 2 红 · S3 只改中文标签 ⇒ 2 红(「显示文字一字未改」+「标签序列整体保持」,而**加载行为那条照绿** ⇒ 身份与显示确实分开了)· S4 只改 id ⇒ 4 红。⚠️这一组是**记录前补做的**:M-06/M-10 落得早、只留下测试没留下脚本,所以重新打了一遍断点才敢写数,不写"应该红过"。
- **M-07 7 条**(`.tmp/rv-m07.sh`):①光柱挂上 PointLight ②材质改成 MeshStandard ③`arm` 幂等去掉 ④漏 dispose 几何 ⑤不从 `mesh.parent` 摘 ⑥`lift` 不进高度 ⑦**第八份内联光柱**(临时往 `src/kunlun/` 塞一个 `makeBeacon9`)。**半径 4 条**(`.tmp/rv-radius.sh`):①回程门退回字面量 9 ②拾取退回 `near(..., 9)` ③`DOOR_RADIUS` 改回 2.5 ④某章不再 import 常量。
- **M-08 7 条**(`.tmp/rv-m08.sh`):①②③把三条假声明逐条改回去 ④`@param` 退回裸 `HTMLVideoElement` ⑤别处再挂一份 `_vCanPlayFn` 记账 ⑥`src/ctx.js` 登记册退回「houseMats/mA 房屋材质分组」那一行 ⑦**四条一起改回 ⇒ checkJs 精确回到 306** —— 这一条是"−48 是归因、不是靠放宽"的唯一硬证据。
- **M-09 5 条**(`.tmp/rv-m09.sh` + `.tmp/rv-m09-breaks.cjs` b1~b5):新增 zh 撞键 / 新增 en 撞键 / 造一条半截双语条目 / 把反查改成首写覆盖 / 在别处再建一张 `_shown`。
- **山丘 6 条**(`.tmp/rv-hill.sh`):①偷偷改一个产物字节 ②往产物目录塞未登记文件 ③清单谎称 CI 会重建 ④`emptyOutDir` 被关掉(⇒ 断言"清单必须住在产物目录之外"失去依据)⑤`hill-src` 多一处 `room.start()` 调用 ⑥`index.html` 引一个不在清单里的 chunk。

**真浏览器验收(M-07)**:`.tmp/beacon-live-check.cjs` 直跑本地 :3281 —— `[计数对话] 出现 / [石门信标] storyBeaconGate 立起 / [场景现存信标] ["storyBeaconGate"] / [曾立起] ["storyBeaconBox","storyBeaconGate"] / [已撤除] ["storyBeaconBox"] / [同格重复立] {"storyBeaconBox":1,"storyBeaconGate":1} / pageerrors(0)`,主场景 PointLight 25(scene3 自备的余烬/门光是既有的,不算信标)。同一支探针在收拢**之前**打不出 `storyBeaconGate`(旧写法在箱信标撤走的那一格不再重建)⇒ 这条差异就是收敛的正面证据,不是"测试没红而已"。

- 门禁:npm test 6 条脚本 **7/22/108/46/20/6 = 209 项 0 失败**(exit 0,未涨);vitest **1085 项 / 97 文件**;eslint 0;tsc --noEmit 0;`npm run build` 0 且三条构建断言照旧(**46 prefetch** / 入口不含 three / dist 无 importmap;prefetch 较包 B 的 45 +1,是新增的 `shared/beacon-manager.js` 进了核心链),main chunk **270,846 B**(< 512 KB 闸);`scripts/probe/boot-cost-probe.cjs` 退出 0(沙箱首屏 **675KB / 56 资源 / 46 条 prefetch 全带 crossorigin**);`npm run depcruise` 0 违规(**395 modules / 1351 deps**,较包 B +8/+32);checkJs **258 = 新基线**(开工时基线文件写 308、**实测 306**;四刀归因 −48:typedef 24 / mA 3 / houseMats 5 / worldManager 16;新增 0,错误分布未变)。
- ⚠️**要记住的六条**:①**基线文件里的数会虚高** —— 降 checkJs 基线之前必须重新数一遍,别拿 `checkjs-baseline.txt` 当起点(这次 308 vs 实测 306 的 2 条差没人追,只按实测记账);②`: unknown` 本身不是错,**手写一份与写入方不一致的形状**才是错 —— 收类型先找"唯一写入方",有现成的类/元素就指过去,没有就**留着别动**并把理由写在声明旁边;③撞键这类普查要从**真实导出**量(import 后递归收集),`story-text.mjs` 里有动态构造的 key,正则扫源码会漏;④产物溯源测试**不要断 git** —— CI 是浅检出/detached,断"提交号对不对"必然假红;git 信息在**记录时**写进清单,测试只核对清单与字节;⑤探针红先与**生产**比一遍再定性:`b612-guidance-probe`(`✗ [进程行] 325 国王之星(storyBeat) | v=null` + `waitForFunction` 45s 超时)与 `b612-327-guidance-probe`(`waitForFunction` 20s 超时)在本地与 `BASE_URL=https://cloudbear.cloud` 下**失败点逐字相同** ⇒ 判为探针自有的预置债(过时),不是本批回归,但也**没顺手修**;⑥工具类四条坑:`perl -0777 -pi -e 's/^…$/…/'` **必须带 `/m`**(否则整文件被当成一条字符串,`^…$` 只匹配首尾,断点静默打不上 ⇒ 每个断点都要 grep 反查一遍)、vitest 打印的是 `     × <完整标题>`,匹配红项要用 `grep -E '^ *× ' | grep -qF "关键字"`,不要写 `grep -qF "× 关键字"`、JSDoc 类型正则里可选标记要写成字符类 `[*?]?:`,写成 `'\\*?\\?:'` 会变成"必须有个问号"、Write/Edit 之后有 prettier 钩子会重排文件,连续第二次编辑必须重读。
- ⚠️**本批未做、已记档**:①M-07 的第三件 `story-session` **没抽**:全仓 9 份 `speakSeq`,签名有四种形状 —— `(seq,i,done)`(scene2-draw:390 / earth-day:65 / scene7-tippler:161 / scene7-vanity:38)、`(seq,i,done,ticket=visit)`(scene3-night:234 / scene3-memory:307 / scene6-king:45)、`(seq,i,done,home)`(late-planets:54)、`(seq,then)`(ending-journey:236)⇒ 抽共享模块得先统一签名,那是动 9 章调用点的独立一批;票据本身包 B 已经上到该上的三条。②`scene3-memory`/`scene6-king` 那两份信标的呼吸节奏仍留在各自文件里(只并了几何与拆除)。③M-09 的行 ID 化(336 处 `tt(` / 46 文件)。④山丘清单**管不到**"`hill-src` 改了但没重跑 build"这一类漂移 —— 产物里没有版本戳可比,要治得先在 hill-src 构建里注入戳(对齐主站的 `__B612_BUILD__`),属另一批。⑤checkJs 剩下的簇已按两种顺序排好,下一批照表收:**按文件** `upload.js` 21 / `planets.js` 17 / `quizgate.js` 16 / `player.js`·`player-physics.js`·`minimap.js` 各 14 / `gallery/mode.js` 13 / `scene7-tippler.js`·`finale.js`·`ark-freeflight-hud.js` 各 10;**按类** `value` on HTMLElement 16、`style` 与 `onclick` on Element 各 9、`message` on unknown 9、`material` on Object3D 9、`kunlun` on `{ getH: … }` 7,`TS2339` 共 194 条。

### 第六轮还没动的部分(已排期)

> **2026-10-14 二次核实的修正**(下面每条都回读过代码,范围与审计原文不同,按修正后的做):
> - **M-14 只剩一半,而且不是 P1**。跨 Scene 登记那半 **2026-10-11 已经补上了**:`src/kunlun/planets.js:32-39` 的 `addWorldObj()` 就是 `scene.add(obj)` + `bag.register(obj,{scene})`,注释还写着"捕获补丁只挂在 `ctx.scene.s.add`"——正是审计指的那个缺口。**真没的那半是代次守卫**:`bag.register` 有(`hot.js:149` `REG[name] !== bag` ⇒ 晚到的当场摘除释放),但 `installCaptures` 里 `s.add` 的包装(`hot.js:28-31`)**没有** ⇒ 已 dispose 的旧 bag 被迟到的 `bag.async` 回调重新装上去,期间进 `bag.objs` 的对象落在一个已被 `length=0` 清空的死数组上,再没人释放 = 真泄漏。影响面**只在 dev/HMR**(生产不二次装配)⇒ 定 P3;其余 25 个 hotBegin 模块里只有 planets.js 往非主场景挂东西,scene3-memory/scene6-king/scene7-tippler 那些 `w.scene.add` 根本没进 bag(它们是搁置的旧玩法)。
> - **M-15 的"全站没退订"不成立**:journey-system(`:656`)、toast、state-system、gameshell-system、plane-flight、sheep-companion、scene10-fox 都存了 unsub 并在 dispose 里调。**唯一实例是 `src/gallery/portal.js:64`** —— 模块顶层 `eventBus.on('world:changed', …)` 把返回的退订函数直接丢弃,全文件没有 dispose/hotEnd ⇒ HMR 二次导入就是双份。按"补一个实例"来修,别写成"全站通病"。
> - **M-03 只适用于剧情链,别顺手改对话系统**:`src/kunlun/ending-journey.js:225` 是裸 `const wait = (ms) => new Promise(r => setTimeout(r, ms))`,`veil()`(318-327)/`drawMuzzle()`(512-516)一路 await 下去,全文件 grep 不到任何 gen/version/cancel/token ⇒ 中途换世界,旧对白/tint 会在新场景弹。**对照**:`src/core/gameshell-dialog.js:312-336` **已经有**统一票据(`scopeVersions`/`worldVersions` bump + `dispose()` 清 typeTimer/hideTimer)⇒ 那一处不是裸 setTimeout。
> - **M-18 属实但今天打不着**:`lib/upload/stream.js:34-37` 的 `release()` 没有"已释放"标志,调两次就减两次在途账;审计自己也注明现役调用方恰好幂等 ⇒ 2 行加个 flag 即可,不必大动。**已落地**(实测双调次数 2 / 2~3 / 2,见上一节)。
> - **M-19 属实但范围要说准**:`package.json:32,34` 的 `deps`/`depcruise` 都只扫 `src`,CI 跑的是 `npm run depcruise`(test.yml:95)。**~~`server.js` + `lib/` 的依赖方向完全没人守~~ —— 实测 49/50 个后端文件是靠 `src/__tests__/` 的 require 顺路扫到的,漏的是**入口**不是覆盖**(详见上一节)。做之前先读 test.yml:105 已有的 `check-backend-manifest.cjs`(它管"清单覆盖真实依赖",本次部署日志里那句"从 server.js 可达 51 个,清单 53 个"就是它),别造第二个平行闸。**已落地**。
> - **M-02 的严重性比原文更硬**:除了"先 notify 后写回",还有一条 **粘性**——`game-state.js:29` 的 `if (state[key] === value) return` 让写回失败之后**再 set 同一个值也永远不会重试**,ctx 就停在旧值直到有人写一个不同的值。改时必须一起改 `src/__tests__/game-state.test.js:61-72`(那里明确钉住了"apply 抛错被吞 / 自身状态仍已写"这个契约)。
> - **M-04 的机制与原文不同**:`store.set*` **不抛错、返回布尔**(`src/state/store-api.js:139-147`,配额满只 `console.warn` + return false),而 `applySave`(`chapter-map-logic.mjs:159-168`)逐字段写并把返回值全丢 ⇒ 半数写失败也照样 `location.reload()`(`chapter-map.js:246-248`),重载后没落盘的字段回滚成旧值 = 混合档,玩家零提示。修法是汇总布尔并给提示/可撤销,不是包 try/catch。

PR2 = **已落地(见上一节)**:M-14 剩下的那半(捕获路径的代次守卫)+ 安装栈缺陷 + M-15 唯一实例 `portal.js`;
PR3 = **已落地(见上一节)**:M-11 `saveGateData` 结果契约 + M-17 `flush()`/`stopOutbox()` 结论 + aiusage 退回 pending;
PR4 = **已落地(见上一节)**:M-19(`deps`/`depcruise` 入口补上 `server.js` 与 `lib/`)+ M-18(`stream.guard()` 的 `release()` 自我幂等 —— **审计自己注明今天调用方恰好幂等,所以不是现役漏洞**,改的是保证归属);
稳定性包 A = **已落地(见上一节)**:M-01(组合根 `initialized=true` 写在循环前、某系统 init 抛错仍继续装后面的、运行后注册只告警)、M-05(`enter()`/`enterWithoutPush()` 两套重复实现且后者缺 finally ⇒ `transitioning` 可能永久为真把切换锁死);
包 B = M-02(GameState 先 notify 后写回 ctx)、M-03(326/327 多层裸 `setTimeout`,离开章节无统一票据 ⇒ 旧对白在新场景弹、剧情被旧回调改写)、M-04(`applySave` 逐字段写而不汇总失败,失败也照样 reload);
结构包 C(P2)= **已落地(见上一节)**:M-06 显式生命周期试点、M-07 抽 `story-session`/`stardust`/`beacon-manager`(信标实测 **7** 份而非 5;`story-session` 因四种签名未抽,已记档)、M-08 类型渐进(checkJs 306 → **258**,明确**不要**整仓 .js→.ts)、M-09 剧情文本按语句 ID 取(`tt()` 现在带全局注册副作用,本批只登记撞键)、M-10 legacy 过滤改用稳定 ID 而非中文标签、山丘产物溯源。
⚠️其中 **M-02 动手前先读 `src/__tests__/game-state.test.js` 原文**:审计指出该测试把"写回失败 GameState 仍保留新值"钉成了**已确认契约** —— 别把有意的兼容行为当 bug 改掉。

## 2026-10-14 第五轮外部审计(针对 `82d1129`;含游戏内容维度)——先核实再动手

审计方只读源码、未跑测试,并明确「不把此前已修复的问题重复计为缺陷」。6 条工程断言逐条回读后:**4 条成立(其中 1 条比审计说得更严重)、2 条部分成立、1 条误报**;素材版权与译本授权两条按主人指示不处理。

| 断言 | 定性 | 关键证据 |
|---|---|---|
| F `ip-api` 与免费层不符 | **已确认,且更严重** | 实测 HTTPS ⇒ `403 {"status":"fail","message":"SSL unavailable…"}`,HTTP ⇒ 200。fetch **不为 403 抛错**且 body 是合法 JSON ⇒ 走 `status!=='success'` 静默写「未知」,**连 `.catch` 都不进**,再被 `if (ip in gateData.geo) return` 的永久占位钉死 ⇒ **自 2026-09-20(`2929596` 把 http 改成 https)起查到的每一条都是「未知」**,而这条链路一直把访客 IP 交给第三方(privacy.html 从未披露它 ⇒ 删调用同时修掉一处合规缺口,而不是要改文案)。⚠️上线后复核发现本格原话"全线、永久为空"**说过头了**:线上现存 3942 个档案里 2561 条「未知」+ 481 条空,但仍有 900 条是真标签(「俄勒冈州 The Dalles · Google LLC」等)——那是 2026-09-20 之前 http 时代留下、至今没被淘汰的历史值;结论不变(失效的那 24 天一条都没成功过,且占位让它无法自愈),但**准确说法是"自 https 改动起停止工作",不是"从来没有过"** |
| D hill-src 无 CI | **已确认** | 全仓 1 个 workflow、无任何一步进入 hill-src;`vitest.config.js`/`tsconfig.json`/`eslint.config.mjs:14` 三处**主动排除**;山丘 6 个测试文件与 `tsc --noEmit` 在 main 上从不跑;`scripts/ci/audit-deps.sh` 的 pnpm audit 是**无人调用的死脚本** |
| A 入口把 three 拖进首屏 | **已确认,但审计的改法不够** | 入口静态引 three 的边有 **7 条**(不止点名那 5 个玩法模块:`core/audio-system.js:6`、`core/effects-system.js:7` 也直引);`dist/.vite/manifest.json` 的 `index.html.imports` 含 `three-*.js`、50 条 `dynamicImports` **不含** three、main chunk 里是静态 `from"./three-…"` ⇒ three 895KB(≈231KB gzip)确在首屏。**只搬那 5 个模块零收益**,必须连 audio/effects/gltf-loader 同批处理 |
| B world-loader 串行 | **部分成立(不算缺陷)** | 核心 22 / 后台 5 确实串行,但 `vite.config.js:42` 已明写这一取舍与 43 条 prefetch 兜底,且核心链有 `boot-check` 与 planets 顶层注册的顺序约束 |
| E 山丘带登录/房间代码 | **部分成立** | 确实打进单人包并用 `data-solo` 遮 UI,但**零出网**:`manus-auth.js` 是离线替身(login/query/mutate 直接 reject)、`room.start()` 全仓无调用 ⇒ `room.ts:118` 的 `new WebSocket` 与 bootstrap.json fetch 不可达;成立的一半是"该构建期剥离而非只遮" |
| G 存档码缺校验 | **误报** | `chapter-map-logic.mjs:123-142` 有前缀白名单 + `SAVE_FIELDS` 14 键白名单 + 逐类型强转钳位,`applySave` 只遍历白名单 ⇒ 注不进任意键;`store-api.js:230` 的 `entry(name)` 未登记即抛 = 第二道。**真缺口审计没说中**:无输入长度上限、导入前不备份当前进度 |
| H CSP `unsafe-inline` | 事实成立 | 全站 20 页 69 个内联事件属性 + 30 个内联块(≈95KB);`lib/security.js` 是**全局单一 CSP**,零路径分支、零 nonce。⚠️审计说"分阶段先去内联"方向对,但它的前提有误:**CSP3 规定 `script-src` 一旦出现 nonce/hash,支持它的浏览器就忽略 `unsafe-inline`** ⇒ 上 nonce 本身就是一次真收紧,不必等内联清完 |

### 2026-10-14 线上事故(我自己造成的,已恢复 + 已上闸门):两次 deploy 并发把首页打成 404

- **现象**:第 2 次 `deploy.sh` 跑到 8/8 报 `首页 HTTP:404`;服务器上 `/opt/gallery/index.html` **不存在**、`assets/` 只剩 6 个文件(应有 88),`/healthz` 正常 ⇒ 后端活着,前端被删空。中断时长约 **4 分钟**(从第二次启动到第三次单线程发完并复验 200)。
- **根因**:前一次 deploy 在后台任务里"看起来结束了"(外层报 completed exit 0,日志只写到第 3 步),我据此认为它已经停了,于是又起一次。**两次都在做第 4/5 步**:上传 `dist.tar.gz` → 在 `/opt/gallery` 解包 → 按差集清理残留。彼此把对方刚解包出来的文件当成"该删的残留",`index.html` 与 assets 就在交叉删除里没了。这不是 prune 逻辑的 bug(它算的差集是对的),是**并发执行**让它拿着半套清单去清理。
- **修复(闸门,不是承诺)**:`deploy.sh` 开局用 `mkdir .tmp/deploy.lock` 的原子性拿锁,锁内写 `epoch pid`;`on_exit` 释放;**`trap` 装在拿锁之前**,否则"拿到锁之后才失败"会把锁留在盘上变成新的堵点。判活**按锁的年龄而不是 PID**:`kill -0` 在 Git Bash 里对另一个终端的 Windows PID 不可靠,而"误判成已死"正是这次的方向;"误判成还活着"最多多等 20 分钟,提示里写清怎么手工确认与解锁(`rm -rf .tmp/deploy.lock`)。`backend-sync.sh` 独立运行时也看这把锁,被 deploy 调用则认 `DEPLOY_LOCK_HELD=1` 放行(否则自锁死)。四条路径都测过:年轻锁 ⇒ deploy `exit 1` 且**没碰服务器**、`DEPLOY_LOCK_HELD=1` ⇒ 放行、5000s 的残留锁 ⇒ 接管、接管后私钥不可用 ⇒ 失败并**已释放锁**。
- **登记为纪律的判据**:"外层命令的 exit code / 后台任务通知" 不等于 "脚本自己的结论"。deploy 的结论只有两个来源 —— stdout 里的 **`DEPLOY_OK <sha>` / `DEPLOY_FAILED exit=N`** 与 **`.tmp/deploy-state.env`** 的字段(这次若早看快照,`FRONTEND=not-run` 就会告诉我上一次根本没跑完,而不是"跑完了")。发布后一律再 `curl -o /dev/null -w %{http_code} https://cloudbear.cloud/` 亲自读一次首页。


### 本轮已落地(2026-10-14)

- **F 归属地(已上线复验)**:`2739e3b` 删掉 `admin.geoLookup` 与那条 ip-api 外呼,新增 `lib/geoip.js` 只读 Cloudflare `cf-ipcountry`(零出网、零新依赖),`store.trustedProxy(req)` 从 `realIP` 内部抽出成导出以复用同一信任判定。线上实测 `GET /api/admin/list` 带 `geo={header,noHeader,noProxy,local,overwritten,entries:710,source:"cloudflare-cf-ipcountry",outbound:false}`,漂移复核 53/53、卫生探针 24/24、SW 探针 14/14。**读数语义要说全**:国家标签只会随**回访者**逐条补上(现在 entries 里仍是 http 时代的历史值 + 「未知」),不是我上线当天就有 710 条国家标签;旧的「未知」占位要等后台 `clear-geo` 或 geo 90 天保留期才走。**新增纪律**:列表接口不许再顺手写库/发外呼(`handleAdminList` 现为纯读)。
- **D 山丘门禁(已上线复验)**:`f81baf7` 在 `build-and-test` **job 内**加两个 step(pnpm + `typecheck`/`test`),GitHub 上两步均 `success`;刻意不加 job(分支保护要求的 context 是 job id `build-and-test`/`smoke`,加 job 会让保护规则对不上),刻意不跑 `pnpm build`(`emptyOutDir` 会覆写已入库的 `public/hill`,而本项目构建不可复现 ⇒ CI 里重建只制造假漂移)。
- **A three 移出入口静态图**:`src/main.js` 顶部那 7 条静态边(`scene/plane-flight`、`scene/sheep-companion`、`kunlun/scene10-fox`、`kunlun/earth-day`、`kunlun/ending-journey`、`core/audio-system`、`core/effects-system`)改为 `preloadWorld()` 开头的 `Promise.all` 动态 import,且**放在核心链之前** await —— 原有相对顺序是"这 7 个的顶层副作用早于任何世界模块",倒过来就是未知领域。效果与判据:`index.html` 的静态图从 **6 个 chunk(含 `three-*` + `gltf-loader-*`)降到 4 个**,`<link rel=modulepreload>` 不再含 three,three 成为 57 个 `dynamicImports` 之一;首屏入网 671KB(prefetch 仍含 three,这是**设计如此** —— 变的 blocker 关系不是字节总量,别把它说成"省下 231KB 首屏流量");门禁 `scripts/probe/boot-cost-probe.cjs` 阈值按主人默认收紧:**总入网 2600→1000KB、单资源 900→300KB**;新增构建期断言 `[entry-weight]`(在 `vite.config.js` 的 `closeBundle`,只走 `e.imports` 不走 `dynamicImports`,命中即 **打断构建**)。回归验证:A/B 各跑一次 `b612-preload-film-probe`(HEAD 版与改动版分别构建),`预加载在电影期间完成` 与接棒耗时同量级(20785ms vs 21029ms,噪声内),`test-mobile.js` 模拟 iPhone 12 的 6 项(3D 画布、渲染循环存活、零未捕获异常)全过。
  - **顺带修掉一条先前就存在的假红**:`b612-preload-film-probe` 的③原来断言"skip 后 15s 内 `FPS>0`",而 headless 没有 GPU ⇒ `rnd.compileAsync()` 在 SwiftShader 上编全站着色器要 16-40s,这条**在改动前后都红**(我先怀疑是自己改坏了,做 A/B 才确认与本次无关)。现改成断"**接棒**"(`__bootState.worldStarted` ∧ `#c` 显形,预算 12s),FPS 耗时只打印参考。教训登记:**测不出回归的红等于没有门禁**,而把它调绿之前必须先证明它绿过别的都还有效。
- **G 存档码两处真缺口**:`src/shared/chapter-map-logic.mjs` 加 `MAX_CODE_CHARS = 4096` 并在 **`decodeSave` 的最前面、解码之前**判长度(真实码 base64 后约 300-900 字符,留了 4 倍余量);审计报的"能注进任意键"仍是误报(前缀白名单 + `SAVE_FIELDS` 14 键 + 逐类型钳位都在),这条补的是"粘一大串就把主线程吃掉"。另一半是**载入前快照 + 一次性撤销**:`applySave` 之前先 `collectSave` 拍一份字段值写进 `saveBackup`(SCHEMA 新增,`type:'json'`),存档区据此长出「撤销上一次载入 · 日期」,两步确认后 `applySave(快照)` 并清备份。⚠️**快照存的是字段值,不是存档码**,两个理由:①码里套码,每导一次长度翻一倍;②`decodeSave` 的钳位(str 截 40、num 夹 0-99)会把玩家原值**悄悄改掉**——"撤销"要是会改写原值就不叫撤销了。验收:`src/__tests__/chapter-map-logic.test.js`(7→11)与新增 `scripts/probe/chapter-map-undo-probe.cjs`(14 项:导入生效/快照内容/两次确认都不越权/撤销精确/一次性/超长码 127ms 且不动档/零 pageerror)。
  - ⚠️写这条探针时踩到一个**会把验收骗成全绿**的坑:`addInitScript` 每次文档加载前都会跑,于是导入后那次 reload 又把"玩家原有进度"种了回去 ⇒ "导入没生效"和"撤销成功"两边都是假的。修法是给播种加 `sessionStorage` 一次性闸门。**凡是在 reload 之后读回 localStorage 的探针,都要检查种子的执行次数。**
- **E 山丘单人包构建期剥离(按量过的数据做,不做没必要的重构)**:先量了死重到底多少字节 —— 社交/登录代码全在入口 chunk(`public/hill/assets/index-*.js`,84KB minified),而整个山丘产物是 physics 4.3MB + config 357KB + three 218KB + game 166KB,**"剥离能省的流量"根本不是这条审计的价值点**,价值在"单人包里不该存在能发起请求的代码"。于是按这个前提做:
  - `hill-src/vite.config.ts` 加 `define: { __SOLO__: HILL_SOLO !== '0' }`(+ `src/globals.d.ts` 声明),把每一处**会发请求**的调用点收进 `if (!__SOLO__)` / `__SOLO__` 早退:`ManusAuth.prepare()`、`login()`/`logout()` 体、`signedIn()`、`room.onNote` 里的 `fetchNote`、笔袋 `save` 里的 `saveMyNote`/`room.sendNote`/`noteErrorKey`、以及 `manus-auth-change` 那个会 `fetchMyNote` 的监听器。`net/notes.ts` 因此整块被 Rollup 折掉(`api/notes` 在产物里**零命中**),入口 84KB→73KB。
  - **刻意没做**的那半:把 `room.*` 每帧引用(sendPose/remotes/status/count)全搬进条件函数(约 12 处、跨 190 行控制流)。`Room` 实例留着不影响"零出站",因为**没有任何调用点**会去 `room.start()`/`room.peek()`;为了删这段死代码去改每帧逻辑,是在一个只有 6 个单测、没有浏览器探针的子项目里换 0.1% 的字节。这个取舍写在这里,下次别再当成"未完成项"重做一遍。
  - 取而代之,把"不可达"钉成闸门:**`scripts/hill-solo-guard.cjs`**(已进 CI 的 `build-and-test` 作为 BLOCKING step)①产物不得含 `api/notes`;②源码不得出现 `room.start(`/`room.peek(` 调用点;③`__SOLO__` 的定义与 `data-solo` 的常量来源还在。**反向验证做过**:用 `HILL_SOLO=0` 出一次联机产物 ⇒ ①立刻红、exit 1 ⇒ 这条闸门不是恒绿的;再建回单人产物 ⇒ 4 条全过。
  - 山丘真机侧复验:按生产形状把 `dist/` 当 web root 起服(⚠️**注意 `server.js` 把 `/hill` 解成 `<根>/hill/index.html`**,仓库根没有 `hill/` 只有 `public/hill/`,所以直接在仓库根起服测 `/hill` 必然 404 —— `hill-ending-probe.cjs` 文件头那句"本地服务器答 /hill"是错的,待修),结果:标题卡出现、`body[data-solo]` 就位、canvas 建起来了、11 个请求全为同源、**零出站/零失败/零 pageerror**。hill 自己的 typecheck 与 18 个单测也全绿。

- **I checkJs 基线 422→378(先吃掉那 44 条"假类型债")**:最大的一簇根本不是债,是**配置少一行** —— 代码里 44 处 `import.meta.hot`(HMR/可重装配那批)全在报 `Property 'hot' does not exist on type 'ImportMeta'`,而 `vite/client` 就是这些全局声明的出处(山丘子项目 `hill-src/tsconfig.json` 一直有,主项目的 `tsconfig.checkjs.json` 没有)。补上 `"types": ["vite/client"]` ⇒ **−44 条**,错误族分布没变(300×TS2339 + 26×TS2554 + …,没有新增族 ⇒ 不是用放宽换数字)。基线单一源 `scripts/checkjs-baseline.txt` 同步改成 378(CI 那条闸门是 `COUNT > BASELINE` 才红,方向正确)。
  - **剩下的头号簇与已定的修法**(下次接着做,别再从零分析):`SceneNamespace.addBounds/removeBounds`(24)、`KunlunNamespace.setChapter/hidePlanetMote/planetsMode`(~23)等,根因都在 `src/ctx-kunlun.js` / `src/ctx-scene.js` 的代理工厂 —— 函数写的是 `const proxy = {}` 然后循环 `Object.defineProperty(proxy, prop, ...)`,TS 只能推出**空对象类型**,于是**任何** `ctx.kunlun.x` 都报不存在(它报的不是"你写错了",是"我读不出这张表")。两个候选修法:①把 `properties` 数组换成**对象字面量当唯一真相**(`const SHAPE = { setChapter: undefined, ... }`,运行时循环走 `Object.keys(SHAPE)`,返回类型用 `/** @type {{[K in keyof typeof SHAPE]: any}} */` 转出去)⇒ 键集合一份、仍然有拼写检查;②给 proxy 打 `Record<string, any>` ⇒ 一行搞定但**丢掉这张表的全部拼写检查**,不推荐。**今晚没做**是因为这两个都要改 ctx 这对接线全站的叶子文件,而我今天刚因为"累了还去动承重点"赔了一次线上 404 —— 这类改动要单独一批,配 `npx vitest run` 全套 + 一次真浏览器开机验证。
  - **第二刀已落地(2026-10-14):checkJs 378 → 308,消掉 70 条、新增 0 条**。上面那条"修法"里猜的方向是对的,但根因比"代理工厂的类型写法"更朴素:**`types/ctx.d.ts` 是手工维护、入库、没有任何生成脚本**(`npm run typecheck` 就是 `tsc --noEmit`,不产出它),而成员清单的真源是各 `src/ctx-*.js` 里那份 `properties` 数组(代理就是照它 `defineProperty` 的)。两边已经漂了 22 处:13 个成员**运行时有、声明里没有**(就是那 58~70 条 TS2339),3 个**声明里有、运行时没有**。
    - 反向那 3 条(`MediaNamespace.wb`/`ytHeart`、`PlayerNamespace.drM`)是**过期声明**,比缺声明更坏:代理上根本没有这对 getter ⇒ 读到 `undefined`,而对象是 `Object.freeze` 过的 ⇒ 赋值直接 TypeError。全仓实查(`drM` 之类)只剩旧 codemod 清单 `scripts/gen/ctx-alias-codemod.js` 和一句探针注释提到它们,没有任何读写点 ⇒ 已删,原地留注释说明来历(`drM` 是 `drawMap` 的旧别名)。
    - **守卫**:`src/__tests__/types-ctx-drift.test.js` 双向对账(数组有/声明没有 = 红;声明有/数组没有 = 红),覆盖**全部七条**命名空间而不是我改过的三条,并拒绝"两边都解析出 0 个成员"的假通过。它第一次跑就抓到 `PlayerNamespace` 缺 `drawMap`/`tickPhysics` + 过期 `drM` —— 因为我那段临时统计脚本的正则要求数组**多行**排版,而 `ctx-player.js` 的数组写在一行 ⇒ 它整个没被解析到。**教训:一次性 grep 不能当覆盖面用,要落成测试。**
    - 每个补进去的成员形状都取自**真实赋值点**(注释里写清 `文件:行`)。四条探针/调试门面(`planeApi`/`foxApi`/`earthDayApi`/`endingApi`)刻意留 `unknown`:今天没有被 checkJs 覆盖的读取方,临摹一份形状等于给消费方一个假保证;要给它们上类型时,顺手把消费方一起加进 `tsconfig.checkjs.json` 的 `include`。`SceneNamespace.getActiveAtmosphere` 在数组里、但全仓既无赋值也无读取 ⇒ 记为**还没接线的槽位**,按本项目惯例保留(这不是"死代码可删"的结论)。
    - ⚠️**读数时的一个陷阱,别踩**:`tsconfig.checkjs.json` 的 `include` 只有 `src/core/**`、`src/player/**`、`src/kunlun/avatar.js`,其余文件是靠 import 传递闭包被顺带检查的 ⇒ "某个成员没有报错"**不等于**"没人用它",它可能只是住在没被拉进程序的文件里。判定死代码要按读写点实查,不能按报错数。
    - 剩下真正的债按簇排好了(每一簇要的是设计决定,不是机械改):**`Element` 38**(往 DOM 节点上挂 `_langHandler` 这类私有属性 —— 要的是 WeakMap 或类型化元素,属于真重构,别和类型批次混一起做)、`unknown` 36、`object` 36、`HTMLVideoElement` 24、`Object3D` 12、`{ getH }` 11。基线数字的唯一出处仍是 `scripts/checkjs-baseline.txt`(CI 与本仓都读它,超线即阻断)。

- **C 切读前把"整库快照到底多贵"量成了数**(`scripts/probe/gate-write-cost-probe.cjs`,经 ssh 在**生产那块盘**上跑,只读 `gate_data.json`、只往 `/tmp` 写探针自己的文件、跑完即删;不打 DB、不碰 SQLite、绝不打印任何内容):
  - 线上快照 **2372 KB**;`JSON.parse` p50 31.1ms / p95 35.7ms,`JSON.stringify` p50 34.3ms / p95 47.2ms,`write+fsync` p50 11.1ms / p95 11.6ms ⇒ **一次完整"整库快照落盘"≈ p50 76.5ms、p95 92.4ms、max 95.3ms**(都在同一核上,也就是事件循环被按住这么久)。
  - 写频率:夜里那个 45s 窗口 **0 次写**(mtime 停在 2026-10-13T19:26:32Z);按影子表的量级对照,最近 24h `visits` 68 行、`click_events` 0、`chat_messages` 0 ⇒ 触发写的主要就是访客进门那几条(一次访问常连带 recordVisit + 会话续期 + pushIp +(新人)geo,⇒ 2-4 次落盘)。
  - **这条测量把结论从"吞吐/磁盘"改成了"延迟抖动"**:每天约 150-300 次 × 2.3MB ≈ 350-700MB 的写放大看着吓人,但换算成 CPU 只有每天几十秒,盘也一点都不吃(11ms);**真正的问题是 p95≈92ms 的循环阻塞会在客流高峰被连成串**(同一个人进门就 2-4 次,乘上并发就是几百毫秒的排队)。所以 R1 切读的理由应当写成"消掉抖动",不是"省磁盘"。⚠️频率只在夜间取过一次样,**结论要等一次白天高峰复采**(同一条命令 `MTIME_SECONDS=180` 再跑一次即可),别拿深夜数吹白天的余量。
  - 探针自己的边界写在文件头:它测的是"一次落盘的物理成本",**不含**应用内 `saveGateData()` 的排队/合并行为,也不含与并发请求的互相影响 —— 那两个数是玩家感受的另一半,别拿这条当全部。
  - **白天复采样(2026-10-14 08:49 +08,窗口拉到 180s)**:快照 **2374 KB**;`JSON.parse` p50 39.1 / p95 44.6 / max 55.2ms,`JSON.stringify` p50 33.7 / p95 41.5ms,`write+fsync` p50 11.7 / p95 12.3ms ⇒ **一次完整落盘 ≈ p50 87.3ms、p95 94.0ms、max 99.8ms**。与夜里那次(p50 76.5 / p95 92.4)同一量级 ⇒ 结论"切读要省的是每次写把事件循环按住约 0.1s"**不随时间窗变化**。频率侧:这 180s 内 **0 次写**,mtime 全程停在 `2026-10-14T00:48:53.056Z` —— 那一下是本次发布重启进程时的落盘,所以这个窗口对"日常频率"偏低,别拿它当上限(夜里那次的判读仍以影子表量级对照为准)。
  - ⚠️同一次测量顺手抓到一种**新的假绿形态**(已并进 auto-memory 的退出码那条):`ssh -n` 会把 stdin 重定向到 `/dev/null`,于是 `ssh … "node -" < 脚本` 喂给远端的是**空程序** ⇒ 远端 **exit 0 且一个字都没输出**。第一次"白天采样"就是这么"通过"的,发现它只是因为读了输出、没只读退出码。⇒ 走 stdin 传程序的远程执行**不能带 `-n`**;改用 `cat 脚本 | ssh (无 -n) "… node -"`,并且把"输出里有预期的那几行"本身当判据。
  - 还差的维度只有一个:**与并发请求的互相影响**(要在服务上做压测,不是这条只读探针的对象)。
- **H 的开工前提(先纠正我自己在判定表里写下的口径偏向)**:表里那句"CSP3 规定 `script-src` 一旦出现 nonce/hash,浏览器就忽略 `unsafe-inline` ⇒ 上 nonce 本身就是一次真收紧,**不必等内联清完**"——事实对,但**它的意思反过来说更关键**:正因为 nonce 会让 `unsafe-inline` 失效,所以**任何一个页面一旦发 nonce,该页就必须已经没有内联处理器/内联脚本块**,否则那页的 onclick 全线死掉。全站现状是 20 页 69 个内联事件属性 + 30 个内联块,所以"分阶段"只能按**页**切:先挑一页把内联清干净再收紧,绝不能先上站点级 nonce。第一刀要动的东西:`lib/security.js` 当时只有**一条全局 CSP**(零路径分支、零 nonce),得先能按请求路径分叉;模板/静态页里 `onclick=` 换成 `addEventListener`。⚠️这一步同时是**审计 R7/CSP 挂账项**的落地,别当成"顺手改改"。(当时猜的候选页 `privacy.html`/`guide.html` 后来被线上实测**否掉**了,见下一条。)
- **H 第一阶段落地(2026-10-14):收紧的手段是"按页摘 `unsafe-inline`",不是上 nonce**。
  - 为什么 nonce 这条路本轮**不走**:①登记表里那几页本来就零内联,外链靠 `'self'` 就授权到了,nonce 没有需要授权的对象;②对还没清内联的页面,nonce 恰是"出现即让 `unsafe-inline` 失效"的那一刀。所以审计原文"nonce 先落地,内联逐页迁移"按实测改成 **`unsafe-inline` 按页摘除先落地**,上面那句前提纠正仍然成立且是依据。
  - ⚠️**新实测前提(审计和上一条都没写)**:线上每条 HTML 响应里都有一条**Cloudflare 边缘注入**的内联 jsd beacon(`/cdn-cgi/challenge-platform/scripts/jsd/main.js`),正文带每次请求都变的 `r`/`t` ⇒ **加不了 sha256 白名单**;它也不是我们写的标签,nonce 注不进去。⇒ 摘掉 `unsafe-inline` 会顺带把 CF 的机器人打分脚本挡掉,那是 CDN 侧的功能取舍(归主人拍板),不是本仓代码能解决的。因此第一阶段**只发 `Content-Security-Policy-Report-Only`**(行为一字不改,只量"真去掉了会拦谁"),`CSP_STRICT_MODE=enforce` 才换成真策略。
  - 落了四件:①`lib/security.js` 的 `CSP_INLINE_FREE_PAGES`(**唯一裁决源**,`{path,file}` 成对写)+ `cspStrictPage(req)`(只认精确路径,剥 query/hash ⇒ `/hill/deep` 不算命中);②CI 硬闸 `scripts/admin/csp-page-registry-guard.cjs`(逐条重读那个仓库文件:内联 `<script>` 一个都不许有、`on*=` 事件属性一个都不许有;取不到 lib/登记表空 ⇒ exit 2 不算绿);③单测 `src/__tests__/csp-staged.test.js` 6 条(未登记页一字不动 / 登记页两条头并存且严格版 script-src 无 inline / 路径粒度 / enforce 档覆盖同名头 / `CSP_UNSAFE_EVAL=1` 开发档照样摘 / 登记表非空);④探针 `scripts/probe/csp-stage-probe.cjs`(HTTP + 浏览器两层:`securitypolicyviolation` 收集器抓运行时违规,内联违规条数**按 CF 注入条数归位**,超出的算我们自己的)。
  - 登记表选了哪几页、以及为什么不是上面猜的那两页:**按线上 HTTP 实测挑**,不按文件列表猜 —— `privacy.html`/`guide.html` 线上各带 4/1 条自家内联脚本(不符合);`convert.html`、`models-showcase.html`、`admin.html`、`chat.html`、`docs.html` 在根路径直接 **404**(根级白名单),更不能进表。合格的是 **`/hill/`、`/lobby.html`、`/room.html`**(响应里除 CF 那条外零内联、零事件属性)。
  - 验过的证据:沙箱 Report-Only 3/3 页**零违规**,且正面确认页面真跑了自家 JS(hill:6 个模块 + canvas 已画;lobby/room 各 3 个模块)—— 没有这一条,"零违规"可能只是页面根本没起来。enforce 档同样 3/3 无违规。**反向验证**:临时把 `index.html` 塞进登记表 ⇒ 守卫红(点名 4 条内联 + `type="importmap"` + `onclick=`)、探针红(4 条非 CF 内联违规 ⇒ `CSP_STAGE_FAIL`)。反向验证还当场抓到探针自己的 bug(捕获组序号写成 `m[3]`,应为 `m[2]`;内联一多就 `undefined.includes()` 崩)—— 只跑正向的闸门永远发现不了它。
  - **上线后的线上实测(2026-10-14,`e39e480` 这次发布 = 第一刀走完整条新流程:PR #16 → required checks 绿 → 合并 → 树哈希一致 → `DEPLOY_OK e39e480` → 漂移 198/198 + 独立复检 53/53 → `RELEASE_OK`;GitHub 侧确认 `CSP page registry guard (BLOCKING)` 这一步真的跑了并 success)**:`node scripts/probe/csp-stage-probe.cjs --prod` ⇒ 三条登记页各收到一条**摘掉 `unsafe-inline` 的 Report-Only**,基础 CSP 仍带 inline(一字未动);每页响应里内联脚本**恰好 1 条,归属 CF**,我们自己的 0 条;违规 1 条/页且全部归位 CF ⇒ `CSP_STAGE_OK`;页面照常跑(hill 6 个模块 + canvas 已画)。同批复跑:凭据卫生 24/24、SW 绕过与不落盘 14/14、首屏入网回归通过(671KB / 45 条预取全带 crossorigin)。⇒ 于是"第二阶段该不该 enforce"变成一个有数字的问题:**这 3 页 enforce 后唯一会断的就是 CF 的 jsd beacon**。
  - **还剩两步**(都不在本轮,第二步要主人点头):第二阶段 = 生产设 `CSP_STRICT_MODE=enforce`(改动只有环境变量,代码已备好),前提是那 3 页不再需要 CF 的 jsd,或主人在 CF 控制台按路径关掉 Bot 打分;第三阶段 = 把 `index.html` 的 4 条内联块 + 5 个 `onclick` 迁成 `addEventListener`,那才是全站"20 页 69 个内联事件属性"这笔账的起点(见 `REFACTOR-PLAN-审计挂账项.md` R7)。
- **CSP 第三阶段开了第一刀:生产构建里摘掉 `<script type="importmap">`(2026-10-14)**。这一步完全靠实测立住,三条依据:
  ①**产物里一个裸 specifier 都没有** —— vite 已把 `three` 改写成 `./three-<hash>.js` 相对路径(`dist/assets/*.js` 里 `from"three"` 计数 0,现在是构建断言在钉);
  ②它指向的 `/vendor/*` 在线上**根本不存在**(`curl /vendor/three.module.js` ⇒ 404,`vendor/` 不在部署清单里);
  ③严格 CSP 下这张 map **是真的被拦**,不是"只被报告":沙箱里对 `/` 起 `CSP_STRICT_MODE=enforce`,页面内 `import('three')` 报 `Failed to resolve module specifier`,而 report-only 档解析得到 vendor URL。
  ⇒ 留着它等于在线上声明一个并不存在的能力,还多占一个内联 `<script>` 挡着 `/` 进登记表。做法:`vite.config.js` 新增 `no-importmap-in-build` 插件(`apply:'build'`+`enforce:'post'`),**源码 index.html 里的 map 保留** —— vite dev / 按 `/src/**` 原样取模块的本地服务模式仍靠它解析。断言写在 closeBundle:产物里还有 importmap ⇒ 红;产物里若还有裸 specifier ⇒ 也红(那说明摘它会打断功能,不许摘)。构建产物内联块 4 ⇒ 3。**没有引入 nonce**(本轮的结论就是不该引入,见上面 H 第一条)。
  - ⚠️**顺带查清一条会坑未来的事:`scene-visual-regression` 的像素层已经过期。** 摘 map 前后各跑一遍四检查点,`changedRatio` **逐位相同**(84.9% / 77.3% / 73.9% / 92.0%,maxΔ 只有 5.6~5.9 ⇒ 全体素微偏,不是构图变化),语义层与亮度层两次全绿(`activeWorld` = main/b612/king325/main、非黑非白 28.3、无未捕获异常)⇒ 红是**基线过期**(基线 PNG 是 2026-10-03 抓的,之后过了 A 批移出 three、剧情闸、星门出场等一批视觉相关提交),不是这批引起的。**A/B 在这里是必需的**:只有"对照组建一遍再跑一次"才能把"我摘了 map"与"画面本来就不一样"分开。
    由此两条纪律:①这条探针现在**没在**发布路径里当硬闸(`VR_STRICT=1` 一旦接进闸门,今天开始每次发版都会红)——要接的话必须先 `VR_UPDATE=1` 重建基线,而重建基线等于**承认"当前画面就是有意状态"**,所以只能在确认画面正确之后做,不能带着未验证的改动做;②亮度/语义层仍然有效,这次就是靠它们正面证明"摘掉 map 后世界照常起来"的(boot-cost 证明不了这点,它只量首屏闸门期,而 `three` 早已不在入口图里)。
  - **这一刀已经上线并逐条复验(2026-10-14,`081afb1` = 第三次走完整条 PR→绿→合并→部署流程)**:
    · 部署前先抓了线上首页当"前值":`importmap 1 处 / 内联 5 条 / 16964 字节`;部署后 **`importmap 0` / 内联 4 条(我方 3 + CF 注入 1)/ 15196 字节 / 45 条 prefetch 一字没少** —— 与按三条依据推出的差值完全一致;
    · `/`、`/hill/`、`/healthz` 全 200,`healthz` uptime 240s(确实是本次重启后的新进程);
    · `csp-stage-probe --prod` 仍 `CSP_STAGE_OK`(登记表三页各 1 条内联、全部归位 CF,我方 0 条);
    · **`BASE_URL=https://cloudbear.cloud node scripts/probe/b612-prod-worlds.cjs` 六条断言全绿**:主世界 activeWorld=main → 小地图在场 → 进 B612 → 非主世界小地图隐藏 → **B612 storybook 模型已入景** → **进国王星球 + kingStoryScene 入景**。后两条没三个就用不出来,所以它们就是"摘掉 importmap 后线上 3D 照常"的正面证据(⚠️单靠 boot-cost 证明不了 —— 它只量闸门首屏,而 `three` 早已不在入口图里,这条我差点搞错)。
    · 第 ④ 段仍然按**探针头里写明的那条已知失效**红:`FATAL page.waitForFunction Timeout` 恰好卡在"进国王星球之后、等返回钮"这一步 ⇒ 与"把人放到 (0,0) 就是垫子中心,可能已传回 B612 才去找按钮"的描述同一形态,不是新故障。核对方式是把失败点与头里那段描述对上,而不是直接引用"这是已知旧红"就放行。

- **两条世界切换探针的复活状态**:`b612-prod-worlds.cjs` 自 2026-09-27/09-30 那批剧情闸上线后一直假红,原因全是探针侧没跟上:①石门**按剧情出场**(新档在沙漠里看不到门,现身点只有 `scene3-night` 两处台词)⇒ 探针得用**走过书页一的回访档**;②对白开着时 `portal.js` 刻意不挂「Enter B612」按钮 ⇒ 得先把台词点完;③自动传送是**武装机**(`gateStep` 要先有一帧在 4m 圈外)⇒ 一步瞬移进圈永远不触发;④按钮文案按中文匹配而站点语言跟着浏览器走 ⇒ 钉 `scriptLang`。现在①②③④都处理了,稳定绿到"主世界→B612→国王星(含 storybook / kingStoryScene 入景)"。**仍没修好的一段**:④「星球原点出现返回钮」——把人直接放 (0,0) 就是垫子中心,很可能已经传回 B612 才去找按钮,于是等钮超时;已写在探针文件头,别把它的红当成世界切换坏了。`b612-world-probe.cjs` 有同样的①③④问题,今天没动。
## 2026-10-12 第四轮外部审计(针对 a9ff064 本身)——第一批安全止血 + 第二批稳定发布 全量落地

第四轮审计的 6 条核心论断经回读**全部属实**(前几轮约 1/3 是误报,这一轮没有),12 项清单按"第一批 5 项 + 第二批 3 项 + 第三批 4 项"分层落地;第三批属架构改造,本轮只下第一刀,其余仍挂在 `REFACTOR-PLAN-审计挂账项.md`。

### 第一批:安全止血(规矩变了,后续写码必须照此)
- **白板展品不再能被匿名覆盖(DG-SEC-001,`lib/files-upload.js:236-280`)**:匿名侧新作品名**由服务端签发**(`newWhiteboardName()` + `fs.openSync(...,'wx')` 独占创建,重名自动换名重试),前端必须改用响应里的 `name`/`issued`(`whiteboard.html` 的 `saveAs` 缓存就是这个用途);覆盖只允许"服务端签发给本人"的既有作品(`uploads[name].aid === authVid(req)`)。判定全在打开文件之前 ⇒ 无 Cookie **401**(没表明身份)、他人或 2026-10-12 前的无归属存量 **409**(原文件字节与 aid/mt 一字不变,已用 sha256 钉死)。匿名侧目录一起钉死为 `photos` 的 `whiteboard-*`(此前 `dir=videos|music` 配白板名也能进,是第二个洞)。**后台 token 直传语义一字未改**(自己挑名、允许覆盖)。验收 `src/__tests__/lib-whiteboard-overwrite.test.js`(17)。
- **缩略图继承原图可见性(DG-SEC-003)**:删掉 `canServeMedia` 里 `name.includes('thumbs/') ⇒ return true` 的短路。`thumbs/<主干>.webp` 先经 `mediarules.thumbSourceNames()` 归一回原条目名再判定,**改扩展名的那一跳必须按主干名回查**(按全名找 `.webp` 必然 miss ⇒ 私有照片的缩略图会被判"查无此名"而公开);同名多扩展取**交集**(全拒才拒)。未归一就带 `thumbs/` 进决策表 ⇒ 直接拒(堵第二条绕过原图判定的路)。`req._mediaPublic` 改为**无条件赋值**,不再保留上一请求的布尔值。前端 `scene.js` 的 `tok()` 现按主干名回查 `myUploadTokens`,缩略图 URL 也带得上 `?mt=`。验收 `src/__tests__/lib-thumb-gate.test.js`(14)。
- **公开 API 也吃黑名单与封禁(DG-GATE-001,`server.js:105`)**:59 个端点里 33 个 `auth:'public'`,而 `dispatch()` 一直跑在 `entryGate` 之前 ⇒ **被拉黑 IP / 被踢设备照样能调这些接口**(kick 只赶出画面,没赶出 API)。现 `gate.apiBanGuard(req,res,pathname)` 在 dispatch 之前裁决,被拦 403 + `Cache-Control: no-cache, no-store, must-revalidate`。⚠️四条必须记住的口径:①判据是**纯只读**的(复用 `findVisitorId`→`getApplicant`,不建档、不记访问、不动会话、不落盘),写动作仍只归 `entryGate`(它已折到同一组原语:`isIpBlocked`/`isProfileBanned`/`banDecision`,全仓只此一份拒绝集);②**只放行 `API_BAN_EXEMPT` 那 4 条认领回路**(`POST /api/entry/collect`、`POST /api/entry/reapply`、`GET /api/entry/status`、`GET /api/entry/watch`;`watch` 是 kick 的**唯一即时送达者**——`src/visitor-fp.js:128` 的 EventSource,拦了它就等于管理动作没人看得见);③**`POST /api/entry/rename` 仍是 `auth:'public'`(`lib/routes.js:86`),只是被这道守卫对封禁身份 403**,别把它写成"已改挂后台";④`kickedTime` 单独**不等于**被封:`isProfileBanned` 只在档案 `status` 缺失时才看 `kickedTime`——`approve` 只回写 status 而把 kickedTime/kickReason 留作永久审计线索(retention 也吃它),第一版把它当封禁直接把"批准后恢复放行"打红,别再犯。`/ws` 的 upgrade 在 `multiplayer.upgradeRejectReason` 里查同一原语(自身契约字符串 `origin|no-visitor|blocked-ip|kicked|stale-session` 未变),`/api/media/sse` 现在也吃 API 闸。验收 `src/__tests__/lib-api-ban-guard.test.js`(23)。
- **循环依赖的硬规矩(2026-10-12)**:`lib/admin.js` 顶层 `require('./security')` 会打出 `admin → security → siteconfig → admin` 的环,**函数内延迟 require 断不开**(depcruise 静态扫全部 require,不看位置)。纯谓词 `isLocalRequest` 已下沉到叶子模块 `lib/local-request.js`(连 `LOCAL_HOST_RE` 一起导出——`security.isAllowedOrigin` 也用它,漏了会让回环请求的 Origin 判定静默 false ⇒ WS 全被 'origin' 拒)。`lib/security.js` 原样 re-export,**对外仍写 `security.isLocalRequest`**;后端模块要用它请 require 叶子。no-circular 是 CI 硬闸。
- **`GET/POST /api/mylinks` 强制有效会话 + 双配额(DG-SEC-004,`lib/siteconfig.js` 的 `handleMyLinks` + 常量在 `lib/config.js`)**:三个数都是**源码常量并从模块导出(不是环境变量)**,改口径只改 `lib/config.js` 那一处(`siteconfig` re-export 同一份,`lib-mylinks.test.js` 有断言钉住不许再出现第二个字面量)——`MYLINKS_RATE=20`(每 IP 每分钟,走 `lib/abuse.js` 的 `mylinks` 桶,超限 **429** + `retryAfter`)、`USER_LINKS_PER_PERSON=10`(**按 `l.aid === 本人 vid` 计数**,不再是"单条记录最多 10 项"那种能被"新起一条记录"绕过去的口径,超限 **400**)、`USER_LINKS_MAX=300`(全局硬上限,默认 10→300,⚠️量级主人未拍板,见挂账)。全局上限的判断**必须在 push 与 `saveGateData()` 之前**(超限 **503** + `Retry-After`),否则"拒绝"本身仍在拿整库落盘换洪水;无有效 `vid` Cookie ⇒ **401**(旧实现只靠"Cookie 恰好存在"自证身份)。验收 `src/__tests__/lib-mylinks.test.js`(18)。
  ⚠️**2026-10-13:这三个常量从 `lib/siteconfig.js` 搬进了 `lib/config.js`** —— 后台「展示区 → 访客链接」面板要显示「已用 n / 全局上限 300」的读数(撞上限时访客只拿到一句 503、服务器只有一行 console.warn,主人对「300 够不够」这个决定一直没有数据可看),而 `admin.js` 一旦 `require(./siteconfig)` 就打出 `siteconfig → admin → siteconfig` 的环(`no-circular` 是硬闸,函数内延迟 require 也断不开)。`config.js` 是 env/常量的叶子层,两边都能 require ⇒ 判定、导出、面板读数共用同一份值;后台载荷 `GET /api/admin/list` 新增 `linkCaps: { used, max, perPerson, ratePerMin }`(**additive**,既有字段一字未动),前端只渲染数字且全部 `Number()` 过一遍再进 innerHTML。
- **上传总容量与并发硬闸(DG-SEC-005,`lib/abuse.js:28-34`)**:`DISK_MIN_FREE`(读环境变量 **`DISK_MIN_FREE_BYTES`**,默认 2GB;`DISK_MAX` 那条从"只告警"升为"拒绝匿名上传")、`UPLOAD_MAX_INFLIGHT=4`(进程内在途写盘数,2 核小机实测口径)、未带 Content-Length 的匿名请求按 `SLOT_RESERVE_FALLBACK=8MB` 预约(**没声明就不给匿名体积开空头**)、被拒者**一个字节都不写**、后台 token 一律豁免(主人的归档批量是正当负载)、`statfsSync` 不可用时退化为只跑并发闸 + **一次性告警**(绝不抛异常)、槽位泄漏由 `SLOT_MAX_AGE_MS=5min` 兜底闸回收、目录总量统计带 `MEDIA_STAT_TTL_MS=15s` 缓存(逐文件 stat 太贵)。四条上传路(直传/分片/白板/大屏)全部接线,`releaseUploadSlot` 幂等且 `finish`/`error`/`aborted`/`close`/413/415/预拒各条结束路径都还位。拒绝回 503 + `Retry-After`(`RETRY_AFTER_S=30`),响应不带 stack/路径。验收 `src/__tests__/lib-disk-guard.test.js`(18)。

### 第二批:稳定发布(部署脚本的"静默成功"全部改成响亮失败)
- **`scripts/backend-sync.sh` 现在有退出码契约**(0 一致/已上传并 md5 复核、1 上传或复核出错、3 操作者答 N、**4 非交互且没 `--yes`**、5 `--check` 发现漂移):旧版在 stdin 不是终端时 `exit 0` ⇒ `release.sh` 当作成功继续上传前端,线上跑出"新前端 + 旧后端"(2026-10-11 实测事故)。调用方**必须**按退出码判断,不许再 `|| echo` 吞掉。
- **`scripts/deploy.sh`:后端同步挪到前端上传之前(第 3 步)且失败即中止** —— 新后端跑旧前端是安全的(加接口/收紧权限),反过来新前端会打到没有的接口上。第 4/5 步(dist 上传/解包)失败也点名"线上=新后端 + 旧前端"并退出;第 6 步重启后**从 `pm2 status` 的输出里读 `gallery … online` 这个字段**(读字段而不是"脚本没报错"),没读到就给出 `ssh … 'pm2 logs gallery --lines 50'` 的处置命令并 exit 1;`--no-backend` 不再免检(有漂移 exit 6,要硬闯必须显式加 `--allow-backend-drift`)。新加 `--yes` 透传、`SSH_BIN/SCP_BIN` 注入口(为"不碰生产"的离线演练而加)、`.tmp/deploy-state.env` 状态快照(每步结论 BACKEND/FRONTEND/RESTART/MODELS/VERIFY/DRIFT,任何 exit 前都写全,失败收尾会打印"已发出的部分")。
- **发布收尾的四类结论互不相同(别再只看"脚本没报错")**:`DEPLOY_OK` 要求 后端第 3 步 md5 复核 + 第 6 步 `--check` 复检 + `verify-drift.sh` 逐文件一致 + 线上 http_code/healthz/chunk 三项齐;`DEPLOY_PARTIAL`(后端被你 `--allow-backend-drift` 放行)/`DEPLOY_PARTIAL models`(前后端已上线但模型同步出错)/`DEPLOY_FAILED verify`/`DEPLOY_FAILED drift` 各有自己的退出。第 8b 步是 **`scripts/verify-drift.sh`(新,只读)**:逐文件比本地 `dist/` + 后端与服务器(md5,前端比 gzip/brotli 变体,`.glb` 只比清单;CRLF 两侧都归一),退出码 0 一致 / 1 有漂移 / 2 无法比对(连不上、本地缺 dist、清单为空,**以及"本地 dist 不是当初上传的那一份"** —— 构建不可复现,事后单独重跑必然如此,见下条)——**2 也算失败,状态未知不等于一致**;`--no-drift` 可跳过但会打 `::AUDIT::` 说明"本次没有字节级证据"。
- **`scripts/release.sh` 现在允许"工作树干净"的发布(2026-10-13)**:5/9 原来写死 `[ -n "$STAGED" ] || exit 1`(“没东西可提交就停”),于是**先分层提交、再跑 release.sh 这条最规范的路径必然 RELEASE_FAILED**,只能退回手搓 `bash scripts/deploy.sh --yes` —— 而 deploy.sh 不经过第 7 步的 CI 闸门,等于"越规范的提交习惯反而越没有闸门"(2026-10-12 的发布就是这样被迫绕过,我当时手工读了两个 required check 的 conclusion 才补上这道闸)。现在:无改动可提交时如实打一行并**跳过 commit**,push / CI 闸门 / deploy 一律照常(CI 验的就是 `git rev-parse HEAD`);`.tmp/release-msg.txt` 的前置要求**刻意保留**,它是发布说明书不是"必须有东西可提交"的条件。commit 失败仍走 if/else 而不是 `… && git commit || echo`(`set -e` 下那会把失败吞成"未新建 commit"然后继续发布)。三条路径在临时克隆里实测:干净树 ⇒ 跳过 commit + `Everything up-to-date` + exit 0;有正常改动 ⇒ 照常 commit+push;暂存了含 `secret` 的文件名 ⇒ 防泄漏闸门照旧 exit 1 并 `git reset -q` 回空暂存区(另:`*私钥*` 这类文件名连 `git add` 都进不去,.gitignore 先挡一层)。
- **`scripts/release.sh`:步骤改 1/9…9/9。第 2 步新增**后端漂移预检**(用 `backend-sync.sh --check`,在建构建/提交之前就把话说清:确有差异而 stdin 非交互又没 `--yes` ⇒ 立刻 `RELEASE_FAILED`,不再烧十几分钟构建后卡在部署;预检判不了则继续,由部署阶段硬判定)。`npm run build` 不再写成 `… | tail -5`(`$?` 属于 tail 的同型事故);失败一律打 `RELEASE_FAILED`。`--yes` 透传到 deploy.sh。**CI 闸门逃生门现在必须署名**:`--no-ci=<原因>` 或 `SKIP_CI_GATE=1 NO_CI_REASON='…'`,**没给原因直接拒绝执行**(exit 1,连构建都不跑);每次绕过把 `NO_CI_AUDIT ts/actor/branch/commit/reason` 一行追加到 `.tmp/no-ci-audit.log`(gitignored)并同时打进本次发布日志(stdout 正被 tee,让"看日志的人"和"看台账的人"读到同一句话)。⚠️ 参数解析里**别写 `NO_CI_REASON=""`** 做初始化——那会把环境里传进来的原因清空,于是"给了原因"也判成没给。
- ⚠️**CI 覆盖缺口(2026-10-12 补掉两条,剩一条刻意不补)**:`npm test` 是 5 条脚本,而 `build-and-test` 作业原来只跑 `test-store.js` + `test.js` 两条 ⇒ 绿色的 CI **并不等于**"后端全测过了"。现已补 `test-session.js`(46)与 `test-upload-security.js`(20)(它们只 require lib/*、自己把 `GATE_DATA_FILE` 指到临时目录,零网络零浏览器)。**`test-mobile.js`(6)不补**:它要无头浏览器,而 `build-and-test` 作业不装 Chromium(只有 `smoke` 作业装 playwright-core 的浏览器)⇒ 盲目加进去只会把 CI 打红;它由本地 `npm test`(release.sh 第 3 步)与 `smoke` 作业分别覆盖。`npm audit` 那步故意 `|| echo`(只报告不阻断)——它是报表不是门禁。
  - **2026-10-13 再补一条阻塞闸门:`Backend deploy manifest guard`**(`node scripts/admin/check-backend-manifest.cjs`)。理由是那天下面"发布阻断级缺陷"那条:守卫虽然已接进 `backend-sync.sh` 与 `verify-drift.sh`,但那**两条只有人手工跑部署时才会执行** —— 漏传可以在主线上躺好几天无人知晓。CI 这一条把同一个判定提前到每个 PR/每次 push,且它不新增 job(作业仍叫 `build-and-test`,**分支保护的 required context 名一字没变**,不会把保护打成 pending)。它依赖的 dependency-cruiser 已由 `npm ci` 装好,与上面那道 `npm run depcruise` 同源同解析器。
  - 同日修 `deploy.sh` 第 5 步清理残留的一处噪音缺陷:候选集原本用 `ls -1 assets`,**目录名也进了差集** ⇒ 每次部署对 `assets/icons`、`assets/textures`、`assets/wise_zzz` 各报一条 `rm: cannot remove …: Is a directory`(既不删也不中止,`xargs rm -f` 的失败不回流)。噪音的真正代价是真残留被埋掉;现改 `find assets -maxdepth 1 -type f -printf '%f\n'` ——**目录一律不参与清理**,离线沙盒实测:三个子目录与其内容原样保留、真残留文件仍被删除、零 stderr。
- **部署私钥的明文回退路径已删除(DG-CRED-001,2026-10-12)**:`deploy.sh` / `backend-sync.sh` / `verify-drift.sh` 原先都有第三条兜底——从桌面 `梦幻画廊-交接笔记.md` 里 `awk '/BEGIN/,/END/'` 抽出**明文 SSH 私钥**写到 `/tmp/gk.pem`(`chmod 600` + `trap` 删除,但脚本崩溃就留在世界可读目录里,而且源头本身就是把私钥明文存进 markdown)。现在私钥**只**接受两个受控来源:`SSH_KEY`/`GIT_SSH_COMMAND` 的 `-i` → `~/.ssh/gk-deploy.pem`;两个都拿不到 ⇒ `deploy.sh`/`backend-sync.sh` **exit 1**、`verify-drift.sh` **exit 2**(状态未知不等于可比对),并打印两条恢复办法(设 `SSH_KEY`,或把耐久私钥放回 `~/.ssh/gk-deploy.pem`)。连带删掉 `HANDOVER_NOTE` 变量、`KEY_OWNED`/`OWN_KEY` 记账与 `cleanup_key()`(已无常备临时文件可删)。**桌面那份交接笔记我没有动**(删文件不是这个改动的范围,内容由主人自己决定)。实测四条路径:受控私钥在 ⇒ `--check` exit 0;`HOME` 指到空目录 ⇒ 三个脚本分别 1/1/2 且 `/tmp/gk*.pem` 一个都没生成。
- ⚠️**离线演练的做法与结论(下次改部署脚本照此做)**:`SSH_BIN/SCP_BIN` 指到 `.tmp/stub/ssh|scp`(脚本直接 `exit 0`,返回空 md5 ⇒ 天然"全部有差异"),`SSH_KEY` 指到假文件避免去动真私钥。实测:非交互无 `--yes` → exit 4 且**从未走到 dist 上传**、`--yes` 但复核不过 → exit 1、`--no-backend` 有漂移 → exit 6、`--no-backend --allow-backend-drift` 走到底并打 `DEPLOY_PARTIAL`、`--check` → exit 5、`--dry` → exit 0。**没有这层注入口,这类路径只能靠往生产机器打一遍才能验证。**
- **分支保护(2026-10-12 已配置)**:required status checks = **`build-and-test`**、**`smoke`**,`strict=true`;`allow_force_pushes=false`、`allow_deletions=false`;**`enforce_admins=false`(这是实测后的刻意选择)**;未开 `required_pull_request_reviews`(主人单人项目,直推 main 是既有工作流)。
  ⚠️**`enforce_admins=true` 会把发布通道打死**:打开它之后 `git push origin main` 被 `remote rejected … (protected branch hook declined)` + `2 of 2 required status checks are expected` 拒掉——required checks 对"尚未跑过检查的新 commit 的直接 push"是死锁(检查只能在 push 之后跑)。当时正是靠这条实测发现才没有把坏配置留下来(改回 `false` 后同一 push 立刻成功)。
  ⇒ 所以"CI 必须通过"这件事现在由**两处**把关:①分支保护管住**合并进 main 的 PR**;②`release.sh` 的 CI 闸门管住**直推之后要部署的那个 commit**(fail-closed:红/取不到/离线一律不部署,2026-10-11 起)。要让保护也管住主人自己的直推,得把发布流程改成分支→PR→合并三步(**挂待拍板,别顺手改**:这会动到他的日常操作)。
- **发布流程 2026-10-14 改为「分支 → PR → 绿 → 合并 → 才部署」(主人拍板"合并"),上面那条 `enforce_admins=false` 的取舍已被这条取代**:
  - `release.sh` 不再 `git push origin main`。新顺序:把本次内容(未推送提交 + 工作树改动)放到 `rel/<时间戳>` 分支、**本地 main 指回 origin/main**(提交全在 rel 分支上,一个不丢)→ push 分支 → `gh pr create` → **轮询 required checks 全绿**(`gh pr view --json statusCheckRollup` 交给 `scripts/admin/checks-verdict.cjs` 折成 PASS/PENDING/FAIL,required contexts **由 `scripts/admin/required-contexts.cjs` 从 legacy 保护 + ruleset 两个来源取并集动态读**,见下面那条"闸门现在真正住在 ruleset")→ `gh pr merge --merge --delete-branch` ⇒ 红的项目根本不进 main。轮询只读**字段**,绝不信 `gh pr checks --watch` 的退出码(断网也返回 0,同型事故本仓记过好几次)。
  - 合并后有一道**树哈希核对**:`git rev-parse <PRhead>^{tree}` 必须等于 `git rev-parse <mergeCommit>^{tree}`,不一致就停下(说明合并窗口里 main 被别人推进了,"CI 绿的那份"不等于"要部署的那份")。核对通过才本地快进 main、跑 deploy.sh。
  - 逃生门 `--no-ci=<原因>` 现在的作用是**用 `--admin` 强合(无视检查结论)**,仍然必须署名并进 `.tmp/no-ci-audit.log`;`--no-deploy` 只合不发(给只改脚本/文档的提交用,不必为此重启线上);工作树干净且 main 与远端一致时**不再乱开 PR**,直接提示改用 `deploy.sh`(取代 2026-10-13 那条"干净树也照发"的补丁)。
  - ⚠️演练手法(改发布脚本必走这条路,别拿生产验):`.tmp/rehearse-release.sh` 用 `git clone --bare` 造一个假 GitHub、`GH_BIN/npm/npx` 与 `scripts/{deploy,backend-sync,verify-drift}.sh` 全换成替身,**测的是工作树里那份未提交的新脚本**(clone 出来的是 HEAD 上的旧版,演练等于没验——第一次就踩中了;新加的 `checks-verdict.cjs` 同理要手工带过去)。三场景实测:正常发布(合并、远端 rel/* 已删、本地 main==远端)、checks 红(`FAIL build-and-test=非SUCCESS` 点名后不部署、远端 main 一字未动)、无新内容(拒绝开 PR)。**替身必须比被测代码严格**:它一开始对 `pr create --json` 和 `--auto` 都照单全收,于是这两处只有真实运行才炸得出来。**演练与真实运行合起来抓到四个 bug**:① `head - 60` 写成带空格(变成从文件读);② 切分支后没更新 `CUR` ⇒ push 的是旧 main("Everything up-to-date")、PR 的 `--head` 也指向旧内容 —— 这个最阴险,整条流水线会"绿着"验证错东西;③ 本机 `gh 2.96` 的 `pr create` **没有 `--json`** ⇒ 改成从它默认输出的 URL 取编号;④ 本仓没开 `enablePullRequestAutoMerge` ⇒ `gh pr merge --auto` 直接 GraphQL 报错,改成"自己按字段轮询 required checks 再 `--merge`"(顺带也不再依赖那个仓库级开关)。另外**同一 rel 分支上已有 PR 时**要复用(`pr create` 会失败,不是事故):上次发布中途失败后接着跑就是这形状。
  - **闸门现在真正住在 ruleset(2026-10-14),不是 `enforce_admins`**:上面那条"enforce_admins=true 会打死发布"已经过时了两层 —— ①通道换成 PR 合并后死锁本身没了;②更关键的是**仓库里只要存在任何 ruleset,legacy 分支保护的写接口就一律 404**(`PUT …/protection/enforce_admins`、`PUT …/required_status_checks` 都是,而 `GET …/protection` 仍返回一个派生视图),所以闸门只能改 ruleset。实建的是 `release-gate…`(id **25039505**,target `refs/heads/main`,enforcement active):`pull_request`(0 人审批,单人项目够用) + `required_status_checks`(**strict**、`build-and-test`/`smoke` 带 `integration_id:15368`) + `non_fast_forward` + `deletion`;`bypass_actors` 只给 RepositoryRole 5(admin)且 **`bypass_mode:"pull_request"`** ⇒ GitHub 自己回 `current_user_can_bypass: pull_requests_only`:**直推 main 绕不过去**,而 `--no-ci` 那条 `gh pr merge --admin` 的署名逃生门仍然能用(绕的是"检查必须绿",不是"必须走 PR")。
    - ⚠️ruleset 写接口的键名(全是 422 一条条 probe 出来的,别猜):`rules` **必须是数组形式**(对象形式报 `is not of type array`);状态检查的参数叫 `strict_required_status_checks_policy`(不是 `strict`);PR 规则的叫 `required_review_thread_resolution`(不是 `require_thread_resolution`);**POST 会默认塞 `require_extra_approval_for_unattributed_changes: true`**,不显式 PUT 成 false 就可能给"归属不明"的改动多加一道审批(单人项目 = 自己批不了 ⇒ 锁死)。
    - 核对闸门真效的三条查询(都比"看 UI"可靠):`gh api …/rules/branches/main --jq '.[]|.type'`(这条分支实际生效的规则)、`gh api …/rulesets/<id> --jq .current_user_can_bypass`、`…--jq .bypass_actors`。**解锁通道**:`gh api -X DELETE …/rulesets/25039505` 用的还是同一个 token,写口实测可用 ⇒ 万一闸门把自己锁死,一条 DELETE 就能解开(legacy 那边现在写不了,所以别指望回退旧规则)。
    - 那条 include 为空、只带 `required_linear_history` 的旧 ruleset(id 24877688,名字就叫 `1`)**谁都不管** —— 依据是它存在期间 `rules/branches/main` 返回 `[]`,而且 PR 的 merge commit 照样合得进去。**别把它读成"main 要求线性历史"**;本轮没动它(它不挡路,而删别人的东西要先问)。
    - 由此带来的新纪律:`release.sh` 判"该跑哪些 check"**同时读 legacy 与 ruleset 取并集**(`scripts/admin/required-contexts.cjs`,exit 2 = 判不了就停下,和 `check-backend-manifest.cjs` 同一 fail-closed 口径)。只读 legacy 的话,以后往 ruleset 里加一条 required check,脚本会拿着旧名单**绿着放行新出现的红** —— 演练场景 D 就是专门验这条的。
    - **两面都实测过了**(2026-10-14,不是推理):①管理员直推 main ⇒ `remote: error: GH013 … - Changes must be made through a pull request. - 2 of 2 required status checks are expected`,push 以 exit 1 被拒、远端 main 一字未动;②同一 ruleset 生效下 **PR #15 照常合并**(required checks 全绿 → merge commit `416c953` → 树哈希一致 → `--no-deploy` 不碰线上)。⇒ "红的项目进不了 main" 从此是机器不许,不是我自觉;`--no-ci` 的署名逃生门仍然有对象(它绕的是"检查必须绿",绕不开"必须走 PR")。
- **required context 名的核对方法**:`gh api repos/<owner>/<repo>/commits/<sha>/check-runs --jq '.check_runs[].name'` 打出来就是 `build-and-test` / `smoke`(Actions 的 check-run name = **job id**,与工作流文件里的 `name: CI` 无关——照抄那个名字会让保护永远处于 pending)。工作流 `on.pull_request` 无路径过滤、无 `concurrency` 取消,所以"绿了"不会被静默撤回。
- ⚠️**本项目构建不可复现(2026-10-12 实测,影响一切"逐文件比字节"的核对)**:同一棵工作树连续两次 `npm run build`,`dist/assets` 里 **79 个 chunk 文件名会全部改变**(内容哈希掺了每次构建都变的量;`vite.config.js` 的 `buildStamp()` 只读 git 版本号/短哈希/提交日期,不是它的来源)。⇒ 三条后果:
  ①**`verify-drift.sh` 的前端半边只在 `deploy.sh` 第 8b 步(比的就是它刚上传的那一份 dist)有效**;事后单独重跑必然一堆「服务器缺文件」假红。现按"线上自洽性"分辨真伪:线上 `index.html` 引用的资源都取得到 ⇒ **exit 2「无法判定(本地 dist 不是当初那份构建)」**(既不算通过也不算半成品);取不到 ⇒ 才是真·半成品 exit 1。事后核对请用 `--backend-only`(后端可复现:比的是 `server.js` + `lib/*.js` + `mediarules.mjs`)。
  ②**"线上到底是哪一次"要靠构建里嵌的版本戳**:2026-10-12 就是这样收尾确认的 —— 服务器上 `assets/entrygate-*.js` 里 grep 到短哈希 `1b18e2c`,与本次部署 commit 一致。**看文件 mtime 不算证据**(tar 解包保留时间戳,且 index.html 的 mtime 只说明它被写过)。
  ③**不可变发布(R6)不能做成"重新构建再比对"**,必须做成"构建一次 → 产物落进 `releases/<sha>/` → 只切 `current` 符号链"(见 `scripts/release-symlink-plan.md`);否则每次切换都在换一批字节,漂移检查永远没有基准。
- ⚠️**仍未做**:不可变发布(`current` → `releases/<sha>` 符号链 + 零停机滚动切换,现方案是覆盖写 + 一次重启)、CSP `script-src` 收紧(nonce/hash,需先拆掉内联脚本)、视频内容审核(需新依赖)、身份/会话/指纹三层分离 —— 全部在 `REFACTOR-PLAN-审计挂账项.md`。(SQLite 按业务表拆分与统一 UploadService 已于 2026-10-12 深夜各下两刀,见"第三批落地"节;R1 只到"影子双写",**读路径还没切**。)

### 第三批:本轮只下的首刀
- `lib/siteconfig.js` 的 `gateData.uploads` 相关判定归一(缩略图/归属/mylinks 三条都在它上面),`canServeMedia` 的输入必须"先归一再裁决"。身份/会话/风险指纹分离的下一步(`authVersion` 永久吊销与过期自愈已于 2026-10-11 落地)记为 R3。**R1/R2 的落地与边界规矩见下面"第三批落地"一节。**
- ⚠️**清单第 12 项里的"CSP 收紧 / 内容审核 / 资产性能"本轮没有动**(2026-10-12 如实登记,别让 `[x]` 看起来已做完):
  ①**CSP** 线上实测仍是 `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://static.cloudflareinsights.com`(`lib/security.js` 的 `scriptSrc` 组装)—— 收 nonce/hash 要先拆掉全站内联脚本(前后端契约同改),挂 **R7**。(2026-10-14 更新:第一阶段已按上面"H 第一阶段落地"那条动手 —— 手段改成**按页摘 `unsafe-inline` + 只发 Report-Only**,全局那条一字未动;发布后用 `node scripts/probe/csp-stage-probe.cjs --prod` 复核线上响应头与违规计数。)
  ②**视频审核**零进展(需新依赖,ffmpeg 抽帧 + 视觉模型的成本要先拍板),挂 **R4**;现在仍是"图片过 NSFW、视频不过"。
  ③**资产性能:2026-10-12 实测后修掉两处真浪费(首访约 2MB)**,并且**纠正了一次自己的误读**:
    先用 Resource-Timing 得出"9 个 URL 重复、浪费 385KB",拿 CDP 的 `Network.loadingFinished.encodedDataLength`
    复核才发现**这条判据不可信**——① `initiatorType:'link'` 同时覆盖 Vite 自己发的 `modulepreload` 与我们注入的
    `prefetch`,分不清是谁;② 同一 URL 出两条 entry 是正常的(先被 `import()` 触发、后被 preload 声明命中缓存),
    命中缓存那条 `transferSize=0`。⇒ **判"是否真重复下载"只能看实际入网字节(CDP),不能看条数**。
    重测之后线上仍然确有 7 个 URL 二次入网(合计浪费 2016KB),两个根因各自独立:
    - **`00001.m4a` 白下 1.6MB**:协议面板配乐 2026-10-03 就被剧情音乐取代,但 `src/ui/agreement-music.js`
      顶层仍 `new Audio(cdn…/00001.m4a)`,而本模块被 `main.js` 顶层 import ⇒ 首访立刻下载,全仓又**零个**
      `startAgreementMusic()` 调用点,于是每次都是下一半再被浏览器 abort(debug-browser 里那条
      `REQ_FAIL … ERR_ABORTED` 就是它)。现改**惰性创建**(不起播就一个字节都不下),实测该 URL 请求数 0。
    - **prefetch 与模块请求缓存键分裂**:`vite.config.js` 注入的 43 条 `<link rel="prefetch" as="script">`
      没带 `crossorigin` ⇒ 预取走 no-cors,而 chunk 稍后是被 `import()` 以 CORS 模式取的;本站静态响应又带
      `Vary: Origin`,两者永远互不命中 ⇒ **同一份 chunk 下两遍**(线上 gzip 后 three 231KB×2、main 126KB×2)。
      本地起一台"像线上一样发 `Vary: Origin`"的静态服(`.tmp/vary-serve.mjs` 手法)复现并 A/B:
      改前 5 个 chunk 二次入网、首访总入网 2855KB(未压缩)、浪费 1224KB;加 `crossorigin` 后
      **0 个重复、总入网 1632KB**(-43%)。
    - **防回退**:该不变量写成**构建期硬失败**(计数直接读产物 `dist/index.html`)。⚠️ 第一版把 `throw`
      写在插件的 try 里,被它自己"注入失败不阻断构建"的 catch 吞成一行 WARN ⇒ 构建照绿,等于造了个
      新的"恒开告警 = 没有告警";挪到 try/catch **外面**后实测:删掉 `crossorigin` → `npm run build` exit 1。
      两类失败性质不同,别一并降级:解析不到 manifest/模块清单 = 环境性可继续;自己模板写错 = 必红。
    ⚠️ 这两处都是**纯前端/构建期**改动,不发 deploy 就不上线;本地 `test-mobile` 6/6 零未捕获异常。
    守门探针:**`node scripts/probe/boot-cost-probe.cjs`**(需先 `npm run build`)。它把 `dist/` 铺进临时
    沙箱、用**本仓自己的** `server.js`+`lib/files-static.js` 起服(只有这条路径会发 `Vary: Origin`,
    `vite preview` 不发 ⇒ 用它测等于没测),用 CDP `Network.loadingFinished.encodedDataLength` 判"真重复下载",
    并屏蔽 SW(否则缓存命中会把重复洗成 0 字节)。阈值:`prefetch` 必须 100% 带 crossorigin、GET 资源
    重复字节容差 **0**、首屏总入网 ≤2600KB、单资源 ≤900KB、零 pageerror。**正反都验过**:修复后 697KB/0 重复
    通过;手工把产物里的 `crossorigin` 抹掉 ⇒ 当场报"6 个真重复、浪费 369KB"退出 1(与线上实测 378KB 同量级)。
    ⚠️ 只数 GET:同一 URL 的多次 POST 是常态(台词预煮切 batch 打 `/api/tts/batch`),混进来天天假红。
    仍**未做**:CSP nonce(R7)、视频审核(R4)、以及"到底还该预取哪些 chunk"的进一步收紧(43 条预取
    在移动晚高峰会与模型/台词抢同一条 CDN 连接池,是当初为"电影期不挡首屏"才选 prefetch 的取舍)。

### 第三批落地(2026-10-12 深夜):R2 上传流水线抽取 + R1 热表影子双写 + 一条发布阻断级缺陷
- **R2 `lib/upload/`(新,8 个模块)**:`magic`(扩展名白名单 + 各入口上限 + 拒答文案,单一出处)、`names`(服务端签发名 / 白板归属与覆盖闸门 / `openWriteTarget` 独占创建)、`quota`(`reserveUploadSlot` 四种 slotKind + 503/`Retry-After` 出口)、`stream`(**四件套唯一实现**:Content-Length 预检 / 流式计数 / 超限 destroy / 失败 unlink,直传·分片·白板·大屏四条入口共用)、`chunks`(暂存账本 + 24h 残片 GC + 末片流式合并)、`moderate`(NSFW 三态 + 送样降采样)、`transcode`(后台压缩队列 + 不覆盖式改名)、`publish`(落名后的公共尾巴:归属 → 反刷 → 响应 → 广播/镜像/压缩/SSE)。`lib/files-upload.js` **913 → 397 行**,只剩"读参数 → 调模块 → 按结论回响应"。
  ⚠️**边界规矩**:`lib/upload/*` 绝不 `require` 编排层(`lib/files-upload.js`)——R2 镜像必须用调用方注入的 `r2Mirror` 参数(`bigscreen.js` 同样注入),否则 `no-circular` 硬闸立刻红。`lib/files-upload.js` 的**导出面一字未动**(chunk 常量、`sweepStaleChunks`/`startChunkGc`、`moderateImage`/`imgB64Sample`/`nsfwEnabled`、`newWhiteboardName` 全部原样转出),`lib/vision.js` 与两个既有测试仍是 `require('./files-upload')` 的消费者,别把它们当"没人用的旧接口"删。
  ⚠️**搬动时刻意保下的两处差异**(纯抽取的边界,别再"顺手统一"):① **分片应急通道不进压缩队列** —— `publishAnonUpload(…, { compress:false })`;改造前那条路有意跳过 ffmpeg(它存在的理由就是"边缘→源站只有 12-40KB/s 的晚高峰",2 核源站排队转码会拖慢正在服务的其它请求)。**副作用登记为已知不一致**:走分片上传的 `.mov` 因此不会被规范化成 `.mp4`,慢网速用户传的 iPhone 视频可能放不出来(2026-10-13 主人已拍板用"空闲补转"闭环,见下面那条;实时队列仍然不放进去 —— 别把它当成"已统一"再往上传路径里塞 ffmpeg)。② 违规拒传时删文件由 `unlinkSync` 统一成异步 `fs.unlink` + 容忍 `ENOENT`(只改"文件从磁盘消失的时刻",不改任何对外结论;分片那条原本的同步删有 `dropChunks` 兜底,不构成孤儿)。验收:`src/__tests__/lib-upload-modules.test.js`、`lib-upload-overwrite.test.js`、`lib-vision-guard.test.js`、`scripts/probe/chunk-upload-probe.js`(11/11)、`api-ban-upload-probe.cjs`(22)。
- **分片视频"空闲补转"(2026-10-13,主人拍板的第三条路)**:上面那条"已知不一致"的闭环 —— **不改上传当场的行为**(实时队列仍然不收分片视频),而是由 `lib/files-upload.js` 的 `sweepVideoNormalize()` 在**启动 + 每小时**扫一轮 `videos/` 根,把该归一容器投进同一个单工位队列(`nice -n 19`,串行)。判据三条都写在 `lib/upload/transcode.js` 的 `needsNormalize` / `pickPending` / `queuePending`(纯函数,单测直接喂形状):
  ①**只吃 `gateData.uploads` 里有归属记录的名字** ⇒ 主人手工 scp 到 `videos/` 的归档视频**绝不会被顺手改名**(改名 = 搬走归属 + PUT 一个新 R2 对象,是不可逆的对外动作);
  ②目标盘剩余低于 DG-SEC-005 的水位、**或水位根本取不到**(`statfsSync` 不可用 / 目录读不到)⇒ 整批不捡 —— 转码要写临时文件,判不了就不动别人的文件(`skipped:'lowdisk'|'nostats'|'nodir'` 三种原因分开返回);
  ③每轮限量(默认 3,`VID_NORMALIZE_MAX` 可调),历史存量靠每小时一轮收敛,不一次把队列灌满几十个大文件。
  扩展名白名单**刻意不含 `.mp4` 与 `.webm`**:两者现代浏览器都能播,补转它们只省磁盘、不修可用性;而"回头重编码历史大 mp4"(直传通道对 >20MB 的 mp4 是会重编码的)属于把新策略追加到存量文件上,不在这一刀里。幂等:转成功 → 名字变 `<主干>.mp4` 且归属随迁 ⇒ 下轮不再命中。
  接线在 **`server.js`**(listen 里 `startVideoNormalize()`,与分片 GC 不同**不在模块加载时自启** —— 否则每个 require 到 files-upload 的单测都会起 ffmpeg);`beginShutdown()` 里 `stopVideoNormalize()`。
  ⚠️**顺带给压缩队列补了入队去重**(补转的必然配套):`compressJob(dir,name,mirror)` 现在返回布尔 —— 同一个 `(dir,name)` 已在队列里或**正在飞**就返回 `false` 不再重排。没有这条,每小时一轮会把一个还没转完的 700MB 视频反复投进队列,在 2 核机上白烧几十分钟(文件本身不会坏:后到的那件改名时 `linkSync` 撞 EEXIST 会放弃改名)。`queuePending` 按 `enqueue` 的返回值统计 `enqueued`,日志不虚报捡了几个。
  验收 `src/__tests__/lib-upload-modules.test.js` 的 ⑤ 段与去重用例(容器判定、归属挑选、限量、三种不捡、sweep 串联、start/stop 幂等、队列拿到不存在的名字也不炸、入队去重)。
- **R1 热表结构化(第 1、2 步)**:`lib/migrate.js`(版本化迁移器:单向前进、只准 `CREATE … IF NOT EXISTS`、禁止破坏性 ALTER、`schema_version` 记账、**改一个已经跑过的迁移 = 拒绝执行并点名**)→ `lib/migrations/001_hot_tables.sql`(`chat_messages`/`click_events`/`client_errors`/`visits` 四张真表 + 时间戳索引)→ `lib/repo/*`(叶子 DAO)→ `lib/shadow.js`(**只写不读**的镜像层:既有写入点旁边多落一行;三条硬要求 = 绝不抛异常、绝不改变响应码/响应体、绝不让请求路径慢到可感知)。接线点 `lib/chat.js`(发言 + 机器人回帖)、`lib/track.js`(一批 = 一次多行 insert;后台"清空点击记录"数组与表**一起清**)、`lib/client-errors.js`(UPSERT 覆盖 + 主动把数组交给影子层,不让 shadow 反向 require)、`lib/store.js`(`recordVisit`)、`server.js` 的 listen(shadow.start 先于 startRetention)。
  ⚠️**两道总闸**:`SHADOW_WRITE=0`(整体停用:不建表、不写、不回填、不清表)与 `USE_SQLITE=0`/better-sqlite3 缺失/句柄已关 ⇒ 自动停用。**保留期与隐私不变量 DG-PRIV-001 现在两边同吃**:`lib/retention.js` 的 `sweepHotTables` 用同一张 `RETENTION_DAYS` 表、同一批 cutoff,`RETENTION_DISABLED=1` 把数组侧和表侧**一起**闸住,而表侧 DELETE 不额外触发 `saveGateData()`(全库快照每轮仍只一次)。
  ⚠️**读路径一条没动 ⇒ 切读还没发生**,判据是 `node scripts/admin/table-parity.cjs`(退出码 **0 一致 / 1 有差异 / 2 无法比对**;`USE_SQLITE=0`、库读不到、影子表还没建都算 2,不算通过)连续跑绿之后再谈。验收 `src/__tests__/lib-hot-tables.test.js`(34)。
  **切读证据窗的台账(每天在服务器上跑一次,连绿 7 天才动读路径)** —— 起算 **2026-10-13**,跑法:
  `ssh -i ~/.ssh/gk-deploy.pem root@101.133.235.110 "cd /opt/gallery && node scripts/admin/table-parity.cjs; echo EXIT=\$?"`
  | 日期 | 退出码 | 备注 |
  |---|---|---|
  | 2026-10-13 | 0 | 形状回环修好后的第一次;`visits 源 1003 / 表 1034`(表只受保留期约束,判 0 不判错) |
  | 2026-10-14 | 0 | 第二次(在 `2739e3b` 后端上线后跑)+ **同日第三次(`e39e480` 的 CSP 发布之后再跑,仍 0)**;若干条"表多出行"仍是保留期内的历史行,按设计不判失败。**同日重跑不加天数** —— 这张表按"每天一次"计,明天(10-15)那次才算第 3 天 |
  | 2026-10-15 | 0 | **第 3 天**。`结果: 一致(退出码 0)`,末尾仍有一批"表多出行"(vid 与时间戳都是保留期内的历史行 / 读到的那一瞬在途写入),按设计不判失败。距"连续 7 天"还差 4 天 |
  往后每跑一天就在此表加一行;**中间出现 1 或 2 则天数归零重计**(那说明影子写又漏了形状或有新写入点没接线)。
- 🔴**发布阻断级缺陷(本轮自己造出来的,已修 + 已上守卫)**:`backend-sync.sh` 的后端清单原本是 `FILES=$(echo server.js lib/*.js …)`,而 **glob 不递归** —— R1/R2 拆出的 `lib/repo/*`(5)、`lib/upload/*`(8)、`lib/migrations/*.sql`(1)共 **14 个文件一个都不会被上传**。照那份清单发布:线上 `server.js → lib/store → lib/shadow → lib/repo/chat` 直接 `Cannot find module`,pm2 反复重启 = **全站 502**;而 md5 差集、上传、复核会**全部绿灯**,因为清单从没往那些子目录看一眼。这是"静默的成功比响亮的失败危险得多"的第 N 个实例,且这次由重构本身引入。
  - 修法:清单收成唯一出处 **`scripts/backend-files.sh`**(`backend_files()` = server.js + `find lib -type f \( -name '*.js' -o -mjs -o -cjs -o -sql \)` + `src/shared/mediarules.mjs`),`backend-sync.sh` 与 `verify-drift.sh` **共用**它(以前后者也写死 `lib/*.js`,于是"线上根本没有这些模块"会被复核报成一致)。清单条目 **37 → 52**(51 个后端源码 + 唯一被点名带上服务器的只读对账脚本 `scripts/admin/table-parity.cjs` —— 它按 `__dirname/../..` 解析仓库根,不在 `<根>/scripts/admin/` 就跑不起来,而"能不能切读"必须在有那块盘的盒子上判定)。扩展名是**写死的白名单**而不用 `find lib -type f`:将来 `lib/` 里落出 `.db`/`.json`/`.env` 之类不该进 web root 的文件时,默认不跟着传。公网侧 `lib/security.js` 的 `staticDenied()` 按**首个路径段**放行/拒绝(`lib` 与 `scripts` 都在拒绝集里,`*.cjs` 后缀再挡一次),所以新建子目录不构成新暴露。
  - 守卫:**`node scripts/admin/check-backend-manifest.cjs`** 把「真实依赖 ⊆ 部署清单」做成机器判定,判据取 **depcruise 解析出的依赖图**(与 `npm run deps` 同一解析器,不是人记的目录名、也不是自写正则)。三件事各自点名并 exit 1:依赖可达但不在清单、`lib/migrations/*.sql` 不在清单(迁移靠 `readdirSync` 发现,**不在依赖图上**,所以要单条规则)、清单里有本地不存在的文件(`tar -T` 会当场失败)。已接进 `backend-sync.sh`(碰服务器**之前**)和 `verify-drift.sh`(exit 2,清单不可信就没有可比的对象)。正反都验过:修好的清单 ⇒ `✅ 从 server.js 可达 50 个,清单 52 个` exit 0;临时把函数体换回 `ls lib/*.js` ⇒ exit 1 并列出那 13 + 1 个文件。
  - ⚠️**守卫自己的第一版也是假绿的**(比漏传更值得记住):用正则扫源码 ⇒ 把 `lib/aiusage.js:109` **注释里**的 `require('./lib/aiusage')` 当依赖,又因 `path.resolve` 传参写错 ⇒ 解析全军覆没,程序打印了 `✅ 后端清单覆盖真实依赖(可达 1 个…)` 然后 exit 0。现在的三条自愈:① 解析交给 depcruise;② 模块数低于 `MIN_MODULES=10` 直接判"图不可信" exit 2;③ 任何解析不出的相对说明符 = **exit 1 而不是信息**(以前是 `console.warn` 放行)。**写判定器时,"我什么都没找到"永远不许当成"没有问题"。**
  - 离线演练(不碰生产)已做实:`SRV` 指到临时目录、`git archive HEAD` 铺一份"线上现在的样子"、`SSH_BIN/SCP_BIN` 指到 stub。结论:`--yes` ⇒ `✅ 37 个后端文件已上传,md5 一致` exit 0,临时目录里 `lib/repo`(5)+`lib/upload`(8)+`lib/migrations/001_hot_tables.sql` 与 `scripts/admin/table-parity.cjs` 全部到位;再跑 `--check` ⇒ exit 0 一致;往 `lib/repo/chat.js` 注入一行 ⇒ `--check` **exit 5**、`verify-drift --backend-only` **exit 1**(OK 51 DRIFT 1 TOTAL 52),还原后 **OK 52 DRIFT 0 TOTAL 52** exit 0。


- ⚠️**R1 上线后第一次用真数据对账就是红的(2026-10-13,线上 177 行),而且不是"行丢了"**:`click_events` 73/73、`client_errors(gate)` 129/129、`client_errors(file)` 237/237 —— **两侧行数完全相等**,差的是"同一行的两种写法":
  - `view_mode TEXT` 列收到 JS number:better-sqlite3 不开 safeIntegers 时把 JS number 按 **double** 绑定,SQLite 的 TEXT 亲和把 REAL 渲染成 **`'0.0'`** 而不是 `'0'`(file 信道 158 行全部撞上,源里 `viewMode` 是 `|| 0` 出来的数字)。
  - `brand` 这一列**源里既可能是字符串也可能是 UA 解析出的对象**:写入 `textCol(对象)` 存成 JSON 文本,读回是裸字符串 ⇒ 对账不等(gate 8 / clicks 11)。更要命的是判据自己也有窟窿:脚本当时用 `normText` 归一,而 `String(对象)` 恒等于 `'[object Object]'` ⇒ **两个完全不同的品牌会被判成相等**。这类"看起来在比、其实没比"比报错更危险。
  - 修法三条,都写在边界上,不碰数据也不碰 DDL:① 写入侧 `view_mode: textCol(...)`(新行直接存 `'0'`);② 读回侧新增 `lib/repo/_db.js` 的 `maybeParseJson`(文本看着像 JSON 对象/数组就 parse 回对象,解析失败原样给字符串)与 `numText`(`'0.0'` → 0),**历史行一条不删、列类型一字不改**(001 迁移已在线上应用过,改它一个字就会被校验和闸门拒绝 —— 纪律③),归一放在"写出去 / 读回来"这对映射上,将来切读时调用点拿到的类型也和老数组一致;③ 对账脚本对对象域改用 `normAny`(键排序后的 JSON 签名),不再 `String()`。
  - 验收:测试文件加 ⑧ 段 4 条,**按线上真实形状写**(数字 viewMode 落 TEXT 列、`'0.0'` 遗留行、对象 brand 与字符串 brand 并存、clicks 的 brand/pos/fp 回环)。**教训:本地 34 条全绿不代表影子写保真 —— 测这类"镜像"必须把畸形形状放进去(数字进 TEXT 列、同一列两种类型、对象字段),只用最顺的那一种数据写测试,等于没测。**


### 已上线并复验(2026-10-13 00:40,commit `78644ae`)
- 本地门禁:`npm test` **4/108/46/20/6 全过** / `npx vitest run` **924 项 81 文件** / `eslint` 0 / `depcruise` 0(374 模块) / `tsc --noEmit` 0 / checkJs **422 = 基线** / `npm run build` 通过 / 后端清单自检 0。
- 发布:`DEPLOY_OK 9e15820`(后端第 3 步 37 个文件 md5 一致 → 前端 → 重启读 `pm2 status` 的 `gallery … online` → 8b 逐文件 **OK 188 DRIFT 0**)。R1 对账修好后只补发后端:`✅ 4 个后端文件已上传,md5 一致` + `✅ gallery 已重启,pm2 报告 online`,`verify-drift --backend-only` **OK 52 DRIFT 0 TOTAL 52**。两次之间前端源码只差一个测试文件(`git diff --name-only 9e15820 78644ae -- src public *.html vite.config.js` 只列出 `src/__tests__/…`,不进构建),所以线上 dist 与 `78644ae` 等价。
- 线上复验:`/healthz` ok、首页与两个 main chunk 全 200、`admin-credential-hygiene-probe` **24/24**、`sw-admin-bypass-probe` **14/14**、`boot-cost-probe` 首屏入网 **697KB / 43 条预取 43 条带 crossorigin / 零重复入网**,线上 `index.html` 实测同样是 **43/43**。
- **R1 在真数据上跑通**:启动日志 `[shadow] 迁移完成 0 -> 1(001_hot_tables)` + `影子双写已启用:库结构 v1,回填 chat_messages=3 click_events=73 client_errors_gate=129 visits=1000`;`table-parity` 第一次红(177 行形状差)→ 修读写边界与判据 → **结果: 一致(退出码 0)**,其中 `visits 源 1000 / 表 1003 (表多 3 行,不判失败)` 正是"表只受保留期约束"那条设计的实测样本。**切读还没发生**:按纪律要连续跑绿一周。

### 顺带修的两个真缺陷(不在审计清单里,做上一项时撞出来的)
- **循环依赖不能用"函数内延迟 require"解**:depcruise 静态扫所有 `require`,写在哪都算一条边。`lib/admin.js` 顶层 `require('./security')` 打出 `admin → security → siteconfig → admin` 的环 ⇒ 纯谓词 `isLocalRequest` 连同 `LOCAL_HOST_RE` 一起下沉到叶子模块 **`lib/local-request.js`(新)**,`lib/security.js` 原样 re-export(对外口径不变、`lib-local-request.test.js` 一字不改),后端要用它的人 require 叶子。**⚠️踩过的坑**:`security.isAllowedOrigin` 内部也在用那两个正则,下沉时只搬不引用 ⇒ `ReferenceError` 被它自己的 `try/catch` 吞成 `false` ⇒ 回环请求的 Origin 判定全线失败、`lib-ws-guard`/`lib-api-ban-guard` 联手报 8 条 `'origin'` 假绿反转 —— **搬常量记得回头查所有引用点**(`npx vitest run` 同跑两个相关套件才能暴露,单跑是绿的)。
- **空远端清单会让差集判成"一致"**:`awk 'NR==FNR{seen[$0]=1;next} !seen[$0]'` 在第一份文件为空时把空集合当"全都见过" ⇒ `N=0` ⇒ 打印"✅ 后端与服务器一致"还返回 0(**又一类静默假绿**,与 `cmd | tail` 的 `$?` 同型)。backend-sync 改 `grep -vxF -f`(无匹配模式=一份都不差,失败方向正确),并用它的**退出码**当结论(0 有差异 / 1 完全一致 / >1 出错),`set -e` 用 `set +e … set -e` 局部包住。**写"比清单"的代码时,空输入必须自己想清楚算一致还是算失败**。
- **`ssh` 不加 `-n` 会抽走本地 stdin**:backend-sync 里只读远端输出的调用(md5sum / tar 取回)不带 `-n` 时会把本地 stdin 喂给远端 ⇒ 那句 `read -r ans` 拿到 EOF,在 `set -e` 下**无声退出**。现只读类调用统一走 `SSHRO=(…ssh -n)`,需要往远端喂 stdin 的(heredoc 解包)继续用原 `SSH`。

## 2026-10-11 外部专家三阶段审计整改(分层全量落地,本地未上线)

外部审计(`新建 文本文档 (6).txt`,三阶段约 50 条)先经 7 个分区并行核验、主代理逐条回读 P1/P2:**约三分之一是误报或已被别的机制抵消**(Cookie 三项属性早已齐备、WS 广播本是 O(房间人数)且有 ping/terminate、admin 的 onclick 全部正确用 `j()`、`javascript:` 进不了 iframe(服务端 `siteconfig` 强制 `^https?://`)、"第二条 SSE 收不到 kick"定性反了(服务端只写 `data:`,两端 `onmessage` 都收得到)、magic bytes 后果被 nosniff+重编码抵消、quiz 在代码事实上从来不是安全边界);**第一阶段的"拆微服务""立刻上 PostgreSQL"已被审计自己第四十节/第十八节推翻,故未执行**。落地分三层:

### L1 后端身份与授权(⚠️ 规矩变了,后续写码必须照此)
- **UA 哈希不再是身份**:`deviceKey(req)=sha256(UA).slice(0,16)`(AGENTS 旧文写的 sha1 已过时),**只许用于统计/限流/风控信号,禁止用于授权判定**。私有媒体可见性与 `mt` 下发的唯一依据是 `store.authVid(req)`(本人 HttpOnly vid + 会话有效)。`siteconfig.isMineUpload`:记录带 `aid` ⇒ 只认 `aid===authVid`;仅 2026-09-18 前的无 `aid` 存量才允许 dk 命中,并**当场把 `aid` 绑给该 vid**(一次性迁移,之后他人撞 UA 也领不走);原"同 UA 遍历历史档案"兜底已删。`userLinks` 同批摘除 dk 授权。`handleMyUploads` 改调 `isMineUpload`(旧 OR 语义会让同 UA 陌生人互列文件名)。验收:`src/__tests__/lib-identity-authorization.test.js`(14)+ `scripts/test/test-upload-security.js`(20)。
- **dk 归并只许命中"完全匿名且从未被认领"的档案**(`isUnclaimedProfile`):他人的昵称/kicked/reapply/被吊销的身份不得经 UA 传播。
- **会话吊销 = 永久**(`authVersion` 模型):`revokeSession` 做 `authVersion+1` 且把 `sess` 写成永不匹配的版本;`touchSession` **只对已有效会话续期,绝不顺手换发**;换发只走 `issueSession`(管理员批准)/`resumeSession`(过期自愈与重新验证)。**兼容护栏必须钉住,别"严格化"**:档案完全没有 `sess` 视为有效、历史 `sess` 无 `authVersion` 按 0 解读——否则一次部署就让全部老访客会话集体失效。
- **过期自愈落在 `entryGate`**(`resumeSession`):此前三天空闲过期的回访者身份认得回、`authVid` 却是 null ⇒ 本人照片与 mt 集体 403,而唯一的自助口 `/api/entry/collect` 依赖的前端指纹通道(`src/visitor-fp.js`,`window.__collectFP` 从未赋值)早是死代码。现在本人 Cookie 走过期自愈;被吊销的永不复活。验收:`scripts/test/test-session.js`(46,**已纳入 `npm test`**)。
- `auth:'write'` 的"仅本地"判定改 **`req.socket.remoteAddress`**(`security.isLocalRequest`),不再读 `Host` 头(伪造 `Host: localhost` 曾可从公网打 `POST /api/upload`/大屏上传删除/`DELETE /api/files`)。**刻意保留**:回环来源但 Host 是公网域名 ⇒ 仍判非本地(Cloudflare Tunnel/本机反代场景)。`NODE_ENV=production` 且无 TOKEN ⇒ 启动即退出(未设 NODE_ENV 时只告警,免得把没设该变量的线上打崩)。

### L1 后端资源与接口
- `/ws` 曾是"另一扇门":Node 对 `Upgrade` 不 emit `request` ⇒ `entryGate`/`blockedIps`/安全头对 WS 全部无效,且 `maxPayload` 是 ws 默认 **100MB**。现改 `noServer` + 自建 upgrade 守卫:Origin 必须本站、须有有效 vid 会话、拒 kicked/denied/blockedIps、单 IP≤8 与全局≤500、`maxPayload:16KB`、按连接消息令牌桶(move 20/s、chat 3/10s、emote 5/10s、join 5/min)、`bufferedAmount>1MB` 即 terminate。⚠️**探针连带影响**:无头/空 UA 不建档 ⇒ 不带真实 UA+vid 的 WS 测试必被拒。验收 `scripts/test/../src/__tests__/lib-ws-guard.test.js`(8)。
- SSE(`/api/entry/watch`、`/api/media/sse`)加每 IP 与全局上限(超限 503)、空闲/超寿回收、空集合真从 Map 摘除、`capKeys` 兜住可轮换 UA 键;`src/media-push.js` 的 `onMediaChanged` 现返回 unsubscribe 并新增 `closeMediaPush()`。
- `POST /api/track/click` 的 `trackRate` 是**死代码**(声明了没用过)⇒ 现接 `lib/ratelimit.js` 的 `track` 桶(60/分/IP,超限回 200 `{throttled:true}` 不让埋点报错),并把点击改为**内存攒批(2s/20 条)批量落库**、导出 `flushTrack()`、关服时 flush。这是"埋点专用豁免"每变更即同步落盘的口径,写新埋点请照此。
- **视频跨扩展名覆盖链(DG-FILE-001)**:`compressJob` 把 12 种源扩展名统一归一 `.mp4`,`renameSync` 前原本零检查 ⇒ 上传 `abc.mov` 可覆盖已存在的 `abc.mp4` 并搬走归属与 `mt`、再 `r2Put` 覆盖 CDN 对象。现用 `linkSync` 原子改名(不可用才退回 existsSync+rename,目标存在仍拒)+ `uploads/photoCaptions` 改"目标键不存在才搬" + 压缩临时名带 pid/序号;直传与分片组装的"禁覆盖"改 `fs.openSync(...,'wx')` 独占创建堵掉 TOCTOU。验收 `src/__tests__/lib-upload-overwrite.test.js`(13)。
- **分片残片可无限占盘**:此前无启动/定时 GC、无在途配额、总量检查只在末片。现 `startChunkGc()`(启动清一次 + 每小时,**unref 永不拖住退出**)+ 每 IP 字节/条数与全局条数配额 + **首片即按 `total×CHUNK_MAX_BYTES` 拒**(不再等末片)。⚠️ 旧文档"24h 残片自动清扫"当时与实现不符,现在才真正成立。验收 `src/__tests__/lib-chunk-gc.test.js`(14)。
- 大屏上传此前 `req.pipe(createWriteStream)` 零上限零清理 ⇒ 补 Content-Length 预检 + 流式计数 + `destroy` + 失败 unlink(`BIGSCREEN_MAX_BYTES=2GB`,该端点仅后台 token 可达)。
- **审核只对公开展品 fail-closed**:`moderateImage` 改三态 `allow|block|unavailable`;`NSFW_MODERATE` 默认关这一成本策略保持不变(主人明令),但**开关已开却拿不到结论**时,匿名公开展品(白板)挂 `uploads[name].pending`、不上墙也不下发(`mediarules` 认 `pending`/`isPending` 并短路,`canServeMedia` 必须传 `pending`);私人上传维持放行(自己看自己)。视频仍不审核(需新依赖,挂待议)。
- **vision**:此前 `fs.readFileSync(≤50MB).toString('base64')` 同步进 JSON 体(峰值 ~250MB、阻塞事件循环)、无在途去重、**失败也永久缓存 FALLBACK**、且是四个 AI 端点里唯一没有洪水防护的。现走 `imgB64Sample` 降采样 ≤512px + 异步读盘 + `analyzeDeduped` 同名只一个在途 + **成功才落缓存** + `vision` 桶 6/分/IP。
- CORS 单一源:`CORS_ORIGIN` 按逗号 **allowlist** 解析(`config.CORS_ALLOWLIST`),预检与真响应共用 `security.corsOriginFor(req)` 并按 Origin 回显 + `Vary: Origin`;`util.sendJson` 的兜底不再回显逗号串(单值头匹配不上)。`.env.example` 已改真实语义。
- 静态黑名单补死:根级 `*.bak-<时间戳>` 曾以 `application/octet-stream` **公网泄露后端源码**(`/\.(bak|cjs)$/` 与"根级 .js"两条都不匹配)。现①路径段含 `.bak` 即拒 ②**根级改白名单登记表** `ROOT_PUBLIC_FILES/EXT`(新增根级公开文件必须在这里登记,与 `scripts/deploy.sh` 的入口清单同源);备份本身也移出 web root(见 L3)。
- R2:`r2sync` 补 15s 超时 + 2 次指数退避(带 jitter)+ 成败计数;照片/视频/大屏获得与 `tts.r2Heal` 同形态的"命中补推"自愈。**持久 outbox 未做**(架构级,挂账)。
- 优雅关闭:注释里"最长 6 分钟"与实现 `8s` 冲突 ⇒ 现 `SHUTDOWN_DRAIN_MS=15000` + 事实化注释,`uncaughtException` 改为 log→`server.close()`→drain→`exit(1)` 交 pm2 拉起(`unhandledRejection` 保持不退出但留计数)。

### L2 前端运行时(审计第四阶段自陈未审,由本轮补齐)
- **`playHint()` 队列是写错的**(功能 Bug,不是优化):`finish()` 里 `const next = hintQueue.shift()` **取了不用**、仍调闭包捕获原 audio 的 `doPlay()` ⇒ 队里的 B 被丢弃、A 重播、B.onEnd 永不触发(而 onEnd 驱动对话推进)。同文件"队列满挤出最旧"分支却正确回调 `stale.onEnd` —— 两条路径自相矛盾。现:调度逻辑抽成纯模块 `src/shared/hint-queue.mjs`(finish 把真正 shift 出的下一条交给调用方、回调恰一次、挤旧必回调)+ `playOne({audio,onEnd,bypassSwitch})`,监听改 `{once:true}`+显式摘除,watchdog 存句柄并 clearTimeout。验收 `src/__tests__/hint-queue.test.js`(13)。**旧教训:语音类探针全在测 `dialog-voice`,从未覆盖 `playHint`——写验收要按"被改动的代码路径"而不是"功能模块名"挑。**
- **`disposeObject3D` 单一实现 = `src/shared/dispose-object3d.mjs`**(geometry/material/15 个贴图键,树内去重),各处**禁止再写内联 traverse-dispose**(`hot.js` 已收敛)。⚠️**必须保留的三层保护**:`node.isSprite` 跳过(three 0.186 的 **Sprite 几何是模块级共享单例**(`Sprite.js:69`),对它 dispose 会让全站 sprite 一起消失——`Line/Points` 的几何是构造参数、各实例独占,**不能一律跳过**,否则 paintings 的 EdgesGeometry 反而漏释放)、调用方 `shared` 集合、同一资源只 dispose 一次。`mode.js` 的 `renderCustomLinks` 由"每 60 秒全删重建"改为**按服务端 `l.id` diff**(未变保留、变化才拆建、消失才 dispose),堵住每分钟一次的显存泄漏。`paintings.takeoverEmpty` 换芯补 dispose 旧 map;`removePaintByUrl` 行为逐字不变(仅收敛到共享工具)。验收 `src/__tests__/dispose-object3d.test.js`(10)。
- **`LoopManager` 从来没有 `stop()`**,而 `core/loop.js` 的 facade 承诺了 `stop`(调用即 `undefined is not a function`,只是全仓无调用方);RAF id 也未保存、`_running` 无对外入口。现补真 `stop()`(置标志 + `cancelAnimationFrame`),`start` 幂等。验收 `src/__tests__/loop-manager.test.js`(8)。
- `audio-system.createSpatialWebAudioNode` 的 dispose 闭包引用 `node`,而 push 进数组的是**另一个对象字面量** ⇒ `indexOf` 恒 -1、死 panner 每帧继续被 `setValueAtTime`。现同一 entry 自建自删;整体 `dispose()` 复用现成的 `removeSource`(stop→脱父→disconnect)而不是 `sources.clear()`。
- `scene-manager`:切换失败此前只回滚指针 ⇒ 现 `rollbackEnter()` 把 avatar 迁回原父节点 + 还原快照 + 对称 `target.leave`;`toMain` 失败用 `splice(idx,0,...removed)` **整段**还原栈(成功路径"回主世界即压平历史"是有意设计,未动);`dispose()` 末尾 `manager=null` 使可重新 init。验收 `src/__tests__/scene-manager-rollback.test.js`(8)。⚠️`src/kunlun/planets.js:89` 用模块级 `const worldManager=initSceneManager(...)` 缓存了实例——dispose 后置 null 会让那个 const 指向旧对象,**别在生产路径 dispose 世界管理器**,除非先把 planets 改成按需 `getSceneManager()`。
- `video-wall`:超时 skip 路径不清 `canplaythrough` ⇒ 慢网下迟到回调让"已跳过的旧视频"突然重播;现加 `_vGen` 世代号 + 所有结束路径显式摘监听。无限轮播与 `avAllowed()` 总闸是有意设计,只把 `sequenceStarted=true` 移到闸门之后(行为等价,不再锁死"同会话后来开 AV")。
- **监听器族(生产整页刷新下不可见,属可重装配/HMR 正确性)**:`gameshell-dialog` 补 `dispose()`(摘 `script:lang`、`disposeMuteBtn`、定时器、lock 队列)、`dialog-voice.mjs` 匿名 `script:lang` 改具名 + `disposeMuteBtn(dialogEl)`、`story-music` dispose 补摘 click 与 `script:lang`(此前二次 init 后一次点击跑多份 handler=**音乐按钮看似失灵**)、`overlay.js` 的顶层一次性 Esc 注册改为 `ensureOverlayListeners()` + `layers.size` 引用计数(**反向问题**:模块顶层代码不会重跑,旧实现一旦 `destroyOverlay` 就 Esc 永久失效)。⚠️**Esc 优先级顺序不能变**:overlay 仍是 `main.js` 最先 import 的 UI 模块。
- `main.js` 保留 `register` 返回的 unregister、resize 改具名 handler 并给 `teardownWorldWiring()` 出口;`composition-root` init 二次调用**拒绝并告警**、dispose 幂等可复位(此前二次 init 会出现两套 update)。
- `hot.js` 新增 `bag.register(obj,{scene,shared})` 与 `bag.async(fn)`(临时重装捕获补丁再 finally 还原),使"异步回调里创建的资源"与"非主世界 `world.scene.add`"可被回收;`planets.js` 的世界灯光/星空/资产回调已走 `addWorldObj` 登记。**仍是已知边界**:自动捕获只覆盖同步执行期,新模块的异步资源要显式 `bag.async`/`bag.register`,别指望 `hotBegin`。
- **存档写失败必须可见**:`store-api.rawSet` 此前 `catch` 后静默 ⇒ 上层无法感知,而 `ui/gl-lost.js` 正对用户宣称"你的进度已经保存"(且它自己那条 try/catch 留痕因异常被吞而**永不触发**=死代码)。现所有 setter 返回布尔 + `console.warn`(与既有 `rawRemove` 对称)+ `hasWriteFailure()` + `STORY_CHECKPOINT_KEYS` 关键剧情键失败提示一次(走 `ctx.ui.modeToast`,偏好类键继续静默);gl-lost 文案按真实返回。`addSpirit` 补白名单校验 + 幂等 + 读时清洗旧档重复(注:此前"可提前凑够 6 颗"经核实**不可达**——唯一调用点的三个来源都排除已收集,故属不变量加固而非漏洞修复)。验收 `store-write-failure.test.js`(9)+ `spirit-invariant.test.js`(7)。

### L3 SW / 后台凭据 / 部署发布
- **`sw.js` 从未真正绕过 admin-media**(审计属实):`/^\/admin(\/|$)/` 对 `/admin-media/photos/a.jpg?token=T` 判 false(`-` 既非 `/` 也非串尾),也不匹配 `isMedia`(只认根级 photos|videos)、非 navigate ⇒ 落 catch-all SWR 的 `if(res.ok) cache.put(e.request, …)`,**把含主 TOKEN 的整 URL 持久化进 Cache Storage**,与文件注释宣称的目标相反;服务端虽回 `private, no-store`,但那段代码根本不读响应头。现:①路径判定覆盖 `/admin`、`/admin/`、`/admin-media`、`/admin-media/` ②任何 `token|mt|sig` 查询串一律不拦截不落盘 ③缓存准入收拢成唯一 `canCacheResponse(res)`(三段分流共用,含 `private|no-store|no-cache`、video、>8MB)④`cache.put`/`mediaLRU` 挂 `event.waitUntil` ⑤**VER 升 v15**(旧池里的凭据条目必须随升版清除)。
- **旧探针是假绿的**:断言写的是 `startsWith('/admin')`(规则本身抓得到),但流程只点 errors tab、从不加载文件页缩略图 ⇒ 从未发出 `/admin-media` 请求。现补"真点文件管理 tab → 缩略图必须发过且 200 → 扫 Cache Storage 全量 keys",14 项;并新增 `scripts/probe/admin-credential-hygiene-probe.cjs`(24 项)。**规矩:验收探针必须真的发出那一条请求,"断言写对了"不等于"测到了"。**
- **主 TOKEN 不再进 URL**:`/admin?token=<TOKEN>` 变成语义上的**一次性引导**——校验后签 `admin_session`(32 字节随机、**只存哈希**、8 小时硬到期不滑动、HttpOnly/Secure/SameSite=Strict)并 **302 到不带 query 的 `/admin`**;`<img>/<video>` 靠 cookie 自动携带,`admin-content.js` 的 `mediaQ()` 已删除、`mediaUrl()` 反过来**剥离** `token/mt/sig`。`tokenOk` 现在认 cookie→x-token→query 三通道,**header/query 通道一条没删**(CI/命令行运维/探针不断)。CSRF 依据:SameSite=Strict 阻断跨站携带 + `timingSafeEqual` + 失败与不存在同答 401/404。⚠️**因此 `TOKEN_QUERY=0` 现在可以放心打开**(旧文档记的"开了就断图"这一互斥已消解,探针 ⑤a/⑤b 实证)。`/admin-media/*` 响应另强制 `private, no-store`(此前 `.flac/.wav` 落 `public,max-age=86400` 可被边缘缓存)。
- 后台两个新运维动作:文件管理「重签令牌」(`bulk rotate-mt`,让泄漏过的 `?mt=` 立即失效)、访客面板「清空 IP 定位缓存」(`bulk clear-geo`);revoke 文案改为**永久**语义(读后端 `revoked_permanently`)。`uploaderInfo` 优先按 `aid` 直查,同 UA 多档案时标「归属不明」不再猜第一个。
- `mt` 媒体令牌:加 `mtIssuedAt` + **180 天老化在本人访问时静默重签**、后台可手动重签(旧 bearer URL 自然失配)。未做 HMAC 短期签名 URL(契约要前后端同改,且会打断图片代理兼容这条当初设计它的原因)。
- **隐私与数据最小化(第一批 2026-10-11 已落地)**:**保留期清理单一源 = `lib/retention.js`**(`RETENTION_DAYS`:聊天 90d / 一念 180d / 客户端报错 30d / 点击 180d / 访问 90d / 答题记录 180d / geo 90d / 历史 IP 180d / 限流死键 7d;老访客档案无活动 365d)。规矩:①新增无界增长的集合必须先进这张表,否则等于回到"只有条数上限、永不老化";②`runSweep()` 裁完**只调一次 `saveGateData()`**(全量快照写盘很贵),数组**原地压缩**(别换新数组——各模块持有引用);③**缺时间戳的条目一律跳过不删**,首轮只给 `geo`/`ips` 补记旁表(`gateData.geoTs` / `a.ipsAt`),第二轮起才裁;④**老访客档案默认只打 `expiredAt` 标记、绝不自动删**(删会切断 uploads/photoCaptions/userLinks 归属线索与踢出审计链),真删需 `RETENTION_DELETE_APPLICANTS=1` + 标记满 90d + "未认领 ∧ 未被管理员处理 ∧ 名下无资产 ∧ 不在 blockedIps" 全成立;`RETENTION_DISABLED=1` 是紧急闸(单测靠它不自动清扫,否则会裁开发者真实库);定时器**必须 unref**。`previewSweep()` 只统计不落盘(后台「清理预览」可直接接,需加路由→同步 `lib-routes.test.js` 快照)。验收 `src/__tests__/lib-retention.test.js`(22)。**仍未做(需主人拍板)**:IP 截断 `/24` 或 `HMAC(ip,rotatingSalt)`——会削弱"同设备重进申请"判定与 `blockedIps` 精度;**访客 IP 已不再发给任何第三方(2026-10-14 第五轮审计 F)**:`admin.geoLookup` 与那条 `https://ip-api.com/json/…` 外呼一起删除,归属地改由 `lib/geoip.js` 用 Cloudflare 的 `cf-ipcountry` 国家码记录(零出网、零新依赖);geo 90d 保留期与后台 `clear-geo` 照旧控规模。
- **AI 用量统计(2026-10-11 已落地)**:`lib/aiusage.js` = 全站 AI 调用台账单一源。四个消费点在各自调用处记账(`lib/vision.js` / `lib/quiz.js` / `lib/chat.js` / `lib/tts.js`),能力名白名单固定五个 `vision|tts|tts-batch|quiz-ai|chat-bot`(`CAPS` 表,未知能力直接丢弃并返回 false;tts 实时与批量在 `lib/tts.js` 的 synth 出口按 `job.pr` 分流,**缓存命中不出网所以压根不记账**);`aichannels.js` 的 `callText/callVision/synthTts` 现返回 `{ok,by,...}`,**实际命中的通道不再被丢弃**,消费方不必改签名。
  - **⚠️ 台账本体在 `gateData.aiUsage` 里**,写盘经合并窗口:**5s(`FLUSH_MS`)或攒 20 条(`FLUSH_BATCH`)**落一次,规模有界(`RECENT_MAX=50` 明细、`DAYS_MAX=14` 天)。由此两条硬约束:①**新增 AI 调用方一律走 `aiusage.record()`,绝不自带 `saveGateData()`**(否则每次 AI 调用 = 一次整库快照);②定时器一律 `unref()`(台账永不拖住进程退出),优雅关闭走 `aiusage.stop()`(已接 `server.js`;**`stop()` 才负责最后一次合并落盘**,别再单独造兜底定时器)。R1(SQLite 真表化)时应把这张表搬出 blob。
  - **隐私**:明细字段只有 `t/cap/ch/ok/ms/tok/model/err`,**绝不记任何用户内容**(prompt、台词原文、照片 URL);通道/模型/错误摘要经 `clip()` 定长裁剪;"哪个通道从不回 token"的滚动统计刻意留在**进程内非持久**。
  - 只读端点 `GET /api/admin/ai-usage`(**沿用既有 `auth:'token'` 档,没新增 auth 枚举值**),路由单表 + 契约快照已同步;后台「✦ AI 用量」tab 在 `src/admin/admin-ai.js`:汇总/通道/天表/失败明细,`addEventListener` 接线(**不写内联 onclick**,与后台既有模板契约一致),能力名显示走自有属性查表(防 `cap='constructor'` 把原型方法插进 HTML)。**这不是成本闸**:2026-09-24 主人令拆除的按设备日限不得借用量统计复活。验收 `src/__tests__/lib-ai-usage.test.js`(23,含「台账不含用户内容字段」的显式断言)。
- **R2 媒体对象同步可靠化(2026-10-11)**:`lib/r2sync.js` 是传输层(15s 超时 + 2 次带 jitter 的 HTTP 重试 + `r2Stats()` 计数),**对象层的"必达"归新建的 `lib/r2outbox.js`**——持久待发台账 + 退避重试,消灭原先满地的 `r2Put(...).catch(()=>{})`(失败即永久缺席 CDN)。
  - **台账刻意不进 `gateData`/SQLite**(`require('./config')` + 惰性 `require('./r2sync')`,零反向依赖):默认 `<ROOT>/.r2-outbox.json`,可用 `R2_OUTBOX_FILE`/`R2_OUTBOX_DIR` 挪出 web root;该文件已进 `.gitignore`,且被 `staticDenied` 三重挡住(点开头文件名 / 点开头路径段 / 根级 `.json` 白名单不含它),临时文件 `.r2-outbox.json.tmp` 同样被挡 —— 测试用真实 `staticDenied()` 在公网与回环两种 req 下钉死。
  - 写盘:内存镜像 + 去抖 2s(`R2_OUTBOX_FLUSH_MS`)或攒 20 条(`..._FLUSH_BATCH`)立刻落,`tmp+rename` 原子写;**全成功路径一个字节都不写**,台账清空即删文件不留孤儿;所有定时器 `unref()`。
  - 重试:退避 `30s→2m→10m→1h→6h`,第 5 次起恒 6h **永不放弃**;同 key 只一次在途(`inflight` Set),在途期间同 key 再入账(上传后压缩又镜像同名)会 bump 内部 `gen`,旧内容成功不作数;**出账只有三种**(源文件已不在 / 条目无 `srcPath` / 未配置 CF),每种都 `console.warn` 点名理由;超上限(默认 2000)淘汰最旧且不在途的,日志明写"放弃自动重试、源站文件是权威、需人工 `scripts/r2-upload*.cjs` 或后台重传"。半截 JSON 告警重建、非法条目逐条忽略。
  - 接线:`lib/files-upload.js`(直传/白板·后台/分片组装三处镜像 + 压缩后镜像 + `handleDelete` 的删除也记账 → 反向分歧"源站已删、R2 没删"能自愈)、`lib/bigscreen.js`(镜像与删除)、`lib/tts.js`(**`r2Heal`/`ttsKey` 函数名、入参、进程内去重、"每键一次在途 PUT"一字未动**,`lib-tts.test.js` 原样通过;底下换成台账,并保留 `r2Put` 直引用作"台账模块异常时退回旧一次性直推"的兜底,`lib/tts.js:158` 那处 `.catch` 是有意的)。**`r2sync` 导出签名未改**,计数分工钉死:传输层看 `r2Stats()`、对象层看 `outboxStats()`(后者内含 `transport` 字段,观测面收成一个读数口)。
  - 启停在入口:`server.js` 的 `listen` 回调 `startOutbox()`(幂等、unref;不启则只剩"下次上传顺手带一笔",重启期间不自我补推),`beginShutdown()` 里 `stopOutbox()`(= 合并落盘 + 清两个句柄,**不要只调 `flush()`**)。**响应时延 0**:所有镜像调用都在 `sendJson(201|202)` 之后。总闸 `R2_OUTBOX_DISABLE=1` 只关台账、不关单次同步。
  - **未做**:后台"R2 待发队列"面板(数据面 `outboxStats()` 已齐:pending/put/delete/oldestAgeMs/nextDueInMs/attempts 分布/totals/params/transport/keys;加只读端点要同步 `lib-routes.test.js` 快照 59→60)。另 `lib/files-static.js` 里 `r2HealMedia()` 的调用点仍从未接线(上一轮遗留),有了持久台账后它不是必需品,保留与否待主人定。验收 `src/__tests__/lib-r2-outbox.test.js`(27)。
- **部署与发布(脚本已改,未上线)**:`StrictHostKeyChecking=no` → **`accept-new`** + 可选 `scripts/known_hosts`(`deploy.sh --pin-hostkey` 抓、主人**带外核对指纹**后入库,信任锚不凭空写死);私钥解析改优先级 `SSH_KEY`/`GIT_SSH_COMMAND` → `~/.ssh/gk-deploy.pem` → ~~桌面交接笔记兜底~~(**这条兜底已于 2026-10-12 删除**,见顶部第四轮的 DG-CRED-001;现在拿不到受控私钥就 exit 1,不再往 `/tmp` 落明文),登录用户抽成 `SSH_USER`(默认仍 root);`backend-sync` 备份移出 web root 到 `/opt/gallery-backups/backend/`(相对路径扁平化防撞名、保留最近 10 份);`deploy.sh` 第 4 步改为**按本次 tar 清单差集清理** `assets/`(仍保留最新 3 个 `main-*.js` 以躲 Cloudflare 边缘缓存旧 HTML 引 404 的血泪)+ 根级只删"受控 Vite 入口清单"里的旧入口,拿不准的一律 WARN 不删,`--no-prune` 可跳;`pm2 restart --kill-timeout 9000` → **25000**(匹配 15s drain);`release.sh` 在 push 后新增 **CI 闸门**(读 `gh run view --json conclusion` 的**字段**判成败,不信管道退出码),红了/取不到即**默认阻断**,逃生门 `--no-ci` 或 `bash scripts/deploy.sh`;checkJs 基线落单一真相 `scripts/checkjs-baseline.txt`(=422,实测),CI 由"只 warning"改为**超基线即 fail**;新增 `npm audit --audit-level=high`(暂不阻断)与 `.github/dependabot.yml`(npm + hill-src pnpm)。完整 immutable release(`releases/<sha>` + `current` symlink 原子切换 + 只部署 CI artifact)写成 `scripts/release-symlink-plan.md`,**本轮未执行**。
- 顺带修:`eslint.config.mjs` 忽略 `.tmp/**`(本机一次性脚本 `ktx2-convert.mjs` 曾让 `npm run lint` 假红);`npm test` 现串 5 个后端脚本(新增 test-session、test-upload-security);`Vary` 改**合并**而非覆盖(`files-static` 两处裸写 `Accept-Encoding` 会把 `Origin`/`Cookie` 分键抹掉,CDN 就可能把已鉴权内容按公开键复用)。

### 验收(本地全绿,未上线)
**已上线并复验(2026-10-11 11:44 起,commit `a7bd569`)**:本地 `npm test` 184 项(4+108+46+20+6)/ `npx vitest run` **713 项 71 文件**(整改前 532)/ `npm run lint` 0 / `tsc --noEmit` 0 / checkJs **422 = 基线** / `depcruise` 0 / `npm run build` 通过 / `test-mobile` 6/6;线上 `sw-admin-bypass-probe` **14/14**、`admin-credential-hygiene-probe` **23/23**、`b612-journey-probe` 默认模式跑通全书(仅末条 E 键断言为既有欠账)、`debug-browser` 0 pageerror、`/healthz` ok、版本戳经 `index.html` 实际引用的 entrygate chunk 核对为 `a7bd569`。
⚠️ **上线过程中查清的两件事**:① `release.sh → deploy.sh → backend-sync.sh` 在非交互终端下会**静默跳过后端上传**(backend-sync 检测 `! -t 0` 即 `exit 0`,deploy.sh 那行还是 `|| echo`),照原脚本发布会得到"新前端 + 旧后端"(后台缩略图当场回到 401 断图)——本次按"后端先行、dist 随后、单次重启"手工发布,**脚本这条链路仍需加 `--yes` 透传或显式提示**(已列入待办);② 服务器 web root 里积了 **29 个历史 `*.bak*`**(含 9 份 `server.js.bak-*`、2 份 `gate_data.json.bak-*`≈2MB 访客数据、104MB `photos.bak.tgz`、11 个点开头的),**旧黑名单对其中 18 个非点开头的完全失效**(`/\.(bak|cjs)$/` 结尾锚与"根级 .js"规则都匹配不到 `server.js.bak-20261008-224430` 这种名字,等于公网可下载);另 11 个点开头的(`.env.bak-*` 等)则被"任意路径段以点开头"那条老规则挡住了——已在本次上线前把新黑名单(路径段含 `.bak` + 根级白名单)先部署并逐条实测 404,随后把 29 个实体全部移入 `/opt/gallery-backups/webroot-bak-quarantine-20261011/`(根级零残留,原位不留软链)。

## 2026-10-10 admin 存量修复:媒体元素令牌 + chat tab 恢复(已上线)

- **缩略图/预览 401 修复(断图十几天)**:`<img>/<video>` 标签发不了 x-token 头,2026-09-18 令牌改 header 后文件页缩略图、页内预览、导出 PDF 原图附录全部 401。`admin-content.js` 加 `mediaQ/mediaUrl` 助手:内嵌 `/admin-media/*` 元素 URL 带查询令牌;**复制的分享链接(copyTxt)刻意仍不带令牌**(守住 09-18 审计"防 token 进 URL/日志"红线,服务端 tokenOk 本就接受 query.token)。
- **chat tab 恢复 + 优雅降级**:admin.html 的在线对话按钮 markup 曾丢失(面板不可达),已恢复(.chat-tab 虚线样式原样)。核实发现该功能**服务端半边从未实现**(online-sse/chat/chats 三端点全 404,客户端重试循环每 8s 刷一条 404):startChat 改为先探测,404 即渲染"服务端未启用"并停手——要启用需补服务端三端点(功能决策,存档待议)。
- 验证:532 单测/lint/typecheck/build 全绿;十 tab 全扫:缩略图 200、chat 显示降级态、零页面异常;线上 admin 探针全绿、版本戳 4440887 双端核对。
- **chat tab 转为可用功能(f157392,主人按推荐项默认执行)**:三端点不做,chat tab 改为「看公开聊天室 + 以管理员回话」——读 `GET /api/chat`(公开,后 30 条,3s 轮询),输入框经 adminFetch POST `/api/chat`,服务端 handleChatPost 以 `tokenOk(req)` 识别 x-token:带头即记 `n:'管理员',admin:true`(普通访客 POST 行为不变,3s 限流对管理员同样生效);`lib/chat.js` 顶部 `require('./admin')` 无环。后台 chat tab 现在是"看聊天室 + 回话"的真实闭环。**教训**:lib/*.js 是启动时加载,改完必须重启服务器再验(同一晚两次踩:static 文件即时生效,backend 模块不是)。

## 2026-10-10 移动性能取证第一步:取证页上线(forensics.html,随本次部署)

- `public/forensics.html`(免构建,public/ 直出):iframe 载入游戏本体(同源),父页每秒向子页注入采样器——FPS/帧均/峰值帧时长/长帧占比/draw calls/三角形/纹理与几何数/JS 堆。约 5 分钟会话分四段(出生点→B612→国王星→自由活动,「切到下一段」按钮),结束 POST 到既有错误信道(后台「报错反馈」tab 可见)+ 剪贴板复制备用。
- **用法**:手机打开 `https://cloudbear.cloud/forensics.html` → 开始采样 → 按面板上的清单操作 5 分钟 → 结束并上传;开发者从后台读报告。
- 桌面冒烟全过(注入/采样/报告结构;SwiftShader 数值保守仅验工具,真机数据才有裁决力)。**决策挂账**:报告回来后定 KTX2(方案②)与移动优化优先级。
- 已知限制:iframe 里 gallery-v2/rose-gallery 的 JSON-module import 在 dev 失败( longstanding dev-only,生产 Vite 构建无此问题,不影响取证)。

## 2026-10-10 运维小批:gzip 缓存 mtime 失效 + SW 探针自动 VER + PWA manifest(ce32c4d,已上线)

- **gzip 内存缓存 mtime 失效**(`lib/files-static.js`):原命中判定只看 5 分钟 TTL——文件更新后旧 gz 副本最长供 5 分钟(2026-07-27 血泪"改完验证误判没部署上"的根因,本次会话验证时又踩两次)。缓存条目现在带 `mtimeMs`,命中时 stat 比对,**不同即立刻重压**;TTL 保留为冷条目淘汰。后端 +2 测试(临时 .mjs 文件改内容断言新内容立即可达;根 .js 有黑名单白名单,测试用 .mjs)。**收益**:发布落地后旧 gz 立即失效,本地"改完要重启验证"与线上"5 分钟陈旧窗口"双双消灭。
- **SW 探针 VER 自动化**:`sw-admin-bypass-probe.cjs` 的 `VER='gallery-v14'` 改为从 `public/sw.js` 源码正则直读——SW 升版只改 sw.js 一处,探针不再手工跟(审查 P2"升版易漏"关闭)。
- **PWA manifest**(审查 P2 收尾):补 `id:'/'` + 512px **maskable** 图标(sharp 从 icon-512 生成:内容缩至 80% 居中+主题金底);shortcuts 未加(需要真实二级页面,暂无)。
- 验证:104 项后端/lint/typecheck/532 单测/build 全绿;线上 manifest id/maskable 图标 200、healthz 200、版本戳 ce32c4d 最新 entrygate 核对。

## 2026-10-10 KTX2 转码实验完成:管线打通,生产启用卡 CSP 决策(3f9109f)

- **编码半边打通**:装 KTX-Software 4.3.2(用户目录,可执行 toktx v4.3.0~28)。直转踩两个坑:①toktx **不吃 WEBP 输入**(CLI 直转全部 skip);②gltf-transform CLI 4.5 的 etc1s 用 `ktx create` 的 assign-tf 选项,**要求 toktx 4.4+**(4.3 报 fatal)。解法两步:`scripts/optimize/webp2png.mjs`(sharp 解码 WEBP→PNG,6 张全过)→ `npx @gltf-transform/cli@4.1.0 etc1s`(4.1 兼容 toktx 4.3,4.5 不兼容)。hero-rose 实测:10.67MB PNG 中间态 → 2.1MB KTX2,`KHR_texture_basisu` + 全部 image/ktx2 ETC1S,**单张 1024² 显存 5.59MB→699KB(约 8 倍省)**;scan-uncompressed 对 KTX2 文件正确放行(PNG 中间态会被标,预期)。
- **渲染半边结论(已接好)**:KTX2Loader + basis 转码器在 dev/vendor 与 dist/public 双路就绪。**生产阻断点 = 站点 CSP**(OWASP 加固版:script-src 无 unsafe-eval):basis 转码器(emscripten)在其 blob worker 内用 `new Function` 做函数表调用(craftInvokerFunction),被 CSP 的 EvalError 拦截——堆栈已抓实。**选项(主人决策)**:①script-src 加 unsafe-eval(页面级 eval 全放开,削弱 XSS 加固,不推荐);②自构 NO_DYNAMIC_EXECUTION=1 的 basis_transcoder.js(无 eval 版,需源码构建);③KTX2 搁置,维持 WEBP(现状无恙)。实验产物(hero-rose-ktx2.glb 等)在 .tmp/,未进生产。
- 验证:532 单测/lint/typecheck/build 全绿;本地经游戏真实加载路径(createGLTFLoader)验证 KTX2 解码被 CSP 拦(堆栈实证);webp2png.mjs 已入库为管线工具。
- **运维注**:KTX-Software 装在 C:\Users\17296\KTX-Software\bin(toktx);静默安装会被系统策略拦,需手动跑安装器。

## 2026-10-10 巨石拆分第四批:admin.js 第二阶段,1086→478 行(已上线)

- **切割方案**(依赖分析的第二阶段建议落地):`admin-state.js`(15 行,DATA/RANGE/CAL_DATE 改 **ESM live binding** + setter——各分区 `import { DATA }` 读到最新值零改写,唯一 rebind 点 load() 收拢为 `setData()`)+ `admin-content.js`(469 行,文件页+展示区+户外大屏+杂项 handler——分区内环自洽:loadFiles↔toggleDemo/editCaption、loadDisplay↔大屏/链接三件套互调全在模块内)+ `admin-stats.js`(206 行,统计页 30 天柱状图/日历/时段榜 + statCards + calReset 从 trunk 搬入)。**本体保留 478 行**:数据/访客/预警/历史/答题分区 + switchTab + boot + 30 名 window 装配(逐字未动)。
- **执行要点**:①`loadFiles` 是 `async function`,机械 export 正则只挂了 const/function 形态,构建期 MISSING_EXPORT 抓住补齐(admin.js 全量三处同款,均构建期兜住);②`statCards` 小函数随唯一消费方搬进 stats;③stats 的 RANGE 改 live import,写入走 `setRangeValue`。**验证新增十 tab 全扫工具**(.tmp/admin-tabs-sweep.cjs):十个 tab 逐个点击全渲染 ✓。
- **顺带浮出两个存量页面问题(非本次回归,已存档)**:①文件页缩略图 `<img src="/admin-media/...">` 自 2026-09-18 令牌改 header 起就 401(tkq() 恒空串,img 标签带不了 header)——后台文件页缩略图断图十几天了;②admin.html 的 chat tab 无 data-tab 属性,十 tab 扫描点不到(对话功能经独立入口可用)。修复待办,与拆分无关。
- **运维注再实证**:本地验页面读到旧响应=服务端 5 分钟 gzip 内存缓存(2026-07-27 血泪同款),重启服务器清缓存后探针即绿;"线上验版本戳要用 index.html 实际引用的 chunk"再+1:entrygate 是运行时动态 import,index.html 只静态引用共享 main chunk(跨版本同名),正确姿势=取服务器最新 entrygate-*.js grep 提交哈希。
- 验证:532 单测/lint/typecheck/build 全绿;admin-errors-tab 探针本地+线上全绿;版本戳 7dc8330 双端核对(最新 entrygate chunk)。

## 2026-10-10 剧情探针现代化第一批:金标准 journey-probe 复活(已推送)

- **发现**:线上跑金标准 `b612-journey-probe` 基线,发现它**也死于第一句对白**——与 script-fill 同根:三处 220ms 对白泵只点选项和对话框背景,而 10-03 起主线对白 autoHide:0,普通台词等「继续 →」点击。三处泵统一补 `.gs-next` 点击。
- **线上重跑结果(重大)**:探针从"死在第一句对白"复活为**端到端跑通全书**——画羊四轮→B612 四站(火山/树苗/日落/玫瑰)→国王历书+老耗子+星屑→返回→家 step4→飞机登机段,60+ 断言深处,仅最后一条断言漂移:合成 `lock:true` 对白在 home-step4 状态下按两次 E 不再关闭(10-02 输入轮后的分层 E 消费链:InputManager 消费/journey/ending 捕获叠加)。
- **定性**:该断言需产品语义核对而非盲改——E 在 lock 对白上"应推进"的旧语义与现行分层消费冲突点在哪,属探针重设计的收尾范围。script-fill 的泵本会话早已现代化,其剩余欠账仅为跑站段重设计。
- 验证:线上(真 GPU 全模型)端到端;本地 probe 语法/lint 过。

## 2026-10-10 巨石拆分第三批:planets.js 1201→884 行,两拆三留(已上线)

- **切割方案**(依赖分析结论"两拆三留";五路全拆属时序耦合太深):`story-guides.js`(140 行,剧情浮光指引:信标+悬浮箭+`ctx.ui.storyTarget` 单一权威写入;`initStoryGuides({getScene,getWorldManager,getChapter,isGateRevealed,getIslands,getMainGateY})` getter 注入——章节/门现身/岛表全是 planets.js 可变状态)+ `nav-buttons.js`(187 行,上下文导航按钮 + 原 onTick 内联决策块封装为 `tickNav(activeWorld)`,早退语义=函数 return 等价;`setNav` 仍导出给主干早退分支)。**本体保留**(world-loader 核心链槽位不变):worldManager 创建与注册(boot-check 断言)、章节权威 setChapter、石门契约(revealStarGate/isStarGateOut——portal.js 每 tick 轮询且失败按已现身放行)、传送垫、主循环物理、GARGANTUA legacy。消费方(scene6/7/late-planets/portal/spirits/8 个探针)零感知——只认场景对象名与 ctx 契约。
- **死码清理约 60 行**:退役的屏顶指引 HUD(755-768 + tick 内 5 处 display:none + bag.remove)、travelTo/backToGallery(零调用)、hudT/lampT(从未读写);连带 spawnFor/worldForIsland 出 import(仅死码引用)。
- **registerWorld 幂等守卫**:b612 与 king 各注册点改 `getWorld(id) || registerWorld(id, ...)`——HMR 重放不再因重复 id throw(分析标定的隐患,顺手补上)。
- **执行实录**(手术脚本三轮迭代,教训:跨 shell 的正则替换转义不可靠,锚点修正一律用 Edit 工具;行级手术前先精确核对每条边界):①extract 起点抓错——tick 决策块误带太空物理边界钳制片段,删除重切;②两段定义区删除时切片方向反了一刀,lint no-undef 连环抓出(worldNav/removeFloatArrow/hud 残留);③最终 884/140/187 行,lint/typecheck/build 全绿。
- **验证**:532 单测全绿;本地世界启动(后台链推进至回忆层,零报错);**线上 return-black 9 项全绿**(世界切换/门契约/portal 时序——正是被拆路径);**聚焦诊断实证 story-guides 在生产正常**(29m 处 storyBeaconStarGate+guideArrowStarGate 同立、chapter/page1/pos 全对)。guide-shot 探针失败为**其自身预置债**(script-fill 同族;本轮已还三笔:自愈式进场、双语按钮匹配、page1/chapter 夹具——b612 段截图正常拍到指引;聚焦诊断证明信标在往返全程正确:进 b612 撤、回主世界 29m 重立)。**剩余断言本身已过时**:portal 按钮"29m 应显示"违背 09-30 现行设计(>15m 只给罗盘+光柱),须按夜链感知整体重设计(待办,同 script-fill)。
- **运维注**:deploy.sh 的 `npm run build | tail` 管道有 pipefail 保护;但线上验版本戳要用 index.html 实际引用的 chunk(grep assets/entrygate-*.js 会匹配到历史保留 chunk 造成误读)。

## 2026-10-09 巨石拆分第二批:ending-journey 1295→791 行,三叶(f83de2d,已上线)
## 2026-10-09 巨石拆分第二批:ending-journey 1295→791 行,三叶(f83de2d,已上线)

- **切割方案**(依赖分析结论:按"四阶段"拆是负收益——四段共享单一 mode 状态机/单一 actionFn 槽/同步链(画嘴套→veil→startFarewell→…→fall→playEpilogue);按"可分离叶子"拆是正收益):①`ending-audio.js`(135 行,自持 WebAudio:水声/水滴/会笑的铃铛;trunk 用 `isWaterActive()` 替换对模块内 water 状态的外读);②`ending-prince.js`(165 行,小王子 rig:加载/动画/摆放/透明度/跟随与倒下;princeMode 自持,`set/getPrinceMode`/`resetFall` 访问器,`initPrinceRig({scene:getter, groundH})` 注入);③`ending-epilogue.js`(325 行,星空/字幕/落版/保存星星卡;控制器注入 `{stageEl getter, getMode/setMode, setStep, hideAction, stopListening, wait}`;`getStageEntry()` 供主干 script:lang 换字;`stopStarfield()` 供 dispose)。主干保留编排(状态机/行动卡/DOM/speakSeq/找井+告别两段/tick/组件),endingApi 形状一字未动。
- **执行陷阱实录**:①注入块最初放在状态声明之后——`wait` 是 const(不提升),顶层引用直接 TDZ,**闸门都不出现**(整页 module 链死);挪到 const 声明之后(主循环段之前)修复。②探针失败会泄漏它自起的服务器进程,下次跑同端口 EADDRINUSE→探针服务器死→假象"闸门超时";重跑前先清泄漏进程。③机械 export 脚本再抓三处 `async function` 漏挂(build 期 MISSING_EXPORT 兜住)。
- 验证:**ending-portfolio 探针双变体 + hill-ending 探针全绿(18 项,本地+线上各一轮)**——正好覆盖被搬走的三叶代码经真实剧情流端到端跑通;532 单测/lint/typecheck/build 全绿;版本戳 f83de2d 双端核对。
- 下批候选:planets.js(1201 行)——依赖分析已完成,**结论"两拆三留"**:可外拆 story-guides(剧情指引,~110 行)与 nav-buttons(导航按钮+tick 决策块,~85 行)两个低耦合叶子(消费方零感知),世界注册/章节权威/传送垫/主循环物理必须留本体且核心链槽位不变;拆前先清 4 处死码(travelTo/backToGallery/hudT/lampT/HUD 段,约 60 行);需同时补 registerWorld 幂等守卫(HMR 重放隐患)。风险点已全部列档(加载顺序/portal 时序/boot-check/探针形状/storyTarget 单写者/HMR/tick 早退语义)。

## 2026-10-09 巨石拆分第一批:admin.js 1623→1086 行,四模块(cc3995d,已上线)

- **切割方案**(依赖分析代理产出函数级依赖表后执行):新建 `admin-core.js`(无状态共享工具:token/adminFetch/confirmAsync/$/esc/j/fmt/day0/todayStr/toast/brandIcon×2)、`admin-tabs.js`(报错反馈+一念墙+TTS 播放追踪,export loadErrors)、`admin-docs.js`(协议文档编辑,状态自持,export loadDocs)、`admin-chat.js`(在线对话,export startChat/chatSelect/chatSend + 新封装 `stopChatLive()`——原 switchTab 内联的 SSE/轮询清理随分区搬入)。**本体保留**:DATA/RANGE/CAL_DATE 三个可变态横跨 8 个互相成环的分区(数据/访客/预警/统计/历史/答题/文件/展示/大屏/杂项),第一阶段刻意不动;30 个 window 内联 onclick 契约在末尾 Object.assign 原样装配。
- **执行要点**(分析代理标了 10 个风险点,全部绕开或单独修):①switchTab 对 chatSse/chatPoll 的直接读写必须封装成 stopChatLive 随模块走,否则切割即失败;②模板 onclick 引用的函数(跨分区如 loadFiles→dl/copyTxt/editCaption)必须在 Object.assign 存活——构建期不报错、运行期静默死,已按 33 处 onclick 清单逐一核对;③顶层 DOM wiring 11 处保持模块顶层执行;④boot(load()+#docs 直达)留在 admin.js 最底;⑤`async function` 声明的 export 要单独处理(机械 export 脚本只匹配 const/let/function,loadDocs/chatSend/adminFetch 三处漏挂,构建期 MISSING_EXPORT 抓住补齐)。
- **顺带修潜伏 bug**(依赖审计发现):统计页日历"本月"按钮 `onclick="CAL_DATE=null;renderStats();"`——两者都不在 window 上,点击必 ReferenceError(抽出模块时就已存在)。新增 `calReset()` 挂 window,模板改引它。
- **附带发现与防御**(本地 admin 探针顺带暴露):本地 client_errors 里有 2 条(累计)“startWorld 模块失败: 场景 Cannot add property wallSpecs”——scene.js 模块执行曾在中间态会话炸过(疑似文件热编辑窗口的模块图不一致,5 连跑+探针均未复现)。已把 `ctx.gallery.wallSpecs` 直供改为防御性 try/catch:真复发时 `__reportError` 上报全栈+挂画缺席降级,绝不允许核心链 scene.js 半途炸掉整局重试。
- 验证:532 单测/lint/typecheck/build 全绿;**admin-errors-tab 探针本地+线上全绿**(真实 ADMIN_TOKEN 点 tab→loadErrors→SSE,走全新模块结构);版本戳 cc3995d 双端核对;0 pageerror。
- 下批候选:ending-journey.js(1295 行)与 planets.js(1200 行身兼 5 职)——后者是剧情核心,拆前需同等粒度的依赖分析。

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
- **优雅关闭(#9;2026-10-11 数值已更正)**:`server.js` 捕获 SIGTERM/SIGINT → `server.close()` 收束在途请求。**当初注释写"最长 6 分钟"而实现是 `setTimeout(exit,8000)`——文案与代码矛盾**:现统一为具名常量 `SHUTDOWN_DRAIN_MS = 15000`,配套 `pm2 restart --kill-timeout **25000**`(deploy.sh 与 backend-sync.sh 都改;9000 会在排空途中 SIGKILL)。选 15s 而非更长:游戏页常驻 SSE 会让每次发布等满窗口,现已由 `closeMediaSse()` 主动收束(SIGTERM→退出毫秒级)。`uncaughtException` 不再"带脏状态续跑":log→close→drain→`exit(1)` 交 pm2 拉起;`unhandledRejection` 保持不退出但带计数。关服时还会 `flushTrack()` 与 `stopChunkGc()`。存档无缓冲不补 flush(每次变更本就同步落盘,SQLite 为权威;仅埋点走批量,见顶部 L1)。
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
- `deploy.sh` step 5 now runs it before its single restart (`BACKEND_SYNC_NO_RESTART=1`). `--no-backend` skips it. A refusal or failure never stops the rest of the deploy. ⚠️**本条已被 2026-10-12 的两处改动推翻(照此行事会重演事故)**:①后端同步挪到**第 3 步,前端上传之前**;②拒绝/失败/非交互未授权一律**中止部署**(exit 3/4/1/6),`--no-backend` 也不再免检(有漂移即 exit 6,要硬闯得显式加 `--allow-backend-drift`)。详见本文件顶部「2026-10-12 第四轮外部审计」第二批。
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
  **配额身份键与限流**:`quotaKey(req)` 优先用不可猜的 **vid Cookie(HttpOnly)**,无档案才退回 `deviceKey(req)`=sha256(UA)(旧文档误记 sha1;**只可用于统计/限流/风控,禁止用于授权判定**——2026-10-11 DG-SEC-001);`capKeys(obj, max)` 防伪造身份无限增键(时间戳表删最旧,日配额表随机淘汰)。**AI 配额闸已全部拆除(2026-09-24 主人令)**:tts/vision/quiz 阅卷/聊天机器人召唤的按设备日限全部移除,AI 调用不再设配额 —— 成本防线只剩:文案长度上限、缓存(同句/同照片永不重复合成)、聊天室 3 秒/条发言限流、vision 仅本人照片且每张只分析一次。新增 AI 端点时按需自选防线,勿再照抄已删除的日限闸。
- `src/` — 前端 ES 模块(2026-07-27 由 `js/` 迁入并分目录),经 `ctx.js` 共享状态;**装配走唯一组合根 `core/composition-root.js`(按"层→相位→次序"确定性 init),严禁在 main.js 散点 import 副作用**。目录:`core/`(组合根/composition-root、game-state、game-loop、light-budget、boot-state、gameshell-dialog…)、`scene/`(scene/effects/desert/player/media)、`gallery/`(paintings/signs/markers/links/mode/fountains…)、`gate/`(entrygate/quizgate/settings/upload/housecolor/**agreement-swipe**/consent-session/guide-card/openfilm…)、`kunlun/`(peaks/spirits/eternal/ark/windchime/fireplace/snowwin/resetview/letgo/finale)、`state/`、`ui/`、`shared/`(story-text/z-layers)、`types/ctx.d.ts`(ctx 类型权威)、`styles/main.css`。**世界模块两段渐进加载(2026-09-24)**:`core/world-loader.js` 把 36 个世界模块拆 **核心链 26(串行阻塞揭幕;含星球世界 planets.js——它顶层创建 worldManager 世界注册表与石门传送垫,延后会让 boot-check 假报缺项)** + **后台链 10(永恒厅/飞舟/风铃/壁炉/雪窗/第6场/回忆层/重置视角/放下/终章,进图后补载不阻塞)**;后台链安全靠「core 后段顶层对后台链 ctx 登记零引用」,新增后台模块前照此核查;后台完成态挂 `window.__deferredWorldReady`。
  **ctx 总线规矩**:`src/ctx.js` 是跨模块共享通道,属性收进 **7 个命名空间**,有**登记册**防膨胀(新属性先登记);类型权威在 `types/ctx.d.ts` 的 `GalleryCtx`(6 个 `ctx-*.js` 分片合并)。
  **写路径单入口**:运行时可变状态的唯一写入口是 `gameState.set(prop, val)`(详见下方「写路径单入口规矩」条)。
- `vendor/` — npm 三方库的浏览器直跑副本(three.module.js/hls.mjs),由 `scripts/gen/sync-vendor.js`(postinstall 自动跑)从 node_modules 拷贝;index.html 的 importmap 把裸包名映射到这里,**仅本地原生 ESM(非 Vite)运行用**,生产构建直接打包 node_modules。three 锁定 `0.160.0`(与旧 three.mjs 同版,已删)。
- `scripts/` — `test/`(test.js/test-mobile.js/verify-all.js/历史一次性 race/upload 测试)、`probe/`(debug-browser/perf-probe/perf-profile/daynight-probe/light-compile-bench/**b612-*-probe.cjs** 系列/**verify-***/**probe-***)、`gen/`(check.js/gen-data.js/gen-thumbs.js/sync-vendor.js/dev.js)、`dev/`(一次性截图/处理脚本)、`optimize/`(模型压缩)、`artifacts/`(调试截图/baselines 截图回归)。**探针即验收**:新功能配套 `scripts/probe/` 探针,线上跑 `PROBE_URL=https://cloudbear.cloud node scripts/probe/<名>.cjs`。`scripts/blender-fbx2glb.py`(Blender 转换)、`scripts/deploy.sh`(一键部署)、`scripts/r2-upload*.cjs`(R2 同步)。一次性探针不删,归档备查。
- `public/` — sw.js + manifest.json(Vite 原样拷进 dist 根,URL 不变)。
- `models/` — **3D 模型持久资产库(~495M)**,代码按 `/models/xxx.glb` 绝对路径加载,**server.js 经 safeJoin 直接服务 `/opt/gallery/models/`**(线上实测 206 + Range 正常)。⚠️ **Vite 只复制 `public/` 进 dist,`models/` 不在 dist 里** → 见「生产部署」盲区条。**线上读取已走 R2 CDN(2026-09-24)**:`src/scene/gltf-loader.js` 用 `LoadingManager.setURLModifier` 把 `/models/...` 重写到 `https://cdn.cloudbear.cloud/models/...`(R2 桶 `gallery-media` 镜像,immutable 头);CDN 失联置 `window.__modelCdnDown` 本会话回退源站,localhost 豁免。镜像补传用 `scripts/r2-upload-models-rest.cjs`(CF REST 通道,Bearer token 走服务器 .env)。
- `admin.html` — 后台(审批/统计/历史/答题记录/展示区/文件管理)。**日常入口就是 `/admin`**(2026-10-11 起:8 小时 HttpOnly 会话内免密);`/admin?token=<TOKEN>` 只是**一次性引导**,验过即 302 到不带 query 的地址,主 TOKEN 不再驻留 URL/历史/日志;直接开 `/admin.html` 是 404(静态黑名单拦截)。会话只存**哈希**、硬到期不滑动、无登出按钮(自然过期或清 Cookie)。**后台脚本 `src/admin/admin.js` 里 `tk()/tk2()/tkq()` 恒返空串(token 已统一走 `x-token` 请求头,2026-09-18 审计;2026-10-11 起 cookie 也可,`mediaQ()` 已删除、内嵌媒体元素一律裸路径)**——带查询串的接口必须自起 `?`(如 `/api/admin/client-errors?type=`),**禁止 `+ tk() + '&...'` 拼接**(2026-09-25 血泪:报错 tab 因此拼出 `client-errors&type=` 畸形 URL 404、后台长期空白;验收 `scripts/probe/admin-errors-tab-probe.cjs`,带 ADMIN_TOKEN 实点 tab)。`guide.html` — 《元素共鸣准则》访客说明书。`whiteboard.html`/`music.html`/`agreement.html`/`privacy.html`/`community.html`/`lobby.html`/`room.html` — 子页,全部纳入 Vite 多页构建(产物仍在 dist 根,部署路径不变)。
  **三协议阅读(P1-1,2026-09-23 起)**:闸门底行三个协议名点开的是**并列三协议面板**(`src/gate/agreement-swipe.js`),同一面板内三标签切换、每份各自勾选、三份签毕自动点亮 ENTER,**全程零整页 reload**(旧实现是三次整页跳转 + 收尾 `parent.location.reload()` 把 3D 世界推倒重来)。三份 html 被内嵌时带 `?embed=1`,各自的 consentBar / 固定返回键自动隐藏。验收 `scripts/probe/b612-pact-probe.cjs`。单份文档直开(`agreement.html?from=gate`)仍走原逻辑。
- `official.html` — **B612 官网**(2026-09-06 上线,取代 www 旧 React 官网):绘本式单页,默认英文 + sessionStorage 切中文,零依赖零 3D,字体自托管 `official-assets/fonts/`(国内不依赖 Google CDN),图片 `official-assets/*.webp`(主人的 Dola AI 生成图,水印已由 `dev/process-official-art.py` 去除:垂直克隆/水平镜像克隆两法)。部署见「生产部署」官网条;验收探针 `dev/official-site-probe.cjs`。

## 展示区模式(2026-07-25 主人定;2026-09-06 特殊模式整体删除)

- **2026-09-06 主人定:特殊模式删除**——`/api/siteconfig` 恒返 `mode:'normal'`(设备 special/全局 special 不再参与决策),admin 后台模式切换 UI 移除,`mediarules.mjs` 决策表按普通模式单轨:演示/本人上传可见,其余(图库/他人)整框隐藏,下载门禁同理拒绝。
- **照片全库退役**:data.js P 仅剩 5 张演示照片(201~205),其余 69 张已从 data.js/photos/服务器全部删除(挂画循环改为内容填完即止,不再绕圈重复挂);非大屏视频退役:data.js V/VIDEO_WALL_SOURCES 清空,服务器 videos/ 根目录仅剩 户外大屏/(大屏 1~5 号轮播走 /api/bigscreen + R2,完全不受影响)。访客上传仍可动态上墙。
- 链接模型:`mode.js` `spawnLinkModel`(10 种),后台链接(icon=挂原图案/model=新建)、访客链接(gateData.userLinks 按 dk,出现在眼前,pos 由前端传)。

## 上线前必跑(自动化测试)

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm test                          # = 下面六条(test-store + test-store-sqlite + test.js + test-session + test-upload-security + test-mobile)
node scripts/test/test-store.js   # 存档原子写 7 项(并发保存/截断恢复/tmp 残留;**2026-10-14 起先埋残留再断言它被搬走**)
node scripts/test/test-store-sqlite.js # SQLite 持久层 11 项(迁移/DB 权威恢复/**前置条件断言**/_savedAt 仲裁/USE_SQLITE=0 回退;2026-10-14 起才进 npm test 与 CI)
node scripts/test/test.js         # 后端 108 项(数据校验/API/安全边界/审批门/上传限制/邀请/协商缓存/健康检查)
node scripts/test/test-session.js # 会话机制 46 项(吊销永久 + 过期自愈 + 兼容护栏 + dk 归并收紧;2026-10-11 起进 npm test)
node scripts/test/test-upload-security.js # 上传归属 20 项(同 UA 陌生人互不可见 + 存量迁移 + 吊销即断)
node scripts/test/test-mobile.js  # 手机端渲染 6 项(iPhone 模拟:着色器错误/JS异常/空屏;**2026-10-15 起等的是"世界接棒"
                                  #   = 电影收束 ∧ __bootState.worldStarted ∧ #c 显形,不再把 getFPS()>0 关进 90s 闸门 ——
                                  #   headless 无 GPU,SwiftShader 编全站着色器实测 35-45s,机器一忙就冲破预算,
                                  #   这条当天连挡两次发布;FPS 仍量仍打印,循环存活由 posD 逐帧读数 + 截图非纯色兜住。
                                  #   同一个坑与同一次改法见 b612-preload-film-probe 那条**)
npx vitest run                    # 前端单测 978 项 / 86 文件(物理/碰撞/状态机/游戏状态/存档/路由契约/配额/灯光预算/剧情纯逻辑/
                                  #   身份与授权/上传覆盖与分片GC/WS守卫/SSE限流/资源释放/队列/循环生命周期/
                                  #   保留期清扫/AI用量台账/R2待发台账/缩略图同权/mylinks配额/白板归属/磁盘并发闸/公开API封禁闸)
npx vitest run --coverage         # 覆盖率基线(2026-09-24 建):已测纯逻辑模块普遍 82-100%(game-state 94/collision-resolve 96/light-budget 100/store 100/vertical-physics 92);
                                  # 全库 2.02% 是**假低**——3D/浏览器模块在 node 里跑不了,由探针层(scripts/probe/)兜住,勿用全库数字评判
npm run lint / npm run typecheck / npm run deps   # 三项都必须 0 错;lint 已忽略 .tmp/**(本机一次性脚本,别让假红骗人)
npx tsc -p tsconfig.checkjs.json  # 类型债基线=scripts/checkjs-baseline.txt(单一真相,CI 超基线即 fail,不是 warning)
npm run test:scene                # 场景截图回归 4 检查点(主世界/B612/国王星球/返回;见「场景自动化测试」节)
npm run build && node scripts/probe/boot-cost-probe.cjs   # 首屏真实入网字节闸:prefetch 必带 crossorigin、GET 零重复下载、总入网 ≤2600KB(2026-10-12 建,起因见顶部「资产性能」条)
node scripts/probe/api-ban-upload-probe.cjs   # 拉黑/封禁 + 白板归属 + 目录钉死 + mylinks 会话闸的端到端验收 22 项(自起本地服、数据文件指临时目录)
```
⚠️ `cmd | tail` 的 `$?` 属于 tail——判成败要**单独取退出码**或读结构化字段(2026-10-11 实测踩到:lint 报 1 error 但 `| tail` 后显示 EXIT=0)。

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
- **HMR 分家**:`src/hot.js` 提供 `hotBegin/hotEnd` 生命周期(自动捕获场景对象/ticker/定时器/DOM,热替换时先销毁旧实例;ticker 按引用逐个移除,不会误杀后加载模块)。已接入 **26 个模块**(2026-09-18 核数;旧清单所列 effects 已被 core/effects-system.js 取代且未接 HMR):dome-towers/housecolor/fountains/links/markers/quizgate/eternal/signs/mode/ark/crash-site/spirits/snowwin/tower-orb/windchime/story-dialogs/settings/letgo/upload/fireplace/resetview/planets/finale/museum/peaks 等——改这些文件只热替换对应模块,不整页闪动(实测见 probe-hmr.js)。paintings.js/openfilm.js/avatar.js/scene.js 为高频改动未接 HMR 项(2026-09-18 审计)。player/desert/media(有玩家状态/物理/长连接)保持整页刷新。**新模块要接 HMR 就三行**:`import {hotBegin,hotEnd} from './hot.js'` + 顶部 `hotBegin('名')` + 底部 `hotEnd('名');if(import.meta.hot)import.meta.hot.accept()`。**注意**:①模块内要用 `onTick`/`s` 就在 `hotBegin` 之后再从 ctx 解构(拿到包装版);②碰撞体/iG 可交互组/全局事件监听等自动捕获管不到的,用 `const bag=hotBegin('名');bag.custom.push(()=>{...})` 注册自定义清理;**②b(2026-10-11 新增)异步创建的资源必须显式登记**——`hotBegin/hotEnd` 只覆盖同步执行期,`fetch().then`/GLTF 回调/`setTimeout` 里 `add` 的对象全在 bag 之外,改用 `bag.register(obj,{scene,shared})`(带"已被热替换则晚到资源当场释放"守卫)或把整段回调包进 `bag.async(fn)`(临时重装捕获补丁、finally 还原,支持嵌套);非主世界的 `world.scene.add(...)` 因 scene ≠ `ctx.scene.s`,老补丁从来抓不到,`planets.js` 现统一走 `addWorldObj`。**资源释放的唯一实现 = `src/shared/dispose-object3d.mjs`**(geometry/material/15 个贴图键、树内去重),各处**禁止再写内联 traverse-dispose**(`hot.js` 已收敛);⚠️ 它内置 `node.isSprite` 跳过——three 0.186 的 **Sprite 几何是模块级共享单例**,无脑 dispose 会让全站 sprite 一起消失(审计建议的"traverse 全部 dispose"正含此坑),而 `Line/Points` 的几何是构造参数、各实例独占,**不能一律跳过**。③主循环(main.js)对热模块暴露的函数/数据必须调用时从 ctx 现取(如 ctx.updateFireworks、ctx.pG),不能模块顶层一次性解构。
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

- **照片缩略图**:`node scripts/gen/gen-thumbs.js`(服务器/本地,需 ffmpeg)→ `photos/thumbs/*.webp`(1024px);前端优先拉缩略图,**取不到就回退原图**(2026-10-12 DG-SEC-003 后缩略图**继承原图可见性**,所以"拿不到"既可能是 404 没生成、也可能是 403 无权——`scene.js` 的 `img.onerror` 两种都走 noThumb 回退)。上传后记得重跑。
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
- 云端:阿里云 `101.133.235.110`,pm2 进程 `gallery`(:3000/:3443)、`landing`(:3100),目录 `/opt/gallery/`(⚠️ **不是 git 仓库**,代码同步靠 scp,不能 git pull)。SSH 密钥:部署脚本只认 `SSH_KEY`/`GIT_SSH_COMMAND` 的 `-i` 与 `~/.ssh/gk-deploy.pem` 两个来源(**2026-10-12 起不再从 `C:/Users/17296/Desktop/梦幻画廊-交接笔记.md` 抽明文私钥**,那个兜底连同 `HANDOVER_NOTE` 变量一起删了;`~/Downloads/网站私钥bear1.pem` 是历史原件,脚本不读它)。**日常部署直接用 `node scripts/deploy.sh`**,别手搓 scp(脚本已固化构建/上传/清理/模型同步/重启/验证全套)。
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
- **AI 成本闸规矩(2026-07-28 起 vision;2026-09-23 补 quiz;⚠️ 2026-09-24 主人令已整体拆除,本节仅作历史存档,勿再照抄)**:凡**真实消耗 AI 额度**的访客可触发端点,必须加**每设备日限**,照 `lib/vision.js` 的模板:`quotaKey(req)` 取身份(优先不可猜的 vid Cookie,无档案退回 `deviceKey(req)`=sha256(UA)(旧文档误记 sha1;**只可用于统计/限流/风控,禁止用于授权判定**——2026-10-11 DG-SEC-001)),按 UTC 日期分桶,超限返回 429。两条已落地:**vision 看图配文 20 次/天**、**quiz AI 阅卷 20 次/天**(quiz 特殊:**超限不拦截交卷**,降级本地细则兜底,体验不中断)。键数上限用 `capKeys(obj, max)` 防伪造身份无限增键。**现状(2026-09-24 主人令,以此为准)**:上述日限闸**已全部拆除**——tts/vision/quiz 阅卷/聊天机器人召唤的按设备日限一并移除,AI 调用不再设配额。现存成本防线只有四条:文案长度上限、缓存(同句/同照片永不重复合成)、聊天室 3 秒/条发言限流、vision 仅本人照片且每张只分析一次。**新增 AI 端点按需自选防线,勿再照抄已删除的日限闸**(详见「结构」节后端条)。
- **存档规矩(2026-07-28 深化②;2026-10-11 补写失败可见性)**:前端 localStorage **唯一入口是 `ctx.store`**(src/state/store.js 深模块,冷核心,main.js 紧随 overlay import)——键名字符串只允许出现在 store.js 的 SCHEMA 登记册,业务代码**禁止直写 localStorage**(探针第 8 项会扫)。接口:`num/setNum`(等价 `+(getItem||0)`)、`str/setStr`、`json/setJson`(坏数据回退 def,不抛)、`flag/mark`(一次性标记)、`getSpirits/addSpirit`(灵蕴库存,内置旧档迁移:顺序时代数量键→前 n 颗;addSpirit 同步写兼容数量键)、`houseColor/setHouseColor/clearHouseColor`(动态组键)。**新增存档键先去 SCHEMA 登记**(未登记键调用即抛「未登记」);sessionStorage 会话级键不进 store。**2026-10-11 三条新增**:①所有 setter 现**返回布尔**且失败 `console.warn`(此前 `rawSet` 的 catch 只清缓存、上层无从知晓,而 `ui/gl-lost.js` 正对用户宣称"进度已经保存";它与 `rawRemove` 的对称留痕是同一批治理漏掉的一半);②`hasWriteFailure()`(粘性旗)+ `STORY_CHECKPOINT_KEYS`/`storyCheckpointKeys()`——**关键剧情键写失败要给用户轻提示(走 `ctx.ui.modeToast`),新增剧情 checkpoint 键必须同步进这个集合**,偏好类键继续静默;③`addSpirit` 现校验 key ∈ `SPIRIT_ORDER` 且幂等、`getSpirits()` 读时清洗旧档重复(注:"重复凑 6 颗提前通关"经核实**不可达**——唯一调用点的三个来源都排除已收集,故这属存储层自证不变量,不是漏洞修复)。验收:scripts/probe/store-probe.js(11 项)+ `src/__tests__/store-write-failure.test.js`(9)+ `spirit-invariant.test.js`(7)。
- **ctx 总线规矩(2026-07-28 深化①,阶段二/三已上线)**:ctx.js 是全量登记册 + 7 个命名空间(`ctx.ui` 反馈 / `ctx.kunlun` 神话层 / `ctx.player` 玩家门禁 / `ctx.scene` 场景内核 / `ctx.media` 媒体户外 / `ctx.gallery` 挂画房屋 / `ctx.mode` 展示模式,共 148 个映射属性,2026-09-20 情节阶段一收编后核数)。**扁平写已软冻结**:映射属性扁平写仍放行但 dev 环境(localhost/?ctxdebug)告警一次;全 src 610 处已迁完、扁平写零残留。规矩:①新挂属性必须先在 ctx.js 登记册对应分组登记;②能收进深模块(overlay/store/mediarules)的不挂总线;③新代码写命名空间路径,别名是 get/set 活委托、扁平读永久等价;④命名空间已冻结,不许往别名集塞新键;⑤dev 控制台「ctx软冻结」告警=走老路,改命名空间。批量迁移用 `node scripts/gen/ctx-alias-codemod.js <目录> all --dry` 先演练。验收:scripts/probe/ctx-bus-probe.js(8 项)。
- **写路径单入口规矩(2026-08-29 Stage4,组合根 + 单向状态,详见 RFC-架构深化.md 候选①阶段四/五)**:运行时可变状态的**唯一写入口是 `gameState.set(prop, val)`**(`import {getGameState} from '<按目录层级>/core/game-state.js'`,如 `src/gallery/mode.js` 用 `'../core/game-state.js'`、`src/ctx.js` 用 `'./core/game-state.js'`),写完自身 state 后经 `bindNamespace` 的 write-through 回写 `ctx.<ns>.<prop>` 并发 `${ns}:changed:${prop}` / `${ns}:changed` 事件;**读者照旧 `ctx.<ns>.<prop>`,经 vault 零改动**。已绑定(在 `ctx.js` 命名空间创建处**早注册**,早于模块导入期):`mode` 7 个配置下发 prop(siteMode/customLinks/demoPhotos/myUploads/myUploadTokens/myLinks/myCaptions)、`player`(quizPassed/viewMode)、`kunlun`(flightLock)。**委托冻结**:已绑 prop 的命名空间 set 陷阱委托 `gameState.set`,故 legacy 直写 `ctx.mode.x=v` 仍可用但**自动收归单入口**(幂等守卫防回环,apply 直写 vault 不经陷阱防递归)。**三类刻意不绑,别手贱去绑**:①每帧高频 prop(`pl`/`jD`/`ks`/`mv`/`drM`/`dayHour`——绑了每帧刷事件+存储);②初始化期能力/函数注册(`applyMode`/`texAllowed`/`eternalHandlers`/`hangOne`…,一次性注册非运行期状态);③集合原地变异(`houseMats`/`paintGroups`/`myUploads` 的 `.push`——不触发 set 陷阱,本就不发事件)。**新系统**按 `defineSystem({layer,phase,order,deps,init,update,dispose})` 契约写在 `src/core/`,并在 `main.js` 组合根 `compositionRoot.register(...)`;层序 platform→engine→gameplay→presentation。诊断钩子:`window.__compositionRoot.list()` / `window.__gameState` / `window.__ctx`。验收:`node live-verify.cjs`(生产双路径探针:gameState.set 写回 + legacy 直写漏斗 + 烟花逐帧回归,`EXIT=0` 才算过)。
- **昆仑灵鉴文案层(2026-07-26)**:全站神话包装已上线(详见 KUNLUN_PLAN.md)。规矩:①AI 配文前缀「昆仑替你记得：」只加在 paintings.js `showAI` 显示层(幂等),**不写进库存数据**;②反馈 toast 一律走 `ctx.modeToast`,不新造组件;③答题门槛 **60 分**(原 95,2026-07-26 主人定),三档反馈=满分/≥60/<60 邀请函;**分数线单一源=lib/quiz.js `QUIZ_PASS_SCORE`**(2026-07-28 深化③):test.js 与前端(player.js 提示/quizgate)全部自动跟随——前端经 `/api/quiz/state` 与 `/api/quiz/start` 的 `passScore` 字段下发,改分数线只需同步 lib/quiz.js + ADMIN_GUIDE.md 两处;④逐题批改走 `POST /api/quiz/judge`(只回布尔、每题每会话限判一次),**正解字母永不下发浏览器——神话卷(track=shen)除外**:该卷题库独立(questions/shenhua.json),判后公开正解+解析,主人特批;⑤答题入口永不关闭,答对题数计入天穹(`kunlunQuiz`)。
- **聊天室(2026-07-26)**:lib/chat.js,全员 100 条;`@昆仑之灵` 触发 AI 回帖(复用 AI_GRADE 双通道)。规矩:消息渲染一律 textContent(防 XSS);dk 只比对不下发;清理聊天记录须改库后 pm2 restart。
- **安全基线(2026-07-28 OWASP 审计,2🔴+5🟡 已全部修复并上线)**:①SVG **已从公开上传白名单移除**(2026-07-31 起,`lib/files.js` 的 `PUBLIC_IMG_EXT` 不含 `.svg`,上传直接 400——SVG 可含脚本,直开即同源 XSS,链:`/admin-media?token=` 偷管理 token;直接禁格式比 CSP 兜底更彻底、免维护);**存量 SVG** 仍经 files.js `sec` 强制 `Content-Security-Policy: script-src 'none'` 兜底——新增响应头只许走 files.js `sec` 集中处;②admin.html 用户数据进 onclick JS 字符串**一律 `j()` 不用 esc()`**(esc 不转引号;文件名/URL 可含引号,公开上传即可种后台 XSS);③上传归属**只认 `uploads[name].aid === authVid(req)`**(2026-10-11 改:此前"dk=sha1(UA) 仅兜底"实际是**并列授权路径**,同 UA 的陌生访客可互看私有媒体并拿到对方永久 `mt`;现在只有 2026-09-18 前的无 `aid` 存量可经 dk 命中,且命中当场绑 `aid` 完成一次性迁移);④`linkClicks` 5000 上限(防存储 DoS;常量 `lib/track.js` 的 `CLICK_CAP`,裁剪写在新落库路径里);⑤vision 洪水防护(**口径变过两次,别再抄旧文档**:2026-09-24 按主人要求**拆除**了"每设备每日 20 次"(正常访客用不到、误伤却大),2026-10-11 DG-AI-001 补的是另一维度——**每 IP 每分钟 6 次**(`lib/vision.js` 的 `VISION_RATE_PER_MIN`,超限 429),且**缓存命中免检**、失败不再永久落缓存);⑥token 用 `timingSafeEqual`;⑦safeJoin 必须带 `path.sep` 比较;⑧JSON/静态统一 `X-Content-Type-Options: nosniff`+`Referrer-Policy`,HTML 加 `X-Frame-Options: SAMEORIGIN`。复验:scripts/probe/security-fix-probe.js(**18 项**,2026-10-12 起:含「SVG 上传被拒 + 白名单无 .svg + 存量 SVG 仍有 CSP 兜底」三条取代已过时的「SVG 仍可上传」,vision 四条钉住"无日限 / 连 6 次放行 / 第 7 次 429 / 超限后缓存命中仍 200")。⚠️**这个探针曾被自己的整改弄红两次**(旧断言吃的是"21 次全放行"和"失败也复用缓存"这两个已作废的行为)——**改了限流或缓存语义,必须回来看这条探针的断言还成不成立**,否则"必跑探针"变成常驻假红。遗留(运维):阿里云安全组应只放行 Cloudflare IP 段访问 3000/3443,后台强制走 HTTPS——主人手动在控制台配。
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
- 静态黑名单(2026-07-26;2026-07-27 增补 scripts/dist/vendor;**2026-10-11 改成根级白名单**):公开静态经 server.js `staticDenied()` 拦截——点文件、`lib/`、`node_modules/`、`origin/`、`tools/`、`questions/`(题库含答案)、`scripts/`、`dist/`、pem/bat/sh/md/log、`gate_data.json`、`package*.json`、`admin.html`、根级 `.json`(manifest 除外)与根级 `.js`(仅 `data.js`/`sw.js`);**`src/` 与 `vendor/` 目录(可读源码)公网一律 404,仅本地放行——本地判定已改走 `req.socket.remoteAddress`(`security.isLocalRequest`),不再信 `Host` 头(伪造 `Host: localhost` 曾可从公网打 write 档)**。⚠️ 旧规则靠**结尾锚**,**根级 `server.js.bak-<时间戳>` 曾同时绕过 `/\.(bak|cjs)$/` 与"根级 .js"两条,以 `application/octet-stream` 公网泄露后端源码**;现①任意路径段含 `.bak` 即拒 ②**根级改白名单登记表 `ROOT_PUBLIC_FILES`/`ROOT_PUBLIC_EXT`:新增任何根级公开文件必须在这里登记**(与 `scripts/deploy.sh` 的入口清单同源,拿不准就不放行)。`/admin` 与 `/admin-media` 走独立 token/会话通道不受影响,且 `/admin-media/*` 响应强制 `private, no-store`。
- **媒体可见性规矩(2026-07-28 深化④,单一源)**:**下载放行与墙面上墙共用一张决策表 `src/shared/mediarules.mjs`**(纯函数零依赖)——服务端 `canServeMedia` 经 Node≥22.12 的 require(ESM) 取用,客户端 mode.js(上墙/纹理)/paintings.js(配文/视频调度)经 ESM import 取用;**改可见性规则只许改这一个文件**(旧规矩"改可见性必须同步服务端 canServeMedia"已由此落地)。「归类」各侧自备(服务端按 dk/mt 指纹,客户端按 siteconfig 下发的 myUploads),「归类之后怎么办」全在决策表:`wallDecision`(演示/本人/图库/他人)、`contentAllowed`、`captionAllowed`、`serveDecision`(下载+CDN 公开标记)。验收:scripts/probe/media-rules-probe.js(8 项)+ test.js 媒体门禁段。
- **媒体文件级门禁(2026-07-26 紧急堵口;2026-07-27 增补 mt 令牌;2026-10-11 补寿命与待审核态;2026-10-12 缩略图同权)**:上传即签发 `uploads[name].mt`(hex20)+ `mtIssuedAt`,`/api/siteconfig` 下发 `myUploadTokens`,`loadTexCapped` 给本人上传的 URL 拼 `?mt=`——QQ/UC 浏览器图片代理改用代理 UA 请求 `<img>` 也能认出本人(否则粉框"Photo Loading");存量上传服务端启动时自动补发。**缩略图也要带得上 mt**:`myUploadTokens` 的键是**原条目名**,而 `thumbs/<主干>.webp` 换了扩展名 ⇒ `scene.js` 的 `tok()` 在全名查不到时必须按 `mediarules.mediaStem()` 主干名回查(2026-10-12 之前查不到就不带令牌,UA 漂移场景每张图白跑一次 403)。⚠️ `mt` 本质是 **bearer URL:知道即有权**,故 2026-10-11 起加了两条:①**180 天老化**在本人访问时静默重签(`MT_MAX_AGE_MS`,旧 URL 自然失配)②后台「重签令牌」手动轮换(`bulk rotate-mt`,泄漏后立即作废)——仍**未做** HMAC 短期签名 URL(前后端契约同改,且会打断它当初被设计出来的那个图片代理场景)。`/photos/*`、`/videos/*` 经 siteconfig.js `canServeMedia()` 判定(决策表见上条,**必须把 `pending` 传进去**——待审核展品在 `serveDecision` 里最先短路,不上墙也不下发;**缩略图要先经 `thumbSourceNames` 归一成原图条目名再喂决策表**);`/api/files` 无 token 时同规则过滤,带 token 全量。**场景里的"隐藏"不等于文件不可下**。
  ⚠️**`scripts/probe/media-rules-probe.js` 这条实机探针已属陈旧(2026-10-13 复核定性,别当成回归)**:它卡在 `waitForFunction(paintGroups.length>0)` 90 秒超时(流程里**从不点 ENTER**,靠"自动入世"拿到 `__ctx.pl`),而它抽查的图库照片 `photos/1000000850.jpg` 在 `data.js` 里**根本不存在了** —— 2026-09-06「照片全库退役」把 69 张图库照片从 data.js/photos/服务器一并删光,现在只剩 5 张演示(201~205),所以 `libContentOff > 0` 这类断言永无可能成立。同一棵工作树用 `debug-browser.js` 跑本地页:**0 个 pageerror**,唯一 404 是 PWA 图标 `icons/icon-192.png` ⇒ 判定为"夹具随功能退役而失效",不是 R1/R2 或缩略图同权改造带坏的。要恢复这道验收得按今天的数据集重写夹具(挂待办,`npm test` 里没有它,不影响门禁)。
- 公开上传禁止覆盖同名文件(409,`fs.openSync(...,'wx')` 独占创建堵 TOCTOU)。**白板(DG-SEC-001,2026-10-12)也在此列且更严**:新作品名由服务端签发,覆盖只认 `uploads[name].aid === authVid(req)`(无 Cookie 401、他人或无归属存量 409);**后台(token)直传仍可自己挑名并覆盖**。
- **分片上传(2026-07-28 晚高峰应急,主人定)**:Cloudflare 边缘→源站回源带宽被运营商压到 ~12-40KB/s 时,>1MB 直传撑满 100s 超时 → 524(2026-07-28 19 点实测)。方案:前端 >384KB 自动按 **256KB/片** 走 `POST /api/upload/chunk?(dir,name,seq,total)`,服务端 `.chunks/` 暂存、最后一片重组+直传同一后处理(aid/mt/compressJob/abuseCheck 全走);规则与直传一致(409 禁覆盖/413 总量与单片 400KB 上限/24h 残片自动清扫)。验收:scripts/probe/chunk-upload-probe.js(9 项,含 md5 一致性)。
- sw.js 不拦截带 `Range` 头的请求:Cache API 禁止存 206,拦截即视频全挂。
- **sw.js /admin 绕过(2026-09-25 血泪;2026-10-11 才真正补全)**:sw.js 的 HTML 判定**必须包含 `mode==='navigate'`**——`/admin` 这类不带 .html 的美化路径曾被当静态资源走 SWR,后台发新版后主人首屏仍是 SW 缓存里的旧 admin.html(「报错反馈 文件不存在」久修不愈的第二层真凶)。**当年那条 `/^\/admin(\/|$)/` 其实从来没覆盖 `/admin-media`**(`-` 既非 `/` 也非串尾),于是带主 TOKEN 的媒体 URL 落进 catch-all SWR 的 `cache.put(e.request,…)` 持久化到磁盘——注释宣称的目标与代码相反,且该分支根本不读响应 `Cache-Control`,服务端 `private,no-store` 也挡不住。现规矩:①路径判定覆盖 `/admin`、`/admin/`、`/admin-media`、`/admin-media/`;②**任何带 `token|mt|sig` 查询串的请求一律不拦截不落盘**(通用原则,不只后台);③缓存准入只许走 `canCacheResponse(res)` 一处(三段分流共用;`private|no-store|no-cache`/video/>8MB 一律拒存);④`cache.put` 与 LRU 必须挂 `event.waitUntil`,否则 SW 会在写完前被回收。升版 VER(现 **v15**,升版即为清掉旧池里的凭据条目)以清旧池。**后台页面永远不要进 SW 缓存**;新增美化路径页面时核对 sw.js 三段分流。验收 `scripts/probe/sw-admin-bypass-probe.cjs`(14 项,**必须真发出 `/admin-media` 缩略图请求**——旧版断言写对了但流程没走到,是"假绿探针"的典型)。
- 畸形 URL 必须 400 而不是崩进程:`decodeURIComponent` 已包 try/catch,新增路径解析同样要接异常。
- 门禁/权限逻辑改任何一处都要跑 `node scripts/test/test.js`(含审批门/VIP/答题评分回归)。
- **版本与备份(2026-07-28 主人定;2026-08-29 修正)**:①本地已是 git 仓库(main 分支,`.gitignore` 挡 .env/origin/*.pem/*.tgz/gate_data.json/videos/tools/ffmpeg)并同步到 **GitHub 仓 `bear20252026/dream-gallery`** —— ⚠️ **该仓为 PUBLIC(公开)**,经 `gh repo view` 实测确认(此前文档误记为"私有仓",已更正)。因此**任何密钥/凭据都不得入库**:SSH 登录私钥(`gk.pem` 等)、TLS 私钥、API token、PAT 一律禁止提交;`.gitignore` 已加 `*.pem`/`*.key`/`*私钥*` 兜底。私钥一旦误提交须**立即在云平台吊销轮换**。(2026-07-28,凭据存于本机 Git Credential Manager;推送即异地备份)——**每次部署前必须 commit + push**(部署后跑 `node scripts/probe/debug-browser.js https://cloudbear.cloud/ 15` 确认无 pageerror);回滚=`git checkout <commit> -- <文件>` 后按正常流程部署。**2026-07-28 脱敏**:后台密码从 _setup_server.sh/verify-all.js/perf-probe.js/gate-media-probe.js 清除(改读环境变量 ADMIN_TOKEN/TOKEN),历史已压平重签。②云端 cron 自动备份:`/opt/backups/backup-gallery.sh`,**每天 03:17 daily**(gate_data.json+photos+music+代码文本 → `/opt/backups/daily/`,留 14 份)、**每周日 04:23 weekly**(videos → `/opt/backups/weekly/`,留 2 份;大屏另有 R2+本地原码率双备份),日志 `/var/log/gallery-backup.log`。改备份内容必须同步改 `tools/backup-gallery.sh`(本地 git 跟踪)并重新 scp 到 `/opt/backups/`。
