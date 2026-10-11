# Immutable release（releases/<sha> + current symlink）落地方案

> 状态：**纯设计文档，不改变任何现有行为。** 落地前的部署仍走 `scripts/deploy.sh` 当前的
> "tar 直接覆盖 `/opt/gallery` + 差集清理残留" 模式（2026-10-11 T3 版本）。
> 本文给出一条从"覆盖式部署"渐进到"不可变发布 + 原子切换 + 一键回滚"的分阶段路径，
> 并列出所有需要**主人在服务器侧**执行/拍板的准备步骤与风险点。

## 0. 为什么要做（当前模式的真实缺陷）

- `/opt/gallery` 是**就地覆盖**：`tar -xzf` 只写新版本的文件，从不删除新版本里已不存在的旧文件
  （历史 `entrygate-*.js` 等哈希块、已下线的根级 html 会残留，且可能被 Cloudflare 边缘继续服务）。
  T3 已经在 `deploy.sh` 里加了"基于本次 dist 清单的差集清理"止血，但那只是**逼近**不可变发布，
  不是真不可变：切换过程不是原子的（先传 assets 再传 html，中间存在半个新版本窗口），
  也没有"旧版本原样保留、失败即切回"的能力。
- 后端四块盲区里 `server.js`/`lib/*.js` 靠 `scripts/backend-sync.sh` 做 md5 增量同步——同样就地覆盖，
  回滚只能靠备份目录里手挑文件重新 scp。
- 站点根 `/opt/gallery` **不是 git 仓库**（靠 scp，不能 `git pull`），所以 immutable release 的"按 commit 落盘"
  必须在部署脚本里显式实现，不能指望服务器上有 git。

## 1. 目标形态

```
/opt/gallery-releases/
    <sha-1>/            # 每个 release 一份完整、只读的 dist 产物（+ 后端代码）
    <sha-2>/
    ...
/opt/gallery  ->  /opt/gallery-releases/<sha-N>   # 唯一的可变指针（symlink）
/opt/gallery-data/       # 与代码分离的持久数据：models/ photos/ videos/ music/ gate_data* .env
                         #   —— 这些永远不随 release 切换，也不参与清理
```

- 部署 = 新建 `releases/<sha>` → 校验 → **原子**把 `/opt/gallery` 这个 symlink 切到新目录。
- 回滚 = 把 symlink 切回旧 `<sha>`（`pm2 restart` 可选）。秒级、不重新构建。
- 保留最近 N 个 release 目录，其余删除（`releases/` 与 web root 天然分离，旧版本无公网泄露面）。

## 2. 分阶段落地（每阶段都可独立上线、可回退）

### 阶段 A — 数据与代码分家（服务器侧，风险最高，需停机窗口）
1. 建持久数据目录并把现有数据搬进去（**cp -a 保留权限/时间戳，先不删原文件**）：
   `models/ photos/ videos/ music/ gate_data.db* gate_data.json .env` → `/opt/gallery-data/`。
2. 让 Node 服务从 `/opt/gallery-data/...` 读取：这要改后端路径常量（`lib/config.js` 之类），
   **属 `lib/**` 范围，本方案不触碰**；改前用 `USE_SQLITE`/env 兜底，改后按 T 流程 backend-sync。
   风险：路径改错=媒体/存档全 404。务必先 `--dry` 比对、双端 md5、线上探针。
3. 数据分家完成前，**不能**进入阶段 B（symlink 切换会把数据目录一起切走）。

### 阶段 B — 只读 release 目录 + 原子 symlink 切换（部署脚本改造）
1. `deploy.sh` 改为：本地构建 → 打包 dist → scp 到 `/opt/gallery-releases/<sha>.tar.gz` →
   服务器解到 `/opt/gallery-releases/<sha>/`（全新目录，不碰线上）。
2. 校验 `<sha>/`（`ls` 关键文件、可选起一个临时端口探活），**绿了才**做原子切换：
   `ln -sfn /opt/gallery-releases/<sha> /opt/gallery.new && mv -Tf /opt/gallery.new /opt/gallery`
   （`mv -T` 对 symlink 是原子的，读端不会看到半新半旧）。
