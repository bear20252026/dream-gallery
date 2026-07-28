// settings.js — 昵称系统(双渠道,进馆后自愿,不强制)
// 渠道一:进馆 5 秒后的轻弹窗(≤1/4 屏,居中,超小 ✕ 在上边框中央)
//   文案:「执棋入局,应先正其名。还请赐下雅号,以载此卷丹青。」输入框为「契约书」
// 渠道二:右下角 ⚙ 齿轮 → 设置页改昵称;保存即同步后台(POST /api/gate/rename)
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
const bag=hotBegin('settings');

let myName=ctx.store.str('nick');
let panelOpen=false;

const css=document.createElement('style');
css.textContent=`
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
`;
document.head.appendChild(css);

const pop=document.createElement('div');
pop.id='nickPop';
pop.innerHTML=`<div class="x" id="nickX">✕</div>
  <div class="poem">古老的低语在等待回应……<br>请给出你的真言，以便元素之力归附于你。</div>
  <div class="pact"><input id="nickInput" maxlength="16" placeholder="写下雅号(也可日后再改)"></div>
  <button class="save" id="nickSave">落 款</button>`;
document.body.appendChild(pop);

// 设置入口合并到左上角昆仑罗盘(2026-07-25 主人定:罗盘不只指方向,轻点也开设置页;右下粉色齿轮已隐藏)
const gear=document.getElementById('kunlunCompass')||document.createElement('div');
gear.style.cursor='pointer';
const lkOld=document.getElementById('lk');if(lkOld)lkOld.style.display='none'; // 隐藏旧粉色齿轮按钮
const panel=document.createElement('div');
panel.id='gearPanel';
panel.style.left='16px';panel.style.right='auto';panel.style.bottom='auto';panel.style.top='88px'; // 面板挂在罗盘下方
panel.innerHTML=`<h4>设 置<span class="px" id="gearX">✕</span></h4>
  <input id="gearNickInput" maxlength="16" placeholder="你的昵称">
  <button id="gearNickSave">保存昵称</button>
  <div class="menu">
    <button id="gmUpload">📷 上传照片 / 视频</button>
    <button id="gmUploadLink">🔗 添加我的链接</button>
    <button id="gmColor">🎨 房屋换色</button>
    <button id="gmGuide">📖 元素共鸣准则(说明书)</button>
    <button id="gmSky">🌌 天穹</button>
    <button id="gmSpirits">✦ 六灵蕴</button>
    <button id="gmChat">💬 聊天</button>
  </div>
  <div id="skyBox" style="display:none;text-align:center;margin-top:10px"><canvas id="skyCv" width="150" height="150"></canvas><div id="skyTx" style="font-size:12px;color:#ffd9a8;letter-spacing:2px;margin-top:4px"></div><div id="skySub" style="font-size:10px;color:rgba(255,217,168,.55);margin-top:2px"></div><div id="skyLine" style="font-size:11px;color:rgba(255,235,200,.8);line-height:1.7;margin-top:5px;min-height:18px"></div><div id="skyStats" style="font-size:10px;color:rgba(255,255,255,.45);margin-top:4px"></div><div id="skyFull" style="display:none;font-size:11px;color:rgba(255,220,170,.8);line-height:1.8;margin-top:6px">天穹已合。你带来的每一片灵蕴，都回到了它该在的地方。<br>但昆仑不闭门——新的裂痕总会生出，你会回来吗？</div></div>`;
