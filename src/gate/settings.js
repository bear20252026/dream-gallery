// settings.js — 昵称系统(双渠道,进馆后自愿,不强制) + 设置面板入口
// 子模块:sky-progress(天穹) / chat-room(聊天室) / spirit-page(六灵蕴) / upload-import(展厅选片) / quality(画质)
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';
import { skyApi, openSky } from './settings/sky-progress.js';
import { chatApi } from './settings/chat-room.js';
import { spApi } from './settings/spirit-page.js';
import { etPickApi, openEternalPick } from './settings/upload-import.js';
import { qApi, openQuality } from './settings/quality.js';
const bag = hotBegin('settings');

let myName = ctx.store.str('nick');
let panelOpen = false;

// ===================== CSS =====================
const css = document.createElement('style');
css.textContent = `
#nickPop{position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:80;width:min(320px,88vw);background:linear-gradient(160deg,rgba(34,20,30,0.96),rgba(22,12,24,0.96));border:1px solid rgba(255,214,170,0.35);border-radius:18px;padding:34px 20px 20px;text-align:center;box-shadow:0 16px 60px rgba(0,0,0,0.55);display:none}
#nickPop.show{display:block;animation:nickIn .45s ease}
@keyframes nickIn{from{opacity:0;transform:translate(-50%,-46%)}to{opacity:1;transform:translate(-50%,-50%)}}
#nickPop .poem{color:#ffe2c4;font-size:15px;line-height:1.9;letter-spacing:1px}
#nickPop .pact{margin-top:14px;border:1px dashed rgba(255,214,170,0.45);border-radius:12px;padding:10px;position:relative}
#nickPop .pact::before{content:'契 约 书';position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:#241320;padding:0 10px;color:rgba(255,214,170,0.75);font-size:12px;letter-spacing:3px}
#nickPop input{width:100%;padding:11px;border-radius:9px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;font-size:15px;text-align:center;outline:none;box-sizing:border-box}
#nickPop input:focus{border-color:rgba(255,214,170,0.6)}
#nickPop button.save{margin-top:12px;width:100%;padding:11px;border:none;border-radius:10px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;font-size:15px;letter-spacing:4px;cursor:pointer}
#nickPop .x{position:absolute;top:-9px;left:50%;transform:translateX(-50%);width:18px;height:18px;line-height:16px;border-radius:50%;background:rgba(60,40,50,0.9);border:1px solid rgba(255,255,255,0.25);color:rgba(255,255,255,0.65);font-size:11px;cursor:pointer;text-align:center;user-select:none}
#nickPop .x:hover{color:#fff;border-color:#fff}
#gearBtn{position:fixed;right:14px;bottom:14px;z-index:70;width:42px;height:42px;border-radius:50%;background:rgba(30,20,34,0.8);border:1px solid rgba(255,255,255,0.2);color:#e8d8c8;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .3s}
#gearBtn:hover{transform:rotate(60deg)}
#gearPanel{position:fixed;right:14px;bottom:64px;z-index:70;width:240px;background:linear-gradient(160deg,rgba(34,20,30,0.96),rgba(22,12,24,0.96));border:1px solid rgba(255,255,255,0.16);border-radius:14px;padding:16px;display:none;color:#e8dcd0}
#gearPanel.show{display:block}
#gearPanel h4{margin:0 0 10px;font-size:14px;letter-spacing:2px;color:#ffd9c4;display:flex;justify-content:space-between;align-items:center}
#gearPanel h4 .px{cursor:pointer;color:rgba(255,255,255,0.5);font-size:16px;padding:0 2px}
#gearPanel h4 .px:hover{color:#fff}
#gearPanel input{width:100%;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;text-align:center;outline:none;box-sizing:border-box}
#gearPanel button{margin-top:10px;width:100%;padding:9px;border:none;border-radius:8px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;font-size:14px;cursor:pointer}
#gearPanel .tip{margin-top:8px;font-size:11px;color:rgba(255,255,255,0.4);text-align:center}
#gearPanel .menu{margin-top:14px;border-top:1px solid rgba(255,255,255,0.12);padding-top:12px;display:flex;flex-direction:column;gap:8px}
#gearPanel .menu button{padding:10px;border:1px solid rgba(255,255,255,0.18);border-radius:9px;background:rgba(255,255,255,0.06);color:#e8dcd0;font-size:14px;cursor:pointer;text-align:left}
#gearPanel .menu button:hover{background:rgba(200,138,75,0.2);border-color:#c98a4b}
#etPickList{max-height:44vh;overflow-y:auto;margin:10px 0;display:flex;flex-direction:column;gap:6px}
#etPickList label{display:flex;align-items:center;gap:8px;font-size:12px;padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:8px;cursor:pointer;color:#e8dcd0}
#etPickList label.on{background:rgba(200,138,75,.18);border-color:#c98a4b}
#etPickList input{accent-color:#c98a4b;flex:none}
#etPickList .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#qOv .opt{padding:13px;border:1px solid rgba(255,255,255,.18);border-radius:10px;margin:8px 0;cursor:pointer;text-align:center;font-size:14px;color:#e8dcd0}
#qOv .opt.on{background:rgba(200,138,75,.22);border-color:#c98a4b}
#qOv .opt small{display:block;opacity:.55;font-size:11px;margin-top:3px}
`;
document.head.appendChild(css);

