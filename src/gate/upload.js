import { Z } from '../shared/z-layers.mjs';
// upload.js — 访客上传(照片 + 我的链接) + AI 配文 + 空中悬浮路标
// 照片:任何人可传、不限张数、≤5MB;自己只见自己的,后台见全部
// AI 配文:/api/vision/analyze(审核不过也照常上传,用回退句)
// 路标:上传成功后,从脚下到挂画处拉一条虚线,动态向前流动,带你找到自己的作品
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { expose } from '../debug-hooks.js';
hotBegin('upload');
const { s } = ctx;

const css = document.createElement('style');
css.textContent = `
#upBtn{position:fixed;left:14px;bottom:14px;z-index:70;height:42px;padding:0 16px;border-radius:21px;background:rgba(30,20,34,0.85);border:1px solid rgba(255,255,255,0.2);color:#e8d8c8;font-size:15px;cursor:pointer;display:flex;align-items:center;gap:6px}
#upPanel{position:fixed;left:14px;bottom:64px;z-index:70;width:min(300px,90vw);background:linear-gradient(160deg,rgba(34,20,30,0.97),rgba(22,12,24,0.97));border:1px solid rgba(255,255,255,0.16);border-radius:16px;padding:18px;display:none;color:#e8dcd0}
#upPanel.show{display:block}
#upPanel .tabs{display:flex;gap:8px;margin-bottom:14px}
#upPanel .tabs button{flex:1;padding:8px;border:1px solid rgba(255,255,255,0.2);border-radius:9px;background:transparent;color:#cbb;font-size:14px;cursor:pointer}
#upPanel .tabs button.on{background:rgba(200,138,75,0.25);border-color:#c98a4b;color:#ffe2c4}
#upPanel input[type=text],#upPanel input[type=url]{width:100%;padding:10px;border-radius:9px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;outline:none;box-sizing:border-box;margin-bottom:10px}
#upPanel .drop{width:100%;padding:22px 10px;border:1.5px dashed rgba(255,214,170,0.45);border-radius:12px;text-align:center;color:#ffd9c4;font-size:14px;cursor:pointer}
#upPanel .drop:hover{background:rgba(255,214,170,0.08)}
#upPanel .go{width:100%;margin-top:10px;padding:11px;border:none;border-radius:10px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;font-size:15px;cursor:pointer}
#upPanel .tip{margin-top:8px;font-size:11px;color:rgba(255,255,255,0.4);text-align:center;line-height:1.6}
#upPanel .models{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px}
#upPanel .models button{padding:7px 2px;font-size:11px;border:1px solid rgba(255,255,255,0.18);border-radius:8px;background:transparent;color:#dcc;cursor:pointer}
#upPanel .models button.on{border-color:#c98a4b;color:#ffe2c4;background:rgba(200,138,75,0.2)}
#upPanel .presets{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}
#upPanel .presets button{padding:8px 2px;font-size:12px;border:1px solid rgba(120,180,255,0.35);border-radius:8px;background:rgba(60,100,180,0.15);color:#cfe0ff;cursor:pointer}
#upPanel .presets button:hover{background:rgba(60,100,180,0.3)}
#upProg{margin-top:10px;font-size:13px;color:#ffd9c4;text-align:center;min-height:18px}
`;
document.head.appendChild(css);

const btn = document.createElement('button');
btn.id = 'upBtn';
btn.style.display = 'none'; // 功能已并入 ⚙ 设置二级页(2026-07-25 主人定:悬浮按钮只留行走/跳跃类)
document.body.appendChild(btn);

const panel = document.createElement('div');
panel.id = 'upPanel';
panel.style.right = '14px';
panel.style.left = 'auto';
panel.style.bottom = '64px';
panel.innerHTML = `
<div class="tabs"><button id="tabPhoto" class="on">上传照片</button><button id="tabLink">我的链接</button><span id="upX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,0.5);padding:4px 6px">✕</span></div>
<div id="panePhoto">
  <div class="drop" id="drop">点这里选择照片/视频</div>
  <input type="file" id="file" accept="image/*,video/*" style="display:none">
  <button class="go" id="doUp" style="display:none">确认上传</button>
  <div class="tip">图片≤50MB、视频≤700MB,全格式<br>挂上墙后有路标指引你去找,只有自己能看到</div>
</div>
<div id="paneLink" style="display:none">
  <input type="text" id="lkName" maxlength="12" placeholder="链接名称(如:我的主页)">
  <input type="url" id="lkUrl" placeholder="https://…">
  <div class="presets" id="lkPresets"></div>
  <div class="models" id="lkModels"></div>
  <button class="go" id="doLk">落成链接</button>
  <div class="tip">点预设一键填名称和网址,选模型,落成后直接出现在你眼前</div>
</div>
<div id="upProg"></div>`;
document.body.appendChild(panel);
// 我的链接管理列表(模板外动态挂载,带删除)
const myLinkListEl = document.createElement('div');
myLinkListEl.id = 'myLinkList';
myLinkListEl.style.cssText =
  'margin-top:10px;border-top:1px solid rgba(255,255,255,0.12);padding-top:8px';
