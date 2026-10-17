// test-backup.js — 备份脚本的离线演练(2026-10-17,外部审计 C1 整改)
//
// 为什么必须有这条:旧版 tools/backup-gallery.sh 把 tar 失败用 `2>/dev/null || true` 整个吞掉,下一行
// **无条件轮转** —— 于是"今天没备成"与"备成了"在 cron 日志里长成同一句话,而第 14 份完好备份照删。
// 而且旧版把 G/B 写死在脚本里,**没有任何注入口**,所以这类失败当年根本没法离线验证(这才是它活到今天的成因)。
// 新版加了 GALLERY_DIR/BACKUP_DIR/TAR_BIN/SQLITE_BIN/KEEP_*/REQUIRED/REQUIRE_DB 七个注入口,本文件就用它们
// 把"必须响亮的六条路径"逐条打红,并用 **HEAD 版当对照组**证明"旧版在这些条件下会报成功"。
//
// 全程不碰生产:夹具落在系统临时目录,不联网、不起 server.js、不读 /opt。
// 跑法:node scripts/test/test-backup.js
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'tools', 'backup-gallery.sh');
// 两套路径:**fs 用 Windows 原路径,bash/tar 用 MSYS 路径** —— Git Bash 自带的 bsdtar 把 `C:/…` 读成
// "远端 host:path"(报 Cannot connect to C:),只认 `/c/…`;Linux(CI)本来就是后者,转换在 Linux 上是 no-op。
const FS_TMP = path.join(os.tmpdir(), 'dg-backup-test');
const FS_BAK = path.join(os.tmpdir(), 'dg-backup-test-bk');
// ⚠️桩脚本一律落在系统临时目录,**不放仓库 .tmp/**:.tmp/ 被 .gitignore 挡着 ⇒ CI 的检出里根本没有这个目录,
// 2026-10-17 CI 就是这么炸的(ENOENT: no such file or directory, open '…/.tmp/tar-fail.sh')。
const FS_STUB = path.join(os.tmpdir(), 'dg-backup-stubs');
const msys = (p) =>
  p.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, (m, d) => '/' + d.toLowerCase() + '/');
const TMP = msys(FS_TMP);
const BAK = msys(FS_BAK);
// 对照组取的是**入库夹具**,不是 git 历史:`actions/checkout@v5` 默认 fetch-depth=1(浅检出),
// `git log -- <文件>` 在 CI 里只会剩一条提交 ⇒ "扫历史找吞失败那一版"必然假红
// (与本仓「产物溯源测试不要断 git」同一条纪律)。夹具本身由下面第一条断言验明正身。
const FIXTURE_OLD = path.join(ROOT, 'scripts', 'test', 'fixtures', 'backup-gallery.pre-fix.sh');
fs.mkdirSync(FS_STUB, { recursive: true });
const OLD = path.join(FS_STUB, 'old-copy.sh'); // 夹具的临时副本(只改 G/B 两行,不改内容)
const SCRIPT_SH = msys(SCRIPT);
const OLD_SH = msys(OLD);

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    fail++;
    console.log('  ✗ ' + name + (extra === undefined ? '' : '  → ' + extra));
  }
};

const sh = (cmd, env) =>
  spawnSync('bash', ['-c', cmd], {
    encoding: 'utf8',
    cwd: ROOT,
    env: Object.assign({}, process.env, env || {}),
    timeout: 180000,
  });

const DAY = sh('date +%Y%m%d').stdout.trim();

