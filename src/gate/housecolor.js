// housecolor.js — 房屋分组换色:墙壁/天花板/腰线/踢脚线 各自独立换色
// 16 预设色卡 + 自定义取色,即时生效,localStorage 记忆;换色仅自己可见
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
hotBegin('housecolor');

const GROUPS=[
  ['wall','墙壁'],['ceil','天花板'],['deco','腰线'],['base','踢脚线'],
];
const PRESETS=[
  ['妃粉','#e8a0b4'],['朱砂','#c04030'],['柿橙','#d4682a'],['杏黄','#e8b84a'],
  ['松绿','#3c8060'],['竹青','#58a08a'],['翡翠','#20a080'],['黛蓝','#3a5a8c'],
  ['霁蓝','#6a9ad0'],['藕紫','#b090c8'],['檀紫','#7a5a9c'],['鎏金','#c8a84a'],
  ['月白','#e8e4da'],['米白','#d8cbb0'],['黛灰','#6a6a72'],['墨黑','#3a3a42'],
];

const css=document.createElement('style');
css.textContent=`
#hcBtn{position:fixed;left:14px;bottom:64px;z-index:70;height:42px;padding:0 16px;border-radius:21px;background:rgba(30,20,34,0.85);border:1px solid rgba(255,255,255,0.2);color:#e8d8c8;font-size:15px;cursor:pointer;display:flex;align-items:center;gap:6px}
#hcPanel{position:fixed;left:14px;bottom:114px;z-index:70;width:min(300px,90vw);background:linear-gradient(160deg,rgba(34,20,30,0.97),rgba(22,12,24,0.97));border:1px solid rgba(255,255,255,0.16);border-radius:16px;padding:16px;display:none;color:#e8dcd0;max-height:70vh;overflow-y:auto}
#hcPanel.show{display:block}
#hcPanel h4{margin:0 0 10px;font-size:14px;letter-spacing:2px;color:#ffd9c4;display:flex;justify-content:space-between;align-items:center}
#hcPanel .gt{display:flex;gap:6px;margin-bottom:12px}
#hcPanel .gt button{flex:1;padding:7px 2px;font-size:12px;border:1px solid rgba(255,255,255,0.18);border-radius:8px;background:transparent;color:#dcc;cursor:pointer}
#hcPanel .gt button.on{border-color:#c98a4b;color:#ffe2c4;background:rgba(200,138,75,0.2)}
#hcPanel .sw{display:grid;grid-template-columns:repeat(8,1fr);gap:7px}
#hcPanel .sw button{aspect-ratio:1;border-radius:8px;border:2px solid transparent;cursor:pointer}
#hcPanel .sw button.on{border-color:#fff}
#hcPanel .row{display:flex;gap:8px;margin-top:12px;align-items:center}
#hcPanel input[type=color]{width:52px;height:34px;border:none;background:none;cursor:pointer;padding:0}
#hcPanel .row span{font-size:12px;color:rgba(255,255,255,0.55)}
#hcPanel .reset{flex:1;padding:8px;border:1px solid rgba(255,255,255,0.2);border-radius:8px;background:transparent;color:#cbb;font-size:13px;cursor:pointer}
`;
document.head.appendChild(css);

const btn=document.createElement('button');
btn.id='hcBtn';btn.style.display='none'; // 功能已并入 ⚙ 设置二级页(2026-07-25 主人定:悬浮按钮只留行走/跳跃类)
document.body.appendChild(btn);
const panel=document.createElement('div');
panel.id='hcPanel';
panel.style.right='14px';panel.style.left='auto';panel.style.bottom='64px';
panel.innerHTML=`<h4>房 屋 换 色<span class="px" id="hcX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,0.5);padding:0 2px">✕</span></h4><div class="gt"></div><div class="sw"></div>
  <div class="row"><input type="color" id="hcCustom" value="#e8a0b4"><span>自定义颜色</span>
  <button class="reset" id="hcReset">恢复全部原色</button></div>
  <div class="row"><span style="font-size:11px">换色只有你自己看得见,不会改别人的画廊</span></div>`;
document.body.appendChild(panel);
document.getElementById('hcX').onclick=function(){panel.classList.remove('show');};
btn.onclick=()=>panel.classList.toggle('show');
ctx.gallery.openHouseColor=function(){panel.classList.add('show');}; // ⚙ 设置二级页入口

let curGroup='wall';
const originals={}; // group -> [hex...]
let originalsSaved=false;
function matsOf(g){return (ctx.gallery.houseMats&&ctx.gallery.houseMats[g])||[];}
function saveOriginals(){
  if(originalsSaved)return;
  for(const [g] of GROUPS)originals[g]=matsOf(g).map(m=>'#'+m.color.getHexString());
  originalsSaved=true;
}
function apply(group,hex,save){
  saveOriginals();
  const c=new THREE.Color(hex);
  for(const m of matsOf(group))m.color.copy(c);
  if(save)ctx.store.setHouseColor(group,hex);
  // 昆仑灵鉴:换色=心象外显(节流 1.5s,自定义取色拖动不刷屏)
  if(save){const now=Date.now();if(now-(apply._t||0)>1500){apply._t=now;ctx.ui.modeToast&&ctx.ui.modeToast('你换上的不是颜色，是你此刻的心境。');if(!apply._spoke){apply._spoke=true;ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('你换上的不是颜色，是你此刻的心境。');}}}
  refreshSwatch();
}

// 分组页签
const gt=panel.querySelector('.gt');
for(const [g,label] of GROUPS){
  const b=document.createElement('button');
  b.textContent=label;b.dataset.g=g;
  if(g===curGroup)b.classList.add('on');
  b.onclick=()=>{
    curGroup=g;
    gt.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.g===g));
    refreshSwatch();
  };
  gt.appendChild(b);
}
// 色卡
const sw=panel.querySelector('.sw');
for(const [name,hex] of PRESETS){
  const b=document.createElement('button');
  b.style.background=hex;b.dataset.c=hex;b.title=name;
  b.onclick=()=>apply(curGroup,hex,true);
  sw.appendChild(b);
}
function refreshSwatch(){
  const cur=ctx.store.houseColor(curGroup);
  sw.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.c===cur));
  if(cur)document.getElementById('hcCustom').value=cur;
}
document.getElementById('hcCustom').oninput=e=>apply(curGroup,e.target.value,true);
document.getElementById('hcReset').onclick=()=>{
  for(const [g] of GROUPS){
    (originals[g]||[]).forEach((hex,i)=>{const m=matsOf(g)[i];if(m)m.color.set(hex);});
    ctx.store.clearHouseColor(g);
  }
  refreshSwatch();
};

// 启动时恢复每组上次选择
for(const [g] of GROUPS){
  const saved=ctx.store.houseColor(g);
  if(saved)apply(g,saved,false);
}
refreshSwatch();

hotEnd('housecolor');
if(import.meta.hot)import.meta.hot.accept();