document.getElementById('paneLink').appendChild(myLinkListEl);

let open = false;
function toggleUpPanel(force) {
  open = force !== undefined ? force : !open;
  panel.classList.toggle('show', open);
}
document.getElementById('upX').onclick = function () {
  toggleUpPanel(false);
};
btn.onclick = () => toggleUpPanel();
ctx.mode.openUpload = function () {
  toggleUpPanel(true);
}; // ⚙ 设置二级页入口
const $ = (id) => document.getElementById(id);
$('tabPhoto').onclick = () => {
  $('tabPhoto').classList.add('on');
  $('tabLink').classList.remove('on');
  $('panePhoto').style.display = 'block';
  $('paneLink').style.display = 'none';
};
$('tabLink').onclick = () => {
  $('tabLink').classList.add('on');
  $('tabPhoto').classList.remove('on');
  $('paneLink').style.display = 'block';
  $('panePhoto').style.display = 'none';
};
$('drop').onclick = () => $('file').click();
let picked = null;
const VID_EXT = /\.(mp4|webm|mov|m4v|mkv|avi|flv|wmv|ts|m2ts|3gp|mpg|mpeg)$/i;
$('file').onchange = () => {
  picked = $('file').files[0] || null;
  if (picked) {
    const isVid = VID_EXT.test(picked.name) || /^video\//.test(picked.type);
    const max = isVid ? 700 * 1024 * 1024 : 50 * 1024 * 1024;
    if (picked.size > max) {
      prog(isVid ? '视频超过 700MB,换个小点的' : '图片超过 50MB,换个小点的');
      picked = null;
      return;
    }
    $('drop').textContent = '已选:' + picked.name + (isVid ? '(视频)' : '(图片)');
    $('doUp').style.display = 'block';
  }
};
function prog(t) {
  $('upProg').textContent = t;
}
setInterval(() => {
  if (!open) prog('');
}, 4000);

// ===== 空中悬浮路标:虚线从脚下延伸到目标,流光点循环向前,带你找到自己的作品 =====
function guideTo(target) {
  if (!ctx.player.pl) return;
  const from = ctx.player.pl.p.clone();
  from.y = 2.6;
  const to = new THREE.Vector3(target.x, (target.y || 2.2) + 1.2, target.z);
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineDashedMaterial({
    color: '#ffd700',
    dashSize: 0.5,
    gapSize: 0.3,
    transparent: true,
    opacity: 0.75,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  s.add(line);
  // 终点金色箭头(向下指,自转+浮动)
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.25, 0.7, 4),
    new THREE.MeshBasicMaterial({ color: '#ffd700' })
  );
  arrow.rotation.x = Math.PI;
  arrow.position.copy(to);
  s.add(arrow);
  // 循环前进的流光点(3 颗,沿虚线从脚下飞向目标)
  const dots = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#ffee88' })
    );
    s.add(d);
    dots.push(d);
  }
  const t0 = performance.now();
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    arrow.position.y = to.y + Math.sin(t * 3) * 0.15;
    arrow.rotation.y = t * 2;
    dots.forEach((d, i) => {
      const p = (t * 0.35 + i / 3) % 1; // 0→1 循环前进
      d.position.lerpVectors(from, to, p);
    });
    if (ctx.player.pl) {
      const d = Math.hypot(ctx.player.pl.p.x - to.x, ctx.player.pl.p.z - to.z);
      if (d < 5) cleanup();
    }
  };
  const cleanup = () => {
    s.remove(line);
    s.remove(arrow);
    for (const d of dots) s.remove(d);
    const i = ctx.tickers.indexOf(tick);
    if (i >= 0) ctx.tickers.splice(i, 1);
  };
  ctx.onTick(tick);
  setTimeout(cleanup, 180000);
}

