// spirit-page.js — 六灵蕴收集页(独立三级页,展示收集进度、召回、传送、前缀)
import { ctx } from '../../ctx.js';

const spOv = document.createElement('div');
spOv.id = 'spOv';
spOv.style.cssText =
  'position:fixed;inset:0;z-index:380;display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
const spCard = document.createElement('div');
spCard.style.cssText =
  'width:min(460px,92vw);max-height:82vh;overflow-y:auto;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:18px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55)';
spOv.appendChild(spCard);
document.body.appendChild(spOv);
export const spApi = ctx.overlay.register(spOv, { x: '#spX' });

function renderSpirits() {
  const list = ctx.kunlun.spiritsState ? ctx.kunlun.spiritsState() : [];
  const n = list.filter((x) => x.state === 'got').length;
  let html =
    '<div style="display:flex;align-items:center;margin-bottom:10px"><b style="letter-spacing:2px;font-size:15px">六灵蕴</b><span style="font-size:11px;color:rgba(255,217,168,.55);margin-left:8px">' +
    n +
    ' / 6</span><span id="spX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px">✕</span></div>';
  html +=
    '<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.1);margin-bottom:12px"><div style="height:100%;width:' +
    (n / 6) * 100 +
    '%;border-radius:3px;background:linear-gradient(90deg,#7ddb7a,#f0a860)"></div></div>';
  for (const sp of list) {
    const st =
      sp.state === 'got'
        ? '已收集'
        : sp.state === 'open'
          ? '位置已解锁 · ' + sp.place
          : '位置未解锁';
    html +=
      '<div style="display:flex;align-items:center;gap:8px;padding:7px 4px;font-size:12px;opacity:' +
      (sp.state === 'locked' ? '0.45' : '1') +
      '">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:' +
      (sp.state === 'got' ? sp.color : 'transparent') +
      ';border:1.5px solid ' +
      sp.color +
      '"></span>' +
      '<span style="flex:1">' +
      sp.name +
      ' <span style="opacity:.5;font-size:10px">' +
      sp.en +
      ' · ' +
      sp.emotion +
      '</span></span>' +
      '<span style="font-size:10px;color:' +
      (sp.state === 'got' ? '#7dff9a' : sp.state === 'open' ? '#ffd9a8' : 'rgba(255,255,255,.4)') +
      '">' +
      st +
      '</span></div>';
  }
  if (n >= 6) {
    const lg = ctx.store.json('letGo', []);
    if (lg.length) {
      html +=
        '<div style="margin-top:10px;padding:10px;border:1px dashed rgba(255,214,170,.35);border-radius:12px;font-size:11px;line-height:2;color:#ffe9c4">已放下的照片（它们还在服务器上，随时可召回）：';
      for (const nm of lg) {
        const fr = (ctx.scene.iG || []).find((g) => g.userData && g.userData.eternalName === nm);
        const label =
          fr && fr.userData.mtime ? '此处曾有过——' + fr.userData.mtime.slice(0, 10) : nm;
        html +=
          '<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.75">' +
          label +
          '</span><button data-lg="' +
          nm +
          '" style="padding:3px 10px;font-size:11px;border:1px solid rgba(124,200,232,.5);border-radius:6px;background:transparent;color:#bfe8ff;cursor:pointer">召回</button></div>';
      }
      html += '</div>';
    }
    html +=
      '<div style="margin-top:10px;display:flex;gap:8px">' +
      '<button id="spGoHall" style="flex:1;padding:9px;border:none;border-radius:9px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;cursor:pointer;font-size:12px">⇪ 返回永恒展厅</button>' +
      '<button id="spGoPeak" style="flex:1;padding:9px;border:1px solid rgba(255,214,170,.5);border-radius:9px;background:transparent;color:#ffe2c4;cursor:pointer;font-size:12px">⇣ 山巅登飞舟</button></div>';
    html +=
      '<div style="margin-top:10px;padding:10px;border:1px dashed rgba(255,214,170,.5);border-radius:12px;font-size:11px;line-height:1.9;color:#ffe9c4">六灵蕴齐聚。雅号可冠前缀：<br>' +
      '<select id="spPrefix" style="margin-top:6px;width:100%;padding:7px;border-radius:8px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.2)">' +
      '<option value="">无前缀</option><option value="六合藏梦人·">六合藏梦人·</option><option value="心象行者·">心象行者·</option><option value="昆仑回响·">昆仑回响·</option></select>' +
      '<div style="opacity:.6;margin-top:4px">选好后,再保存一次昵称即生效(聊天与访客记录中显示)。</div></div>';
  } else {
    const next = list.find((x) => x.state === 'open');
    html +=
      '<div style="margin-top:8px;font-size:11px;color:rgba(255,217,168,.7)">' +
      (next
        ? '下一颗：' + next.name + '（' + next.place + '）——循金色光柱而去'
        : '天穹合拢之后，残镜自会指引你。') +
      '</div>';
  }
  spCard.innerHTML = html;
  const sel = document.getElementById('spPrefix');
  if (sel) {
    sel.value = ctx.store.str('prefix');
    sel.onchange = () => {
      ctx.store.setStr('prefix', sel.value);
      ctx.ui.modeToast &&
        ctx.ui.modeToast(
          sel.value ? '前缀已选：' + sel.value + ' 再保存一次昵称生效' : '已取消前缀'
        );
    };
  }
  const gh = document.getElementById('spGoHall');
  if (gh)
    gh.onclick = () => {
      spApi.close();
      ctx.kunlun.eternalTeleport && ctx.kunlun.eternalTeleport(true);
    };
  const gp = document.getElementById('spGoPeak');
  if (gp)
    gp.onclick = () => {
      spApi.close();
      ctx.kunlun.arkTeleportToPeak && ctx.kunlun.arkTeleportToPeak();
    };
  spCard.querySelectorAll('button[data-lg]').forEach((b) => {
    b.onclick = () => {
      if (ctx.kunlun.letgoRecall && ctx.kunlun.letgoRecall(b.getAttribute('data-lg')))
        renderSpirits();
    };
  });
}

// gmSpirits 由 settings.js 动态创建，需在 settings.js 设置完 panel 后再绑定
setTimeout(function () {
  document.getElementById('gmSpirits').onclick = function () {
    renderSpirits();
    spApi.open();
  };
}, 0);
window.__refreshSpirits = function () {
  if (spApi.isOpen()) renderSpirits();
};
