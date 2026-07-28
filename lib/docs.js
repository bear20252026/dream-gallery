// ===================== 协议文档在线编辑(2026-07-27 主人定) =====================
// /admin/docs 页面 + /api/admin/docs 接口,均需 TOKEN
// 白名单三个文件:agreement.html / privacy.html / community.html
// 保存前自动备份到 .docs-bak/(点目录,静态黑名单天然拦截公网),可随时回滚
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const { sendJson, readBody } = require('./util');
const { clearGzipCache } = require('./files');

const DOC_FILES = ['agreement.html', 'privacy.html', 'community.html'];
const BACKUP_DIR = path.join(ROOT, '.docs-bak');

function docPath(name) {
  if (!DOC_FILES.includes(name)) return null;
  return path.join(ROOT, name);
}

// GET /api/admin/docs?file=xxx → {name, content}
// GET /api/admin/docs?backups=xxx → {backups:[...]}
function handleDocsGet(req, res, query) {
  if (query.backups) {
    const name = String(query.backups);
    if (!docPath(name)) { sendJson(res, 400, { error: '文件不合法' }); return; }
    let list = [];
    try {
      list = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith(name + '.'))
        .sort().reverse().slice(0, 20);
    } catch (e) {}
    sendJson(res, 200, { backups: list });
    return;
  }
  const p = docPath(String(query.file || ''));
  if (!p) { sendJson(res, 400, { error: 'file 必须是: ' + DOC_FILES.join(' / ') }); return; }
  sendJson(res, 200, { name: path.basename(p), content: fs.readFileSync(p, 'utf8') });
}

// POST /api/admin/docs {file, content} 保存(先备份); {file, restore:'备份名'} 回滚
// 协议文件 10~30KB,JSON 转义后可能超过默认 64KB 上限,这里放宽到 3MB(2026-07-27 502 修复)
function handleDocsPost(req, res) {
  readBody(req, obj => {
    const p = docPath(String(obj.file || ''));
    if (!p) { sendJson(res, 400, { error: 'file 必须是: ' + DOC_FILES.join(' / ') }); return; }
    const name = path.basename(p);
    try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
    // 回滚:从指定备份恢复(恢复前先把当前版也备份,可反复横跳)
    if (obj.restore) {
      const bak = String(obj.restore);
      if (!/^[a-z0-9.\-]+$/i.test(bak) || bak.includes('..')) { sendJson(res, 400, { error: '备份名不合法' }); return; }
      const bakPath = path.join(BACKUP_DIR, bak);
      if (!fs.existsSync(bakPath)) { sendJson(res, 404, { error: '备份不存在' }); return; }
      fs.copyFileSync(p, path.join(BACKUP_DIR, name + '.' + Date.now() + '.bak'));
      fs.copyFileSync(bakPath, p);
      clearGzipCache(p);
      sendJson(res, 200, { ok: true, restored: bak });
      return;
    }

    // 保存:先备份旧版,再写新版
    const content = String(obj.content || '');
    if (content.length < 200 || !content.includes('<html')) { sendJson(res, 400, { error: '内容不完整(疑似误清空),已拒绝保存' }); return; }
    if (content.length > 1024 * 1024) { sendJson(res, 400, { error: '内容过大' }); return; }
    const bakName = name + '.' + Date.now() + '.bak';
    fs.copyFileSync(p, path.join(BACKUP_DIR, bakName));
    fs.writeFileSync(p, content, 'utf8');
    clearGzipCache(p); // 立即可见,无需等 5 分钟
    sendJson(res, 200, { ok: true, backup: bakName, size: content.length });
  }, 3 * 1024 * 1024);
}

module.exports = { handleDocsGet, handleDocsPost, DOC_FILES };
