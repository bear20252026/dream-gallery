// snowwin.js — 永恒展厅·飘雪之窗(二期④,2026-07-27 主人定稿)
// E2 墙拱窗:点击开/关。开窗→窗外飘雪(200 粒,0.3~0.6m/s+正弦横漂)+风声(-35dB 持续)+木窗"咯"声;
// 三幅晨光画渐覆雪纱(0→0.3,10s);关窗→雪停,雪纱 60s 融化(替代设计稿的右键"设为可落雪",同义免新 UI)
// 首次开启 TTS「冬藏之雪打开了这扇窗……」。零 PointLight。
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
const bag=hotBegin('snowwin');
const {s,onTick,iG}=ctx;

// ===================== 窗体(E2 墙:中点 (796.97,605.25),内法线 (0.5,-0.866)) =====================
const WIN={x:797.03,y:401.6,z:605.14};
const wg=new THREE.Group();
wg.position.set(WIN.x,WIN.y,WIN.z);
wg.rotation.y=Math.atan2(0.5,-0.866); // 面朝厅内
// 拱形轮廓:矩形身+半圆顶(宽1.5,通高1.8)
function archShape(scale){
  const w=0.75*scale,r=0.75*scale,y0=-0.9*scale,yTop=0.15*scale;
  const sh=new THREE.Shape();
  sh.moveTo(-w,y0);sh.lineTo(w,y0);sh.lineTo(w,yTop);
  sh.absarc(0,yTop,r,0,Math.PI,false);
  sh.lineTo(-w,y0);
  return sh;
}
// 边框(深色外轮廓,略大一圈垫底)
const frameM=new THREE.Mesh(new THREE.ShapeGeometry(archShape(1.1)),new THREE.MeshStandardMaterial({color:'#4a3626',roughness:0.7,side:THREE.DoubleSide}));
frameM.position.z=-0.01;wg.add(frameM);
// ===================== 窗上飘雪(玻璃 Canvas 动画;墙是实心的,3D 雪点会被墙体挡死——2D 才是正解) =====================
// 静态底图:灰蓝渐变+远山剪影(一次预渲染)
const snowBase=document.createElement('canvas');snowBase.width=128;snowBase.height=256;
{
  const x=snowBase.getContext('2d');
  const g=x.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#B0C4DE');g.addColorStop(1,'#D1D9E0');
  x.fillStyle=g;x.fillRect(0,0,128,256);
  x.fillStyle='rgba(140,155,175,0.55)';
  x.beginPath();x.moveTo(0,192);x.lineTo(36,148);x.lineTo(68,180);x.lineTo(100,140);x.lineTo(128,176);x.lineTo(128,256);x.lineTo(0,256);x.fill();
}
const glassCv=document.createElement('canvas');glassCv.width=128;glassCv.height=256;
const glassX=glassCv.getContext('2d');
glassX.drawImage(snowBase,0,0);
const glassTex=new THREE.CanvasTexture(glassCv);glassTex.colorSpace=THREE.SRGBColorSpace;
const glassM=new THREE.MeshBasicMaterial({map:glassTex,transparent:true,opacity:0.75,side:THREE.DoubleSide});
const glass=new THREE.Mesh(new THREE.ShapeGeometry(archShape(1)),glassM);
wg.add(glass);
// 80 粒雪:开窗时逐帧落,关窗即清(200 粒在 2D 太密,80 恰好;0.3~0.6m/s 按窗高折算)
const FLAKES=[];
for(let i=0;i<80;i++)FLAKES.push({x:Math.random()*128,y:Math.random()*256,r:1+Math.random()*2,v:0.5+Math.random()*0.5,ph:Math.random()*6.28});
function drawSnow(t){
  glassX.drawImage(snowBase,0,0);
  glassX.fillStyle='rgba(255,255,255,0.92)';
  for(const f of FLAKES){
    glassX.beginPath();glassX.arc(f.x+Math.sin(t*1.2+f.ph)*3,f.y,f.r,0,Math.PI*2);glassX.fill();
  }
  glassTex.needsUpdate=true;
}
// 隐形点击盒
const hit=new THREE.Mesh(new THREE.BoxGeometry(1.7,2.0,0.3),new THREE.MeshBasicMaterial({visible:false}));
wg.add(hit);
wg.userData={eternalAction:'snowwin'};
s.add(wg);iG.push(wg);