document.body.appendChild(panel);
// ===== 昆仑灵鉴 M1:补天进度(天穹)——上传与有效凝视皆化灵蕴,金色填满裂痕 =====
function drawSky(){
  const cv=document.getElementById('skyCv');if(!cv)return;
  const c=cv.getContext('2d'),W=150,R=62,cx=75,cy=75;
  const val=skyVal(),ratio=Math.min(1,val/100); // 100 制:答对选择题×1 + 上传照片×5
  c.clearRect(0,0,W,W);
  // 天穹底:径向渐变+微光晕
  let dg=c.createRadialGradient(cx-14,cy-16,6,cx,cy,R);
  dg.addColorStop(0,'#2c2138');dg.addColorStop(1,'#120c1a');
  c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.fillStyle=dg;c.fill();
  if(ratio>0){ // 灵蕴金填充(扇形+前缘亮弧+外发光)
    c.save();
    c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+Math.PI*2*ratio);c.closePath();
    const g=c.createRadialGradient(cx,cy,4,cx,cy,R);g.addColorStop(0,'rgba(255,226,150,0.98)');g.addColorStop(0.7,'rgba(238,178,70,0.72)');g.addColorStop(1,'rgba(220,150,40,0.45)');c.fillStyle=g;
    c.shadowColor='rgba(255,200,100,0.75)';c.shadowBlur=16;c.fill();c.restore();
    // 填充前缘的亮弧
    const ea=-Math.PI/2+Math.PI*2*ratio;
    c.beginPath();c.arc(cx,cy,R*0.99,ea-0.12,ea+0.12);c.strokeStyle='rgba(255,244,210,0.9)';c.lineWidth=3;c.lineCap='round';c.stroke();
  }
  // 灵蕴微星(稳定位,不随重绘跳动)
  c.fillStyle='rgba(255,230,170,0.85)';
  for(let i=0;i<5;i++){const a=i*1.93+0.7,r2=R*(0.36+0.5*((i*37)%10)/10);c.beginPath();c.arc(cx+Math.cos(a)*r2,cy+Math.sin(a)*r2,1.4,0,Math.PI*2);c.fill();}
  // 裂纹(暗芯+淡金描边,利落一道)
  c.lineCap='round';let a=0.6;
  c.beginPath();c.moveTo(cx,cy);for(let r=8;r<R;r+=9){a+=Math.sin(r*3.7)*0.5;c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}
  c.strokeStyle='rgba(216,179,108,0.35)';c.lineWidth=4;c.stroke();
  c.strokeStyle='rgba(14,8,18,0.95)';c.lineWidth=2;c.stroke();
  // 外环:双层+高光
  c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.strokeStyle='rgba(216,179,108,0.55)';c.lineWidth=1.5;c.stroke();
  c.beginPath();c.arc(cx,cy,R+4,0,Math.PI*2);c.strokeStyle='rgba(216,179,108,0.18)';c.lineWidth=1;c.stroke();
  c.beginPath();c.arc(cx,cy,R,-Math.PI/2-0.9,-Math.PI/2-0.3);c.strokeStyle='rgba(255,240,200,0.6)';c.lineWidth=2.5;c.lineCap='round';c.stroke();
  document.getElementById('skyTx').textContent=val>=100?'天穹已合':'灵蕴归位率 '+val+' / 100';
  document.getElementById('skySub').textContent=val>=100?'天穹已合。灵蕴长存。':val>=81?'最后的天隙正在缝合……':val>=51?'天穹正在愈合……':val>=21?'裂痕正在收窄……':'灵蕴正在苏醒……';
  document.getElementById('skyLine').textContent=(val>=1&&val<100)?SKY_LINES[val-1]:'';
  document.getElementById('skyStats').textContent='答对选择题：'+ctx.store.num('quiz')+' 题 · 上传照片：'+ctx.store.num('up')+' 张';
  document.getElementById('skyFull').style.display=val>=100?'block':'none';
}
// ===== 天穹 100 制与里程碑文案系统(2026-07-26 主人定) =====
function skyVal(){
  const q=ctx.store.num('quiz'),u=ctx.store.num('up');
  return Math.min(q+u*5,100);
}
// 里程碑 11 档:屏幕中央大字 3 秒 + TTS 旁白(每档只触发一次);100% 后出选择对话框
const SKY_MS=[
  [5,'第一道裂痕的边缘，亮起了微光。','第一道裂痕的边缘，亮起了微光。昆仑等这一刻，等了很久。'],
  [10,'天穹记住了你的声音。','天穹记住了你的声音。你答对的每一道题，都在为它缝上第一针。'],
  [20,'第一缕天光，透了进来。','第一缕天光，透了进来。你带来的灵蕴，已经开始修补这片天空。'],
  [35,'昆仑的山风，忽然温柔了。','昆仑的山风，忽然温柔了。它认出了你——那个愿意凝视的人。'],
  [50,'裂痕收窄了一半。天穹记得你的每一幅画。','裂痕收窄了一半。天穹记得你的每一幅画，也记得你每一次低头沉思的片刻。'],
  [65,'残镜在回应你。你听见了吗？','残镜在回应你。你听见了吗？那是三千年来的第一声回响。'],
  [80,'还差最后一块。你听见女娲的回音了吗？','还差最后一块。你听见女娲的回音了吗？她说，她一直在等一个人，等一个愿意把记忆带上昆仑的人。'],
  [90,'天穹即将合拢。最后十步。','天穹即将合拢。最后十步。你走过的每一步，昆仑都替你记得。'],
  [95,'再挂一幅。就一幅。','再挂一幅。就一幅。那片天，在等你把它补完。'],
  [98,'你几乎能触到那片完整的天了。','你几乎能触到那片完整的天了。它就在你眼前，只差最后一丝灵蕴。'],
  [100,'天穹已合。你做到了。','天穹已合。你做到了。你带来的每一片灵蕴，都回到了它该在的地方。你答过的每一道题，都是你对天地的回答。你挂过的每一幅画，都是人间留给昆仑的证明。三千年了。你是第一个走完这条路的人。但昆仑不闭门。新的裂痕总会生出——新的记忆也在等你。你愿意回来吗，藏梦人？']
];
// 百分比逐条小文案(天穹页进度条旁显示,不播语音)
const SKY_LINES=['第一片灵蕴归位。天穹轻轻动了一下。','裂隙的边缘，有了温度。','昆仑开始记得你了。','女娲的碎片，正在醒来。','第一道裂痕的边缘，亮起了微光。','灵蕴在山巅汇聚。','天穹在低声回应。','你走过的每一步都算数。','镜面泛起第一层光晕。','天穹记住了你的声音。','裂缝的边缘开始发光。','第二片天光正在形成。','残镜的镜面更亮了一寸。','昆仑的风停了下来，在听。','你答过的每一题都在天穹上留下一笔。','灵蕴正在向裂痕汇聚。','天穹的裂缝边缘有了金色。','你挂的画在昆仑生了根。','万镜画廊的灯，亮了一盏。','第一缕天光，透了进来。','天穹的呼吸变得均匀了。','你上传的每一张照片都在发光。','昆仑记住了你的雅号。','灵蕴织入天隙的声音，像风穿过古琴。','四分之一的裂痕已经愈合。','西王母的残镜上，开始浮现你的名字。','万镜画廊的千面镜，都在朝你的方向转动。','你带来的灵蕴正在唤醒昆仑。','天穹的脉动与你同步。','裂痕收窄了一角。','灵蕴之光照亮了第一片云。','昆仑的山巅有了暖意。','天柱的根基在稳固。','你凝视过的每一幅画都在帮你。','昆仑的山风，忽然温柔了。','裂缝不再扩大。','灵蕴之石的光，穿透了云层。','万镜画廊的灯，亮了一半。','天穹在轻声说你的名字。','裂痕收窄了四成。','你带来的记忆正在编织天序。','昆仑的雪开始融化。','天穹的裂痕边缘有了完整的金色。','残镜的光从昆仑照到了人间。','灵蕴的河流正在填满天隙。','你挂的每一幅画都变成了一颗星。','天穹的脉络重新接通。','灵蕴已经覆盖了大半裂痕。','只剩一半了。','裂痕收窄了一半。天穹记得你的每一幅画。','你答的每一题都是天衣的一针。','灵蕴的节奏越来越快。','天穹的裂缝在颤抖——是愈合的颤抖。','万镜画廊的镜面映出了蓝天。','灵蕴已经覆盖了天穹的一半以上。','你在昆仑走过的路，已经开始发光。','天穹裂痕的宽度在缩小。','灵蕴的碎片正在彼此靠近。','天穹的缝合线越来越密。','六成。天穹记住了你的每一滴凝视。','裂痕的边缘开始自行愈合。','灵蕴的波纹正在天穹上扩散。','万镜画廊的灯，亮了大半。','天穹在为你让路。','残镜在回应你。你听见了吗？','灵蕴的流动变得顺畅。','裂痕的深度在变浅。','天穹的补丁正在融为一体。','你在昆仑刻下的印记，正在发光。','裂痕已经从天空退到了边缘。','灵蕴的光芒越来越亮。','天穹的呼吸变得轻盈。','女娲的回音越来越近。','灵蕴正在涌入最后一处缺口。','四分之三的裂痕已经消失。','天穹的脉络正在重建。','灵蕴的河流即将汇入天海。','你带来的记忆之光，正在缝合最后的天隙。','只剩最后一段了。','还差最后一块。你听见女娲的回音了吗？','灵蕴正在完成最后的编织。','天穹的裂缝只剩一道细纹。','你上传的每一张照片都在天穹上闪光。','万镜画廊的灯，几乎全亮了。','灵蕴的光芒直冲九霄。','天穹的裂痕正在最后合拢。','昆仑之巅的残镜映出了完整的天。','你在天穹上留下了永恒的印记。','只剩最后几道细纹了。','天穹即将合拢。最后十步。','你的记忆正在成为天穹的一部分。','灵蕴的光芒温柔而坚定。','天穹的最后几针正在缝入。','万镜画廊的镜面，映出了你的面孔。','再挂一幅。就一幅。','天穹几乎完整了。','灵蕴正在完成最后的缝合。','你几乎能触到那片完整的天了。','最后一片灵蕴，正在归位。','天穹已合。你做到了。'];
function showMs(big,tts,isFull){
  const d=document.createElement('div');
  d.style.cssText='position:fixed;inset:0;z-index:390;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .5s';
  const inner=document.createElement('div');
  inner.style.cssText='max-width:86vw;text-align:center;font-size:clamp(20px,5vw,34px);letter-spacing:3px;color:#ffe9c4;text-shadow:0 0 30px rgba(255,200,100,.6),0 2px 12px rgba(0,0,0,.8);line-height:1.8';
  inner.textContent=big;
  d.appendChild(inner);document.body.appendChild(d);
  requestAnimationFrame(()=>{d.style.opacity='1';});
  ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak(tts);
  setTimeout(()=>{d.style.opacity='0';setTimeout(()=>{d.remove();if(isFull)skyFullDialog();},600);},3000);
}
function skyFullDialog(){
  if(document.getElementById('skyFullDlg'))return;
  const d=document.createElement('div');d.id='skyFullDlg';
  d.style.cssText='position:fixed;inset:0;z-index:391;display:flex;align-items:center;justify-content:center;background:rgba(12,6,12,.55)';
  d.innerHTML='<div style="background:linear-gradient(160deg,rgba(38,22,34,.98),rgba(24,14,26,.98));border:1px solid rgba(255,214,170,.4);border-radius:18px;padding:24px 26px;text-align:center;color:#ffe9c4;max-width:88vw">'
    +'<div style="font-size:15px;letter-spacing:2px;line-height:2;margin-bottom:14px">天穹已合。接下来，你想——</div>'
    +'<button id="sfStay" style="padding:10px 18px;margin:0 6px;border:none;border-radius:12px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;cursor:pointer">留下继续布展</button>'
    +'<button id="sfLeave" style="padding:10px 18px;margin:0 6px;border:1px solid rgba(255,255,255,.3);border-radius:12px;background:transparent;color:#dcc;cursor:pointer">带着新的记忆回来看看</button></div>';
  document.body.appendChild(d);
  const sfApi=ctx.overlay.register(d,{touchOnly:true}); // 一次性弹窗:只进触摸白名单,开关节奏自管
  d.querySelector('#sfStay').onclick=()=>{sfApi.unregister();d.remove();ctx.ui.modeToast&&ctx.ui.modeToast('昆仑谢过你。');};
  d.querySelector('#sfLeave').onclick=()=>{sfApi.unregister();d.remove();ctx.ui.modeToast&&ctx.ui.modeToast('昆仑留着你的光。');};
}
function checkSkyMs(){
  const v=skyVal(),had=ctx.store.num('skyMs');
  for(let i=SKY_MS.length-1;i>=0;i--){
    const [m,big,tts]=SKY_MS[i];
    if(v>=m&&had<m){ctx.store.setNum('skyMs',m);showMs(big,tts,m===100);if(m===100&&ctx.scene.kintsugiOn)ctx.scene.kintsugiOn();return;}
  }
}
ctx.kunlun.checkSkyMs=checkSkyMs;
// 金缮天花板(2026-07-28 C1):启动时已达成(里程碑档已记 或 进度值满)直接点亮;新里程碑触发走上面钩子
if((ctx.store.num('skyMs')>=100||skyVal()>=100)&&ctx.scene.kintsugiOn)ctx.scene.kintsugiOn();
// 天穹改独立三级页(2026-07-26 主人定:与聊天/六灵蕴同规——居中呈现,✕/点外圈/Esc 均可退出)
const skyOv=document.createElement('div');
skyOv.id='skyOv';
skyOv.style.cssText='position:fixed;inset:0;z-index:380;display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
const skyCard=document.createElement('div');
skyCard.style.cssText='width:min(380px,92vw);max-height:82vh;overflow-y:auto;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:18px;color:#fff;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.55)';
skyCard.innerHTML='<div style="display:flex;align-items:center;margin-bottom:4px"><b style="letter-spacing:2px;font-size:15px">天穹</b><span id="skyX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px">✕</span></div>';
const skyBoxEl=document.getElementById('skyBox');
skyBoxEl.style.display='block';skyBoxEl.style.marginTop='0';
skyCard.appendChild(skyBoxEl);
skyOv.appendChild(skyCard);
document.body.appendChild(skyOv);
const skyOvApi=ctx.overlay.register(skyOv,{x:'#skyX'}); // 三铁律注册即得(✕/点外圈/Esc 栈)
document.getElementById('gmSky').onclick=function(){skyOvApi.open();drawSky();};

