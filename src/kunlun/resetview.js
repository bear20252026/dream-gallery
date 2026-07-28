// resetview.js — 永恒展厅·重置视角(二期④,2026-07-27 主人定稿)
// 中央圆平台(直径1.8m+六色光带):每次进展厅自动执行一次——最旧的那幅晨光画离框飞出,
// 弧线移至平台上方 1.2m 悬浮(增亮+天青光粒拖尾),展示 5s 后归位;点击平台可再演,点击任意处提前结束
// 首次 TTS「朝露之珠让最旧的照片重新发光……」。零 PointLight。
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
const bag=hotBegin('resetview');
const {s,onTick,iG}=ctx;

const HX=800,HZ=600,FLOOR=400;
const SPIRIT_COLORS=['#7ddb7a','#ff5a4a','#e8a03c','#dfeaf5','#7cc8e8','#f0a860'];

// ===================== 中央平台(暖灰石+六色光带;可踩:groundOverride 链式垫高 0.15) =====================
const pg=new THREE.Group();
pg.position.set(HX,FLOOR,HZ);
const disc=new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.95,0.15,32),
  new THREE.MeshStandardMaterial({color:'#9a8a7a',roughness:0.6,metalness:0.05}));
disc.position.y=0.075;pg.add(disc);
for(let k=0;k<6;k++){
  const a=k/6*Math.PI*2;
  const gem=new THREE.Mesh(new THREE.OctahedronGeometry(0.05,0),
    new THREE.MeshBasicMaterial({color:SPIRIT_COLORS[k],toneMapped:false}));
  gem.position.set(Math.cos(a)*0.84,0.16,Math.sin(a)*0.84);
  pg.add(gem);
}
const hit=new THREE.Mesh(new THREE.CylinderGeometry(0.95,0.95,0.3,16),new THREE.MeshBasicMaterial({visible:false}));
hit.position.y=0.15;pg.add(hit);
pg.userData={eternalAction:'resetview'};
s.add(pg);iG.push(pg);
// 平台可踩(链式包装 eternal.js 的地面:平台面 +0.15,其余原样)
const prevOver=ctx.kunlun.groundOverride;
ctx.kunlun.groundOverride=function(x,z){
  const dx=x-HX,dz=z-HZ;
  if(dx*dx+dz*dz<0.81)return FLOOR+0.15;
  return prevOver?prevOver(x,z):undefined;
};

// ===================== 光粒拖尾(天青) =====================
const TN=20,trPos=new Float32Array(TN*3);
const trGeo=new THREE.BufferGeometry();trGeo.setAttribute('position',new THREE.BufferAttribute(trPos,3));
const trail=new THREE.Points(trGeo,new THREE.PointsMaterial({color:'#7EC8E3',size:0.055,transparent:true,opacity:0.85,blending:THREE.AdditiveBlending,depthWrite:false}));
trail.visible=false;trail.frustumCulled=false;s.add(trail);

// ===================== 演出状态机 =====================
// 相位:fly(2.5s 贝塞尔弧线)→ settle(0.5s 增亮)→ hold(5s 展示)→ back(2s 归位)
let phase=null,pT0=0,plane=null,home=null,p0=null,p1=null,p2=null;
const FLOAT_AT=new THREE.Vector3(HX,FLOOR+1.35,HZ);
function oldestFrame(){
  // 已放下(letGo)的空画框不参与展演(letgo.js 打标)
  const frames=iG.filter(g=>g.userData&&g.userData.eternalName&&!g.userData.letGo);
  if(!frames.length)return null;
  frames.sort((a,b)=>a.userData.oz-b.userData.oz); // eternal.js 按 mtime 从早到晚挂 z 从小到大
  return frames[0];
}
function startShow(){
  if(phase)return;
  if(ctx.gallery.zG)return;                 // 有画正放大,不抢
  const fg=oldestFrame();if(!fg)return;
  plane=fg.children[1];if(!plane)return;
  home={frame:fg,pos:plane.position.clone(),rot:plane.rotation.clone(),worldPos:plane.getWorldPosition(new THREE.Vector3())};
  s.attach(plane);                  // 摘到世界空间(保持世界变换)
  p0=plane.position.clone();
  p2=FLOAT_AT.clone();
  p1=p0.clone().add(p2).multiplyScalar(0.5);p1.y+=1.2; // 弧顶
  phase='fly';pT0=performance.now();
  trail.visible=true;
  plane.material.emissiveIntensity=0.4;
  if(!ctx.store.flag('resetTts')){
    ctx.store.mark('resetTts');
    ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('朝露之珠让最旧的照片重新发光。无论你走了多远，昆仑会让你记得来处。');
  }
}
function startBack(){
  phase='back';pT0=performance.now();
  p0=plane.position.clone();
}
function finish(){
  if(home&&plane){
    home.frame.add(plane);          // 归还原父级
    plane.position.copy(home.pos);plane.rotation.copy(home.rot);
    plane.material.emissiveIntensity=0.16;
  }
  plane=null;home=null;phase=null;trail.visible=false;
}
function bezier(out,t,a,b,c){
  const u=1-t;
  out.set(u*u*a.x+2*u*t*b.x+t*t*c.x, u*u*a.y+2*u*t*b.y+t*t*c.y, u*u*a.z+2*u*t*b.z+t*t*c.z);
  return out;
}
// 点击任意处提前结束(捕获阶段,只在演出中挂耳)
function skipEv(e){if(phase&&phase!=='back')startBack();}
document.addEventListener('mousedown',skipEv,true);
// 点平台再演(eternal.js 钩子分发)
ctx.kunlun.eternalHandlers=ctx.kunlun.eternalHandlers||{};
ctx.kunlun.eternalHandlers.resetview=function(){if(!phase)startShow();};

