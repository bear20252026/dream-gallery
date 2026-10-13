// admin-content.js — 文件页 + 展示区 + 户外大屏 + 杂项 handler(2026-10-10 admin 第二阶段切出,逐字迁移)
// 分区内环自洽:loadFiles↔toggleDemo/editCaption、loadDisplay↔loadBigscreen/链接三件套互调均在模块内。
// DATA 经 admin-state.js live binding 读(就地 mutate 无需 setter,唯一 rebind 点 load() 在 admin.js)。
import {
  brandIcon,
  tk,
  tk2,
  tkq,
  adminFetch,
  confirmAsync,
  $,
  esc,
  j,
  fmt,
  toast,
} from './admin-core.js';
import { DATA } from './admin-state.js';

// 内嵌媒体元素一律**裸路径**(2026-10-11 凭据治理):`<img>/<video>` 靠浏览器自动携带的 HttpOnly
// admin_session cookie 过 /admin-media 鉴权,凭据不再进 URL(地址栏/历史/访问日志/缓存键全部干净)。
// 顺带把任何来源遗留的 token/mt/sig 查询串剥掉——mediaUrl 是后台所有内嵌媒体 URL 的唯一出口。
// 复制出去的分享链接(copyTxt)从不带凭据,这条红线不变(AGENTS 2026-10-10)。
const mediaUrl = (u) => {
  const s = String(u || '');
  const q = s.indexOf('?');
  if (q < 0) return s;
  try {
    const p = new URLSearchParams(s.slice(q + 1));
    p.delete('token');
    p.delete('mt');
    p.delete('sig');
    const rest = p.toString();
    return s.slice(0, q) + (rest ? '?' + rest : '');
  } catch {
    return s.slice(0, q);
  }
};

