# RFC:梦幻画廊架构深化(2026-07-28)

> 本文档替代 GitHub Issue(项目无 git 仓库),按 code-arch-optimizer 技能的 RFC 模板记录五个深化候选的决策与落地。
> 状态:⑤②③④ **已实施并上线**;① **阶段一~五全部已上线**(2026-07-28 阶段一~三,2026-08-29 阶段四~五;候选① 至此收官)。
> 验收基线:test.js 127 项 + test-mobile 6 项全绿;专项探针 overlay 12 / store 11 / media-rules 8 / ark-free 13 / spirit-hud 5 / ctx-bus 8 / security-fix 11 全绿;生产无头探针 `node live-verify.cjs`(组合根 9 系统 + Stage4 双路径写回 + 烟花逐帧回归)EXIT=0。

---

## 候选⑤ 弹层管理 — ✅ 已上线(2026-07-28,产物 main-BMKgv1KT 起)

### 问题

弹层三铁律(✕+点外圈+Esc)靠每个模块手写:settings.js 一个 `onSettingsKey` 统管 Esc、player.js 一份 `isUiTouch` 硬编码 id 白名单。新增弹层要在三个文件里各抄一遍,漏一处就是"按钮全哑/退不出"级事故(2026-07-26 六灵蕴页血泪)。

### 提议的接口(已落地)

`src/ui/overlay.js` 冷核心深模块,接口仅三个入口:

```js
const api = ctx.overlay.register(el, {
  display: 'flex',          // 打开时 display
  escapable: true,          // Esc 可关
  closeOnOutside: true,     // 点外圈可关
  x: '#chatX',              // ✕ 选择器(事件委托,innerHTML 重渲染仍生效)
  canClose: (reason) => bool, // 拦截关闭('esc'|'outside'|'x'|'api')
  onOpen() {}, onClose(reason) {},
  touchOnly: false,         // true=只进触摸白名单(飞舟 HUD/序章)
});
api.open(); api.close(); api.isOpen(); api.unregister();
ctx.overlay.anyOpen();
ctx.overlay.isUiTouch(target); // player.js 触摸白名单唯一判定(data-overlay 标记)
```

隐藏的复杂度:Esc 栈(后开先关,模块靠 main.js 最先 import 取得监听优先级)、事件委托、触摸白名单自动标记。

### 依赖策略

进程内依赖:直接合并,无 I/O。冷核心不接 HMR(与 ctx.js 同级);热模块注册后必须 `bag.custom` 里 `unregister()`。

### 测试策略

边界测试 `scripts/probe/overlay-probe.js`(12 项):三铁律注册即得/Esc 栈序/答题中 canClose 拦截/触摸白名单/touchOnly。旧的散点 Esc/白名单人肉审查被替代(无独立旧测试文件需删)。

### 实施建议(已写入 AGENTS.md「弹层规矩」)

新弹层只 `register`,禁止手写 isUiTouch id 清单/点外圈监听/Esc 监听。已迁移:聊天/天穹/六灵蕴/答题/序章/飞舟 HUD/天穹已满对话框。

---

## 候选② 存档 schema — ✅ 已上线(2026-07-28,产物 main-BhrBizZ0 起)

### 问题

24+ 把 localStorage 钥匙散落在 15 个文件里:同一把钥匙(`kunlunQuiz`)在 quizgate.js 写、settings.js 读两遍、spirits.js 再读;类型转换(`+(getItem||0)`)、默认值、旧档迁移逻辑(spirits 数量键→key 数组)各自复制粘贴。改键名或迁移规则要全站 grep,漏一处就是坏档。

### 提议的接口(已落地)

`src/state/store.js` 冷核心深模块,键名字符串只允许出现在 SCHEMA 登记册:

```js
ctx.store.num('skyMs');  ctx.store.setNum('skyMs', 100);  // 等价 +(getItem||0)
ctx.store.str('nick');   ctx.store.setStr('nick', name);  // 等价 getItem||def
ctx.store.json('letGo', []); ctx.store.setJson('letGo', v); // 坏数据回退 def,不抛
ctx.store.flag('arkFlew'); ctx.store.mark('arkFlew');      // 一次性标记
ctx.store.getSpirits();  // 灵蕴库存(内置旧档迁移:数量键→前 n 颗)
ctx.store.addSpirit(key); // 写数组+同步兼容数量键
ctx.store.houseColor(g); ctx.store.setHouseColor(g, hex); ctx.store.clearHouseColor(g);
```

隐藏的复杂度:类型转换、try/catch 兜底(隐私模式 quota)、旧档迁移、兼容键双写。未登记键调用即抛「未登记」——新键必须先登记。

### 依赖策略

进程内依赖(localStorage 为本地存储,无替代品需求):直接合并。sessionStorage 会话级键明确不进 store(迁移无意义)。

### 测试策略

边界测试 `scripts/probe/store-probe.js`(11 项):默认值语义逐点对齐/旧档迁移/addSpirit 双键/读写回环/坏 JSON 回退/houseColor 动态键/未登记抛错/全 src 扫描零 localStorage 直写。第 8 项扫描使"业务代码禁止直写 localStorage"成为可执行的门禁,替代人肉 code review。

### 实施建议(已写入 AGENTS.md「存档规矩」)

新存档键先去 SCHEMA 登记;15 个模块已全部迁移(spirits/settings/quizgate/finale/upload/paintings/eternal/ark/prologue/letgo/fireplace/resetview/snowwin/windchime/housecolor/main)。

---

## 候选③ 答题分数线单一源 — ✅ 已上线(2026-07-28,产物 main-De03AAIv 起)

### 问题

分数线 60 改一次要同步四处:lib/quiz.js(判定)、test.js(断言字面量)、player.js(两句用户提示硬编码"60 分")、ADMIN_GUIDE.md(文档)。AGENTS.md 靠"必须同步三处"的人肉规矩兜底。

### 提议的接口(已落地)

单一源 = `lib/quiz.js` 的 `QUIZ_PASS_SCORE`,三个通道自动跟随:

- `GET /api/quiz/state` 与 `/api/quiz/start` 响应新增 `passScore` 字段 → quizgate.js 写入 `ctx.quizPassScore`(兜底 60)→ player.js 提示文案动态插值;
- `module.exports.QUIZ_PASS_SCORE` → test.js require 后直接用于断言(测试跟随实现,不再单独硬编码);
- ADMIN_GUIDE.md 保持人工文档(主人的规则公告,不自动跟随)。

隐藏的复杂度:下发时序(兜底值→真值覆盖)、前后端默认值一致性。

### 依赖策略

进程内(常量)+ 自有 HTTP 边界(下发字段)。属于"远程但自有依赖"的轻量形态:端口即 `/api/quiz/*` 响应契约,生产适配器=同进程路由,测试适配器=test.js 的临时服务器实例。

### 测试策略

test.js 新增 2 项断言(出卷/状态响应携带 passScore 且等于源常量),总数 125→127。旧的"60 分字面量断言"被替代删除。

### 实施建议(已写入 AGENTS.md 规矩③)

改分数线只需 lib/quiz.js + ADMIN_GUIDE.md 两处;前端文案永远用 `ctx.quizPassScore||60` 插值,禁止再写死数字。

---

## 候选④ 媒体可见性规则单一源 — ✅ 已上线(2026-07-28,产物 main-6Mu47nSZ 起)

### 问题

同一条可见性规则有两个面:服务端 `canServeMedia`(裸 URL 下载放行/403)与客户端 mode.js(上墙/拿掉内容)、paintings.js(配文门禁/视频调度)。两边各写一份人肉同步——2026-07-26"裸 URL 谁都能下"和 2026-07-27"CDN 缓存后门禁形同虚设"两次堵口的根因都在这套接缝上。AGENTS.md 旧规矩"改可见性必须同步这一层"是纯人肉约束。

### 提议的接口(已落地)

`src/shared/mediarules.mjs` 纯函数决策表,双端共用:

```js
import { wallDecision, contentAllowed, captionAllowed, serveDecision,
         stripThumbs, isWhiteboard, isBigscreen } from '../shared/mediarules.mjs';

wallDecision({ mode, isDemo, isMine, isLib })   // → {visible, content} 上墙
contentAllowed({ mode, isDemo, isMine, isLib }) // → bool 纹理/视频门禁
captionAllowed({ mode, isDemo, isMine })        // → bool 配文门禁
serveDecision({ dir, base, isDemo, isMine, hasMt, globalSpecial, deviceSpecial })
                                                // → {allow, pub} 下载放行+CDN 公开标记
```

「归类」各侧自备(服务端按 dk/mt 设备指纹判本人;客户端按 /api/siteconfig 下发的 myUploads 名单),「归类之后怎么办」只在决策表。

**双端消费方式**(本项目三通道的硬约束):文件放 `src/shared/` 并用 `.mjs`——开发模式浏览器经 `/src/`(仅 localhost 放行)拿原生 ESM;生产由 Vite 打包;服务端 Node≥22.12 用 `require(ESM)` 同步取用(本地 v24.18、线上 v22.23.1 均已验证;模块无顶层 await 是硬要求)。**教训**:最初放在 `shared/mediarules.cjs`,native ESM 浏览器无法 import、静态黑名单又 404,开发入口直接瘫痪——前后端共享文件必须按"浏览器原生 ESM 能直接加载"来选址和命名。

### 依赖策略

进程内依赖:纯函数零依赖,直接合并。跨进程(浏览器↔服务器)共享的是**代码**而非状态,用单文件双通道解决,不引入端口/适配器层(杀鸡不用牛刀)。

### 测试策略

边界测试 `scripts/probe/media-rules-probe.js`(8 项):普通模式图库框留内容拿掉/纹理拦图库、合成演示照片(上墙→特殊下墙→放行)、特殊模式图库全展示、切换可逆、无 pageerror。test.js 媒体门禁段(本人 403/图库 403/大屏 206/演示标记往返)继续覆盖服务端下载面。`gate-media-probe.js`(打生产、需预置管理员记录、headed 浏览器)已判定为过时交互探针,弃用,由上述两项替代。

### 实施建议(已写入 AGENTS.md「媒体可见性规矩」)

改可见性规则只许改 mediarules.mjs 一个文件;场景里的"隐藏"不等于文件不可下(下载面由 serveDecision 同表保证)。

---

## 候选① ctx 上帝总线 — ✅ 阶段一~五全部已上线(一~三 2026-07-28;四~五 2026-08-29)

### 问题

`ctx` 承载了 79 个属性(`ctx.pl` 单属性 113 处引用),是全站唯一跨模块通道:场景对象、玩家状态、神话层状态、UI 回调、模式数据混在一起。理解一个属性要翻写入方;任意模块可改写任意状态;AI 导航时无法从类型/命名推断归属。(注:本次②⑤已把最痛的两簇——存档 24 键、弹层三铁律——从总线收编进深模块,总线压力已实质下降。)

### 已落地(阶段一:登记册)

`src/ctx.js` 扩写为全量登记册:79 个属性按 11 个域分组(帧循环/场景内核/特效/媒体/户外交互/挂画/玩家/门禁答题/展示模式/天穹灵蕴/永恒展厅飞舟/冷核心),每个属性注明类型、写入方、用途;新增三条规矩(新属性先登记/能进深模块的不挂总线/分型是既定方向)。

### 已落地(阶段二:命名空间别名层 + 全簇迁移)

ctx.js 内置 `aliasNS` 工厂,get/set 双向委托到同一个扁平属性——**扁平路径永久可用,行为完全等价**;且因别名是活委托,HMR 热替换扁平属性后别名自动拿到新值(比模块顶层一次性解构更稳):

