// windchime.js — 永恒展厅·风铃回响(二期③,2026-07-27 主人定稿)
// 西墙琥珀玻璃风铃:每次进展厅自动响一声;每24小时(现实)第一次连响三声;点击可再响
// 入场检测自给自足:ticker 比对 厅内/厅外 状态跳变,不侵入 eternal.js/ark.js
// 零 PointLight:铃身琥珀半透明+内芯 Basic 流光;C5 音高+2.5s 混响衰减(主人参数)
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
const bag=hotBegin('windchime');
const {s,onTick,iG}=ctx;

// ===================== 风铃本体(西墙 E3 内壁 x≈794.7,垂于 402.35; clickable 高度已按 28.6° 俯仰上限校过) =====================
const cg=new THREE.Group();
cg.position.set(794.7,402.35,600);
// 挂绳(自吊顶 402.9 垂下)
const cord=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.55,6),new THREE.MeshStandardMaterial({color:'#8a6a3c',roughness:0.8}));
cord.position.set(794.7,402.35+0.28,600);s.add(cord);
// 琥珀铃身(半透明玻璃+内芯流光)
const amberGlass=new THREE.MeshStandardMaterial({color:'#e8a03c',transparent:true,opacity:0.55,roughness:0.15,metalness:0.1,emissive:'#8a5a10',emissiveIntensity:0.25,side:THREE.DoubleSide});
const bell=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.08,0.17,12,1,true),amberGlass);
bell.position.y=-0.1;cg.add(bell);
const core=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.035,0.12,8),new THREE.MeshBasicMaterial({color:'#ffd98a',transparent:true,opacity:0.7,toneMapped:false}));
core.position.y=-0.1;cg.add(core);
// 三根玻璃管(错落长度)
for(let k=0;k<3;k++){
  const a=k/3*Math.PI*2;
  const tube=new THREE.Mesh(new THREE.CylinderGeometry(0.011,0.011,0.16+k*0.035,6,1,true),amberGlass);
  tube.position.set(Math.cos(a)*0.055,-0.24-k*0.017,Math.sin(a)*0.055);
  cg.add(tube);
}
// 铃锤
const clapper=new THREE.Mesh(new THREE.SphereGeometry(0.018,8,6),new THREE.MeshBasicMaterial({color:'#ffe9c4',toneMapped:false}));
clapper.position.y=-0.2;cg.add(clapper);
// 隐形大碰撞球(点击宽容;raycast 对 visible:false 材质照常命中,同 paintings.js hitBox)
const hit=new THREE.Mesh(new THREE.SphereGeometry(0.35,8,6),new THREE.MeshBasicMaterial({visible:false}));
hit.position.y=-0.12;cg.add(hit);
cg.userData={eternalAction:'chime'};
s.add(cg);iG.push(cg);

// ===================== 声音:C5 + 泛音,2.5s 衰减 =====================
function chimeSound(delay){
  try{
    const ac=chimeSound.ac||(chimeSound.ac=new (window.AudioContext||window.webkitAudioContext)());
    const d=delay||0;
    [523.25,1046.5,1569.8].forEach((f,k)=>{
      const o=ac.createOscillator(),g=ac.createGain();
      o.type='sine';o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,ac.currentTime+d);
      g.gain.exponentialRampToValueAtTime([0.2,0.09,0.045][k],ac.currentTime+d+0.015);
      g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+d+2.5);
      o.connect(g);g.connect(ac.destination);o.start(ac.currentTime+d);o.stop(ac.currentTime+d+2.6);
    });
  }catch(e){}
}

// ===================== 响铃(声+摇摆 3s;首次 TTS) =====================
let swingT0=-1e9;
function ring(times){
  for(let i=0;i<times;i++)chimeSound(i*0.7);
  swingT0=performance.now();
  if(!ctx.store.flag('chimeTts')){
    ctx.store.mark('chimeTts');
    ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('秋思之叶化作了这枚风铃。你每一次走进来，它都会替昆仑问候你。');
  }
}
// 点击再响(eternal.js 钩子分发)
ctx.kunlun.eternalHandlers=ctx.kunlun.eternalHandlers||{};
ctx.kunlun.eternalHandlers.chime=function(){ring(1);};

// ===================== 入场自鸣:厅外→厅内跳变;24h 首到三声 =====================
function entered(){
  const now=Date.now(),last=ctx.store.num('chimeLastRing');
  const triple=now-last>24*3600*1000;
  ctx.store.setNum('chimeLastRing',now);
  ring(triple?3:1);
}

// ===================== 主循环:摇摆动画 + 流光 + 入场检测(250ms 节流) =====================
let wasIn=false,chkT=0;
onTick(function(){
  const now=performance.now();
  const p=(now-swingT0)/3000;
  if(p<1){
    cg.rotation.x=Math.sin(p*20)*0.28*(1-p);
    cg.rotation.z=Math.cos(p*17)*0.18*(1-p);
  }else if(cg.rotation.x||cg.rotation.z){cg.rotation.x=0;cg.rotation.z=0;}
  core.material.opacity=0.5+Math.sin(now*0.004)*0.25; // 内芯流光
  chkT++;if(chkT%15)return;
  const inH=!!(ctx.kunlun.eternalKeepOut&&ctx.player.pl&&ctx.kunlun.eternalKeepOut(ctx.player.pl.p.x,ctx.player.pl.p.z));
  if(inH&&!wasIn)entered();
  wasIn=inH;
});

bag.custom.push(()=>{
  const i=iG.indexOf(cg);if(i>=0)iG.splice(i,1);
  if(ctx.kunlun.eternalHandlers)delete ctx.kunlun.eternalHandlers.chime;
});
hotEnd('windchime');
if(import.meta.hot)import.meta.hot.accept();
