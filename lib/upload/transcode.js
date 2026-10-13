// transcode.js — 后台异步压缩队列(省存储,不占上传速度)
// (2026-10-12 审计挂账 R2 第一步自 lib/files-upload.js 原样搬入:改名闸门、临时名唯一化、
//  归属/配文迁移条件与"没省多少就保留原文件"的判据一字未改)
//
// 规则:上传完成响应后才开始;单任务队列(2 核服务器);nice 低优先级;
// 只有压缩后更小才替换;视频统一转 mp4 时同步迁移 uploads/photoCaptions 记录;
// 图片必须保持原扩展名(画框按原文件名引用,改名会 404 白框),bmp/tiff 同格式压不动直接跳过
//
// R2 镜像走调用方传进来的 mirror(= lib/files-upload.js 的 r2Mirror:先记持久台账再 fire-and-forget),
// 本模块不 require 回编排层,也不直连 r2sync/r2outbox —— no-circular 是 CI 硬闸。
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../config');

// spawn 走调用期取用(不在顶层解构):单测据此可桩掉 ffmpeg,不必依赖真二进制
function spawnProc(cmd, args, opts) { return require('child_process').spawn(cmd, args, opts); }

const compressQueue = [];
let compressing = false;
let current = null; // 正在跑的那件 [dir, name, mirror](入队去重用,见 compressJob)
let compressTmpSeq = 0; // 压缩临时名的进程内计数(与 pid 一起构成唯一后缀)
const VID_COMPRESS_EXT = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.3gp', '.mpg', '.mpeg'];
const IMG_COMPRESS_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

// 不覆盖式搬移:link 在目标已存在时必失败(EEXIST),把"查存在→搬移"的竞态窗口交给内核判
//   link 不可用(跨设备/文件系统限制)时退回 existsSync+rename,目标存在仍旧拒
function moveNoOverwrite(src, dst) {
  try { fs.linkSync(src, dst); fs.unlinkSync(src); return true; }
  catch (e) {
    if (e && e.code === 'EEXIST') return false;
    if (fs.existsSync(dst)) return false;
    try { fs.renameSync(src, dst); return true; } catch (e2) { return false; }
  }
}

/**
 * 入队一个压缩任务。返回 false = 没排(同一个 (dir,name) 已经在队列里或正在跑)。
 * 2026-10-13 加去重:补转扫描是"每小时一轮",而一个 700MB 视频的转码可能超过一小时才结束,
 * 不去重就会把同一个文件一遍遍投进队列,白烧 2 核机器的 CPU(真出现过后一个会 linkSync 撞 EEXIST
 * 而放弃改名,不会损坏文件,但每次都是几十分钟的死转)。
 */
