// letgo.js — 永恒展厅·放下与召回(二期⑤,2026-07-27 主人定稿+数据铁律落地)
// 长按晨光画 3s(环形进度条+边缘变暗)→ 照片化为暖色光尘消解(3s,边缩边散)→ 空画框:
// 暖白空面+原图灰影(0.1)+小匾「此处曾有过——日期」。上限 3 张(语气温和不责备)。
// 召回:罗盘「✦ 六星屑」页→已放下的照片→点召回 → 光尘聚回、照片重新长出。
// 铁律:放下=不呈现,**照片文件永留服务器**,主展厅墙也不受影响;状态仅 localStorage,可逆。
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
const bag=hotBegin('letgo');
const {s,onTick,iG,ray,mP2,cam}=ctx;

const MAX_LETGO=3;
const state=ctx.store.json('letGo',[]);
function save(){ctx.store.setJson('letGo',state);}
function frames(){return iG.filter(g=>g.userData&&g.userData.eternalName);}
function dateStr(g){return g.userData.mtime?g.userData.mtime.slice(0,10).replace(/-/g,'.'):'';}

// ===================== 光尘系统(消解扩散/召回聚回,共用 700 粒) =====================
const PN=700,pPos=new Float32Array(PN*3),pCol=new Float32Array(PN*3);
const pGeo=new THREE.BufferGeometry();
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
const pMat=new THREE.PointsMaterial({size:0.05,vertexColors:true,transparent:true,opacity:0.95,blending:THREE.AdditiveBlending,depthWrite:false,map:(function(){
  const c=document.createElement('canvas');c.width=c.height=32;
  const x=c.getContext('2d');const g=x.createRadialGradient(16,16,1,16,16,16);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.5,'rgba(255,255,255,0.4)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(0,0,32,32);return new THREE.CanvasTexture(c);
})()});
const dust=new THREE.Points(pGeo,pMat);
dust.frustumCulled=false;dust.visible=false;s.add(dust);
const parts=[]; // {mode:'out'|'in',x,y,z,vx,vy,vz,t0,life,cr,cg,cb}
const DUST_COLORS=[[0.96,0.64,0.38],[1.0,0.84,0.0],[1.0,0.96,0.9]]; // #F4A460→#FFD700→#FFF5E6
function emit(center,dir,spread,speed,life){
  const c=DUST_COLORS[Math.floor(Math.random()*3)];
  parts.push({mode:dir,x:center.x+(Math.random()-0.5)*spread.x,y:center.y+(Math.random()-0.5)*spread.y,z:center.z,
    vx:(Math.random()-0.5)*2*speed,vy:(Math.random()-0.5)*2*speed,vz:(Math.random()-0.5)*2*speed,
    t0:performance.now(),life:life,cr:c[0],cg:c[1],cb:c[2]});
}
function tickDust(){
  const now=performance.now(),arr=pGeo.attributes.position.array,ca=pGeo.attributes.color.array;
  let n=0;
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i],t=(now-p.t0)/1000;
    if(t>=p.life){parts.splice(i,1);continue;}
    const k=t/p.life,fade=1-k;
    if(p.mode==='in'){ // 聚回:向心收拢
      p.x+=p.vx*0.016*(1-k*0.9);p.y+=p.vy*0.016*(1-k*0.9);p.z+=p.vz*0.016*(1-k*0.9);
    }else{
      p.x+=p.vx*0.016;p.y+=p.vy*0.016;p.z+=p.vz*0.016;
      p.vy-=0.15*0.016; // 微尘缓沉
    }
    arr[n*3]=p.x;arr[n*3+1]=p.y;arr[n*3+2]=p.z;
    ca[n*3]=p.cr*fade;ca[n*3+1]=p.cg*fade;ca[n*3+2]=p.cb*fade;
    n++;
  }
  // 多余点位清空(加色混合下黑=隐)
  for(let i=n;i<PN;i++){arr[i*3]=0;arr[i*3+1]=-999;arr[i*3+2]=0;ca[i*3]=ca[i*3+1]=ca[i*3+2]=0;}
  pGeo.attributes.position.needsUpdate=true;pGeo.attributes.color.needsUpdate=true;
  dust.visible=parts.length>0;
}

