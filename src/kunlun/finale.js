// finale.js — 永恒展厅·终章三件套(二期⑥,2026-07-27 主人定稿)
// ①俯瞰天穹:走到南平台边缘自动进入——镜头俯压、雾退见地面、"这就是你补完的天";动键/转视角即退出
// ②心象投影:站上中央平台抬头看镜 1s→旅途剪影回放(~14s 残影蒙太奇;无录屏能力,用首照+灵蕴静态卡)
// ③灵蕴归位:六墙印记点击重听灵蕴 TTS;全部点过→六色闪光+「六合藏梦人·雅号」+自动冠前缀
// 零 PointLight;DOM 弹层守三铁律(投影:✕跳过/点击即走/仅播放期存在)
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
const bag=hotBegin('finale');
const {s,onTick,iG}=ctx;

const HX=800,HZ=600,FLOOR=400;
const SPIRIT_COLORS=['#7ddb7a','#ff5a4a','#e8a03c','#dfeaf5','#7cc8e8','#f0a860'];
const SPIRIT_NAMES=['春生之芽','夏炽之焰','秋思之叶','冬藏之雪','朝露之珠','暮光之尘'];
function inHall(){return !!(ctx.player.pl&&ctx.kunlun.eternalKeepOut&&ctx.kunlun.eternalKeepOut(ctx.player.pl.p.x,ctx.player.pl.p.z));}
function bigText(text,hold){
  const d=document.createElement('div');
  d.style.cssText='position:fixed;inset:0;z-index:389;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .5s';
  const inner=document.createElement('div');
  inner.style.cssText='max-width:86vw;text-align:center;font-size:clamp(20px,5vw,32px);letter-spacing:3px;color:#ffe9c4;text-shadow:0 0 30px rgba(255,200,100,.6),0 2px 12px rgba(0,0,0,.8);line-height:1.9';
  inner.textContent=text;
  d.appendChild(inner);document.body.appendChild(d);
  requestAnimationFrame(()=>{d.style.opacity='1';});
  setTimeout(()=>{d.style.opacity='0';setTimeout(()=>d.remove(),600);},hold||1800);
}
function bell(f,g,dur){
  try{
    const ac=bell.ac||(bell.ac=new (window.AudioContext||window.webkitAudioContext)());
    [f,f*1.5].forEach((ff,k)=>{
      const o=ac.createOscillator(),gg=ac.createGain();
      o.type='sine';o.frequency.value=ff;
      gg.gain.setValueAtTime(0.0001,ac.currentTime);
      gg.gain.exponentialRampToValueAtTime(g*(k?0.5:1),ac.currentTime+0.02);
      gg.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur);
      o.connect(gg);gg.connect(ac.destination);o.start();o.stop(ac.currentTime+dur+0.1);
    });
  }catch(e){}
}

// ===================== ① 俯瞰天穹(南平台边缘) =====================
// 平台区:门洞中点 (803.03,594.75),外向 (0.5,-0.866),纵深 0.5~2.8,横宽 ±1.9
let skyOn=false,skyY0=0,fogSave=0,skyCd=0,windSrc=null,windAC=null,windGain=null;
function wind(on){
  try{
    if(on){
      if(windSrc)return;
      windAC=windAC||new (window.AudioContext||window.webkitAudioContext)();
      const len=windAC.sampleRate*2,buf=windAC.createBuffer(1,len,windAC.sampleRate);
      const d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      windSrc=windAC.createBufferSource();windSrc.buffer=buf;windSrc.loop=true;
      const lp=windAC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=300;
      windGain=windAC.createGain();windGain.gain.value=0.08; // 高空风声加强(-20dB)
      windSrc.connect(lp);lp.connect(windGain);windGain.connect(windAC.destination);
      windSrc.start();
    }else if(windSrc){windSrc.stop();windSrc=null;}
  }catch(e){}
}
function skyEnter(){
  skyOn=true;skyY0=ctx.player.pl.y;fogSave=s.fog.density;
  bigText('这就是你补完的天。',1500);
  bell(98,0.18,3);wind(true); // 远处编钟+风声
  if(!ctx.store.flag('skyviewTts')){
    ctx.store.mark('skyviewTts');
    ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('这就是你补完的天。从地面到天空，从碎片到完整——你走了多远，只有你自己知道。');
  }
}
function skyExit(){if(!skyOn)return;skyOn=false;wind(false);}
function skyTick(){
  const p=ctx.player.pl.p;
  const rx=p.x-803.03,rz=p.z-594.75;
  const along=rx*0.5+rz*(-0.866),side=rx*0.866+rz*0.5;
  const inZone=along>0.5&&along<2.8&&Math.abs(side)<1.9;
  if(!skyOn){
    if(skyCd>0)skyCd--;
    if(inZone&&!skyCd)skyEnter();
  }else{
    // 俯压镜头 + 雾退(每帧缓动)
    ctx.player.pl.pi+=(-0.7-ctx.player.pl.pi)*0.06;
    s.fog.density+=(0.0008-s.fog.density)*0.05;
    // 退出:任何方向键/摇杆/转视角
    const k=ctx.player.ks||{};
    const moved=k.w||k.a||k.s||k.d||k.arrowup||k.arrowdown||k.arrowleft||k.arrowright||(ctx.player.jD&&(ctx.player.jD.x||ctx.player.jD.z));
    if(moved||Math.abs(ctx.player.pl.y-skyY0)>0.08||!inZone){
      skyExit();skyCd=40; // 出 zone 前不再触发(约 10s 节流)
    }
  }
  if(!skyOn&&s.fog.density!==fogSave&&fogSave)s.fog.density+=(fogSave-s.fog.density)*0.05; // 雾回
}

