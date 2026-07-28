// fireplace.js — 永恒展厅·暖色壁炉(二期③,2026-07-27 主人定稿)
// 西南墙(E4)石砌壁炉:火焰粒子(~110,橙→金渐隐)+火星(12,上升 1.5m)+火光辉光(零 PointLight)
// 靠近 1.5m:火焰增亮 + 屏幕暖色晕;点击壁炉:火焰依次染六灵蕴色(5s 复原,替代设计稿的拖拽灵蕴)
// 首次点击 TTS「夏炽之焰点燃了这面壁炉……」
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
const bag=hotBegin('fireplace');
const {s,onTick,iG,bounds}=ctx;

const SPIRIT_COLORS=['#7ddb7a','#ff5a4a','#e8a03c','#dfeaf5','#7cc8e8','#f0a860'];
const SPIRIT_NAMES=['春生之芽','夏炽之焰','秋思之叶','冬藏之雪','朝露之珠','暮光之尘'];

// ===================== 位置:E4 墙(793.94,596.5)→(800,593),内法线 (0.5,0.866),炉心 =====================
const FX=797.14,FZ=595.05,FLOOR=400;
const RY=Math.atan2(0.5,0.866); // 开口朝厅内
const fg=new THREE.Group();
fg.position.set(FX,FLOOR,FZ);fg.rotation.y=RY;
// 石砌外壳(深暖石)
const stoneM=new THREE.MeshStandardMaterial({color:'#5a4a3c',roughness:0.85});
const backM=new THREE.MeshStandardMaterial({color:'#2a1c14',roughness:0.95});
for(const px of [-0.51,0.51]){
  const col=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.85,0.4),stoneM);
  col.position.set(px,0.425,0);fg.add(col);
}
const lintel=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.22,0.4),stoneM);lintel.position.set(0,0.74,0);fg.add(lintel);
const mantel=new THREE.Mesh(new THREE.BoxGeometry(1.35,0.06,0.5),stoneM);mantel.position.set(0,0.88,0);fg.add(mantel);
const hearth=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.08,0.45),stoneM);hearth.position.set(0,0.04,0);fg.add(hearth);
const back=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.7,0.06),backM);back.position.set(0,0.42,-0.17);fg.add(back);
// 炭床(暗红炭块)
const emberM=new THREE.MeshBasicMaterial({color:'#c8380a',toneMapped:false});
for(let k=0;k<5;k++){
  const em=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,5),emberM);
  em.position.set(-0.16+k*0.08,0.11,-0.02+(k%2)*0.05);fg.add(em);
}
// 隐形点击盒(paintings.js hitBox 同款)
const hit=new THREE.Mesh(new THREE.BoxGeometry(1.3,1.0,0.6),new THREE.MeshBasicMaterial({visible:false}));
hit.position.set(0,0.5,0);fg.add(hit);
fg.userData={eternalAction:'fireplace'};
s.add(fg);iG.push(fg);
// 碰撞(近似 AABB;炉子占墙角,略宽无妨)
const fb={mnX:796.4,mxX:797.9,mnZ:594.3,mxZ:595.8};
bounds.push(fb);

// ===================== 火光辉光(两片加色渐变面+地面光池) =====================
function glowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;
  const x=c.getContext('2d');const g=x.createRadialGradient(32,40,2,32,40,30);
  g.addColorStop(0,'rgba(255,190,90,0.9)');g.addColorStop(0.55,'rgba(255,120,40,0.35)');g.addColorStop(1,'rgba(255,120,40,0)');
  x.fillStyle=g;x.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