// ===== 上传提示音(2026-07-25 主人定):照片/视频上传成功即随机播 51/52 之一(每次上传只播一个),
// 起播成功的同时暂停场景内其他所有音视频,提示音播完(或中途出错)自动恢复 =====
// onEnd(2026-07-26):播完(或失败)后的回调——TTS 排队等提示音结束再开口,不再混音
// 2026-07-31:使用统一音频管理器,最多同时2个声音(1视频+1提示音),提示音排队
const HINT_SOUNDS = ['music/VID_20260725_51.mp3', 'music/VID_20260725_52.mp3'];
function playUploadHint(onEnd) {
  try {
    const snd = new Audio(HINT_SOUNDS[Math.floor(Math.random() * HINT_SOUNDS.length)]);
    expose('upHint', snd); // 诊断钩子:探针验证提示音/暂停恢复用
    // 使用音频管理器播放,自动排队
    if (ctx.media.audioManager) {
      ctx.media.audioManager.playHint(snd, onEnd);
    } else {
      // 降级方案:原有逻辑
      const paused = [];
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        while (paused.length) {
          const m = paused.pop();
          m.play().catch(() => {});
        }
        if (onEnd) onEnd();
      };
      const pauseOthers = () => {
        const all = new Set(document.querySelectorAll('video,audio'));
        [
          ctx.media.vidEl,
          ctx.media.v45El,
          ctx.media.mA,
          ctx.kunlun.flyAudio,
          ctx.kunlun.peakVidEl,
        ].forEach((m) => {
          if (m) all.add(m);
        });
        all.forEach((m) => {
          if (m !== snd && !m.paused) {
            m.pause();
            paused.push(m);
          }
        });
      };
      snd.addEventListener('ended', finish);
      snd.addEventListener('error', finish);
      snd.play().then(pauseOthers).catch(finish);
    }
  } catch (e) {
    if (onEnd) onEnd();
  }
}

// ===== B612灵鉴:上传成功金色微尘(2 秒,灵蕴归位的视觉化;DOM 粒子零依赖) =====
function goldDust() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:' + Z.kickNotice + ';pointer-events:none;overflow:hidden';
  document.body.appendChild(box);
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('div');
    const sz = 3 + Math.random() * 5;
    p.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:${60 + Math.random() * 40}%;width:${sz}px;height:${sz}px;border-radius:50%;background:radial-gradient(circle,#ffe9a8,#e8b13c);box-shadow:0 0 ${4 + sz}px rgba(255,210,120,0.9);opacity:0`;
    box.appendChild(p);
    const dx = (Math.random() - 0.5) * 120,
      dy = -(120 + Math.random() * 220);
    p.animate(
      [
        { transform: 'translate(0,0)', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(${dx}px,${dy}px)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 800, easing: 'ease-out', delay: Math.random() * 300 }
    );
  }
  setTimeout(() => box.remove(), 2600);
}