// ===================== 昵称弹窗 =====================
const pop = document.createElement('div');
pop.id = 'nickPop';
pop.innerHTML = `<div class="x" id="nickX">✕</div>
  <div class="poem">古老的低语在等待回应……<br>请给出你的真言，以便元素之力归附于你。</div>
  <div class="pact"><input id="nickInput" maxlength="16" placeholder="写下雅号(也可日后再改)"></div>
  <button class="save" id="nickSave">落 款</button>`;
document.body.appendChild(pop);

// ===================== 设置面板(昆仑罗盘触发) =====================
const gear = document.getElementById('kunlunCompass') || document.createElement('div');
gear.style.cursor = 'pointer';
const lkOld = document.getElementById('lk');
if (lkOld) lkOld.style.display = 'none';
const panel = document.createElement('div');
panel.id = 'gearPanel';
panel.style.left = '16px';
panel.style.right = 'auto';
panel.style.bottom = 'auto';
panel.style.top = '88px';
panel.innerHTML = `<h4>设 置<span class="px" id="gearX">✕</span></h4>
  <input id="gearNickInput" maxlength="16" placeholder="你的昵称">
  <button id="gearNickSave">保存昵称</button>
  <div class="menu">
    <button id="gmUpload">📷 上传照片 / 视频</button>
    <button id="gmUploadLink">🔗 添加我的链接</button>
    <button id="gmColor">🎨 房屋换色</button>
    <button id="gmGuide">📖 元素共鸣准则(说明书)</button>
    <button id="gmSky">🌌 天穹</button>
    <button id="gmSpirits">✦ 六灵蕴</button>
    <button id="gmSelectEternal">🖼 展厅选片</button>
    <button id="gmQuality">🎚 画质</button>
    <button id="gmChat">💬 聊天</button>
  </div>
  <div id="skyBox" style="display:none;text-align:center;margin-top:10px"><canvas id="skyCv" width="150" height="150"></canvas><div id="skyTx" style="font-size:12px;color:#ffd9a8;letter-spacing:2px;margin-top:4px"></div><div id="skySub" style="font-size:10px;color:rgba(255,217,168,.55);margin-top:2px"></div><div id="skyLine" style="font-size:11px;color:rgba(255,235,200,.8);line-height:1.7;margin-top:5px;min-height:18px"></div><div id="skyStats" style="font-size:10px;color:rgba(255,255,255,.45);margin-top:4px"></div><div id="skyFull" style="display:none;font-size:11px;color:rgba(255,220,170,.8);line-height:1.8;margin-top:6px">天穹已合。你带来的每一片灵蕴，都回到了它该在的地方。<br>但昆仑不闭门——新的裂痕总会生出，你会回来吗？</div></div>`;
document.body.appendChild(panel);

// ===================== 快捷菜单入口 =====================
function closePanel() {
  panelOpen = false;
  panel.classList.remove('show');
}

document.getElementById('gmSky').onclick = function () {
  closePanel();
  openSky();
};
document.getElementById('gmSelectEternal').onclick = function () {
  closePanel();
  openEternalPick();
};
document.getElementById('gmQuality').onclick = function () {
  closePanel();
  openQuality();
};
document.getElementById('gmUpload').onclick = function () {
  closePanel();
  if (ctx.mode.openUpload) {
    ctx.mode.openUpload();
    const t = document.getElementById('tabPhoto');
    t && t.click();
  }
};
document.getElementById('gmUploadLink').onclick = function () {
  closePanel();
  if (ctx.mode.openUpload) {
    ctx.mode.openUpload();
    const t = document.getElementById('tabLink');
    t && t.click();
  }
};
document.getElementById('gmColor').onclick = function () {
  closePanel();
  ctx.gallery.openHouseColor && ctx.gallery.openHouseColor();
};
document.getElementById('gmGuide').onclick = function () {
  closePanel();
  window.openPanel('guide.html', '元素共鸣准则');
};

