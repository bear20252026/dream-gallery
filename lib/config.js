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
const IS_PROD = process.env.NODE_ENV === 'production';
// CORS 允许源:生产默认 cloudbear.cloud;开发/Vite 同源代理不受影响。
// 需要更宽时显式设 CORS_ORIGIN=* 或自定义域名(2026-09-18 审计 P2#7:不再默认 *)
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://cloudbear.cloud';
// CORS_ORIGIN 按「逗号分隔 allowlist」语义解析(2026-10-11 DG-CORS-001):
// Access-Control-Allow-Origin 是单值头,把整串原样回显永远匹配不上,必须逐项拆开后逐请求匹配。
const CORS_LIST = String(CORS_ORIGIN)
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const CORS_ALLOW_ALL = CORS_LIST.includes('*');
const CORS_ALLOWLIST = new Set(CORS_LIST.filter((s) => s !== '*'));

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

// ===================== 访客自定义链接的三道闸(2026-10-12 DG-SEC-004;2026-10-13 从 siteconfig 搬来)=====================
// 为什么搬:判定写在 lib/siteconfig.js,而后台要把「已用 n / 上限」显示给主人看(撞上限时访客只拿到
//   一句 503,服务器上只有一行 console.warn,面板里完全看不出来)。admin.js 若去 require ./siteconfig
//   就打出 siteconfig → admin → siteconfig 的环(depcruise no-circular 是 CI 硬闸,函数内延迟 require
//   也断不开)。config.js 是「env / 常量」的叶子层,两边都能 require 它;
//   lib/siteconfig.js 继续按原名 re-export ⇒ 它的对外契约一字未动,既有测试照旧从 siteconfig 取值。
// ⚠️ 这三个数是**写死的常量,不是环境变量**:要调口径就改这里再发布,在服务器上设 env 不会生效。
const USER_LINKS_PER_PERSON = 10; // 每人最多几条(按 aid 计,不再经 UA 兜底)
const USER_LINKS_MAX = 300; // 全局硬上限:后台面板一屏可读,也是 gate_data 快照规模的护栏(量级主人未拍板改动)
const MYLINKS_RATE = 20; // 每 IP 每分钟:够一人连满 10 条 + 失败重试/删除,人工使用打不到

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
  // 3D 模型(2026-09-23 补):此前落到 application/octet-stream,浏览器仍能加载但不利于
  // CDN/中间层缓存策略判断;GLTFLoader 走 fetch 不校验 MIME,补上更规范
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.hdr': 'image/vnd.radiance',
};

module.exports = {
  ROOT, PORT, TOKEN, IS_PROD, CORS_ORIGIN, CORS_ALLOWLIST, CORS_ALLOW_ALL,
  GATE_ANSWER, GATE_QUESTION, GATE_HINT,
  GATE_MODE, ONCE_GRACE_MS, DAY_MS,
  MEDIA_DIRS, MIME,
  CF_R2_TOKEN, CF_R2_ACCOUNT, CF_R2_BUCKET,
  USER_LINKS_PER_PERSON, USER_LINKS_MAX, MYLINKS_RATE, // 访客链接三道闸(siteconfig re-export 同一份)
};