// ===== 照片/视频上传 =====
// 四象气质归类(B612灵鉴 M3-lite,仅图片):按 AI 配文关键词判 生机/炽烈/萧瑟/安宁,
// 判不准无伤大雅——它只是新画归墙的"讲究",不是硬规则
const AURA_KWS = {
  生机: ['花', '春', '绿', '阳', '海', '笑', '草', '晴', '蓝', '光'],
  炽烈: ['红', '爱', '热', '心动', '泪', '焰', '醉', '舞', '甜'],
  萧瑟: ['暮', '黄昏', '雨', '雪', '夜', '别', '旧', '寂', '凉', '秋'],
  安宁: ['静', '书', '猫', '家', '茶', '灯', '独', '安', '眠', '午后'],
};
const AURA_PLACE = {
  生机: '东墙·生机位',
  炽烈: '南墙·炽烈位',
  萧瑟: '西墙·萧瑟位',
  安宁: '北墙·安宁位',
};
function classifyAura(t) {
  if (!t) return null;
  let best = null,
    bn = 0;
  for (const [k, ws] of Object.entries(AURA_KWS)) {
    let n = 0;
    for (const w of ws) if (t.includes(w)) n++;
    if (n > bn) {
      bn = n;
      best = k;
    }
  }
  return best;
}
$('doUp').onclick = async () => {
  if (!picked) return;
  const file = picked;
  const isVid = VID_EXT.test(file.name) || /^video\//.test(file.type);
  const dir = isVid ? 'videos' : 'photos';
  const ext =
    (file.name.split('.').pop() || (isVid ? 'mp4' : 'jpg'))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || (isVid ? 'mp4' : 'jpg');
  const name = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + '.' + ext;
  prog('你的照片正在飞往 B612…(可关闭本页,上传不会断)');
  // 分片上传(2026-07-28 晚高峰应急):CF 回源限流,>384KB 的文件按 256KB 切片逐片传,
  // 每片几秒内完成,绕开 Cloudflare 100s 超时(524);小文件仍直传
  const CHUNK = 256 * 1024;
  async function uploadFile() {
    if (file.size <= 384 * 1024) {
      const r = await fetch('/api/upload?dir=' + dir + '&name=' + encodeURIComponent(name), {
        method: 'POST',
        body: file,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '上传失败');
      return d;
    }
    const total = Math.ceil(file.size / CHUNK);
    let last = null;
    for (let i = 0; i < total; i++) {
      prog('正在上传 ' + (i + 1) + '/' + total + ' 片(高峰期限速,分片慢传)…');
      const r = await fetch(
        '/api/upload/chunk?dir=' +
          dir +
          '&name=' +
          encodeURIComponent(name) +
          '&seq=' +
          i +
          '&total=' +
          total,
        { method: 'POST', body: file.slice(i * CHUNK, (i + 1) * CHUNK) }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '上传失败(第 ' + (i + 1) + ' 片)');
      last = d;
    }
    return last;
  }
  // 灵蕴去重(2026-07-26 主人定):同一张照片按内容哈希只计一次 +5 进度,重复上传不刷分
  // 2026-09-04 修复:哈希改为上传成功后才入库——失败重试不再被误判 dup 烧掉 +5(审计发现)
  let dup = false;
  let pendingHex = null;
  if (!isVid) {
    try {
      const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hex = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const set = ctx.store.json('upHash', []);
      if (set.includes(hex)) dup = true;
      else pendingHex = hex;
    } catch (e) {}
  }
  try {
    const d = await uploadFile();
    if (pendingHex) {
      const set = ctx.store.json('upHash', []);
      if (!set.includes(pendingHex)) {
        set.push(pendingHex);
        ctx.store.setJson('upHash', set);
      }
    }
    if (d.mt) {
      ctx.mode.myUploadTokens = ctx.mode.myUploadTokens || {};
      ctx.mode.myUploadTokens[name] = d.mt;
    } // 媒体令牌:本张图片以后走 ?mt= 过图片代理
    playUploadHint(() => {
      ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak('你的照片已飞抵 B612。');
    }); // 提示音先播,TTS 排队等播完再开口(不混音)
    goldDust(); // B612灵鉴:灵蕴归位,金色微尘 2 秒
    prog(isVid ? '你收回了一片光。正在上墙…' : '你收回了一片光。AI 配文中…(可先去逛)');
    picked = null;
    $('drop').textContent = '点这里选择照片/视频';
    $('doUp').style.display = 'none';
    // AI 配文(仅图片;失败用回退句,不阻塞上墙)
    let caption = isVid ? '访客上传的视频' : '访客上传的照片';
    if (!isVid) {
      try {
        const rv = await fetch('/api/vision/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: name }),
        });
        const dv = await rv.json();
        if (dv.caption) caption = dv.caption;
      } catch (e) {}
    }
    // 上墙 + 路标(四象:图片按气质归方位墙,视频不参与)
    const aura = isVid ? null : classifyAura(caption);
    const g = ctx.gallery.hangOne(dir + '/' + name, caption, aura);
    if (ctx.mode.myUploads && !ctx.mode.myUploads.includes(name)) ctx.mode.myUploads.push(name);
    if (ctx.mode.myCaptions) ctx.mode.myCaptions[name] = caption;
    if (ctx.mode.applyPaintMode) ctx.mode.applyPaintMode();
    guideTo({ x: g.userData.ox, y: g.userData.oy, z: g.userData.oz });
    prog('它归位了。跟着金色路标去找它吧');
    ctx.ui.modeToast && ctx.ui.modeToast('它归位了。跟着金色路标去找它吧'); // 全局提示:面板关了也看得见
    if (aura) ctx.ui.modeToast && ctx.ui.modeToast('这幅画的气质，归了' + AURA_PLACE[aura] + '。');
    // 天穹进度(2026-07-26 新规则):上传一张照片 +5,重复照片不加
    if (!isVid) {
      if (dup) {
        ctx.ui.modeToast && ctx.ui.modeToast('这片灵蕴已归过位，不再重复计算。');
      } else {
        const u = ctx.store.num('up') + 1;
        ctx.store.setNum('up', u);
        ctx.ui.modeToast && ctx.ui.modeToast('灵蕴 +5。天穹裂痕收窄了一寸。');
        ctx.kunlun.checkSkyMs && ctx.kunlun.checkSkyMs();
      }
    }
    open = false;
    panel.classList.remove('show');
  } catch (e) {
    prog(e.message || '上传失败,请稍后再试');
  }
};