```js
ctx.ui.modeToast(...)        // 反馈与冷核心:modeToast/kunlunSpeak/overlay/store
ctx.kunlun.flightLock        // 昆仑神话层:flightLock/eternal*/ark*/spirits*/checkSkyMs/fadeTeleport…(18 键)
ctx.player.pl / quizPassed   // 玩家与门禁:pl/jD/ks/mv/drM/viewMode/quizPassed/quizPassScore(8 键)
```

- 迁移由一次性代号机 `scripts/gen/ctx-alias-codemod.js`(词边界正则,先 --dry 演练再落盘)完成:kunlun 簇 218 处 + gate 簇 93 处 + gallery 簇 15 处 + scene 簇 75 处 + main.js 手工 3 处 = **388 处**,迁移后全 src 映射属性**零扁平残留**(grep 门禁)。
- 命名空间冻结(Object.freeze):新键塞不进别名集,也不污染扁平 ctx。
- 边界契约测试 `scripts/probe/ctx-bus-probe.js`(6 项):别名读===扁平读(函数引用同一)/别名写↔扁平写往返同步/冻结生效/eternalHandlers 经别名注册齐全且均为函数/昆仑簇契约(spiritsGot/eternalKeepOut/groundOverride)经别名可取——**总线契约第一次变成可测的**。

### 阶段三(冻结扁平写入) — ✅ 已上线(软冻结,2026-07-28,产物 main-dC-uIkAy 起)

实施形态为**软冻结**(而非硬抛错):映射属性在扁平 ctx 上全部变为存取器,真实值收进内部 `vault`;扁平写仍放行(行为不断),dev 环境(localhost/?ctxdebug)告警一次指路命名空间。同批完成:

- **命名空间扩至 7 个**:ui(反馈)/kunlun(神话层 18 键)/player(玩家门禁 8 键)/scene(场景内核 34 键)/media(媒体户外 23 键)/gallery(挂画房屋 7 键)/mode(展示模式 17 键)——共 107 个映射属性。
- **二轮迁移**:代号机扩表后 kunlun/gate/gallery/scene/main.js 再迁 **222 处**;8 个 `Object.assign(ctx,{…})` 注册点全部手工改为命名空间注册(如 `Object.assign(ctx.scene,{s,cam,…})`);冷核心 overlay/store 注册也走 `ctx.ui.*`。迁移后映射属性**扁平写零残留**(grep 门禁)。
- **刻意不迁**:模块顶层 `const {s,onTick}=ctx` 解构(读快照,语义与旧完全一致)、仅本模块自用的暴露(zoomIn/applyTexGate/renderCustomLinks/setTime/tickPhysics 保持扁平)。
- 契约探针扩至 8 项:新增新命名空间等价断言 + 软冻结存取器/扁平写同步断言。

硬冻结(扁平写抛错)评估为**不实施**:扁平读(含解构)是无处不在的既有语义,抛错只有纪律收益、有断线风险;软冻结(dev 告警)已提供同等的引导力。

### 依赖策略与测试策略(阶段一~三)

纯进程内重构。回归基线:九套测试 201 项断言全绿(test.js 127 + test-mobile 6 + overlay 12 + store 11 + media-rules 8 + ark-free 13 + spirit-hud 5 + ctx-bus 8 + security-fix 11),公网无头浏览器零 pageerror。

### 实施建议(已写入 ctx.js 头部规矩)

① 新属性先登记;② 能收进深模块(overlay/store/mediarules 模式)的不挂总线;③ 新代码写命名空间路径;④ dev 控制台出现「ctx软冻结」告警=走老路了,改成命名空间。

### 阶段四(组合根 + 依赖注入 + 事件总线 + 单向状态) — ✅ 已上线(2026-08-29)

#### 问题

阶段三解决了「属性归属与命名」,但没解决「**运行时怎么组织**」:①主循环由 `ctx.tickers` 一路 + 各模块自行 `ctx.loop.on` 拼装,谁先谁后靠 import 顺序,曾出现 `onTick` 每帧执行两次的双循环 bug;②跨模块通信靠直接改 `ctx` 属性,读者无从订阅变更(想知道 `flightLock` 何时翻转只能轮询或散点回调);③状态读写双向自由,任意模块可写任意标志,新增写入方时无法从代码推断「还有谁在监听」。