// ===== 昆仑灵鉴:聊天室·昆仑回声壁(独立三级页,屏幕中央呈现,不占设置面板高度) =====
// 全员共壁留最近 100 条;@昆仑之灵 召唤机器人;气泡自己靠右、他人靠左(皮相借 GlassChat)
const chatOv=document.createElement('div');
chatOv.id='chatOv'; // 必须挂 id:player.js 的 UI 白名单靠它识别"这是界面手势,别转视角"
chatOv.style.cssText='position:fixed;inset:0;z-index:380;display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
const chatCard=document.createElement('div');
chatCard.style.cssText='width:min(520px,92vw);max-height:82vh;display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:16px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55)';
chatCard.innerHTML='<div style="display:flex;align-items:center;margin-bottom:8px"><b style="letter-spacing:2px;font-size:15px">昆仑回声壁</b><span style="font-size:10px;color:rgba(255,217,168,.55);margin-left:8px">全员共壁 · 留最近 100 条 · @昆仑之灵 可召唤它回答</span><span id="chatX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px;font-size:14px">✕</span></div>'
  +'<div id="chatMsgs" style="flex:1;min-height:220px;max-height:54vh;overflow-y:auto;padding:8px;background:rgba(0,0,0,.25);border-radius:12px"></div>'
  +'<div style="display:flex;gap:6px;margin-top:8px"><input id="chatInput" maxlength="140" placeholder="说一句…(140字内)" style="flex:1;min-width:0;padding:9px 13px;border-radius:16px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:13px;outline:none">'
  +'<button id="chatSend" style="padding:9px 16px;border:none;border-radius:16px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;font-size:13px;cursor:pointer">发</button></div>';