// ===================== 三幅晨光画的雪纱(白色渐变罩,0→0.3) =====================
const veils=[];
function veilTexture(){
  const c=document.createElement('canvas');c.width=64;c.height=64;
  const x=c.getContext('2d');const g=x.createLinearGradient(0,0,0,64);
  g.addColorStop(0,'rgba(255,255,255,0.95)');g.addColorStop(0.7,'rgba(255,255,255,0.55)');g.addColorStop(1,'rgba(255,255,255,0.25)');
  x.fillStyle=g;x.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
function ensureVeils(){
  if(veils.length)return;
  const frames=iG.filter(g=>g.userData&&g.userData.eternalName);
  for(const f of frames){
    const v=new THREE.Mesh(new THREE.PlaneGeometry(1.14,1.44),
      new THREE.MeshBasicMaterial({map:veilTexture(),transparent:true,opacity:0,depthWrite:false}));
    v.position.z=0.055;f.add(v);veils.push(v);
  }
}

// ===================== 声音:木窗"咯" + 风声循环(-35dB) =====================
let windAC=null,windSrc=null,windGain=null;
function creak(){
  try{
    const ac=creak.ac||(creak.ac=new (window.AudioContext||window.webkitAudioContext)());
    const o=ac.createOscillator(),g=ac.createGain();
    o.type='triangle';o.frequency.setValueAtTime(160,ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(90,ac.currentTime+0.12);
    g.gain.setValueAtTime(0.0001,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15,ac.currentTime+0.015);
    g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.16);
    o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+0.18);
  }catch(e){}
}
function wind(on){
  try{
    if(on){
      if(windSrc)return;
      windAC=windAC||new (window.AudioContext||window.webkitAudioContext)();
      const len=windAC.sampleRate*2,buf=windAC.createBuffer(1,len,windAC.sampleRate);
      const d=buf.getChannelData(0);
      for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      windSrc=windAC.createBufferSource();windSrc.buffer=buf;windSrc.loop=true;
      const lp=windAC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=380;
      windGain=windAC.createGain();windGain.gain.value=0.02; // ≈-34dB
      windSrc.connect(lp);lp.connect(windGain);windGain.connect(windAC.destination);
      windSrc.start();
    }else if(windSrc){windSrc.stop();windSrc=null;}
  }catch(e){}
}

// ===================== 开/关切换(eternal.js 钩子分发) =====================
let open=false;
ctx.kunlun.eternalHandlers=ctx.kunlun.eternalHandlers||{};
ctx.kunlun.eternalHandlers.snowwin=function(){
  open=!open;
  creak();wind(open);
  if(!open){glassX.drawImage(snowBase,0,0);glassTex.needsUpdate=true;} // 关窗即雪停
  glassM.opacity=open?0.88:0.75;
  ctx.ui.modeToast&&ctx.ui.modeToast(open?'窗开了。雪落进来，也落在你的画上。':'窗关了。雪慢慢停了。');
  if(open&&!ctx.store.flag('snowTts')){
    ctx.store.mark('snowTts');
    ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('冬藏之雪打开了这扇窗。那些你不愿诉说的沉默，可以落在雪里。');
  }
};

// ===================== 主循环:窗上雪动画(5 帧一刷)+雪纱 10s 覆/60s 融 =====================
let snowAcc=0;
onTick(function(){
  const t=performance.now()*0.001;
  if(open){
    snowAcc++;
    if(snowAcc%5===0){
      for(const f of FLAKES){f.y+=f.v*5;if(f.y>258){f.y=-2;f.x=Math.random()*128;}}
      drawSnow(t);
    }
  }
  ensureVeils();
  const target=open?0.3:0,rate=open?0.3/10:0.3/60; // 10s 覆满 / 60s 融尽
  for(const v of veils){
    const o=v.material.opacity;
    if(o<target)v.material.opacity=Math.min(target,o+rate/60);
    else if(o>target)v.material.opacity=Math.max(target,o-rate/60);
  }
});

bag.custom.push(()=>{
  const gi=iG.indexOf(wg);if(gi>=0)iG.splice(gi,1);
  wind(false);
  for(const v of veils){v.parent&&v.parent.remove(v);v.geometry.dispose();v.material.dispose();}
  if(ctx.kunlun.eternalHandlers)delete ctx.kunlun.eternalHandlers.snowwin;
});
hotEnd('snowwin');
if(import.meta.hot)import.meta.hot.accept();