// ===================== ② 心象投影(中央平台抬头看镜) =====================
const mirror=new THREE.Group();
mirror.position.set(HX,FLOOR+2.8,HZ);
const mRing=new THREE.Mesh(new THREE.TorusGeometry(0.95,0.06,8,32),
  new THREE.MeshBasicMaterial({color:'#caa040',toneMapped:false}));
mRing.rotation.x=Math.PI/2;mirror.add(mRing);
const mFace=new THREE.Mesh(new THREE.CircleGeometry(0.9,32),
  new THREE.MeshStandardMaterial({color:'#cfe0e8',metalness:0.9,roughness:0.15,emissive:'#8ab8d8',emissiveIntensity:0.15}));
mFace.rotation.x=Math.PI/2;mFace.position.y=-0.01;mirror.add(mFace);
s.add(mirror);
let gazeAcc=0,projBusy=false,projDoneEntry=false;
function oldestSrc(){
  const frames=iG.filter(g=>g.userData&&g.userData.eternalName);
  if(!frames.length)return null;
  frames.sort((a,b)=>a.userData.oz-b.userData.oz);
  return frames[0].userData.src;
}
function playProjection(){
  if(projBusy)return;projBusy=true;
  const src=oldestSrc();
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:393;background:rgba(10,8,14,0.78);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .8s;cursor:pointer';
  const card=document.createElement('div');
  card.style.cssText='max-width:82vw;text-align:center;opacity:0;transition:opacity .6s;filter:drop-shadow(0 0 24px rgba(255,220,160,.35))';
  ov.appendChild(card);document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';});
  const T=(html,ms,ch)=>new Promise(r=>setTimeout(()=>{
    card.style.opacity='0';
    setTimeout(()=>{card.innerHTML=html;card.style.opacity='1';if(ch)bell(660+ch*60,0.1,1.2);r();},450);
  },ms));
  const P='font-size:clamp(18px,4.4vw,28px);letter-spacing:3px;color:#ffe9c4;line-height:2';
  const S='font-size:13px;letter-spacing:2px;color:rgba(255,233,196,.6);margin-top:10px';
  const gems=SPIRIT_COLORS.map((c,i)=>'<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:'+c+';margin:0 6px;box-shadow:0 0 10px '+c+'"></span>').join('');
  let dead=false;
  (async()=>{
    await T('<div style="'+P+'">心象共鸣</div><div style="'+S+'">你以真意作答，女娲问心，十问皆通</div>',1600,0);if(dead)return;
    if(src){await T('<img src="/'+src+'" style="max-width:min(70vw,420px);max-height:46vh;border-radius:10px;opacity:.92"><div style="'+S+'">你带来的第一片光</div>',2400,1);if(dead)return;}
    await T('<div style="'+P+'">补天 · 天穹已合</div><div style="'+S+'">你带来的每一片灵蕴，都回到了它该在的地方</div>',1800,2);if(dead)return;
    await T('<div>'+gems+'</div><div style="'+P+';margin-top:14px">六灵蕴</div><div style="'+S+'">希望 · 热爱 · 眷恋 · 沉静 · 新生 · 释然</div>',2800,3);if(dead)return;
    await T('<div style="'+P+'">灵蕴飞舟</div><div style="'+S+'">昆仑的风，曾为你让路</div>',1600,4);if(dead)return;
    await T('<div style="'+P+'">六航路</div><div style="'+S+'">朝霞 · 炽阳 · 暮色 · 寒夜 · 破晓 · 合光</div>',2000,5);if(dead)return;
    await T('<div style="'+P+'">永恒展厅</div><div style="'+S+'">你终于到了</div>',1600,6);if(dead)return;
    card.style.opacity='0';
    setTimeout(()=>{
      card.innerHTML='<div style="'+P+'">你走过的路，天穹都记得。</div>';card.style.opacity='1';
      ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('你走过的路，天穹都记得。');
      setTimeout(()=>{ov.style.opacity='0';setTimeout(()=>{ov.remove();projBusy=false;},800);},2400);
    },500);
  })();
  ov.onclick=()=>{dead=true;ov.remove();projBusy=false;}; // 点击跳过(三铁律:即点即走)
}
function projTick(){
  if(projBusy||projDoneEntry)return;
  const p=ctx.player.pl.p,dx=p.x-HX,dz=p.z-HZ;
  const gazing=dx*dx+dz*dz<1.1&&ctx.player.pl.pi>0.45;
  if(gazing){gazeAcc++;if(gazeAcc>=4){projDoneEntry=true;gazeAcc=0;playProjection();}} // 4×250ms=1s
  else gazeAcc=0;
}