3. 后端代码也进 release 目录（`server.js`/`lib/` 随 `<sha>` 一起落），与 dist 同版本；
   共享数据走阶段 A 的 `/opt/gallery-data`，不在 release 内。
4. `pm2 restart gallery --kill-timeout 25000`（drain 15000ms，见 T4 说明）。
5. **注意**：现有 `deploy.sh` 的差集清理、models 增量同步、backend-sync 在阶段 B 会被"整目录新发"取代；
   切换前不要删旧 release（回滚要用）。

### 阶段 C — nginx/pm2 指向与权限核对
- server.js 里写死了 `/opt/gallery/assets`、`/opt/gallery/models` 等**绝对路径**；切成 symlink 后这些路径
  仍解析得到（symlink 透明），但 `models/` 变成 `/opt/gallery-data/models` 的软链或改常量（阶段 A 决定）。
- 若将来引入独立 deploy 用户（见 §3），需确认该用户对 `/opt/gallery-releases` 有写、对 symlink 有 `ln -sfn` 权、
  对 pm2 有 `pm2 restart gallery` 权（走 sudo 白名单），且 nginx 反代的 `proxy_pass` 到 3000/3443 不变。
- Cloudflare 前置不变；边缘缓存策略不变（immutable 哈希资源仍靠内容哈希，根级 html 仍 no-cache）。

### 阶段 D — 失败自动回滚 + 版本戳
- 切换后跑健康探针（`/healthz`、`index.html` 实际引用的 chunk grep 哈希）；不健康则
  `ln -sfn` 切回上一个 `<sha>` 再 `pm2 restart`，并把失败 release 标记不删（供取证）。
- 线上"版本戳"核对姿势不变：取 `index.html` 真正引用的 chunk（entrygate 是运行时动态 import，
  index.html 只静态引用共享 main chunk）去 grep 提交哈希，别信 `ls assets/entrygate-*.js`。

## 3. 只部署 CI artifact（与 T4 CI 闸门配套）
- 更严格的做法：`deploy.sh` 不再本地构建，而是从 **通过的 CI run** 下载它构建好的 `dist` artifact
  （`gh run download <run-id> -n dist`），部署的就是 CI 验证过的那份字节。需要：
  - CI 增加 `actions/upload-artifact`（dist 目录）步骤；
  - artifact 要含 `models/` 吗？不含（models 是持久数据，走数据分家）。
- 好处：杜绝"本地构建产物 ≠ CI 验证产物"的差异；配合 T4 闸门，红 CI 根本没有可部署的 artifact。

## 4. 风险点清单（落地前必须逐条确认）
- 停机窗口：阶段 A 数据搬移 + 后端路径改常量风险最高，建议低峰执行并先全量备份 `/opt/backups`。
- symlink 与 SELinux/权限：`ln -sfn` + `mv -T` 组合在标准 ext4/Alibaba Linux 上原子；确认无人用 `cp` 语义误跟进。
- `--no-prune`/差集清理与新模式互斥：进入阶段 B 后差集清理不再需要（新目录天然干净），要显式移除该逻辑避免误删。
- pm2 进程 cwd：若 pm2 记录的工作目录是被删除的旧 release 路径，restart 可能找不到入口——切换后 `pm2 restart gallery --update-env` 并核对 `pm2 describe gallery` 的 `script`/`cwd` 指向 symlink。
- 凭据与主机信任：本仓库 `deploy.sh` 用 `accept-new`，切换 deploy 用户需先 `--pin-hostkey` 落 `scripts/known_hosts`。

## 5. 服务器侧准备步骤（主人执行；本文件只是登记，脚本不代做）
见本次整改回报里的"服务器侧步骤清单"（建 deploy 用户、目录属主、只允许 `pm2 restart gallery` 的 sudo 白名单）。
本方案（immutable release）的服务器侧前置=阶段 A 的数据目录与后端路径改造，务必先完成再谈 symlink 切换。