function resetFixture(keepOldBackups) {
  fs.rmSync(FS_TMP, { recursive: true, force: true });
  if (!keepOldBackups) fs.rmSync(FS_BAK, { recursive: true, force: true });
  const w = (rel, text) => {
    const p = path.join(FS_TMP, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  };
  fs.mkdirSync(path.join(FS_TMP, 'photos'), { recursive: true });
  fs.mkdirSync(path.join(FS_TMP, 'music'), { recursive: true });
  w('gate_data.json', '{"applicants":{}}');
  w('gate_data.db', 'SQLITE-DUMMY');
  w('gate_data.db-wal', 'WAL');
  w('gate_data.db-shm', 'SHM');
  w('.r2-outbox.json', '{"entries":[]}');
  w('data.js', 'window.P=[];');
  w('server.js', '//');
  w('package.json', '{}');
  w('index.html', '<html></html>');
  w('admin.html', '<html></html>');
  w('guide.html', '<html></html>');
  w('whiteboard.html', '<html></html>');
  w('music.html', '<html></html>');
  w('agreement.html', '<html></html>');
  w('privacy.html', '<html></html>');
  w('community.html', '<html></html>');
  w('docs.html', '<html></html>');
  w('ADMIN_GUIDE.md', '#');
  w('AGENTS.md', '#');
  w('lib/store.js', '//');
  w('scripts/admin/table-parity.cjs', '//');
  w('src/state/store-api.js', '//');
  w('photos/p.txt', 'x');
  w('music/m.txt', 'x');
  fs.mkdirSync(path.join(FS_TMP, 'questions'), { recursive: true });
  fs.mkdirSync(path.join(FS_TMP, 'videos'), { recursive: true });
  w('videos/v.txt', 'x');
  fs.mkdirSync(path.join(FS_BAK, 'daily'), { recursive: true });
  fs.mkdirSync(path.join(FS_BAK, 'weekly'), { recursive: true });
}

function seedOldArchives(n, mid, sub) {
  for (let i = 1; i <= n; i++) {
    fs.writeFileSync(path.join(FS_BAK, sub, `gallery-${mid}-2026010${i}.tar.gz`), 'OLD' + i);
  }
}

const runNew = (extraEnv) =>
  sh(
    `bash '${SCRIPT_SH}' daily`,
    Object.assign({ GALLERY_DIR: TMP, BACKUP_DIR: BAK }, extraEnv || {})
  );

const members = () => {
  const f = path.join(FS_BAK, 'daily', `gallery-data-${DAY}.tar.gz`);
  if (!fs.existsSync(f)) return null;
  const r = sh(`tar tzf '${msys(f)}'`);
  return r.status === 0 ? r.stdout.split(/\r?\n/).filter(Boolean) : { unreadable: true };
};

console.log('=== 备份脚本离线演练(夹具在临时目录,不碰生产)===' + DAY);

// ---------- ① 正常路径 ----------
resetFixture(false);
seedOldArchives(3, 'data', 'daily');
{
  // 这条走 **hot-copy 分支**(SQLITE_BIN 指到不存在的程序 ⇒ 不收口,wal/shm 原样进档)。
  // checkpointed 分支由 ⑧ 单独覆盖:那边 sqlite3 把 WAL 并回主库并删掉 -wal/-shm,归档里没有它们才是对的。
  const r = runNew({ KEEP_DAILY: '2', SQLITE_BIN: 'no-such-sqlite-on-this-box' });
  const line = (r.stdout || '') + (r.stderr || '');
  ok(
    '正常备份 BACKUP_OK',
    r.status === 0 && /BACKUP_OK/.test(line),
    'status=' + r.status + ' out=' + line.slice(0, 160)
  );
  ok('不收口时结论行如实报 dbmode=hot-copy', /dbmode=hot-copy/.test(line), line.slice(0, 120));
  const m = members() || [];
  const need = [
    'gate_data.db',
    'gate_data.db-wal',
    'gate_data.db-shm',
    'gate_data.json',
    '.r2-outbox.json',
    'data.js',
    'scripts/admin/table-parity.cjs',
  ];
  const miss = need.filter((x) => !m.includes(x));
  ok(
    '恢复集含权威 SQLite 三件 + 镜像 + R2 台账 + data.js + scripts',
    miss.length === 0,
    '缺:' + miss.join(',')
  );
  const kept = fs
    .readdirSync(path.join(FS_BAK, 'daily'))
    .filter((f) => f.endsWith('.tar.gz')).length;
  ok('轮转按 KEEP_DAILY=2 收(新档 + 1 份旧的)', kept === 2, '实际份数=' + kept);
  ok(
    '.part 不留在盘上',
    !fs.existsSync(path.join(FS_BAK, 'daily', `gallery-data-${DAY}.tar.gz.part`))
  );
}

const strays = () => {
  const d = path.join(FS_BAK, 'daily');
  return fs.existsSync(d)
    ? fs.readdirSync(d).filter((f) => f.endsWith('.part') || f.endsWith('.err'))
    : [];
};

// 替身脚本必须**真的可执行**:Windows/Git Bash 上执行位是虚的,Linux CI 上没 chmod 就是 exit 126
// ("command found but not executable")。而 126 也 >1 ⇒ 脚本照样打 BACKUP_FAILED,
// 于是"tar 致命失败"那条会在**桩根本没跑起来**的情况下通过 —— 那是假通过,比红危险。
const writeStub = (name, body) => {
  const win = path.join(FS_STUB, name);
  fs.writeFileSync(win, body);
  fs.chmodSync(win, 0o755);
  // 只在 POSIX 上真探活:Windows 既没有执行位(Node 报的 mode 永远不含 0o111),又不能直接 exec 一个 .sh
  // (EFTYPE),在那里判这件事是伪命题;Linux CI 上缺执行位会退 126 并伪装成"备份失败",所以那里必须判。
  if (process.platform !== 'win32') {
    const probe = spawnSync(win, [], { encoding: 'utf8' });
    ok(
      `替身 ${name} 真的可执行(126/127 会伪装成"备份失败")`,
      !(probe.status === 126 || probe.status === 127 || probe.error),
      'status=' + probe.status + ' err=' + ((probe.error && probe.error.code) || '')
    );
  }
  return msys(win);
};

// ---------- ② tar 真失败:要响亮,且**不许轮转** ----------
resetFixture(false);
seedOldArchives(12, 'data', 'daily');
{
  // 替身 tar:直接以 2 退出(模拟致命打包错误)
  const stub = writeStub('tar-fail.sh', '#!/bin/bash\nexit 2\n');
  const r = runNew({ TAR_BIN: stub, KEEP_DAILY: '2' });
  const line = (r.stdout || '') + (r.stderr || '');
  ok(
    'tar 致命失败 ⇒ BACKUP_FAILED + 非零退出',
    r.status !== 0 && /BACKUP_FAILED/.test(line),
    'status=' + r.status + ' out=' + line.slice(0, 120)
  );
  // 必须点名"为什么红":只判"非零 + 有 BACKUP_FAILED"的话,126(替身没有执行位)/ 127(缺解释器)
  // 都会冒充通过 —— CI 上第一次就是这么个假通过,真因是 chmod,不是备份脚本。
  ok(
    '失败原因确实是 tar 退 2(不是替身自己跑不起来)',
    /reason=tar-exit=2/.test(line),
    line.slice(0, 160)
  );
  const n = fs.readdirSync(path.join(FS_BAK, 'daily')).filter((f) => f.endsWith('.tar.gz')).length;
  ok('失败时**没有**轮转(12 份完好旧档一份没被顶掉)', n === 12, '实际=' + n);
  ok(
    '失败时没有当日档冒充成功',
    !fs.existsSync(path.join(FS_BAK, 'daily', `gallery-data-${DAY}.tar.gz`))
  );
  ok(
    '失败路径不留半截 .part / .err 在盘上(残骸会让下一次 ENOSPC 更容易发生)',
    strays().length === 0,
    strays().join(',')
  );
}

// ---------- ③ 残缺/读不了的归档:验看必须拦住 ----------
{
  resetFixture(false);
  seedOldArchives(12, 'data', 'daily');
  // 替身:"打包成功"(exit 0)但产物不是合法 gzip —— 这正是 tar 中途被 ENOSPC 咬断的形状。
  // 写法要可移植:参数由替身自己在 argv 里找(不再套一层 bash,不再用 `$#`/`${@:i:1}` 这类
  // 在 Windows 的旧 bash 与 Linux 的 bash 之间行为不一致的展开)。
  const stub = writeStub(
    'tar-garbage.sh',
    '#!/bin/bash\nprev=""\nfor a in "$@"; do\n  if [ "$prev" = czf ]; then printf NOTGZIP > "$a"; break; fi\n  prev="$a"\ndone\nexit 0\n'
  );
  const r = runNew({ TAR_BIN: stub, KEEP_DAILY: '2' });
  const line = (r.stdout || '') + (r.stderr || '');
  // 原因允许 archive-unreadable 或 archive-empty 二选一:Windows 的 bsdtar 对"文件存在但不是 gzip"
  // 有时 exit 0 且列出 0 条(实测),Linux 的 GNU tar 会 exit≠0 —— **两种都能被接住才是这条判据的意义**
  // (判据不能只认本机的工具行为,否则 CI 上会变成假红)。
  ok(
    '产物是残缺档 ⇒ BACKUP_FAILED(unreadable 或 empty 都算接住)',
    r.status !== 0 && /archive-(unreadable|empty)/.test(line),
    'status=' + r.status + ' out=' + line.slice(0, 140)
  );
  ok(
    '残缺档没有上位成当日档',
    !fs.existsSync(path.join(FS_BAK, 'daily', `gallery-data-${DAY}.tar.gz`))
  );
  ok(
    '残缺档同样不轮转旧档',
    fs.readdirSync(path.join(FS_BAK, 'daily')).filter((f) => f.endsWith('.tar.gz')).length === 12
  );
}

// ---------- ④ 权威 DB 缺席:宁可不备也不用好档去换 ----------
{
  resetFixture(false);
  fs.rmSync(path.join(FS_TMP, 'gate_data.db'));
  seedOldArchives(5, 'data', 'daily');
  const r = runNew({});
  ok(
    'gate_data.db 缺席 ⇒ REQUIRE_DB=1 拒跑(exit 8)',
    r.status === 8 && /authoritative-db-missing/.test((r.stdout || '') + (r.stderr || '')),
    'status=' + r.status
  );
  ok(
    '拒跑时旧档一份没动',
    fs.readdirSync(path.join(FS_BAK, 'daily')).filter((f) => f.endsWith('.tar.gz')).length === 5
  );
  const r2 = runNew({ REQUIRE_DB: '0' });
  ok(
    '纯 JSON 部署显式 REQUIRE_DB=0 才照跑',
    r2.status === 0 && /BACKUP_OK/.test(r2.stdout || ''),
    'status=' + r2.status
  );
}

// ---------- ⑤ 必检成员这条判据确实咬人 ----------
{
  resetFixture(false);
  const r = runNew({ REQUIRED: 'never-looked-like-this.txt' });
  ok(
    '必检成员不在归档里 ⇒ exit 5 点名',
    r.status === 5 && /archive-missing-required/.test((r.stdout || '') + (r.stderr || '')),
    'status=' + r.status
  );
}

// ---------- ⑥ 对照组:**修复之前那一版**在同一夹具下的表现(证明旧版是假成功) ----------
{
  // 三条纪律,都是本轮踩出来的:
  //  ①**不能取 `HEAD:`** —— 本测试与修复同批入仓,一提交 HEAD 上的脚本就已经是修好的那份,
  //    对照会静默退化成"新脚本和自己比"(实测:提交后这两条立刻变红,旧 status=1、归档 members 空)。
  //  ②**不能扫 git 历史** —— `actions/checkout@v5` 默认 fetch-depth=1,CI 里 `git log -- <文件>` 只剩一条提交
  //    (与本仓「山丘产物溯源不要断 git」同一条纪律)。⇒ 对照版本**入库成夹具**。
  //  ③**夹具必须验明正身** —— 拿一份"其实已经是新版"的文件当"旧版"跑,A/B 会漂亮地通过而什么也没证明。
  const isOldShape = (t) => /\|\|\s*true/.test(t) && !/BACKUP_FAILED/.test(t);
  const oldText = fs.existsSync(FIXTURE_OLD)
    ? // 归一行尾:仓库在 Windows 上按 core.autocrlf 会把 .sh 检出成 CRLF ⇒ ①`^B=…$` 这类锚点全部失配
      // (patch G/B 两行会静默失败,对照就变成"旧版去打包 /opt/gallery");②bash 也会把 `\r` 带进命令里。
      // 与仓库里"凡拿正则读源码就先归一 CRLF"是同一条纪律(第四/九刀各记过一次)。
      fs.readFileSync(FIXTURE_OLD, 'utf8').replace(/\r\n/g, '\n')
    : '';
  ok(
    `对照夹具存在且确实是"吞失败"那一版(${path.relative(ROOT, FIXTURE_OLD)})`,
    isOldShape(oldText),
    oldText ? '夹具里没有 "|| true" 或已含 BACKUP_FAILED ⇒ 对照失效' : '夹具文件不存在'
  );
  ok(
    '对照夹具 ≠ 在跑的脚本(否则 A/B 就是自己跟自己比)',
    oldText.length > 0 && oldText !== fs.readFileSync(SCRIPT, 'utf8')
  );
  const old = isOldShape(oldText) ? { rev: 'fixture', text: oldText } : null;
  if (old) {
    // 旧版把 G/B 写死(这正是它测不了的原因)——对照实验里只改这两行,其余一字不动
    const patched = old.text
      .replace(/^G=\/opt\/gallery$/m, 'G=' + TMP)
      .replace(/^B=\/opt\/backups$/m, 'B=' + BAK);
    fs.writeFileSync(OLD, patched);
    // a) 夹具里删掉一批旧版硬编码会打包的路径 ⇒ tar 必然致命失败
    resetFixture(false);
    seedOldArchives(12, 'data', 'daily');
    fs.rmSync(path.join(FS_TMP, 'photos'), { recursive: true });
    fs.rmSync(path.join(FS_TMP, 'music'), { recursive: true });
    fs.rmSync(path.join(FS_TMP, 'gate_data.json'));
    fs.rmSync(path.join(FS_TMP, 'src'), { recursive: true });
    const oldRun = sh(`bash '${OLD_SH}' daily`);
    const oldLine = (oldRun.stdout || '') + (oldRun.stderr || '');
    const newRun = sh(`bash '${SCRIPT_SH}' daily`, {
      GALLERY_DIR: TMP,
      BACKUP_DIR: BAK,
      REQUIRE_DB: '0',
    });
    ok(
      '★ A/B 决定性一条:同一夹具下旧版报"成功"(exit 0),新版报 BACKUP_FAILED',
      oldRun.status === 0 &&
        /backup daily done/.test(oldLine) &&
        newRun.status !== 0 &&
        /BACKUP_FAILED/.test((newRun.stdout || '') + (newRun.stderr || '')),
      '旧 status=' + oldRun.status + ' 新 status=' + newRun.status
    );
    // b) 旧版归档里没有 SQLite 权威库(即使它跑成功的那次)
    resetFixture(false);
    const oldOk = sh(`bash '${OLD_SH}' daily`);
    const f = path.join(FS_BAK, 'daily', `gallery-data-${DAY}.tar.gz`);
    const m = fs.existsSync(f) ? sh(`tar tzf '${msys(f)}'`).stdout.split(/\r?\n/) : [];
    ok(
      '★ A/B 第二条:旧版即使打包成功,归档里也没有 gate_data.db(R2 台账/data.js 同样没有)',
      oldOk.status === 0 &&
        !m.includes('gate_data.db') &&
        !m.includes('.r2-outbox.json') &&
        !m.includes('data.js'),
      'members=' + m.slice(0, 6).join(',')
    );
    const newOk = sh(`bash '${SCRIPT_SH}' daily`, { GALLERY_DIR: TMP, BACKUP_DIR: BAK });
    const nm = members() || [];
    ok(
      '新版同夹具包含这三件',
      newOk.status === 0 &&
        nm.includes('gate_data.db') &&
        nm.includes('.r2-outbox.json') &&
        nm.includes('data.js')
    );
  }
}

// ---------- ⑦ weekly 路径也走同一套判定 ----------
{
  resetFixture(false);
  seedOldArchives(4, 'videos', 'weekly');
  const r = sh(`bash '${SCRIPT}' weekly`, {
    GALLERY_DIR: TMP,
    BACKUP_DIR: BAK,
    KEEP_WEEKLY: '2',
    REQUIRED: 'videos',
  });
  const line = (r.stdout || '') + (r.stderr || '');
  ok(
    'weekly 成功并收拢到 2 份',
    r.status === 0 && /BACKUP_OK mode=videos/.test(line),
    'status=' + r.status + ' out=' + line.slice(0, 140)
  );
  ok(
    'weekly 轮转后剩 KEEP_WEEKLY=2',
    fs.readdirSync(path.join(FS_BAK, 'weekly')).filter((f) => f.endsWith('.tar.gz')).length === 2
  );
}

// ---------- ⑧ checkpoint 会"吃掉"-wal/-shm ⇒ 清单必须在它之后采(2026-10-17 写测试时当场撞出的自伤) ----------
{
  resetFixture(false);
  const stub = writeStub(
    'sqlite-eats-wal.sh',
    // 真 sqlite3 的 wal_checkpoint(TRUNCATE) 之后,SQLite 会把 -wal / -shm 一并删掉(它们是临时文件)
    '#!/bin/bash\nrm -f "$1-wal" "$1-shm"\nexit 0\n'
  );
  const r = runNew({ SQLITE_BIN: stub, REQUIRED: 'gate_data.db' });
  const line = (r.stdout || '') + (r.stderr || '');
  ok(
    'checkpoint 之后 -wal 消失 ⇒ 备份仍须成功(清单在它之后采)',
    r.status === 0 && /BACKUP_OK/.test(line),
    'status=' + r.status + ' out=' + line.slice(0, 200)
  );
  ok(
    '结论行报 dbmode=checkpointed(而不是偷偷说 hot-copy)',
    /dbmode=checkpointed/.test(line),
    line.slice(0, 120)
  );
  const m = members() || [];
  ok('归档里仍有主库 gate_data.db', m.includes('gate_data.db'), m.slice(0, 6).join(','));
  // 反向验证:这条"checkpoint 必须在采清单之前"的顺序判据必须有可能失败。
  // 做法不是改脚本(那会碰运行期),而是把同一个谓词喂给一份**故意把两个标记调换**的副本 ——
  // 谓词在真脚本上判"顺序正确",在调换版上必须判"顺序错误",否则它就是在空转。
  const orderOf = (src) => {
    const a = src.indexOf('wal_checkpoint(TRUNCATE)');
    const b = src.indexOf('$(pick');
    return a >= 0 && b >= 0 && a < b;
  };
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const swapped = src
    .replace('wal_checkpoint(TRUNCATE)', '\u0000CHK\u0000')
    .replace('$(pick', 'wal_checkpoint(TRUNCATE)')
    .replace('\u0000CHK\u0000', '$(pick');
  ok('顺序判据在真脚本上成立(checkpoint 早于采清单)', orderOf(src) === true);
  ok(
    '★ 顺序判据在调换版上必须判假(证明它会咬人)',
    orderOf(swapped) === false,
    '调换版判定=' + orderOf(swapped)
  );
}

// ---------- ⑨ 结构自检:两类"本地绿、CI 红"的写法不许再回到本文件 ----------
{
  // 本轮 CI 就是死在这两件事上(两次不同的失败,同一个根源:CI 的检出比本机干净):
  //  ① 桩脚本写进 `<仓库>/.tmp/` —— 那目录被 .gitignore 挡着,CI 检出里**不存在** ⇒ ENOENT,测试直接崩;
  //  ② 对照组去 `git log/show` 取历史版本 —— `actions/checkout@v5` 默认 fetch-depth=1 ⇒ 浅检出里没有旧提交。
  // 判据读自己的源码,并且**在一份合成样本上证明它会红**(不然又是"看起来在判,其实没判")。
  const ciHostile = (src) => {
    const hits = [];
    if (/path\.join\(\s*ROOT\s*,\s*['"]\.tmp['"]/.test(src))
      hits.push('写进 gitignored 的仓库 .tmp/');
    if (/spawnSync\(\s*['"]git['"]/.test(src)) hits.push('断 git 历史(浅检出下必红)');
    return hits;
  };
  // 扫描边界:只扫**本块之前**的源码 —— 否则下面两条合成样本(故意写成违规形状)会被自己的谓词抓到,
  // 报出"本文件违规"这种假红(第一轮就是这么红的:谓词读到了它自己的测试数据)。
  const me = fs.readFileSync(__filename, 'utf8').split('⑨ 结构自检')[0];
  ok('本测试不写仓库 .tmp/、也不断 git 历史', ciHostile(me).length === 0, ciHostile(me).join(','));
  ok(
    '★ 这条自检在合成样本上必须判红(证明它会咬人)',
    ciHostile("x = path.join(ROOT, '.tmp', 'a.sh')").length === 1 &&
      ciHostile("spawnSync('git', ['log'])").length === 1
  );
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