// ===== 我的链接 =====
let pickedModel = 'sphere';
{
  // 常用网站预设:点击一键填名称+网址,选模型即可落成到 3D 链接
  const PRESETS = [
    ['百度', 'https://www.baidu.com'],
    ['哔哩哔哩', 'https://www.bilibili.com'],
    ['王者营地', 'https://pvp.qq.com/cp/a20190918confrontationm/index.html'],
    [
      '爱奇艺',
      'https://mbd.baidu.com/ug_share/mbox/4a83aa9e65/share?product=external&tk=50777bfaa57553a1ae74eafb54e8d53e&share_url=https%3A%2F%2Fm.iqiyi.com%2F&domain=mbd.baidu.com',
    ],
  ];
  const pw = $('lkPresets');
  for (const [n, u] of PRESETS) {
    const b = document.createElement('button');
    b.textContent = n;
    b.onclick = () => {
      $('lkName').value = n;
      $('lkUrl').value = u;
    };
    pw.appendChild(b);
  }
  const wrap = $('lkModels');
  const types = ctx.mode.LINK_MODEL_TYPES || {};
  Object.keys(types).forEach((k, i) => {
    const b = document.createElement('button');
    b.textContent = types[k].name;
    if (i === 0) b.classList.add('on');
    b.onclick = () => {
      pickedModel = k;
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
    wrap.appendChild(b);
  });
}
$('doLk').onclick = async () => {
  const name = $('lkName').value.trim(),
    url = $('lkUrl').value.trim();
  if (!name || !/^https?:\/\//i.test(url)) {
    prog('名称和 http(s) 链接都要填对');
    return;
  }
  // 模型出现在眼前:玩家前方 3 米
  const pos = { x: 0, y: 2.0, z: 0 };
  if (ctx.player.pl) {
    const fx = -Math.sin(ctx.player.pl.y),
      fz = -Math.cos(ctx.player.pl.y);
    pos.x = +(ctx.player.pl.p.x + fx * 3).toFixed(1);
    pos.z = +(ctx.player.pl.p.z + fz * 3).toFixed(1);
  }
  prog('落成中…');
  try {
    const r = await fetch('/api/mylinks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', name, url, model: pickedModel, pos }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '失败');
    prog('你召来了一件凡间的造物。B612收下了。');
    ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak('你召来了一件凡间的造物。B612收下了。');
    $('lkName').value = '';
    $('lkUrl').value = '';
    if (ctx.mode.refreshMode) await ctx.mode.refreshMode();
    renderMyLinks();
    guideTo(pos);
    setTimeout(() => {
      open = false;
      panel.classList.remove('show');
    }, 800);
  } catch (e) {
    prog(e.message || '失败,请稍后再试');
  }
};

// 我的链接管理列表(含删除)
async function renderMyLinks() {
  const list = ctx.mode.myLinks || [];
  myLinkListEl.innerHTML = list.length
    ? list
        .map(
          (
            l,
            i
          ) => `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;font-size:12px">
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🔗 ${l.name}</span>
    <button data-i="${i}" style="padding:3px 8px;font-size:11px;border:1px solid rgba(255,120,120,0.5);border-radius:6px;background:transparent;color:#ff9a9a;cursor:pointer">删除</button>
  </div>`
        )
        .join('')
    : '<div style="font-size:11px;opacity:.5">还没有自己的链接</div>';
  myLinkListEl.querySelectorAll('button[data-i]').forEach((b) => {
    b.onclick = async () => {
      const l = list[+b.dataset.i];
      b.disabled = true;
      b.textContent = '…';
      try {
        const r = await fetch('/api/mylinks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'del', id: l.id }),
        });
        if (!r.ok) throw 0;
        if (ctx.mode.refreshMode) await ctx.mode.refreshMode();
        renderMyLinks();
      } catch (e) {
        b.disabled = false;
        b.textContent = '删除';
      }
    };
  });
}
// 面板打开时刷新一次;mode 刷新也会更新 ctx.mode.myLinks
setInterval(renderMyLinks, 5000);

hotEnd('upload');
if (import.meta.hot) import.meta.hot.accept();