// ===================== Esc 退出设置面板 =====================
function onSettingsKey(e) {
  if (e.key !== 'Escape') return;
  if (panel.classList.contains('show')) {
    panelOpen = false;
    panel.classList.remove('show');
  }
}
document.addEventListener('keydown', onSettingsKey);

// ===================== 热更新清理 =====================
bag.custom.push(() => {
  document.removeEventListener('keydown', onSettingsKey);
  skyApi.unregister();
  chatApi.unregister();
  spApi.unregister();
  etPickApi.unregister();
  qApi.unregister();
});

// ===================== 保存昵称 =====================
async function saveNick(name, onOk) {
  name = (name || '').trim().slice(0, 16);
  const base = name.replace(/^(六合藏梦人|心象行者|昆仑回响)·/, '');
  const p = ctx.kunlun.isDone && ctx.kunlun.isDone() ? ctx.store.str('prefix') : '';
  name = (p + base).slice(0, 16);
  if (!name) {
    ctx.ui.modeToast && ctx.ui.modeToast('昵称不能为空');
    return;
  }
  try {
    const r = await fetch('/api/entry/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '保存失败');
    myName = name;
    ctx.store.setStr('nick', name);
    ctx.ui.modeToast && ctx.ui.modeToast('你的名字已被刻入昆仑壁。');
    ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak('你的名字已被刻入昆仑壁。');
    if (onOk) onOk();
  } catch (e) {
    ctx.ui.modeToast && ctx.ui.modeToast(e.message || '保存失败,请稍后再试');
  }
}

// ===================== 昵称弹窗逻辑 =====================
let popShown = false;
function maybePop() {
  if (popShown || myName || panelOpen) return;
  // 用户本次浏览器会话里已关过/保存过昵称 → 不再重复弹。
  // (之前 nickPopOff 只写不读:每次刷新都弹窗 + 10s 关闭锁,盖住画布中央,
  //  也挡住画布点击,加重"卡住"的体感)
  if (sessionStorage.getItem('nickPopOff') === '1') return;
  if (
    !sessionStorage.getItem('agreementConsented') ||
    !sessionStorage.getItem('privacyConsented') ||
    !sessionStorage.getItem('communityConsented')
  )
    return;
  pop.classList.add('show');
  lockPop(10);
}
function lockPop(sec) {
  const x = document.getElementById('nickX'),
    save = document.getElementById('nickSave');
  const origX = x.textContent;
  let left = sec;
  x.textContent = left + 's';
  x.style.pointerEvents = 'none';
  x.style.opacity = '0.5';
  const t = setInterval(function () {
    left--;
    if (left <= 0) {
      clearInterval(t);
      x.textContent = origX;
      x.style.pointerEvents = '';
      x.style.opacity = '';
    } else x.textContent = left + 's';
  }, 1000);
}
document.getElementById('nickX').onclick = function () {
  pop.classList.remove('show');
  popShown = true;
  sessionStorage.setItem('nickPopOff', '1');
};
document.getElementById('nickSave').onclick = function () {
  saveNick(document.getElementById('nickInput').value, function () {
    pop.classList.remove('show');
    popShown = true;
    sessionStorage.setItem('nickPopOff', '1');
  });
};

// ===================== 齿轮面板绑定 =====================
function bindGear() {
  const g = document.getElementById('kunlunCompass');
  if (!g) {
    setTimeout(bindGear, 300);
    return;
  }
  g.onclick = function (e) {
    if (e && e.stopPropagation) e.stopPropagation();
    panelOpen = !panelOpen;
    panel.classList.toggle('show', panelOpen);
    const li = document.getElementById('li');
    if (li) {
      li.style.transition = 'transform .5s';
      li.style.transform = panelOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    if (panelOpen) document.getElementById('gearNickInput').value = myName;
  };
}
bindGear();
document.getElementById('gearNickSave').onclick = function () {
  saveNick(document.getElementById('gearNickInput').value, function () {
    panelOpen = false;
    panel.classList.remove('show');
  });
};
document.getElementById('gearX').onclick = function () {
  panelOpen = false;
  panel.classList.remove('show');
};

// ===================== 开局触发 =====================
setTimeout(function () {
  if (ctx.showGuideCard) ctx.showGuideCard();
  maybePop();
}, 4000);

hotEnd('settings');
if (import.meta.hot) import.meta.hot.accept();
