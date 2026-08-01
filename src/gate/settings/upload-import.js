// upload-import.js — C2 展厅选片导入(从上传中挑选 ≤20 幅呈现在永恒展厅西墙)
import { ctx } from '../../ctx.js';

const etPickOv = document.createElement('div');
etPickOv.id = 'etPickOv';
etPickOv.style.cssText =
  'position:fixed;inset:0;z-index:380;display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
etPickOv.innerHTML =
  '<div style="width:min(420px,92vw);max-height:84vh;overflow-y:auto;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:18px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55)">' +
  '<div style="display:flex;align-items:center;margin-bottom:6px"><b style="letter-spacing:2px;font-size:15px">展厅选片</b><span id="etPickX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px;font-size:14px">✕</span></div>' +
  '<div style="font-size:11px;color:rgba(255,217,168,.6);line-height:1.7;margin-bottom:4px">从「我的上传」挑选 ≤20 幅,呈现在永恒展厅西墙(仅自己可见)。选好后需抵达展厅才会显现。</div>' +
  '<div id="etPickCount" style="font-size:12px;color:#ffd9a8;margin-bottom:6px">已选 0 / 20</div>' +
  '<div id="etPickList"></div>' +
  '<div id="etPickEmpty" style="display:none;font-size:12px;color:rgba(255,255,255,.5);text-align:center;padding:14px">你还没有上传过作品。先去「上传照片 / 视频」吧。</div>' +
  '<button id="etPickSave" style="margin-top:8px;width:100%;padding:11px;border:none;border-radius:10px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;font-size:14px;cursor:pointer">保 存 选 片</button></div>';
document.body.appendChild(etPickOv);
export const etPickApi = ctx.overlay.register(etPickOv, { x: '#etPickX' });

let etSel = new Set();

function etRender(list) {
  const box = document.getElementById('etPickList'),
    empty = document.getElementById('etPickEmpty'),
    cnt = document.getElementById('etPickCount');
  box.innerHTML = '';
  if (!list.length) {
    empty.style.display = 'block';
    cnt.textContent = '已选 0 / 20';
    return;
  }
  empty.style.display = 'none';
  for (const name of list) {
    const on = etSel.has(name);
    const lab = document.createElement('label');
    lab.className = on ? 'on' : '';
    lab.innerHTML =
      '<input type="checkbox" ' +
      (on ? 'checked' : '') +
      '><span class="nm">' +
      name.replace(/^whiteboard-/i, '') +
      '</span>';
    lab.querySelector('input').onchange = function () {
      if (this.checked) {
        if (etSel.size >= 20) {
          this.checked = false;
          ctx.ui.modeToast && ctx.ui.modeToast('最多选 20 幅');
          return;
        }
        etSel.add(name);
      } else etSel.delete(name);
      lab.className = this.checked ? 'on' : '';
      cnt.textContent = '已选 ' + etSel.size + ' / 20';
    };
    box.appendChild(lab);
  }
  cnt.textContent = '已选 ' + etSel.size + ' / 20';
}

export function openEternalPick() {
  etSel = new Set(ctx.store.json('eternalPicks', []) || []);
  fetch('/api/myuploads')
    .then((r) => r.json())
    .then((d) => {
      etRender((d.names || []).filter((n) => !/^whiteboard-/i.test(n)));
      etPickApi.open();
    })
    .catch(() => {
      etRender([]);
      etPickApi.open();
    });
}
document.getElementById('etPickSave').onclick = function () {
  ctx.store.setJson('eternalPicks', Array.from(etSel));
  ctx.kunlun.rebuildEternalPicks && ctx.kunlun.rebuildEternalPicks();
  etPickApi.close();
  ctx.ui.modeToast &&
    ctx.ui.modeToast('选片已保存' + (etSel.size ? '（' + etSel.size + ' 幅）' : '（已清空）'));
};