#### 已落地

`src/core/` 四件套 + 组合根,系统按统一契约注册,由组合根按层序装配:

```js
// src/core/system.js — 积木契约
export function defineSystem({ name, layer, phase, order, deps, init, update, dispose }) {}

// main.js — 组合根装配(唯一装配点)
compositionRoot.register(createStateSystem({ eventBus, gameState, ctx }));
compositionRoot.register(createInputSystem(ctx.input));
// …共 9 个系统
```

- **四层 / 多相位**:`platform`(bootstrap/input)→ `engine`(animate/ui)→ `gameplay` → `presentation`(render/ui),相位内按 `order` 排序,不再依赖 import 顺序。
- **事件总线** `ctx.events`(`src/core/event-bus.js`):`on/once/off/emit/onPropertyChange/emitPropertyChange`。命名空间 set 陷阱在变更时 `emitPropertyChange(ns,prop,new,old)`,同时发 `${ns}:changed:${prop}` 精确事件与 `${ns}:changed` 命名空间级事件。**坑:手动 `emit('ns:changed:prop')` 不会触发父级 `${ns}:changed` 监听,变更必须走 `emitPropertyChange`**。
- **单向状态** `game-state.js`(`getGameState()`):`get/set/patch/subscribe/snapshot`。`state-system` 订阅 `${ns}:changed` 把变更镜像进 game-state,使其成为**统一可读 + 可订阅源**(读模型/CQRS 投影)。
- **已抽出的 9 个系统**:`platform:bootstrap:-1000 loop` / `platform:bootstrap:0 state` / `platform:bootstrap:1 ui` / `platform:input:0 input` / `engine:animate:0 audio` / `engine:animate:0 effects` / `engine:ui:0 perf-monitor` / `presentation:render:0 media` / `presentation:ui:0 toast`。原 `src/scene/effects.js`、`src/scene/media/spatial-audio.js`、`src/scene/perf-monitor.js` 逻辑迁入 `src/core/` 后删除。
- **每刀都先部署生产验证**:垂直切片(audio → perf-monitor → effects → media → ui)逐个 build + 部署 + 无头探针验证,未攒批。

#### 依赖策略与测试策略

纯进程内重构,无新外部依赖。回归基线:九套既有测试(201 项)保持全绿,新增 `live-verify.cjs` 生产无头探针(组合根 9 系统注册齐全 + 烟花 Points 逐帧 `drawRange`/position 校验和判动画未破 + 零 pageerror)。

### 阶段五(写路径单入口 · 委托冻结) — ✅ 已上线(2026-08-29)

#### 问题

阶段四只把状态**读**侧收成单向(镜像进 game-state),**写**侧仍是双向自由:`ctx.mode.siteMode = x` 与 `gameState.set('siteMode', x)` 两条路并存。更隐蔽的是:若把绑定注册放在 `state-system.init`(运行期),则**模块导入期直写**(`player.js` 的 `viewMode=0`、`quizgate.js` 的 `quizPassed` 默认值)早于注册,会绕过 game-state,只能靠后续 seed 补值——单入口名不副实。

#### 已落地(委托 delegate 变体,零破坏)

```js
// game-state.js — 写完自身 state 后 write-through 回命名空间
set(key, value) {
  if (state[key] === value) return;      // 幂等守卫(防回环)
  state[key] = value; notify(key, value, old);
  const b = nsBindings[key];
  if (b) b.apply(key, value);            // 回写 ctx.<ns>.<prop> + 发事件
}

// ctx.js — 命名空间创建处「早注册」(早于任何模块导入期直写)
ctx.mode = createModeNamespace(vault);
gs.bindNamespace('mode', ['siteMode', …], (prop, val) => {
  const old = vault[prop];
  if (old !== val) { vault[prop] = val; eventBus.emitPropertyChange('mode', prop, val, old); }
});  // apply 直写 vault + 直发事件,不经代理 set 陷阱 → 无递归

// ctx-mode.js 等命名空间 set 陷阱
set(newValue) {
  if (gs.isBound(prop)) { gs.set(prop, newValue); return; }  // 已绑 → 委托单入口
  …原自写 vault + 发事件行为…                                 // 未绑 → 维持原样
}
```