const glowM=new THREE.MeshBasicMaterial({map:glowTexture(),transparent:true,opacity:0.4,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
const glow1=new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.7),glowM);
glow1.position.set(FX,FLOOR+0.4,FZ);glow1.rotation.y=RY;s.add(glow1);
const glow2=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.5),glowM);
glow2.position.set(FX+0.5*0.15,FLOOR+0.35,FZ+0.866*0.15);glow2.rotation.y=RY+Math.PI/5;s.add(glow2);
const poolM=new THREE.Mesh(new THREE.CircleGeometry(0.6,20),new THREE.MeshBasicMaterial({color:'#ff9a40',transparent:true,opacity:0.22,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
poolM.rotation.x=-Math.PI/2;poolM.position.set(FX+0.5*0.35,FLOOR+0.05,FZ+0.866*0.35);s.add(poolM);

// ===================== 火焰粒子(顶点色渐隐;加色混合下"暗=隐") =====================
const FN=110,fPos=new Float32Array(FN*3),fCol=new Float32Array(FN*3);
const fGeo=new THREE.BufferGeometry();
fGeo.setAttribute('position',new THREE.BufferAttribute(fPos,3));
fGeo.setAttribute('color',new THREE.BufferAttribute(fCol,3));
const fMat=new THREE.PointsMaterial({size:0.095,vertexColors:true,transparent:true,opacity:0.95,blending:THREE.AdditiveBlending,depthWrite:false,map:(function(){
  const c=document.createElement('canvas');c.width=c.height=32;
  const x=c.getContext('2d');const g=x.createRadialGradient(16,16,1,16,16,16);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.5,'rgba(255,255,255,0.4)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(0,0,32,32);return new THREE.CanvasTexture(c);
})()});
const flames=new THREE.Points(fGeo,fMat);
flames.frustumCulled=false;s.add(flames);
// 火星(12,小而快,升 1.5m)
const SN=12,sPos=new Float32Array(SN*3);
const sGeo=new THREE.BufferGeometry();sGeo.setAttribute('position',new THREE.BufferAttribute(sPos,3));
const sparks=new THREE.Points(sGeo,new THREE.PointsMaterial({color:'#ffe9b0',size:0.03,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false}));
sparks.frustumCulled=false;s.add(sparks);

// ===================== 灵蕴染色(点击循环,5s 复原) =====================
let dyeK=-1,dyeUntil=0;
function baseColor(life,out){
  if(dyeK<0){ // 默认:橙→金
    out[0]=1;out[1]=0.42+life*0.42;out[2]=life*0.25;
  }else{
    const c=new THREE.Color(SPIRIT_COLORS[dyeK]);
    out[0]=0.55+c.r*0.45;out[1]=0.55+c.g*0.45;out[2]=0.55+c.b*0.45; // 白芯→灵蕴色
  }
}
ctx.kunlun.eternalHandlers=ctx.kunlun.eternalHandlers||{};
ctx.kunlun.eternalHandlers.fireplace=function(){
  dyeK=(dyeK+1)%6;dyeUntil=performance.now()+5000;
  glowM.color.set(dyeK<0?'#ffffff':SPIRIT_COLORS[dyeK]);
  ctx.ui.modeToast&&ctx.ui.modeToast(SPIRIT_NAMES[dyeK]+' 在壁炉里起舞。');
  if(!ctx.store.flag('fireTts')){
    ctx.store.mark('fireTts');
    ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('夏炽之焰点燃了这面壁炉。你曾经热烈过的东西，值得被一直暖着。');
  }
};

// ===================== 屏幕暖色晕(靠近时) =====================
const vign=document.createElement('div');
vign.style.cssText='position:fixed;inset:0;z-index:384;pointer-events:none;box-shadow:inset 0 0 130px 24px rgba(255,150,60,0.22);opacity:0;transition:opacity .6s';
document.body.appendChild(vign);

// ===================== 主循环:火焰/火星/辉光/靠近感应(300ms 节流) =====================
let nearT=0,nearF=false;
onTick(function(){
  const now=performance.now(),t=now*0.001;
  if(dyeK>=0&&now>dyeUntil){dyeK=-1;glowM.color.set('#ffffff');}
  const boost=nearF?1.2:1;
  // 火焰
  const pa=fGeo.attributes.position.array,ca=fGeo.attributes.color.array,tmp=[0,0,0];
  for(let i=0;i<FN;i++){
    const sd=i*2.399,life=(t*(0.9+(i%5)*0.22)+sd)%1;
    const wob=Math.sin(t*7+sd*3)*0.02*(1-life);
    pa[i*3]=FX+(Math.sin(sd*5.7)*0.09)*(1-life)+wob;
    pa[i*3+1]=FLOOR+0.12+life*0.55;
    pa[i*3+2]=FZ+(Math.cos(sd*4.3)*0.09)*(1-life)+Math.cos(t*6+sd*2)*0.015*(1-life);
    baseColor(life,tmp);
    const fade=Math.pow(1-life,0.65)*boost;
    ca[i*3]=tmp[0]*fade;ca[i*3+1]=tmp[1]*fade;ca[i*3+2]=tmp[2]*fade;
  }
  fGeo.attributes.position.needsUpdate=true;
  fGeo.attributes.color.needsUpdate=true;
  // 火星
  const sa=sGeo.attributes.position.array;
  for(let i=0;i<SN;i++){
    const sd=i*3.7,life=(t*1.4+sd)%1;
    sa[i*3]=FX+Math.sin(sd*6.1)*0.07+Math.sin(t*3+sd)*0.06*life;
    sa[i*3+1]=FLOOR+0.15+life*1.5;
    sa[i*3+2]=FZ+Math.cos(sd*5.2)*0.07+Math.cos(t*2.6+sd)*0.05*life;
  }
  sGeo.attributes.position.needsUpdate=true;
  // 辉光闪动
  glowM.opacity=(0.42+Math.sin(t*9)*0.07+Math.sin(t*23)*0.05)*boost;
  poolM.material.opacity=(0.18+Math.sin(t*11)*0.05)*boost;
  // 靠近感应(炉心 1.5m)
  nearT++;if(nearT%18===0&&ctx.player.pl){
    const dx=ctx.player.pl.p.x-FX,dz=ctx.player.pl.p.z-FZ;
    nearF=dx*dx+dz*dz<2.25;
    vign.style.opacity=nearF?'1':'0';
  }
});

bag.custom.push(()=>{
  const gi=iG.indexOf(fg);if(gi>=0)iG.splice(gi,1);
  const bi=bounds.indexOf(fb);if(bi>=0)bounds.splice(bi,1);
  vign.remove();
  if(ctx.kunlun.eternalHandlers)delete ctx.kunlun.eternalHandlers.fireplace;
});
hotEnd('fireplace');
if(import.meta.hot)import.meta.hot.accept();
