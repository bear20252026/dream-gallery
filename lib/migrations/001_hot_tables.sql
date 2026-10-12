-- 001_hot_tables.sql — R1 第 1-2 步:四个 append-only 热集合搬进真表(影子双写阶段)
-- ===================== 迁移纪律(路线图 REFACTOR-PLAN R1 第 1 步明文)=====================
--   ① 只允许 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS;
--   ② 禁止任何破坏性 ALTER(DROP TABLE / DROP COLUMN / RENAME / 改列类型 / TRUNCATE)——
--      迁移器按 schema_version 单向前进,没有"回滚脚本"这一概念,写坏一次就永久坏;
--   ③ 每个语句都必须幂等(重跑不报错、不重复建对象)。
--   列的选取标准:**完整还原 gateData 数组元素的每个字段**,这样"切读"阶段不必再改表。
--   时间戳列沿用源字段名(chat 用 ts,其余用 t),保留期裁剪(lib/retention.js)按这一列出 DELETE。
--
-- src 列 = 这一行的来源:'live' 影子写(写入点实时双写)| 'backfill' 一次性历史回填。
-- written_at = 落表时刻(毫秒),与 ts/t 的差就是"写入延迟",对账脚本据此解释 ±1ms 判据。

-- ===================== gateData.chat(lib/chat.js,MAX_MSG=100 条环形裁剪)=====================
-- 源元素 { n, t, ts, dk, admin?, bot? }。
-- ⚠️ 读接口 GET /api/chat 里的 `me` 不是存储字段,而是 `m.dk === 请求者 dk` 的读时投影,
--    所以这里必须落 `dk` 列(有 dk 就能还原 me,反过来不行)。
CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,                    -- 消息时间(毫秒)
  nick        TEXT    NOT NULL DEFAULT '',          -- n:昵称 / 「管理员」/ 「昆仑之灵」
  body        TEXT    NOT NULL DEFAULT '',          -- t:正文(≤140 字;机器人回帖同)
  dk          TEXT,                                 -- 设备指纹键(读侧据此算 me;bot 消息为 NULL)
  admin       INTEGER NOT NULL DEFAULT 0,           -- 后台 token 代发的管理员发言
  bot         INTEGER NOT NULL DEFAULT 0,           -- @昆仑之灵 召唤出的机器人回帖
  src         TEXT    NOT NULL DEFAULT 'live',
  written_at  INTEGER NOT NULL DEFAULT 0
);
-- 保留期裁剪(DELETE WHERE ts < ?)与"按时间读最近 N 条"都吃这一列
CREATE INDEX IF NOT EXISTS idx_chat_messages_ts ON chat_messages (ts);

-- ===================== gateData.linkClicks(lib/track.js,CLICK_CAP=5000,攒批落库)=====================
-- 源记录 { t, dk, name, ip, geo, ua, brand, dev, fp, link, url, pos }——单条最重的一列集全。
-- dev / fp / pos 是嵌套对象,按 JSON 落列(读侧 JSON.parse 还原;查询条件从不穿透它们:
-- 后台只按时间倒序取最近 300 条与导出 xlsx,逐字段列式化留给切读阶段)。
CREATE TABLE IF NOT EXISTS click_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  t           INTEGER NOT NULL,                    -- 点击时刻(毫秒)
  dk          TEXT,
  name        TEXT,                                 -- 昵称(档案没有就 '访客')
  ip          TEXT,
  geo         TEXT,                                 -- IP→归属地缓存快照
  ua          TEXT,
  brand       TEXT,
  dev         TEXT,                                 -- JSON:档案附加(电量/网络等)
  fp          TEXT,                                 -- JSON:白名单裁剪后的设备指纹
  link        TEXT,                                 -- 链接名(≤40)
  url         TEXT,                                 -- 目标 URL(≤300)
  pos         TEXT,                                 -- JSON:{x,y,z} 馆内坐标,或 NULL
  src         TEXT    NOT NULL DEFAULT 'live',
  written_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_click_events_t    ON click_events (t);
CREATE INDEX IF NOT EXISTS idx_click_events_dk_t ON click_events (dk, t);

-- ===================== 客户端报错(两条信道,一张表,channel 区分)=====================
-- channel='gate' → gateData.clientErrors(lib/track.js handleTrackError,ERR_CAP=500,纯追加)
--                   源记录 { t, dk, name, ip, brand, msg, src, line, ua }
-- channel='file' → client_errors.json(lib/client-errors.js record(),MAX_ITEMS=500,**按
--                   message+source+type 聚合**:同一条错误 count++ / lastT 刷新,不是追加)
--                   源条目 { id, t, lastT, type, message, source, lineno, colno, stack, url,
--                            viewMode, playerPos, ua, world, ip, count }
-- 判龄字段:retention 对 gate 信道按 t、对 file 信道按 lastT(缺失退回 t)——两个 DELETE 都覆盖。
CREATE TABLE IF NOT EXISTS client_errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT    NOT NULL,                    -- 'gate' | 'file'
  src_id      TEXT,                                -- file 信道的聚合主键(client_errors.json 的 id)
  t           INTEGER NOT NULL,                    -- 首次出现时刻
  last_t      INTEGER,                             -- 最近一次出现(file 信道判龄用;gate 信道为 NULL)
  count       INTEGER NOT NULL DEFAULT 1,          -- 聚合计数
  type        TEXT,                                -- js / promise / resource / webgl / network
  message     TEXT,                                -- ≤400(file 信道正文)
  source      TEXT,                                -- ≤200(file 信道来源文件)
  msg         TEXT,                                -- gate 信道的报错正文(≤300;源字段名 msg)
  src_file    TEXT,                                -- gate 信道的来源文件(≤200;源字段名 src,
                                                   --   本列让位给四张表统一的 src 来源标记,故改名)
  lineno      INTEGER,
  colno       INTEGER,
  stack       TEXT,                                -- ≤2000
  url         TEXT,                                -- ≤200
  view_mode   TEXT,                                -- 第一/第三人称(原样存字符串,缺失为 NULL)
  player_pos  TEXT,                                -- ≤60
  world       TEXT,                                -- ≤20
  ua          TEXT,
  ip          TEXT,
  dk          TEXT,                                -- 以下三列只有 gate 信道写
  name        TEXT,
  brand       TEXT,
  line        INTEGER,                             -- gate 信道的行号(源字段就叫 line)
  src         TEXT    NOT NULL DEFAULT 'live',     -- 'live' 影子写 | 'backfill' 一次性历史回填
  written_at  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (channel, src_id)                          -- src_id 为 NULL(gate 信道)⇒ 每行都唯一,不影响追加
);
CREATE INDEX IF NOT EXISTS idx_client_errors_channel_t ON client_errors (channel, t);
CREATE INDEX IF NOT EXISTS idx_client_errors_last_t    ON client_errors (channel, last_t);

-- ===================== gateData.visits(lib/store.js recordVisit,{t,id},超 1000 裁旧)=====================
-- 源元素 { t, id } —— id 是访客档案键(= vid),可为 null。
CREATE TABLE IF NOT EXISTS visits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  t           INTEGER NOT NULL,                    -- 访问时刻(毫秒)
  vid         TEXT,                                 -- 访客档案 id(id || null)
  src         TEXT    NOT NULL DEFAULT 'live',
  written_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_visits_t     ON visits (t);
CREATE INDEX IF NOT EXISTS idx_visits_vid_t ON visits (vid, t);