- **写者**改走 `gameState.set`(`mode.js` 的 7 处配置下发、`quizgate.js` 门禁判定、`player.js` V 键切换、`avatar.js` 加载角色、`ark.js` 6 处 flightLock)。
- **读者零改动**:`ctx.<ns>.<prop>` 仍经 vault 拿到新值。
- **legacy 直写仍可用**,但自动委托到单入口——这是选「委托」而非「抛错」的原因:抛错会让上述导入期默认直写当场断线,风险与收益不成比例。
- **早注册**使导入期直写也走单入口,彻底消除「导入期绕过」残留缺陷。
- **已绑定**:`mode` 7 个配置下发 prop、`player`(quizPassed/viewMode)、`kunlun`(flightLock)。

**刻意不绑的三类**(绑了就是负收益):①每帧高频 prop(`pl`/`jD`/`ks`/`mv`/`drM`/`dayHour`,会每帧刷事件+存储);②初始化期能力/函数注册(`applyMode`/`texAllowed`/`eternalHandlers`/`hangOne`,一次性注册非运行期状态);③集合原地变异(`houseMats`/`paintGroups`/`myUploads` 的 `.push`——**不触发 set 陷阱**,本就不发事件)。`gallery`/`media`/`ui`/`scene` 命名空间经审计基本只剩 ②③,故不逐一绑定。

#### 依赖策略与测试策略

纯进程内重构。回归:九套既有测试 201 项全绿 + `live-verify.cjs` 扩展为**双路径探针**:

- `stage4_write_through`:对 10 个绑定 prop 走 `gameState.set`,断言 through(`ctx.<ns>.<prop>` 拿到新值)/ stored / restored。
- `stage4_legacy_funnel`:反向走 legacy 直写 `ctx.mode.siteMode = v`,断言 `gameState.get` 立即拿到新值(证明已收归单入口)+ 事件已发 + 探针后状态复原。

线上结果:`PAGE_ERRORS=0`、9 系统注册齐全、烟花逐帧动画回归、双路径探针全绿(`EXIT=0`)。

#### 实施建议(已写入 AGENTS.md「写路径单入口规矩」)

新增运行时可变状态时:①在 `ctx.js` 命名空间创建处 `bindNamespace` 登记;②写者一律 `gameState.set`,禁止新写 `ctx.<ns>.<prop> = v`(老代码不强制改,委托会自动收归);③先自查是否属于「刻意不绑的三类」;④改完必须跑 `node live-verify.cjs`。

---

## 总结:本次深化的净效果

| 维度 | 深化前 | 深化后 |
|---|---|---|
| 新增弹层 | 改 3 个文件抄三件套 | `register` 一行 |
| 新增存档键 | 全站 grep 找同款写法 | SCHEMA 登记一行 |
| 改分数线 | 人肉同步 4 处 | 改 1 处(+文档) |
| 改可见性规则 | 人肉同步前后端 4 处 | 改 1 个决策表 |
| 新增运行时状态(候选①阶段四/五) | 任意模块直写 `ctx`,读者无从订阅变更 | `bindNamespace` 登记一行 + 写者走 `gameState.set` 单入口,自动回写 + 自动发事件(legacy 直写也自动收归) |
| 主循环装配(候选①阶段四) | 靠 import 顺序拼 `ctx.tickers` + 各模块 `ctx.loop.on`(曾每帧跑两次) | 组合根按 `layer/phase/order` 装配 9 个系统,装配点唯一 |
| 防回归 | 人肉记忆 AGENTS.md 规矩 | 4 个专项探针(12+11+8+2 项)可执行门禁 + 生产无头探针 `live-verify.cjs` |