chatOv.appendChild(chatCard);
document.body.appendChild(chatOv);
let chatTimer=null;
const chatOvApi=ctx.overlay.register(chatOv,{ // 三铁律注册即得;开关副作用(加载+5s 轮询)挂钩子
  x:'#chatX',
  onOpen(){loadChat();chatTimer=setInterval(loadChat,5000);},
  onClose(){clearInterval(chatTimer);},
});
function fmtT(ts){const d=new Date(ts);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
async function loadChat(){
  try{
    const r=await fetch('/api/chat');const d=await r.json();
    const box=document.getElementById('chatMsgs');if(!box)return;
    box.innerHTML='';
    const msgs=d.msgs||[];
    if(!msgs.length){box.innerHTML='<div style="opacity:.5;text-align:center;padding:14px;font-size:12px">还没有人说话。第一句，由你来开。</div>';return;}
    for(const m of msgs){
      const row=document.createElement('div');
      row.style.cssText='display:flex;flex-direction:column;margin:5px 0;align-items:'+(m.me?'flex-end':'flex-start');
      const head=document.createElement('div');
      head.style.cssText='font-size:10px;color:rgba(255,255,255,.45);margin-bottom:2px';
      head.textContent=(m.bot?'✦ ':'')+m.n+' · '+fmtT(m.ts);
      const bub=document.createElement('div');
      bub.style.cssText=m.bot
        ?'max-width:88%;padding:7px 12px;border-radius:14px;border-bottom-left-radius:4px;font-size:12px;line-height:1.7;background:rgba(230,170,60,.14);border:1px solid rgba(255,214,130,.55);color:#ffe9c4'
        :(m.me
          ?'max-width:88%;padding:7px 12px;border-radius:14px;border-bottom-right-radius:4px;font-size:12px;line-height:1.7;background:linear-gradient(135deg,rgba(201,138,75,.85),rgba(138,90,42,.85));color:#fff'
          :'max-width:88%;padding:7px 12px;border-radius:14px;border-bottom-left-radius:4px;font-size:12px;line-height:1.7;background:rgba(255,255,255,.12);color:rgba(255,255,255,.92)');
      bub.textContent=m.t;
      row.appendChild(head);row.appendChild(bub);box.appendChild(row);
    }
    box.scrollTop=box.scrollHeight;
  }catch(e){}
}
function toggleChat(show){show?chatOvApi.open():chatOvApi.close();}
document.getElementById('gmChat').onclick=function(){toggleChat(true);};

// ===== 昆仑灵鉴:六灵蕴收集页(独立三级页) =====
const spOv=document.createElement('div');
spOv.id='spOv'; // 必须挂 id:player.js 的 UI 白名单靠它识别(之前没挂,点按被当视角手势吞掉,导致"退不出")
spOv.style.cssText='position:fixed;inset:0;z-index:380;display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
const spCard=document.createElement('div');
spCard.style.cssText='width:min(460px,92vw);max-height:82vh;overflow-y:auto;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:18px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55)';
spOv.appendChild(spCard);
document.body.appendChild(spOv);
const spOvApi=ctx.overlay.register(spOv,{x:'#spX'}); // 三铁律注册即得;✕ 走事件委托,renderSpirits 重渲染也生效
function renderSpirits(){
  const list=(ctx.kunlun.spiritsState?ctx.kunlun.spiritsState():[]);
  const n=list.filter(x=>x.state==='got').length;
  let html='<div style="display:flex;align-items:center;margin-bottom:10px"><b style="letter-spacing:2px;font-size:15px">六灵蕴</b><span style="font-size:11px;color:rgba(255,217,168,.55);margin-left:8px">'+n+' / 6</span><span id="spX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px">✕</span></div>';
  html+='<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.1);margin-bottom:12px"><div style="height:100%;width:'+(n/6*100)+'%;border-radius:3px;background:linear-gradient(90deg,#7ddb7a,#f0a860)"></div></div>';
  for(const sp of list){
    const st=sp.state==='got'?'已收集':sp.state==='open'?'位置已解锁 · '+sp.place:'位置未解锁';
    html+='<div style="display:flex;align-items:center;gap:8px;padding:7px 4px;font-size:12px;opacity:'+(sp.state==='locked'?'0.45':'1')+'">'
      +'<span style="width:10px;height:10px;border-radius:50%;background:'+(sp.state==='got'?sp.color:'transparent')+';border:1.5px solid '+sp.color+'"></span>'
      +'<span style="flex:1">'+sp.name+' <span style="opacity:.5;font-size:10px">'+sp.en+' · '+sp.emotion+'</span></span>'
      +'<span style="font-size:10px;color:'+(sp.state==='got'?'#7dff9a':sp.state==='open'?'#ffd9a8':'rgba(255,255,255,.4)')+'">'+st+'</span></div>';
  }
  if(n>=6){
    // 已放下的照片(letgo.js):召回入口——放下只是不呈现,照片永留服务器
    const lg=ctx.store.json('letGo',[]);
    if(lg.length){
      html+='<div style="margin-top:10px;padding:10px;border:1px dashed rgba(255,214,170,.35);border-radius:12px;font-size:11px;line-height:2;color:#ffe9c4">已放下的照片（它们还在服务器上，随时可召回）：';
      for(const nm of lg){
        const fr=(ctx.scene.iG||[]).find(g=>g.userData&&g.userData.eternalName===nm);
        const label=fr&&fr.userData.mtime?'此处曾有过——'+fr.userData.mtime.slice(0,10):nm;
        html+='<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.75">'+label+'</span><button data-lg="'+nm+'" style="padding:3px 10px;font-size:11px;border:1px solid rgba(124,200,232,.5);border-radius:6px;background:transparent;color:#bfe8ff;cursor:pointer">召回</button></div>';
      }
      html+='</div>';
    }
    // 飞舟时代(ark.js/eternal.js):罗盘传送往返 展厅⇄山巅登舟点
    html+='<div style="margin-top:10px;display:flex;gap:8px">'
      +'<button id="spGoHall" style="flex:1;padding:9px;border:none;border-radius:9px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;cursor:pointer;font-size:12px">⇪ 返回永恒展厅</button>'
      +'<button id="spGoPeak" style="flex:1;padding:9px;border:1px solid rgba(255,214,170,.5);border-radius:9px;background:transparent;color:#ffe2c4;cursor:pointer;font-size:12px">⇣ 山巅登飞舟</button></div>';
    html+='<div style="margin-top:10px;padding:10px;border:1px dashed rgba(255,214,170,.5);border-radius:12px;font-size:11px;line-height:1.9;color:#ffe9c4">六灵蕴齐聚。雅号可冠前缀：<br>'
      +'<select id="spPrefix" style="margin-top:6px;width:100%;padding:7px;border-radius:8px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.2)">'
      +'<option value="">无前缀</option><option value="六合藏梦人·">六合藏梦人·</option><option value="心象行者·">心象行者·</option><option value="昆仑回响·">昆仑回响·</option></select>'
      +'<div style="opacity:.6;margin-top:4px">选好后,再保存一次昵称即生效(聊天与访客记录中显示)。</div></div>';
  }else{
    const next=list.find(x=>x.state==='open');
    html+='<div style="margin-top:8px;font-size:11px;color:rgba(255,217,168,.7)">'+(next?'下一颗：'+next.name+'（'+next.place+'）——循金色光柱而去':'天穹合拢之后，残镜自会指引你。')+'</div>';
  }
  spCard.innerHTML=html;
  const sel=document.getElementById('spPrefix');
  if(sel){sel.value=ctx.store.str('prefix');sel.onchange=()=>{ctx.store.setStr('prefix',sel.value);ctx.ui.modeToast&&ctx.ui.modeToast(sel.value?'前缀已选：'+sel.value+' 再保存一次昵称生效':'已取消前缀');};}
  const gh=document.getElementById('spGoHall');
  if(gh)gh.onclick=()=>{spOvApi.close();ctx.kunlun.eternalTeleport&&ctx.kunlun.eternalTeleport(true);};
  const gp=document.getElementById('spGoPeak');
  if(gp)gp.onclick=()=>{spOvApi.close();ctx.kunlun.arkTeleportToPeak&&ctx.kunlun.arkTeleportToPeak();};
  // 召回按钮(letgo.js)
  spCard.querySelectorAll('button[data-lg]').forEach(b=>{
    b.onclick=()=>{if(ctx.kunlun.letgoRecall&&ctx.kunlun.letgoRecall(b.getAttribute('data-lg')))renderSpirits();};
  });
}
document.getElementById('gmSpirits').onclick=function(){renderSpirits();spOvApi.open();};
window.__refreshSpirits=function(){if(spOvApi.isOpen())renderSpirits();};

// 退出键普查(2026-07-28 深化⑤):三级弹层 Esc 由 overlay.js 注册处栈式统管(后开先关);此处只管设置面板
function onSettingsKey(e){
  if(e.key!=='Escape')return;
  if(panel.classList.contains('show')){panelOpen=false;panel.classList.remove('show');}
}
document.addEventListener('keydown',onSettingsKey);
bag.custom.push(()=>{document.removeEventListener('keydown',onSettingsKey);skyOvApi.unregister();chatOvApi.unregister();spOvApi.unregister();});
async function sendChat(){
  const inp=document.getElementById('chatInput');
  const text=(inp.value||'').trim();
  if(!text)return;
  try{
    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
    const d=await r.json();
    if(!r.ok){ctx.ui.modeToast&&ctx.ui.modeToast(d.error||'发送失败');return;}
    inp.value='';loadChat();
    if(/@(昆仑之灵|机器人|bot)/i.test(text))setTimeout(loadChat,6000); // 召唤后,等昆仑之灵作答再刷一次
  }catch(e){ctx.ui.modeToast&&ctx.ui.modeToast('网络开了个小差');}
}
document.getElementById('chatSend').onclick=sendChat;
document.getElementById('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
document.getElementById('gearX').onclick=function(){panelOpen=false;panel.classList.remove('show');};

async function saveNick(name,onOk){
  name=(name||'').trim().slice(0,16);
  // 六灵蕴集齐后:雅号可冠前缀(先剥离旧前缀防叠加)
  const base=name.replace(/^(六合藏梦人|心象行者|昆仑回响)·/,'');
  const p=(ctx.kunlun.isDone&&ctx.kunlun.isDone())?ctx.store.str('prefix'):'';
  name=(p+base).slice(0,16);
  if(!name){ctx.ui.modeToast&&ctx.ui.modeToast('昵称不能为空');return;}
  try{
    const r=await fetch('/api/gate/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'保存失败');
    myName=name;ctx.store.setStr('nick',name);
    ctx.ui.modeToast&&ctx.ui.modeToast('你的名字已被刻入昆仑壁。');
    ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('你的名字已被刻入昆仑壁。');
    if(onOk)onOk();
  }catch(e){ctx.ui.modeToast&&ctx.ui.modeToast(e.message||'保存失败,请稍后再试');}
}

// 弹窗逻辑(2026-07-25 主人修订):开局即触发,前 10 秒双弹窗均不可删;
// 每次重进都弹,直到写下雅号——写过之后,昵称弹窗与说明书卡都不再出现
let popShown=false;
function maybePop(){
  if(popShown||myName||panelOpen)return;
  if(!sessionStorage.getItem('agreementConsented')||!sessionStorage.getItem('privacyConsented')||!sessionStorage.getItem('communityConsented'))return; // 三份协议未签完,昵称弹窗不弹
  pop.classList.add('show');
  lockPop(10);
}
function lockPop(sec){
  // 2026-07-26 主人修订:10 秒锁只锁「关闭键」,命名/保存立即可用——
  // 冻结的用意是让人写昵称,不是把人挡在门外;写完弹窗即关
  const x=document.getElementById('nickX'),save=document.getElementById('nickSave');
  const origX=x.textContent;
  let left=sec;
  x.textContent=left+'s';x.style.pointerEvents='none';x.style.opacity='0.5';
  const t=setInterval(function(){
    left--;
    if(left<=0){clearInterval(t);x.textContent=origX;x.style.pointerEvents='';x.style.opacity='';}
    else x.textContent=left+'s';
  },1000);
}
document.getElementById('nickX').onclick=function(){
  pop.classList.remove('show');
  popShown=true;sessionStorage.setItem('nickPopOff','1');
};
document.getElementById('nickSave').onclick=function(){
  saveNick(document.getElementById('nickInput').value,function(){
    pop.classList.remove('show');popShown=true;sessionStorage.setItem('nickPopOff','1');
  });
};

// 齿轮面板(昆仑罗盘触发;desert.js 在本模块之后加载,需等罗盘元素出现再绑定)
function bindGear(){
  const g=document.getElementById('kunlunCompass');
  if(!g){setTimeout(bindGear,300);return;}
  g.onclick=function(e){
    if(e&&e.stopPropagation)e.stopPropagation();
    panelOpen=!panelOpen;
    panel.classList.toggle('show',panelOpen);
    const li=document.getElementById('li');
    if(li){li.style.transition='transform .5s';li.style.transform=panelOpen?'rotate(180deg)':'rotate(0deg)';}
    if(panelOpen)document.getElementById('gearNickInput').value=myName;
  };
}
bindGear();
document.getElementById('gearNickSave').onclick=function(){
  saveNick(document.getElementById('gearNickInput').value,function(){panelOpen=false;panel.classList.remove('show');});
};
// 二级页入口:上传照片/视频、我的链接、房屋换色、说明书
document.getElementById('gmUpload').onclick=function(){
  panelOpen=false;panel.classList.remove('show');
  if(ctx.mode.openUpload){ctx.mode.openUpload();const t=document.getElementById('tabPhoto');t&&t.click();}
};
document.getElementById('gmUploadLink').onclick=function(){
  panelOpen=false;panel.classList.remove('show');
  if(ctx.mode.openUpload){ctx.mode.openUpload();const t=document.getElementById('tabLink');t&&t.click();}
};
document.getElementById('gmColor').onclick=function(){
  panelOpen=false;panel.classList.remove('show');
  ctx.gallery.openHouseColor&&ctx.gallery.openHouseColor();
};
document.getElementById('gmGuide').onclick=function(){
  panelOpen=false;panel.classList.remove('show');
  window.openPanel('guide.html','元素共鸣准则');
};

// 开局即弹:页面加载 4 秒后,未起名则双弹窗同屏(上昵称下说明书)
// 说明书的自动慢速滚动功能保留在 guide.html 内,不受影响
setTimeout(function(){
  if(ctx.showGuideCard)ctx.showGuideCard();
  maybePop();
},4000);

hotEnd('settings');
if(import.meta.hot)import.meta.hot.accept();