// ===================== 入场自演:厅外→厅内跳变(风铃同款自给自足) =====================
let wasIn=false,chkT=0;
onTick(function(){
  const now=performance.now();
  // 演出推进
  if(phase){
    const el=(now-pT0)/1000;
    if(phase==='fly'){
      const t=Math.min(el/2.5,1),e=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; // ease-in-out
      bezier(plane.position,e,p0,p1,p2);
      plane.rotation.y+=(-Math.PI-plane.rotation.y)*0.06; // 缓转向门(-z);-π 近路
      if(t>=1){phase='settle';pT0=now;}
    }else if(phase==='settle'){
      plane.position.copy(p2);
      if(el>=0.5){phase='hold';pT0=now;}
    }else if(phase==='hold'){
      plane.position.y=p2.y+Math.sin(now*0.002)*0.05; // 悬浮呼吸
      plane.rotation.y+=(-Math.PI-plane.rotation.y)*0.06;
      if(el>=5)startBack();
    }else if(phase==='back'){
      const t=Math.min(el/2,1),e=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      const bp1=p0.clone().add(home.worldPos).multiplyScalar(0.5);bp1.y=Math.max(p0.y,home.worldPos.y)+0.8;
      bezier(plane.position,e,p0,bp1,home.worldPos);
      if(t>=1)finish();
    }
    // 拖尾(滚动记录)
    if(plane){
      const arr=trGeo.attributes.position.array;
      for(let i=TN-1;i>0;i--){arr[i*3]=arr[(i-1)*3];arr[i*3+1]=arr[(i-1)*3+1];arr[i*3+2]=arr[(i-1)*3+2];}
      arr[0]=plane.position.x;arr[1]=plane.position.y;arr[2]=plane.position.z;
      trGeo.attributes.position.needsUpdate=true;
    }
  }
  // 入场检测(250ms 节流)
  chkT++;if(chkT%15)return;
  const inH=!!(ctx.kunlun.eternalKeepOut&&ctx.player.pl&&ctx.kunlun.eternalKeepOut(ctx.player.pl.p.x,ctx.player.pl.p.z));
  if(inH&&!wasIn)setTimeout(startShow,1200); // 稍待欢迎/风铃先至
  wasIn=inH;
});

bag.custom.push(()=>{
  const gi=iG.indexOf(pg);if(gi>=0)iG.splice(gi,1);
  document.removeEventListener('mousedown',skipEv,true);
  ctx.kunlun.groundOverride=prevOver; // 解链,归还 eternal.js 原地面
  if(plane&&home){const fg=oldestFrame();if(fg){fg.add(plane);plane.position.copy(home.pos);plane.rotation.copy(home.rot);plane.material.emissiveIntensity=0.16;}}
  if(ctx.kunlun.eternalHandlers)delete ctx.kunlun.eternalHandlers.resetview;
});
hotEnd('resetview');
if(import.meta.hot)import.meta.hot.accept();
