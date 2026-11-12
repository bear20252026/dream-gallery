// music.js — 音乐搜索后端代理(2026-11-11 全面审计 P1-1)
// 背景:music.html 曾把第三方付费接口的 apiKey 硬编码在公开页面里(公开仓库 + 公开分发
// 双重暴露,任何人可提取盗刷)。现密钥只存服务器环境变量 MUSIC_API_KEY,前端改调本站
// /api/music/search,由本模块代为向上游发起请求 —— 浏览器与仓库从此不接触密钥。
// ⚠️ 旧密钥已在 Git 历史与线上页面暴露过,必须在服务商处吊销轮换;本模块不保留任何旧值。
// 上游失败/未配置一律回明确错误,绝不把上游原始响应(可能含敏感字段)透传给浏览器。
const { sendJson } = require('./util');
const ratelimit = require('./ratelimit');

const MUSIC_API_KEY = process.env.MUSIC_API_KEY || '';
const UPSTREAM = 'https://jkapi.com/api/music';
const MUSIC_RATE = 10; // 每 IP 每分钟:人工搜歌打不到,脚本盗刷被挡
const UPSTREAM_TIMEOUT_MS = 15000;

// 只下发播放必需字段;上游其余字段(可能含密钥/内部标识)一律不出服务器
function pickSong(d) {
  return {
    code: 1,
    name: String(d.name || '').slice(0, 120),
    artist: String(d.artist || '').slice(0, 120),
    album: String(d.album || '').slice(0, 120),
    music_url: String(d.music_url || ''),
  };
}

async function handleMusicSearch(req, res, query) {
  const rl = ratelimit.hit(req, 'music-search', MUSIC_RATE);
  if (!rl.ok) { sendJson(res, 429, { error: '搜索过于频繁,请稍后再试', retryAfter: rl.retryAfter }); return; }
  if (!MUSIC_API_KEY) { sendJson(res, 503, { error: '音乐服务未配置(服务器需设置 MUSIC_API_KEY)' }); return; }
  const name = String((query && query.name) || '').trim().slice(0, 80);
  if (!name) { sendJson(res, 400, { error: '请输入歌名' }); return; }

  const url = `${UPSTREAM}?plat=wy&type=json&apiKey=${encodeURIComponent(MUSIC_API_KEY)}&name=${encodeURIComponent(name)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  let data;
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) { sendJson(res, 502, { error: '音乐服务暂时不可用,请稍后再试' }); return; }
    data = await r.json();
  } catch (e) {
    sendJson(res, 502, { error: '音乐服务暂时不可用,请稍后再试' });
    return;
  } finally {
    clearTimeout(timer);
  }
  if (data && data.code === 1 && data.music_url && /^https:\/\//i.test(String(data.music_url))) {
    sendJson(res, 200, pickSong(data));
    return;
  }
  sendJson(res, 200, { code: 0, msg: '未找到该歌曲' });
}

module.exports = { handleMusicSearch, MUSIC_RATE };