// ===================== 空画框(暖白空面+灰影+小匾) =====================
function buildEmpty(g){
  removeEmpty(g);
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.14,1.44),
    new THREE.MeshStandardMaterial({color:'#f5ead8',roughness:0.9,emissive:'#fff5e0',emissiveIntensity:0.08}));
  panel.position.z=0.045;g.add(panel);g.userData.emptyPanel=panel;
  // 原图灰影(0.1,像一段褪色的记忆)
  const srcImg=g.children[1].material.map&&g.children[1].material.map.image;
  if(srcImg&&srcImg.width){
    const gc=document.createElement('canvas');gc.width=gc.height=srcImg.width;
    const gx=gc.getContext('2d');
    try{gx.filter='grayscale(1)';}catch(e){}
    gx.drawImage(srcImg,0,0);
    const gt=new THREE.CanvasTexture(gc);gt.colorSpace=THREE.SRGBColorSpace;
    const ghost=new THREE.Mesh(new THREE.PlaneGeometry(1.14,1.44),
      new THREE.MeshBasicMaterial({map:gt,transparent:true,opacity:0.1}));
    ghost.position.z=0.05;g.add(ghost);g.userData.ghost=ghost;
  }
  // 小匾「此处曾有过——日期」
  const cc=document.createElement('canvas');cc.width=256;cc.height=56;
  const cx2=cc.getContext('2d');
  cx2.fillStyle='rgba(46,28,16,0.85)';cx2.fillRect(0,0,256,56);
  cx2.fillStyle='#ffd98a';cx2.font='20px serif';cx2.textAlign='center';cx2.textBaseline='middle';
  cx2.fillText('此处曾有过——'+dateStr(g),128,30);
  const ct=new THREE.CanvasTexture(cc);ct.colorSpace=THREE.SRGBColorSpace;
  const cap=new THREE.Mesh(new THREE.PlaneGeometry(1.0,0.22),new THREE.MeshBasicMaterial({map:ct,transparent:true,toneMapped:false}));
  cap.position.set(0,-0.95,0.05);g.add(cap);g.userData.cap=cap;
}
function removeEmpty(g){
  for(const k of ['emptyPanel','ghost','cap']){
    const m=g.userData[k];
    if(m){g.remove(m);m.geometry.dispose();if(m.material.map)m.material.map.dispose();m.material.dispose();g.userData[k]=null;}
  }
}

// ===================== 放下(消解 3s:边缩边散) =====================
let anim=null; // {g,plane,t0,kind:'out'|'in'}
function doLetGo(g){
  const name=g.userData.eternalName;
  if(state.length>=MAX_LETGO){ctx.ui.modeToast&&ctx.ui.modeToast('B612已替你放下了足够多的过去。');return;}
  if(state.includes(name)||anim)return;
  state.push(name);save();
  g.userData.letGo=true;
  const plane=g.children[1];
  plane.material.transparent=true;
  anim={g,plane,t0:performance.now(),kind:'out'};
  if(!ctx.store.flag('letgoTts')){
    ctx.store.mark('letgoTts');
    ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak('暮光之尘学会了放下。那些你已经准备好告别的东西——它会帮你轻轻松开手。');
  }
  ctx.ui.modeToast&&ctx.ui.modeToast('它没有被删除，只是被轻轻放下了。想它了，去罗盘里召回。');
}
function tickLetGo(){
  if(!anim)return;
  const t=(performance.now()-anim.t0)/1000,plane=anim.plane,g=anim.g;
  if(anim.kind==='out'){
    const k=Math.min(t/3,1),sc=Math.max(0.05,1-k*0.95);
    plane.scale.set(sc,sc,1);
    plane.position.x=Math.sin(t*31)*0.008*(1-k); // 颤抖(本地 x 即画面横向)
    plane.material.opacity=t>2?Math.max(0,1-(t-2)):1;
    if(t<2.8){ // 边缘化尘(约 500/s)
      const c=plane.getWorldPosition(new THREE.Vector3());
      for(let i=0;i<9;i++)emit(c,'out',{x:0.55*sc,y:0.7*sc,z:0.05},0.6,1.4+Math.random()*0.6);
    }
    if(k>=1){
      plane.visible=false;plane.scale.set(1,1,1);plane.position.x=0;plane.material.opacity=1;
      buildEmpty(g);
      anim=null;
    }
  }else{ // 召回:光尘聚回,照片重新长出(2.5s)
    const k=Math.min(t/2.5,1);
    plane.visible=true;
    plane.scale.set(0.05+k*0.95,0.05+k*0.95,1);
    plane.material.opacity=k;
    if(t<1.8){
      const c=plane.getWorldPosition(new THREE.Vector3());
      for(let i=0;i<8;i++){
        const p={x:c.x+(Math.random()-0.5)*3,y:c.y+(Math.random()-0.5)*3,z:c.z+(Math.random()-0.5)*1.5};
        parts.push({mode:'in',x:p.x,y:p.y,z:p.z,vx:(c.x-p.x)*0.8,vy:(c.y-p.y)*0.8,vz:(c.z-p.z)*0.8,
          t0:performance.now(),life:1.2,cr:1,cg:0.84,cb:0.4});
      }
    }
    if(k>=1){plane.scale.set(1,1,1);plane.material.opacity=1;anim=null;}
  }
}