// ---------- 文件页 ----------
export async function loadFiles() {
  const dirs = [
    ['photos', ' 照片'],
    ['videos', '🎬 视频'],
    ['music', '🎵 音乐'],
  ];
  const caps = (DATA && DATA.photoCaptions) || {},
    ups = (DATA && DATA.uploaderInfo) || {};
  const mtOf = (DATA && DATA.uploads) || {}; // 上传记录:带 mt(访客端 ?mt= 私有媒体令牌)的文件才能重签
  const demos = (DATA && DATA.siteConfig && DATA.siteConfig.demoPhotos) || [];
  let html = '';
  for (const [dir, label] of dirs) {
    const r = await adminFetch('/api/files?dir=' + dir + tk2());
    const d = await r.json();
    const files = (d[dir] || []).sort((a, b) => b.mtime.localeCompare(a.mtime));
    // 大屏 1~5 号:与「户外大屏」管理页同一套编号/同一批文件(videos/户外大屏/ 子目录,列表 API 不递归故单独拉配置)
    let bsHtml = '';
    if (dir === 'videos') {
      try {
        const bd = await (await adminFetch('/api/bigscreen')).json();
        bsHtml = (bd.slots || [])
          .map(
            (s) => `<div class="file-row" style="align-items:center">
        <!-- eslint-disable-next-line no-irregular-whitespace -- 模板串全角空格是 UI 分隔符 -->
        <span class="fname"><b>${esc(s.label)}</b>&#12288;${s.file ? esc(s.file) : '<span style="opacity:.45">空</span>'}</span>
        ${s.file && !s.hls ? `<button class="btn-day" onclick="pvUrl('${s.src}','${(s.file || '').split('.').pop().toLowerCase()}')">预览播放</button>` : ''}
        ${s.file && s.hls ? `<span style="opacity:.5">HLS 流,不支持在线预览</span>` : ''}
      </div>`
          )
          .join('');
      } catch (e) {
        // 原:静默吞掉 → 整个大屏区块凭空消失
        bsHtml = `<div class="fname" style="color:#c0392b">大屏槽位加载失败:${esc(String(e.message || e))}</div>`;
      }
    }
    html += `${bsHtml ? `<div class="section-title">🎬 户外大屏 1~5 号(画廊内循环播放;与「户外大屏」页编号一致)</div>${bsHtml}` : ''}<div class="section-title">${dir === 'videos' ? '🎬 其他视频(不在大屏循环内)' : label} (${files.length})</div>
<div class="upload-box"><input type="file" id="up-${dir}"><button class="btn-day" onclick="upload('${dir}')">上传到 ${dir}</button></div>
<div>${
      files
        .map((f) => {
          const isImg = /\.(jpe?g|png|gif|webp)$/i.test(f.name);
          const url = mediaUrl(`/admin-media/${dir}/${encodeURIComponent(f.name)}`);
          const cap = caps[f.name]
            ? `<div style="font-size:12px;color:#ffd9a8;padding:2px 0">✍ ${esc(caps[f.name])}</div>`
            : '';
          const who = ups[f.name] ? `<span class="fsize"> ${esc(ups[f.name])}</span>` : '';
          const demoBtn =
            dir === 'photos'
              ? demos.includes(f.name)
                ? `<button class="btn-revoke" onclick="toggleDemo('${j(f.name)}',false)">取消演示</button>`
                : `<button class="btn-day" onclick="toggleDemo('${j(f.name)}',true)">设为演示</button>`
              : '';
          const mtBtn =
            mtOf[f.name] && mtOf[f.name].mt
              ? `<button class="btn-revoke" onclick="rotateMtAsk('${j(f.name)}')" title="重签该文件的访客端媒体令牌(?mt=);怀疑链接外泄点一下,旧链接当场失效">重签令牌</button>`
              : '';
          return `<div class="file-row" style="align-items:flex-start">
        ${isImg ? `<img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:pointer" onclick="pv('${dir}','${j(f.name)}')">` : ''}
        <span class="fname" onclick="pv('${dir}','${j(f.name)}')" title="点击预览">${esc(f.name)}<br>${who}${cap}</span>
        <span class="fsize">${(f.size / 1024 / 1024).toFixed(2)}MB</span>
        <button class="btn-day" onclick="dl('/admin-media/${dir}/${encodeURIComponent(f.name)}','${j(f.name)}')">下载</button>
        <button class="btn-day" onclick="copyTxt(location.origin+'/admin-media/${dir}/' + encodeURIComponent('${j(f.name)}') + '${tkq()}')">复制链接</button>
        ${dir === 'photos' ? `<button class="btn-day" onclick="editCaption('${j(f.name)}','${j(caps[f.name] || '')}')">编辑配文</button>` : ''}
        ${demoBtn}
        ${mtBtn}
        <button class="btn-del" onclick="delFile('${dir}','${encodeURIComponent(f.name)}')">删除</button></div>`;
        })
        .join('') || '<div class="empty">空</div>'
    }</div>`;
  }
  $('fileSections').innerHTML = html;
}
export function pv(dir, name) {
  pvUrl(`/admin-media/${dir}/${name}`, decodeURIComponent(name).split('.').pop().toLowerCase());
}
// 支持任意 URL 的媒体预览(文件页用 /admin-media 相对路径,大屏页用 CDN 绝对地址)
export function pvUrl(url, ext) {
  url = mediaUrl(url);
  const m = $('pvMask');
  if (
    [
      'jpg',
      'jpeg',
      'png',
      'gif',
      'webp',
      'bmp',
      'avif',
      'heic',
      'heif',
      'tif',
      'tiff',
      'ico',
    ].includes(ext)
  )
    m.innerHTML = `<img src="${url}">`;
  else if (['mp4', 'webm', 'm4v', 'mov'].includes(ext))
    m.innerHTML = `<video src="${url}" controls autoplay></video>`;
  else if (['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac'].includes(ext))
    m.innerHTML = `<audio src="${url}" controls autoplay></audio>`;
  else {
    toast('该格式不支持在线播放(可下载后本地打开)', 1);
    return;
  }
  m.classList.add('show');
}
export async function delFile(dir, name) {
  if (!(await confirmAsync('确定删除 ' + decodeURIComponent(name) + ' ？不可恢复！'))) return;
  const r = await adminFetch(`/api/files/${dir}/${name}?x=1` + tk2(), { method: 'DELETE' });
  if (r.ok) {
    toast('已删除');
    loadFiles();
  } else toast('删除失败', 1);
}
// 重签该文件的媒体令牌 mt(/api/admin/bulk action=rotate-mt):mt 是 bearer,链接外泄即重签,旧 ?mt= 立刻失效
// 入参是 uploads 的原始文件名(uploads 的键就是文件名,不做 URL 编码)
export async function rotateMtAsk(name) {
  if (
    !(await confirmAsync(
      '重签「' + name + '」的媒体令牌?\n访客端旧的图片链接(?mt=)当场失效,画廊刷新后自动换新链接。'
    ))
  )
    return;
  const r = await adminFetch('/api/admin/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'rotate-mt', name }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok && d.ok) toast('已重签令牌(旧链接即刻失效)');
  else toast(d.error || '重签失败', 1);
}
export async function upload(dir) {
  const inp = $('up-' + dir);
  if (!inp.files.length) {
    toast('请先选择文件', 1);
    return;
  }
  const f = inp.files[0];
  const r = await adminFetch(`/api/upload?dir=${dir}&name=${encodeURIComponent(f.name)}` + tk2(), {
    method: 'POST',
    body: f,
  });
  if (r.ok) {
    toast('上传成功');
    loadFiles();
  } else toast('上传失败', 1);
}
// ---------- 展示区 ----------
const MOUNT_ICONS = {
  isLink2: '月球',
  isLink3: '滚动古文',
  isLink4: '墨韵文档',
  isLink5: '火星',
  isLink6: '木星',
  isLink7: '地球',
  isLink8: '全息档案',
  isLink9: '翠玉',
  isLink10: '福字',
  isLink11: '雅集',
  isLink12: '文档金库',
  isLink13: '祥云文档',
  isGarden: '秘密花园',
};
const LINK_MODELS = {
  sphere: '水晶球',
  cube: '立方晶',
  cone: '金字塔',
  octa: '星钻',
  torus: '光环',
  cylinder: '玉柱',
  icosa: '宝石',
  knot: '如意结',
  capsule: '胶囊',
  dodeca: '多面晶',
};
export function loadDisplay() {
  if (!DATA) return;
  loadBigscreen();
  const sc = DATA.siteConfig || { mode: 'normal', customLinks: [], demoPhotos: [] };
  // 模式卡
  $('modeCard').innerHTML =
    `全局默认模式:<b style="color:#16a34a">普通模式(2026-09-06 起特殊模式已删除)</b>`;
  // 挂载下拉
  $('clIcon').innerHTML =
    '<option value="">不挂原图案(新建模型)</option>' +
    Object.entries(MOUNT_ICONS)
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join('');
  $('clModel').innerHTML = Object.entries(LINK_MODELS)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join('');
  // 自定义链接列表
  $('customLinks').innerHTML =
    (sc.customLinks || [])
      .map(
        (l) => `<div class="file-row">
    <span class="fname">${esc(l.name)} → <a href="${j(l.url)}" target="_blank" style="color:#8cf">${esc(l.url.slice(0, 42))}</a>
    ${l.icon ? `<span class="fsize">挂在「${MOUNT_ICONS[l.icon] || l.icon}」(普通模式)</span>` : `<span class="fsize">模型「${LINK_MODELS[l.model] || l.model || '水晶球'}」</span>`}</span>
    <button class="btn-day" onclick="copyTxt('${j(l.url)}')">复制</button>
    <button class="btn-del" onclick="delCustomLink('${l.id}')">删除</button></div>`
      )
      .join('') || '<div class="empty">暂无</div>';
  // 演示照片
  const demos = sc.demoPhotos || [];
  $('demoPhotos').innerHTML =
    '当前: ' +
    (demos.map((d) => esc(d)).join('、') || '无') +
    '<br><span style="opacity:.6;font-size:12px">在「文件管理」里对每张照片点「设为/取消演示」即可调整</span>';
  // 访客链接
  const ul = DATA.userLinks || [];
  // 三道闸读数(值由服务端算好下发:上限常量只有一份,在 lib/config.js,前端不再抄一遍数字)
  const caps = DATA.linkCaps || {};
  // 全部按数字处理再拼进 HTML:面板这一段不插任何用户文本,数字化既是类型防御也是 XSS 的兜底
  const capN = Number(caps.max) || 0;
  const usedN = Number(caps.used) || 0;
  const perN = Number(caps.perPerson) || 0;
  const rateN = Number(caps.ratePerMin) || 0;
  const capHint =
    '<div class="empty" style="opacity:.75">' +
    '访客链接已用 ' +
    usedN +
    (capN ? ' / 全局硬上限 ' + capN : '') +
    (capN && usedN >= capN
      ? ' —— <b style="color:#e69b9b">已满:访客再添加会收到 503</b>,需在这里删几条'
      : capN && usedN >= capN * 0.8
        ? ' —— 已用到八成,留意'
        : '') +
    (perN ? '<br>每人最多 ' + perN + ' 条(按登录身份计)' : '') +
    (rateN ? ' · 每 IP 每分钟 ' + rateN + ' 次请求' : '') +
    '</div>';
  const nameOf = (dk) => {
    const r = (DATA.applicants || []).find((a) => a.dk === dk);
    return r ? r.answer || r.brand || '访客' : '访客';
  };
  $('userLinks').innerHTML =
    capHint +
      ul
        .map(
          (l) => `<div class="file-row">
    <span class="fname">[${esc(nameOf(l.dk))}] ${esc(l.name)} → <a href="${j(l.url)}" target="_blank" style="color:#8cf">${esc(l.url.slice(0, 42))}</a>
    <span class="fsize">${LINK_MODELS[l.model] || l.model || ''} · ${fmt(l.ts)}</span></span>
    <button class="btn-day" onclick="copyTxt('${j(l.url)}')">复制</button>
    <button class="btn-del" onclick="delUserLink('${l.id}')">删除</button></div>`
        )
        .join('') || '<div class="empty">暂无</div>';
  // 链接点击记录(仅后台可见)
  const clicks = DATA.linkClicks || [];
  $('clickList').innerHTML =
    clicks
      .map((c) => {
        const fp = c.fp || {},
          dev = c.dev || {};
        const idBits = [c.brand, c.geo, fp.scr, fp.platform ? '' : null]
          .filter(Boolean)
          .join(' · ');
        return `<div class="card">
      <div class="answer">${brandIcon(c.brand)} 「${esc(c.name || '访客')}」 点了 <b style="color:#8cf">${esc(c.link)}</b></div>
      <div class="meta">→ ${esc(c.url)}<br>
      ${fmt(c.t)} · IP ${esc((c.ip || '').replace('::ffff:', ''))} ${esc(c.geo || '')} · ${esc(c.brand || '')}${dev.battery ? ' · 🔋' + esc(dev.battery) : ''}${dev.network ? ' · 📶' + esc(dev.network) : ''}<br>
      屏幕 ${esc(fp.scr || '-')} · 时区 ${esc(String(fp.tz ?? '-'))} · 语言 ${esc(fp.lang || '-')} · ${esc(fp.platform || '')} · ${fp.cores || '-'}核 · 触屏${fp.touch ? '有' : '无'} · 指纹 ${esc(fp.canvas || '-')}${c.pos ? ` · 坐标 ${c.pos.x},${c.pos.y},${c.pos.z}` : ''}</div>
    </div>`;
      })
      .join('') || '<div class="empty">还没有点击记录</div>';
  // 访客端报错不再在此渲染(2026-09-24 修空白 bug):
  // 旧链路(/api/track/error → gateData.clientErrors)前端已无调用方,且此处
  // $('errList') 与「报错」独立 tab 的 #errList 撞重复 id,互相覆写 ——
  // 报错统一由独立 tab 的 loadErrors()(读 /api/admin/client-errors)渲染。
}
// ---------- 户外大屏管理(软编码;上传替换/清空 → 同步 R2 + 游戏即时生效) ----------
async function loadBigscreen() {
  const box = $('bigscreen');
  if (!box) return;
  box.innerHTML = '加载中…';
  try {
    const r = await adminFetch('/api/bigscreen');
    const d = await r.json();
    if (!d.ok) {
      box.innerHTML = '加载失败';
      return;
    }
    box.innerHTML = d.slots
      .map(
        (
          s
        ) => `<div class="card" style="display:flex;align-items:center;gap:10px;padding:10px 12px">
        <b style="width:64px">${s.label}</b>
        <span style="flex:1;opacity:.85;word-break:break-all">${s.file ? esc(s.file) + (s.hls ? ' <span style="opacity:.6">(HLS)</span>' : '') : '<span style="opacity:.45">空(不播放)</span>'}</span>
        ${s.file && !s.hls ? `<button class="btn-day" onclick="pvUrl('${s.src}','${(s.file || '').split('.').pop().toLowerCase()}')">预览</button>` : ''}
        ${s.file && s.hls ? `<span style="opacity:.5">HLS 流,不支持在线预览</span>` : ''}
        <button class="btn-day" onclick="uploadBigscreen('${s.slot}','${s.label}')">上传替换</button>
        ${s.file ? `<button class="btn-del" onclick="delBigscreen('${s.slot}','${s.label}')">清空</button>` : ''}
      </div>`
      )
      .join('');
  } catch (e) {
    box.innerHTML = '加载失败';
  }
}
export function uploadBigscreen(slot, label) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/mp4,video/webm,video/x-matroska,.mp4,.webm,.m4v,.mov,.mkv,.m3u8';
  input.onchange = async function () {
    const f = input.files[0];
    if (!f) return;
    if (!(await confirmAsync('替换「' + label + '」的视频为 ' + f.name + ' ?'))) return;
    const btn = document.querySelector(`#bigscreen button[data-slot="${slot}"]`);
    try {
      const r = await adminFetch(
        '/api/admin/bigscreen/upload?slot=' + slot + '&name=' + encodeURIComponent(f.name) + tk(),
        { method: 'POST', body: f }
      );
      const d = await r.json();
      toast(d.ok ? '已上传: ' + f.name : d.error || '上传失败', d.ok ? 0 : 1);
    } catch (e) {
      toast('上传失败', 1);
    }
    loadBigscreen();
  };
  input.click();
}
export async function delBigscreen(slot, label) {
  if (!(await confirmAsync('清空「' + label + '」的视频?'))) return;
  try {
    const r = await adminFetch('/api/admin/bigscreen/delete?slot=' + slot + tk(), {
      method: 'POST',
    });
    const d = await r.json();
    toast(d.ok ? '已清空' : d.error || '删除失败', d.ok ? 0 : 1);
  } catch (e) {
    toast('删除失败', 1);
  }
  loadBigscreen();
}
export async function addCustomLink() {
  const name = $('clName').value.trim(),
    url = $('clUrl').value.trim();
  const icon = $('clIcon').value,
    model = $('clModel').value;
  if (!name || !url) {
    toast('名称和链接都要填', 1);
    return;
  }
  const r = await adminFetch('/api/admin/links' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', name, url, icon, model }),
  });
  const d = await r.json();
  if (r.ok) {
    toast('已添加');
    $('clName').value = '';
    $('clUrl').value = '';
    DATA.siteConfig.customLinks.push(d.item);
    loadDisplay();
  } else toast(d.error || '失败', 1);
}
export function presetLink(name, url) {
  $('clName').value = name;
  $('clUrl').value = url;
}
export async function delCustomLink(id) {
  const r = await adminFetch('/api/admin/links' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'del', id }),
  });
  if (r.ok) {
    DATA.siteConfig.customLinks = DATA.siteConfig.customLinks.filter((l) => l.id !== id);
    loadDisplay();
    toast('已删除');
  } else toast('失败', 1);
}
export async function delUserLink(id) {
  const r = await adminFetch('/api/admin/links' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delUser', id }),
  });
  if (r.ok) {
    DATA.userLinks = DATA.userLinks.filter((l) => l.id !== id);
    loadDisplay();
    toast('已删除');
  } else toast('失败', 1);
}
export async function toggleDemo(name, demo) {
  const r = await adminFetch('/api/admin/demo' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: name, demo }),
  });
  const d = await r.json();
  if (r.ok) {
    DATA.siteConfig.demoPhotos = d.demoPhotos;
    toast(demo ? '已设为演示' : '已取消演示');
    loadFiles();
  } else toast('失败', 1);
}
export async function editCaption(name, old) {
  const c = prompt('编辑「' + name + '」的 AI 配文(留空删除):', old || '');
  if (c === null) return;
  const r = await adminFetch('/api/admin/caption' + tk(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: name, caption: c }),
  });
  if (r.ok) {
    if (DATA.photoCaptions) DATA.photoCaptions[name] = c;
    toast('配文已保存');
    loadFiles();
  } else toast('保存失败', 1);
}
export function copyTxt(t) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
    .then(() => toast('已复制'))
    .catch(() => {
      prompt('手动复制:', t);
    });
}
// 后台鉴权下载(adminFetch 统一带凭据:有 x-token 用头,正常登录态靠 HttpOnly cookie → blob 落盘,
// 绝不用 URL 参数,任何浏览器都不会"需要授权")
export async function dl(url, filename) {
  try {
    const r = await adminFetch(url);
    if (!r.ok) {
      toast('下载失败:HTTP ' + r.status, 1);
      return;
    }
    const b = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = filename || url.split('/').pop().split('?')[0] || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('已开始下载');
  } catch (e) {
    toast('下载失败:' + e.message, 1);
  }
}
export async function clearClicks() {
  if (!(await confirmAsync('确定清空全部链接点击记录?不可恢复!(建议先导出 Excel)'))) return;
  const r = await adminFetch('/api/admin/clicks/clear' + tk(), { method: 'POST' });
  if (r.ok) {
    DATA.linkClicks = [];
    loadDisplay();
    toast('已清空');
  } else toast('失败', 1);
}
// 导出 PDF:新开打印页(记录 + 答题全量 + 照片原图附录),浏览器「打印→另存为 PDF」
export async function exportPdf() {
  const photos = await (await adminFetch('/api/files?dir=photos' + tk2())).json();
  const imgs = photos.photos || [];
  const clicks = DATA.linkClicks || [];
  const attempts = (await (await adminFetch('/api/admin/quiz' + tk())).json()).attempts || [];
  const w = window.open('', '_blank');
  const escH = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;');
  let html = `<html><head><meta charset="utf-8"><title>梦幻画廊数据档案</title>
  <style>body{font-family:'Microsoft YaHei';padding:24px;font-size:12px}h1{font-size:20px}h2{font-size:15px;margin-top:26px;border-bottom:1px solid #999;padding-bottom:4px}
  table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #aaa;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-all}
  .pg{page-break-before:always}.ph{text-align:center;margin-top:14px}.ph img{max-width:100%;max-height:520px;border:1px solid #ccc}
  .cap{color:#a60;font-size:13px;margin-top:6px}</style></head><body>
  <h1>梦幻画廊 · 数据档案(${new Date().toLocaleString('zh-CN', { hour12: false })})</h1>
  <h2>一、链接点击记录(${clicks.length} 条)</h2>
  <table><tr><th>时间</th><th>昵称</th><th>IP/归属</th><th>品牌</th><th>链接</th><th>URL</th><th>屏幕/平台</th><th>指纹</th></tr>
  ${clicks
    .map((c) => {
      const fp = c.fp || {};
      return `<tr><td>${new Date(c.t).toLocaleString('zh-CN', { hour12: false })}</td><td>${escH(c.name)}</td><td>${escH((c.ip || '').replace('::ffff:', ''))} ${escH(c.geo || '')}</td><td>${escH(c.brand)}</td><td>${escH(c.link)}</td><td>${escH(c.url)}</td><td>${escH(fp.scr || '')} ${escH(fp.platform || '')} ${fp.cores || ''}核</td><td>${escH(fp.canvas || '')}</td></tr>`;
    })
    .join('')}</table>
  <h2>二、答题全量记录(${attempts.length} 条)</h2>
  ${attempts
    .map(
      (
        a
      ) => `<table><tr><th colspan="2">${new Date(a.t).toLocaleString('zh-CN', { hour12: false })} · 总分 ${a.total} · 选择 ${a.mcScore}/81 · 问答 ${a.qaScore}/19(${a.qaBy === 'ai' ? 'AI' : '本地'})</th></tr>
    ${(a.fullReview || []).map((m, j) => `<tr><td style="width:70%">${j + 1}. ${escH(m.q || '')}<br>A.${escH(m.options && m.options.A)} B.${escH(m.options && m.options.B)} C.${escH(m.options && m.options.C)} D.${escH(m.options && m.options.D)}</td><td>选 ${escH(m.chosen)} / 正解 ${escH(m.correctLetter)} ${m.right ? '✓' : '✗'}</td></tr>`).join('')}
    <tr><td><b>问答题目:</b>${escH(a.qaQ || '')}<br><b>作答:</b>${escH((a.qaText || '').slice(0, 800))}</td><td><b>评语:</b>${escH(a.qaComment || '')}</td></tr></table>`
    )
    .join('')}
  <h2 class="pg">三、照片原图(上传照片 + 希沃白板画作,共 ${imgs.length} 张)</h2>
  ${imgs.map((f) => `<div class="ph"><img src="${mediaUrl('/admin-media/photos/' + encodeURIComponent(f.name))}"><div>${escH(f.name)}</div>${DATA.photoCaptions && DATA.photoCaptions[f.name] ? `<div class="cap">✍ ${escH(DATA.photoCaptions[f.name])}</div>` : ''}</div>`).join('')}
  </body></html>`;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 1500);
}
