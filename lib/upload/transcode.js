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

function compressJob(dir, name, mirror) {
  compressQueue.push([dir, name, mirror]);
  if (!compressing) nextCompress();
}
function nextCompress() {
  const job = compressQueue.shift();
  if (!job) { compressing = false; return; }
  compressing = true;
  const [dir, name, mirror] = job;
  const doMirror = typeof mirror === 'function' ? mirror : () => {};
  const done = () => setTimeout(nextCompress, 1000);
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

module.exports = { compressJob, moveNoOverwrite, VID_COMPRESS_EXT, IMG_COMPRESS_EXT };