// ===================== 召回(罗盘调用;厅内播聚回动画,厅外静默还原) =====================
ctx.kunlun.letgoRecall=function(name){
  const i=state.indexOf(name);if(i<0)return false;
  state.splice(i,1);save();
  const g=frames().find(f=>f.userData.eternalName===name);
  if(g){
    g.userData.letGo=false;
    removeEmpty(g);
    const inH=!!(ctx.player.pl&&ctx.kunlun.eternalKeepOut&&ctx.kunlun.eternalKeepOut(ctx.player.pl.p.x,ctx.player.pl.p.z));
    const plane=g.children[1];
    plane.material.transparent=true;
    if(inH&&!anim){anim={g,plane,t0:performance.now(),kind:'in'};}
    else{plane.visible=true;plane.scale.set(1,1,1);plane.material.opacity=1;}
  }
  ctx.ui.modeToast&&ctx.ui.modeToast('它回来了。');
  return true;
};

// ===================== 长按 3s(环形进度条+边缘变暗;拖拽/松手取消;仅厅内,正放大时不可) =====================
const ring=document.createElement('div');
ring.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:76px;height:76px;border-radius:50%;z-index:392;display:none;pointer-events:none';
const ringHole=document.createElement('div');
ringHole.style.cssText='position:absolute;inset:9px;border-radius:50%;background:rgba(20,12,8,0.85);display:flex;align-items:center;justify-content:center;color:#ffe9c4;font-size:11px;letter-spacing:1px';
ringHole.textContent='放下';
ring.appendChild(ringHole);
document.body.appendChild(ring);
const dim=document.createElement('div');
dim.style.cssText='position:fixed;inset:0;z-index:391;pointer-events:none;box-shadow:inset 0 0 140px 40px rgba(0,0,0,0.4);opacity:0;transition:opacity .4s';
document.body.appendChild(dim);

let hold=null; // {g,t0}
function rayHitFrame(px,py){
  mP2.x=(px/innerWidth)*2-1;mP2.y=-(py/innerHeight)*2+1;
  ray.setFromCamera(mP2,cam);
  const fs=frames().filter(g=>!g.userData.letGo);
  const hs=ray.intersectObjects(fs,true);
  if(!hs.length)return null;
  let g=hs[0].object;while(g.parent&&g.parent!==s)g=g.parent;
  return g.userData&&g.userData.eternalName?g:null;
}
function inHallNow(){return !!(ctx.player.pl&&ctx.kunlun.eternalKeepOut&&ctx.kunlun.eternalKeepOut(ctx.player.pl.p.x,ctx.player.pl.p.z));}
function down(e){
  if(hold||anim||ctx.kunlun.flightLock||ctx.gallery.zG||!inHallNow())return;
  if((ctx.scene.activeWorld||'main')!=='main')return; // 多世界切割:放下画框只属主世界
  const p=e.touches?e.touches[0]:e;
  const g=rayHitFrame(p.clientX,p.clientY);
  if(!g)return;
  if(state.length>=MAX_LETGO){ctx.ui.modeToast&&ctx.ui.modeToast('B612已替你放下了足够多的过去。');return;}
  hold={g,t0:performance.now(),x:p.clientX,y:p.clientY};
  ring.style.display='block';dim.style.opacity='1';
}
function up(){cancelHold();}
function moveCancel(e){if(!hold)return;const p=e.touches?e.touches[0]:e;if(Math.hypot(p.clientX-hold.x,p.clientY-hold.y)>14)cancelHold();}
function cancelHold(){if(!hold)return;hold=null;ring.style.display='none';dim.style.opacity='0';}
document.addEventListener('mousedown',down);
document.addEventListener('touchstart',down,{passive:true});
document.addEventListener('mouseup',up);
document.addEventListener('touchend',up);
document.addEventListener('mousemove',moveCancel);
document.addEventListener('touchmove',moveCancel,{passive:true});

// ===================== 主循环:长按推进/光尘/动画/状态应用(载入即还原已放下) =====================
let applied=false;
onTick(function(){
  // 载入后应用已放下状态(等画框建好)
  if(!applied){
    const fs=frames();
    if(fs.length){
      applied=true;
      for(const g of fs){
        if(state.includes(g.userData.eternalName)){g.userData.letGo=true;g.children[1].visible=false;buildEmpty(g);}
      }
    }
  }
  // 长按推进
  if(hold){
    const el=(performance.now()-hold.t0)/1000,p=Math.min(el/3,1);
    ring.style.background='conic-gradient(#ffd88a '+(p*360)+'deg, rgba(255,255,255,.12) 0deg)';
    if(p>=1){const g=hold.g;cancelHold();doLetGo(g);}
  }
  tickDust();
  tickLetGo();
});

bag.custom.push(()=>{
  cancelHold();
  ring.remove();dim.remove();
  document.removeEventListener('mousedown',down);
  document.removeEventListener('touchstart',down);
  document.removeEventListener('mouseup',up);
  document.removeEventListener('touchend',up);
  document.removeEventListener('mousemove',moveCancel);
  document.removeEventListener('touchmove',moveCancel);
  for(const g of frames()){if(g.userData.letGo){g.userData.letGo=false;g.children[1].visible=true;removeEmpty(g);}}
  ctx.kunlun.letgoRecall=null;
});
hotEnd('letgo');
if(import.meta.hot)import.meta.hot.accept();
