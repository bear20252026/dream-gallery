// quality.js — D4 低画质手动开关(高画质自动 / 低画质锁定最低分辨率)
import { ctx } from '../../ctx.js';

const qOv = document.createElement('div');
qOv.id = 'qOv';
qOv.style.cssText =
  'position:fixed;inset:0;z-index:380;display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
qOv.innerHTML =
  '<div style="width:min(360px,92vw);background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:18px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55)">' +
  '<div style="display:flex;align-items:center;margin-bottom:8px"><b style="letter-spacing:2px;font-size:15px">画质</b><span id="qX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px;font-size:14px">✕</span></div>' +
  '<div class="opt" id="qHigh">高画质 · 自动<small>按帧率自动调节清晰度(默认)</small></div>' +
  '<div class="opt" id="qLow">低画质 · 流畅<small>锁定最低分辨率,弱机/弱网更顺滑</small></div></div>';
document.body.appendChild(qOv);
export const qApi = ctx.overlay.register(qOv, { x: '#qX' });

function qSync() {
  const low = !!ctx.store.json('lowQuality', false);
  document.getElementById('qHigh').className = 'opt' + (low ? '' : ' on');
  document.getElementById('qLow').className = 'opt' + (low ? ' on' : '');
}

export function openQuality() {
  qSync();
  qApi.open();
}
document.getElementById('qHigh').onclick = function () {
  ctx.setLowQuality && ctx.setLowQuality(false);
  qSync();
};
document.getElementById('qLow').onclick = function () {
  ctx.setLowQuality && ctx.setLowQuality(true);
  qSync();
};
