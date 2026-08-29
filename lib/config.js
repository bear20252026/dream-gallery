// 配置:.env 加载与全部常量
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// .env 加载:本地开发用 npm 包 dotenv(标准、支持引号/多行值);
// 生产服务器是零依赖裸跑(无 node_modules),自动回退到内置手写解析,行为不变。
// 两者都不覆盖已存在的真实环境变量(pm2 env 优先)。
let dotenvLoaded = false;
try {
  require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
  dotenvLoaded = true;
} catch { /* 生产无 node_modules,走下方手写解析 */ }

// 零依赖 .env 加载(生产兜底;dotenv 成功时跳过)
if (!dotenvLoaded) try {
  const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith('#') && !(m[1] in process.env)) {
      process.env[m[1]] = m[2];
    }
  }
} catch { /* .env 不存在则忽略 */ }

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN || '';
// CORS 允许源(默认 *,即完全开放;如需收紧后台/管理类跨域,设 CORS_ORIGIN=https://your.site)
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// 旧问答门配置
const GATE_ANSWER = process.env.GATE_ANSWER || '';
const GATE_QUESTION = process.env.GATE_QUESTION || '梦幻画廊邀您参观';
const GATE_HINT = process.env.GATE_HINT || '';

// 审批门配置
const GATE_MODE = process.env.GATE_MODE || ''; // 'approval' 时启用审批门
const ONCE_GRACE_MS = 15 * 60 * 1000;          // 「仅一次」:首次进入起 15 分钟,超时需重新申请
const DAY_MS = 24 * 3600 * 1000;

// 允许 API 管理的媒体目录
const MEDIA_DIRS = ['photos', 'videos', 'music'];

// Cloudflare R2 媒体同步配置(2026-08-29):后台增删媒体自动镜像到 R2,保证"从哪加载内容一致"
// 在服务器 .env 配置: CF_R2_TOKEN=<API Token> / CF_R2_ACCOUNT=<账号ID> / CF_R2_BUCKET=<桶名,默认 gallery-media>
const CF_R2_TOKEN = process.env.CF_R2_TOKEN || '';
const CF_R2_ACCOUNT = process.env.CF_R2_ACCOUNT || '';
const CF_R2_BUCKET = process.env.CF_R2_BUCKET || 'gallery-media';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.ico': 'image/x-icon',
};

module.exports = {
  ROOT, PORT, TOKEN, CORS_ORIGIN,
  GATE_ANSWER, GATE_QUESTION, GATE_HINT,
  GATE_MODE, ONCE_GRACE_MS, DAY_MS,
  MEDIA_DIRS, MIME,
  CF_R2_TOKEN, CF_R2_ACCOUNT, CF_R2_BUCKET,
};