function compressJob(dir, name, mirror) {
  if (current && current[0] === dir && current[1] === name) return false;
  if (compressQueue.some((j) => j[0] === dir && j[1] === name)) return false;
  compressQueue.push([dir, name, mirror]);
  if (!compressing) nextCompress();
  return true;
}
function nextCompress() {
  const job = compressQueue.shift();
  if (!job) { compressing = false; return; }
  compressing = true;
  current = job;  // 这件正在飞(直到 done() 才清,见下)
  const [dir, name, mirror] = job;
  const doMirror = typeof mirror === 'function' ? mirror : () => {};
  // current 必须在**这件收工的那一刻**清空,而不是等下一件开工时再清:两件之间有 1s 冷却,
  // 若在整个冷却期里都算"在飞",同一名字在这 1s 内被再次上传(改名走后又被人用同名传回来)
  // 就会被去重静默丢掉 —— 那条上传从此再也轮不到压缩,因为没人会重新投它。
  const done = () => { current = null; setTimeout(nextCompress, 1000); };
  try {
    const ext = path.extname(name).toLowerCase();
    const dirRoot = path.join(ROOT, dir);
    const filePath = `${dirRoot}${path.sep}${name}`; // 与 join 等价(name/dir 为内部队列白名单值)
    if (!filePath.startsWith(dirRoot + path.sep)) return done(); // 压缩队列路径兜底
    const size0 = fs.statSync(filePath).size;
    const isVid = dir === 'videos' && VID_COMPRESS_EXT.includes(ext);
    const isImg = dir === 'photos' && IMG_COMPRESS_EXT.includes(ext);
    // 小文件不动:图片 <1MB、已是 mp4 且 <20MB
    if ((!isVid && !isImg) || (isImg && size0 < 1024 * 1024) || (isVid && ext === '.mp4' && size0 < 20 * 1024 * 1024)) return done();
    const base = name.slice(0, name.length - ext.length);
    // 图片保持原扩展名输出(永不改名);只有视频才会转 .mp4
    const outExt = isVid ? '.mp4' : ext;
    // 临时名带进程内唯一后缀:此前按 basename 派生 ⇒ 同 basename 的两个并发压缩会争抢同一个 tmp
    //   (队列是单工位,但改名后的重投/后台同名上传仍可能并行;争抢会把 A 的产物写成 B 的名字)
    const tmpPath = path.join(ROOT, dir, base + '.compressing.' + process.pid + '.' + (++compressTmpSeq) + outExt);
    const args = isVid
      ? ['-y', '-i', filePath, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '800k', '-maxrate', '1000k', '-bufsize', '2000k', '-vf', "scale='min(1280,iw)':-2", '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmpPath]
      : (ext === '.png'
        ? ['-y', '-i', filePath, '-vf', "scale='min(1920,iw)':-2", '-compression_level', '9', tmpPath]
        : ['-y', '-i', filePath, '-vf', "scale='min(1920,iw)':-2", '-q:v', '3', tmpPath]);
    const p = spawnProc('nice', ['-n', '19', 'ffmpeg', ...args], { stdio: 'ignore' });
    p.on('error', done);
    p.on('close', code => {
      try {
        if (code === 0 && fs.existsSync(tmpPath)) {
          const size1 = fs.statSync(tmpPath).size;
          if (size1 < size0 * 0.92) {
            // 明显更小才替换
            const newName = base + outExt;
            const newPath = path.join(ROOT, dir, newName);
            const renaming = newName !== name; // 图片 outExt===ext ⇒ newName===name,只有视频改名
            // DG-FILE-001#1:改名前必须查目标 —— 上传阶段的 409 只查原始名(abc.mov 不存在即放行),
            //   于是上传 abc.mov 可在后处理覆盖已存在的 abc.mp4(画廊展品文件 + CDN 对象一起被换)。
            //   目标已存在 = 放弃改名:保留原文件与原归属,搬来的产物直接删,不做 uploads 迁移也不 PUT 新名。
            if (renaming && fs.existsSync(newPath)) {
              console.warn(`[upload] 压缩改名目标已存在,放弃改名(保留 ${name} / 不覆盖 ${newName})`);
              try { fs.unlinkSync(tmpPath); } catch (e) {}
              return done();
            }
            if (renaming && !moveNoOverwrite(tmpPath, newPath)) {
              // 上面 existsSync 与落盘之间的竞态:独占 link 失败说明目标刚被别人占 ⇒ 同样放弃改名
              console.warn(`[upload] 压缩改名被独占创建拒绝(目标刚出现),放弃改名: ${newName}`);
              try { fs.unlinkSync(tmpPath); } catch (e) {}
              return done();
            }
            if (!renaming) fs.renameSync(tmpPath, newPath); // 原地替换自己的文件,不涉及他人
            if (renaming) fs.unlink(filePath, () => {});
            const { gateData, saveGateData } = require('../store');
            let dirty = false;
            // DG-FILE-001#2:归属迁移只在"目标键不存在"时进行,并二次确认目标键未被他人占用 ——
            //   无条件搬键会把已存在的 abc.mp4 的 dk/aid/mt(所有权)一起搬走
            if (renaming && gateData.uploads && gateData.uploads[name] && !gateData.uploads[newName]) {
              gateData.uploads[newName] = gateData.uploads[name];
              delete gateData.uploads[name]; dirty = true;
            }
            if (renaming && gateData.photoCaptions && gateData.photoCaptions[name] && !gateData.photoCaptions[newName]) {
              gateData.photoCaptions[newName] = gateData.photoCaptions[name];
              delete gateData.photoCaptions[name]; dirty = true;
            }
            if (dirty) saveGateData();
            // 压缩版替换了服务器文件 → 重新镜像 R2,保证两边一致
            doMirror(dir, newName, newPath);
          } else {
            fs.unlink(tmpPath, () => {}); // 没省多少,保留原文件
          }
        }
      } catch (e) { /* 失败保原文件 */ }
      done();
    });
  } catch (e) { done(); }
}

// ===================== 分片视频的"空闲补转"(2026-10-13,主人拍板的第三条路)=====================
// 背景:分片应急通道**有意**不进实时压缩队列(见 lib/upload/publish.js 的 compress:false)——
//   那条路存在的理由就是"边缘→源站只有 12-40KB/s 的晚高峰",几百 MB 的视频当场排队 ffmpeg
//   会把正在服务的其它请求一起拖慢。但代价是:走分片上传的 .mov/.m4v/.mkv 永远不会被规范化成
//   .mp4,而**直传那条路会** ⇒ 两条通道的产物不对等(存储上差一个数量级;Firefox 等浏览器对
//   .mov/.m4v 的支持也不齐)。
// 补转的做法:不在上传当场转,而是**启动 + 每小时**扫一遍 `videos/` 根目录,把"该规范化却还没规范化"
//   的**访客上传**文件投进同一个单工位队列(队列本身是 nice -n 19 + 串行,天然是空闲工位)。
//   三条约束让这件事不会咬人:
//     ① 只吃 `gateData.uploads` 里有归属记录的名字 ⇒ 主人手工 scp 到 videos/ 的归档文件绝不会被
//        顺手改名(改名会搬走 uploads 记录并 PUT 一个新的 R2 对象,那是不可逆的对外动作);
//     ② 目标盘剩余低于水位就整批不捡(转码要写临时文件,盘紧时先把活停下来);
//     ③ 每轮限量(默认 3):历史存量靠每小时一轮慢慢收敛,而不是一次把队列灌满几十个大文件。
//   幂等性:压缩成功 → 名字变成 <主干>.mp4 且归属记录同步迁移 ⇒ 下一轮扫描不再命中;
//   压缩失败/"没省多少" → 原文件保留,下一轮再试一次(与直传通道的既有语义一致,不新增失败面)。
// 参与补转的扩展名 = "浏览器可能放不出来"的那批容器。
// ⚠️ 刻意**不含** .mp4 与 .webm:两者现代浏览器都能播,补转它们只省磁盘不修可用性;
//    而"回头重编码历史大 mp4"(直传通道对 >20MB 的 mp4 是会重编码的)属于把策略追加到别人的
//    存量文件上,不是这一刀的范围 —— 只做容器归一,不做存量重压。
const NORMALIZE_EXT = ['.mov', '.m4v', '.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.3gp', '.mpg', '.mpeg'];

/** 该扩展名是否需要补转成 .mp4(mp4 是目标格式,自身排除) */
function needsNormalize(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  return !!ext && ext !== '.mp4' && NORMALIZE_EXT.includes(ext);
}

/**
 * 从目录清单里挑出该补转的文件(纯函数,零 IO ⇒ 单测直接喂形状)。
 * @param {string[]} names videos/ 的 readdirSync 结果
 * @param {object} uploads gateData.uploads(有归属记录才算"访客上传",主人的手工归档不碰)
 * @returns {string[]} 排序后的候选
 */
function pickPending(names, uploads) {
  const owned = uploads || {};
  return (Array.isArray(names) ? names : [])
    .filter((n) => {
      if (typeof n !== 'string' || !n) return false;
      if (n.startsWith('.')) return false;                       // .compressing.* 临时文件、点开头一律跳过
      if (n.includes('/') || n.includes('\\')) return false;      // 只吃 videos/ 根:户外大屏/ 与 hls/ 是另一套资产
      if (n.toLowerCase().includes('.bak')) return false;         // 备份文件不参与
      if (!needsNormalize(n)) return false;
      return !!owned[n];                                          // ① 只处理有归属记录的访客上传
    })
    .sort();
}

/**
 * 捡一批进压缩队列。
 * @param {object} o { list, mirror, freeBytes, minFree, max, enqueue }
 *   freeBytes=null(取不到盘余量)⇒ 按"无法判定"处理,**不捡**(水位判不了就别动别人的文件)
 *   enqueue 可注入(单测据此验"捡了谁",不至于真把文件名投进会 spawn ffmpeg 的队列)
 * @returns {{enqueued:string[], skipped:null|'lowdisk'|'nostats', free:number|null}}
 */
function queuePending(o) {
  const opt = o || {};
  const list = Array.isArray(opt.list) ? opt.list : [];
  const max = Number.isFinite(opt.max) && opt.max > 0 ? opt.max : 3;
  const minFree = Number.isFinite(opt.minFree) ? opt.minFree : 0;
  const free = Number.isFinite(opt.freeBytes) ? opt.freeBytes : null;
  if (!list.length) return { enqueued: [], skipped: null, free };
  if (free === null) return { enqueued: [], skipped: 'nostats', free };
  if (free < minFree) return { enqueued: [], skipped: 'lowdisk', free };
  const take = list.slice(0, max);
  const enq = typeof opt.enqueue === 'function' ? opt.enqueue : compressJob;
  // enqueue 返回 false 表示"这件已在队列里/正在跑"(compressJob 的去重),日志就不虚报捡了几个
  const took = take.filter((n) => enq('videos', n, opt.mirror) !== false);
  return { enqueued: took, skipped: null, free };
}

module.exports = {
  compressJob, moveNoOverwrite, VID_COMPRESS_EXT, IMG_COMPRESS_EXT,
  needsNormalize, pickPending, queuePending, NORMALIZE_EXT,
};