// ===================== ③ 灵蕴归位(六墙印记) =====================
const marksDone=ctx.store.json('marks',[]);
const WALL_MID=[[806.06,600],[803.03,605.25],[796.97,605.25],[793.94,600],[796.97,594.75],[803.03,594.75]];
const markGems=[];
for(let k=0;k<6;k++){
  const [wx,wz]=WALL_MID[k];
  const ix=HX-wx,iz=HZ-wz,il=Math.hypot(ix,iz);
  const g=new THREE.Group();
  g.position.set(wx+ix/il*0.18,FLOOR+(k===5?2.9:2.4),wz+iz/il*0.18);
  const gem=new THREE.Mesh(new THREE.OctahedronGeometry(0.12,0),
    new THREE.MeshBasicMaterial({color:SPIRIT_COLORS[k],transparent:true,opacity:0.95,toneMapped:false}));
  g.add(gem);markGems.push(gem);
  const hitM=new THREE.Mesh(new THREE.SphereGeometry(0.3,8,6),new THREE.MeshBasicMaterial({visible:false}));
  g.add(hitM);
  g.userData={eternalAction:'spiritmark',markIndex:k,gem};
  s.add(g);iG.push(g);
  g.userData.pulse=()=>{gem.scale.setScalar(2);};
}
ctx.kunlun.eternalHandlers=ctx.kunlun.eternalHandlers||{};
ctx.kunlun.eternalHandlers.spiritmark=function(cg){
  const k=cg.userData.markIndex;
  cg.userData.pulse();
  const tts=ctx.kunlun.spiritsTTS&&ctx.kunlun.spiritsTTS[k];
  if(tts)ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak(tts);
  if(!marksDone.includes(k)){
    marksDone.push(k);
    ctx.store.setJson('marks',marksDone);
    if(marksDone.length>=6&&!ctx.store.flag('marksDone'))finale();
  }
};
function finale(){
  ctx.store.mark('marksDone');
  // 六色闪光
  const fl=document.createElement('div');
  fl.style.cssText='position:fixed;inset:0;z-index:394;pointer-events:none;opacity:0;transition:opacity .3s;background:conic-gradient(#7ddb7a,#ff5a4a,#e8a03c,#dfeaf5,#7cc8e8,#f0a860,#7ddb7a)';
  document.body.appendChild(fl);
  requestAnimationFrame(()=>{fl.style.opacity='0.85';});
  setTimeout(()=>{fl.style.transition='opacity 1.2s';fl.style.opacity='0';setTimeout(()=>fl.remove(),1300);},900);
  bell(523,0.2,3);
  const nick=ctx.store.str('nick')||'藏梦人';
  bigText('六合藏梦人 · '+nick,3200);
  ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('六合藏梦人。这是昆仑能给你的，最完整的名字。天穹已经合上了，六灵蕴已经归位了。你不再需要修补任何东西。你只需要——继续记住，继续凝视。');
  // 自动冠以「六合藏梦人·」前缀(saveNick 机制已认 kunlunPrefix,主人再保存一次昵称即生效)
  if(ctx.store.str('prefix')!=='六合藏梦人·'){
    ctx.store.setStr('prefix','六合藏梦人·');
    ctx.ui.modeToast&&ctx.ui.modeToast('前缀「六合藏梦人·」已备好，再保存一次昵称即生效。');
  }
}

// ===================== 主循环(250ms 节流三项检测) =====================
let chk=0;
onTick(function(){
  chk++;if(chk%15)return;
  if(!inHall()){projDoneEntry=false;skyExit();return;}
  skyTick();projTick();
});
// 印记呼吸+点击回弹(只遍历自己的 6 颗,不扫 iG)
function gemTick(){
  const t=performance.now()*0.001;
  for(const gm of markGems){
    gm.rotation.y+=0.01;
    const bs=gm.scale.x;
    if(bs>1)gm.scale.setScalar(Math.max(1,bs-0.04));
    gm.material.opacity=0.75+Math.sin(t*2+gm.position.x)*0.2;
  }
}
onTick(gemTick);

bag.custom.push(()=>{
  for(const g of [...iG])if(g.userData&&g.userData.eternalAction==='spiritmark'){const i=iG.indexOf(g);if(i>=0)iG.splice(i,1);}
  wind(false);
  if(ctx.kunlun.eternalHandlers)delete ctx.kunlun.eternalHandlers.spiritmark;
});
hotEnd('finale');
if(import.meta.hot)import.meta.hot.accept();
