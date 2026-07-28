// desert.js — 西域沙海:无限区块地形(沙丘/雅丹/盐沼/胡杨/红柳/枯木/岩石) + 昆仑山 + 水波 + 飞鸟 + 沙暴
// 地形/植被/水体/粒子参数完整复刻《西域·沙海行记》原版;仅对建筑本体/白板本体/心象共鸣屏做地基保护
// 天空用画廊现有云影 shader,昼夜由主循环统一驱动(120秒一昼夜)
import * as THREE from 'three';
import {ctx} from '../ctx.js';
const {s}=ctx;

// ===================== 地形参数(原版复刻) =====================
const KX=800,KZ=600,KR=200;   // 昆仑位置与山系半径(原版坐标)

// ===================== 高度函数(原版复刻) =====================
const hCache=new Map();
function computeHeight(x,z){
  let y=0.5;
  y+=Math.sin(x*0.006)*Math.cos(z*0.006)*4;
  y+=Math.sin(x*0.012+1.5)*Math.cos(z*0.010+2.0)*3;
  const plateau=Math.sin(x*0.008+3)*Math.cos(z*0.007+1);
  if(plateau>0.4)y+=(plateau-0.4)*15;
  const dune=Math.sin(x*0.025+5)*Math.cos(z*0.020+3);
  if(dune>0.1)y+=Math.pow(dune-0.1,1.5)*8;
  const yardang=Math.sin(x*0.035+8)*Math.cos(z*0.028+6);
  if(yardang>0.65)y+=(yardang-0.65)*25;
  const salt=Math.sin(x*0.015+2)*Math.cos(z*0.012+4);
  if(salt>0.5)y=y*0.3-3;
  const oasis=Math.sin(x*0.018+7)*Math.cos(z*0.016+9);
  if(oasis>0.75&&y<2)y-=1.5;
  // 昆仑山系(三螺旋山脊 + 主峰平顶台地)
  const kx=x-KX,kz=z-KZ,kd=Math.sqrt(kx*kx+kz*kz);
  if(kd<KR){
    const ka=Math.atan2(kz,kx);
    // 峰顶平台(2026-07-27 主人定):山顶半径 14m 压平成可站立走动的平台(海拔≈126m),
    // 14~26m 平滑过渡收坡;平台区螺旋山脊与褶皱归零——山顶不再收尖、不再有刃脊
    const kdE=Math.max(kd,14);
    const t=Math.max(0,1-kdE/KR);
    let m=Math.pow(t,1.2)*110;
    let spiral=0;
    for(let arm=0;arm<3;arm++){
      const aa=ka+arm*Math.PI*2/3;
      const r=Math.sin(aa*4+kd*0.06);
      if(r>0.3)spiral+=(r-0.3)*t*18;
    }
    let fold=Math.sin(kx*0.04+kz*0.03)*t*6+Math.sin(kx*0.08)*Math.cos(kz*0.08)*t*3;
    const calm=Math.min(1,kd/26);
    spiral*=calm*calm; fold*=calm*calm;
    let peak=0;
    if(kd<26){const tt=Math.max(0,(kd-14)/12);peak=25*(1-tt*tt*(3-2*tt));}
    const blend=Math.max(0,1-kd/(KR+20));
    y=y*(1-blend*0.85)+(m+spiral+fold+peak)*blend;
  }
  return y;
}

// ===================== 地基保护 =====================
// 仅三处:画廊建筑本体(含10m地基)、希沃白板本体(含作品墙)、心象共鸣屏;平滑过渡到原始地形
function rectDist(x,z,x0,x1,z0,z1){
  const dx=Math.max(x0-x,0,x-x1),dz=Math.max(z0-z,0,z-z1);
  return Math.hypot(dx,dz);
}
function padF(d,flatR,blendR){
  if(d<flatR)return 0;
  if(d>flatR+blendR)return 1;
  const t=(d-flatR)/blendR;
  return t*t*(3-2*t);
}
function protectMask(x,z){
  let m=1;
  m=Math.min(m,padF(rectDist(x,z,-19,19,-13,29),10,25)); // 画廊建筑
  m=Math.min(m,padF(rectDist(x,z,-8,8,36,52),6,14));     // 希沃白板+作品墙
  m=Math.min(m,padF(Math.hypot(x-39,z-14),8,10));        // 心象共鸣屏
  m=Math.min(m,padF(rectDist(x,z,-86,86,97,103),0,10));  // 南巨幕地基条带
  m=Math.min(m,padF(rectDist(x,z,-32,33,-103,-97),0,10));// 北巨幕地基条带
  return m;
}
const getH=function(x,z){
  const k=Math.round(x*2)+','+Math.round(z*2);
  const c=hCache.get(k);
  if(c!==undefined)return c;
  const m=protectMask(x,z);
  // 保护区内再下沉5cm:避免与画廊地板(y=0)/门禁墙共面闪面
  let h=computeHeight(x,z)*m-0.05*(1-m);
  // 建筑150米环带强制为陆地:地形不低于-2.2m(水面-2.5m),盐湖海只出现在远处
  if(h<-2.2&&rectDist(x,z,-19,19,-13,29)<150)h=-2.2;
  if(hCache.size>80000)hCache.delete(hCache.keys().next().value);
  hCache.set(k,h);
  return h;
};

// ===================== 颜色与地物(原版复刻) =====================
function getColor(h){
  const r=Math.random()*0.03;
  if(h<-2)return{r:0.85+r,g:0.82+r,b:0.78+r};
  if(h<0.5)return{r:0.75+r,g:0.65+r,b:0.45+r};
  if(h<3)return{r:0.82+r,g:0.72+r,b:0.50+r};
  if(h<7)return{r:0.70+r,g:0.60+r,b:0.42+r};
  if(h<12)return{r:0.55+r,g:0.45+r,b:0.35+r};
  if(h<20)return{r:0.45+r,g:0.40+r,b:0.38+r};
  if(h<35)return{r:0.55+r,g:0.52+r,b:0.48+r};
  if(h<60)return{r:0.65+r,g:0.62+r,b:0.58+r};
  if(h<90)return{r:0.75+r,g:0.73+r,b:0.70+r};
  return{r:0.95+r,g:0.97+r,b:0.98+r};
}

// 共享材质(视觉与原版一致,避免每株植物一张材质)
const trunkMat=new THREE.MeshStandardMaterial({color:0x5a4a3a,roughness:0.95});
const branchMat=new THREE.MeshStandardMaterial({color:0x4a3a2a,roughness:0.95});
const leafMat=new THREE.MeshStandardMaterial({color:0xDAA520,roughness:0.8});
const tamTrunkMat=new THREE.MeshStandardMaterial({color:0x6b4c3a,roughness:0.95});
const tamLeafMat=new THREE.MeshStandardMaterial({color:0xCD5C5C,roughness:0.8});
const cactusMat=new THREE.MeshStandardMaterial({color:0x2d5a27,roughness:0.8});
const deadMat=new THREE.MeshStandardMaterial({color:0x4a3a2a,roughness:1.0});
const rockMat=new THREE.MeshStandardMaterial({color:0x8B7355,roughness:0.95,flatShading:true});
const saltMat=new THREE.MeshStandardMaterial({color:0xeeeeee,roughness:0.5,transparent:true,opacity:0.7});
const grassMat=new THREE.MeshStandardMaterial({color:0xBDB76B,roughness:0.9});

// ===================== 实例化地物(同类同区块合并为 InstancedMesh,draw call 数千→数百) =====================
const popTrunkGeo=new THREE.CylinderGeometry(0.1,0.25,3.5,5);
const popBranchGeo=new THREE.CylinderGeometry(0.04,0.08,1.5,4);
const popLeafGeo=new THREE.DodecahedronGeometry(1,0);
const tamTrunkGeo=new THREE.CylinderGeometry(0.05,0.1,1.2,4);
const tamLeafGeo=new THREE.SphereGeometry(1,4,4);
const cactusGeo=new THREE.CylinderGeometry(0.15,0.18,1.8,8);
const cactusArmGeo=new THREE.CylinderGeometry(0.08,0.1,0.8,6);
const deadGeo=new THREE.CylinderGeometry(0.08,0.15,2.0,5);
const rockGeo=new THREE.DodecahedronGeometry(1,0);
const saltGeo=new THREE.PlaneGeometry(1,1);
const grassGeo=new THREE.ConeGeometry(0.03,1,3);
// 共享几何体登记:区块卸载时只释放实例缓冲,不释放共享几何体
const sharedGeos=new Set([popTrunkGeo,popBranchGeo,popLeafGeo,tamTrunkGeo,tamLeafGeo,cactusGeo,cactusArmGeo,deadGeo,rockGeo,saltGeo,grassGeo]);
const _im4=new THREE.Matrix4(),_imq=new THREE.Quaternion(),_ime=new THREE.Euler(),_imv=new THREE.Vector3(),_ims=new THREE.Vector3();
function makeInstanced(geo,mat,items){
  if(!items.length)return null;
  const im=new THREE.InstancedMesh(geo,mat,items.length);
  for(let i=0;i<items.length;i++){
    const t=items[i];
    _ime.set(t.rx||0,t.ry||0,t.rz||0);_imq.setFromEuler(_ime);
    _im4.compose(_imv.set(t.x,t.y,t.z),_imq,_ims.set(t.sx,t.sy,t.sz));
    im.setMatrixAt(i,_im4);
  }
  im.instanceMatrix.needsUpdate=true;
  return im;
}

// ===================== 区块系统 =====================
const CHUNK=24,DIST=4;
const chunks=new Map();
const terrainMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.98,metalness:0,side:THREE.DoubleSide});
function genChunk(cx,cz){
  const g=new THREE.Group();
  const ccx=cx*CHUNK+CHUNK/2,ccz=cz*CHUNK+CHUNK/2;
  g.position.set(ccx,0,ccz);
  const p=ctx.player.pl?ctx.player.pl.p:{x:0,z:0};
  const pd=Math.hypot(ccx-p.x,ccz-p.z);
  let seg,detail;
  if(pd<CHUNK*1.5){seg=24;detail=2;}
  else if(pd<CHUNK*3.5){seg=12;detail=1;}
  else{seg=6;detail=0;}
  const geo=new THREE.PlaneGeometry(CHUNK,CHUNK,seg,seg);
  const pos=geo.attributes.position.array;
  const colors=new Float32Array(pos.length);
  for(let i=0;i<pos.length;i+=3){
    const wx=ccx+pos[i],wz=ccz-pos[i+1];
    const h=getH(wx,wz);
    pos[i+2]=h;
    const c=getColor(h);
    colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const terrain=new THREE.Mesh(geo,terrainMat);
  terrain.rotation.x=-Math.PI/2;
  g.add(terrain);

  // 原版密度地物(实例化合并,外观/碰撞与逐个建模完全一致);地基保护区内不生成,避免遮挡建筑/白板
  const colliders=[];
  const B={popT:[],popB:[],popL:[],tamT:[],tamL:[],cac:[],cacA:[],dead:[],rock:[],salt:[],grass:[]};
  const place=(count,cond,cb)=>{
    for(let i=0;i<count;i++){
      const lx=(Math.random()-0.5)*(CHUNK-3),lz=(Math.random()-0.5)*(CHUNK-3);
      const wx=ccx+lx,wz=ccz+lz,h=getH(wx,wz);
      if(protectMask(wx,wz)<0.5)continue;
      if(cond(h))cb(lx,h,lz,wx,wz);
    }
  };
  const bind=(cr,wx,wz,sc)=>{
    if(!cr||!ctx.scene.bounds)return;
    const box={mnX:wx-cr*sc,mxX:wx+cr*sc,mnZ:wz-cr*sc,mxZ:wz+cr*sc,_desert:true};
    ctx.scene.bounds.push(box);colliders.push(box);
  };
  const d2=detail===2,d1=detail>=1;
  // 胡杨(低地):主干+3枝+5叶
  place(d2?3:d1?2:1,h=>h>-1&&h<5,(lx,h,lz,wx,wz)=>{
    const sc=0.7+Math.random()*0.6,ry=Math.random()*Math.PI*2;
    B.popT.push({x:lx,y:h+1.75*sc,z:lz,ry,sx:sc,sy:sc,sz:sc});
    for(let i=0;i<3;i++)B.popB.push({x:lx+Math.sin(i*2)*0.6*sc,y:h+(2.5+i*0.8)*sc,z:lz+Math.cos(i*2)*0.6*sc,rx:Math.cos(i)*0.3,rz:Math.sin(i)*0.5,sx:sc,sy:sc,sz:sc});
    for(let i=0;i<5;i++){const ls=(0.4+Math.random()*0.3)*sc;B.popL.push({x:lx+(Math.random()-0.5)*1.5*sc,y:h+(3+Math.random()*1.5)*sc,z:lz+(Math.random()-0.5)*1.5*sc,ry:Math.random()*Math.PI,sx:ls,sy:ls,sz:ls});}
    bind(0.4,wx,wz,sc);
  });
  // 红柳(中地):干+8叶
  place(d2?6:d1?3:1,h=>h>2&&h<8,(lx,h,lz)=>{
    const sc=0.7+Math.random()*0.5,ry=Math.random()*Math.PI*2;
    B.tamT.push({x:lx,y:h+0.6*sc,z:lz,ry,sx:sc,sy:sc,sz:sc});
    for(let i=0;i<8;i++){const ls=(0.15+Math.random()*0.1)*sc;B.tamL.push({x:lx+(Math.random()-0.5)*0.8*sc,y:h+(0.8+Math.random()*0.6)*sc,z:lz+(Math.random()-0.5)*0.8*sc,sx:ls,sy:ls,sz:ls});}
  });
  // 仙人掌(含概率侧臂)
  place(d2?3:d1?2:1,h=>h>1&&h<4,(lx,h,lz,wx,wz)=>{
    const sc=0.7+Math.random()*0.6,ry=Math.random()*Math.PI*2;
    B.cac.push({x:lx,y:h+0.9*sc,z:lz,ry,sx:sc,sy:sc,sz:sc});
    if(Math.random()>0.5)B.cacA.push({x:lx+0.2*sc,y:h+1.2*sc,z:lz,rz:-0.6,sx:sc,sy:sc,sz:sc});
    bind(0.2,wx,wz,sc);
  });
  // 枯木
  place(d2?3:d1?2:1,h=>h>0&&h<6,(lx,h,lz)=>{
    const sc=0.7+Math.random()*0.6;
    B.dead.push({x:lx,y:h+1.0*sc,z:lz,ry:Math.random()*Math.PI*2,rz:(Math.random()-0.5)*0.4,sx:sc,sy:sc,sz:sc});
  });
  // 岩石(高地,非均匀缩放)
  place(d2?8:d1?5:2,h=>h>5,(lx,h,lz,wx,wz)=>{
    const r=0.6+Math.random()*1.5,sc=0.7+Math.random()*0.6;
    B.rock.push({x:lx,y:h,z:lz,rx:Math.random(),ry:Math.random(),rz:Math.random(),sx:r*(1+Math.random()*0.8)*sc,sy:r*(0.6+Math.random()*0.6)*sc,sz:r*(1+Math.random()*0.8)*sc});
    bind(0.8,wx,wz,sc);
  });
  // 盐壳(洼地)
  place(3,h=>h<-0.5,(lx,h,lz)=>{
    const sc=0.7+Math.random()*0.6;
    B.salt.push({x:lx,y:h+0.02,z:lz,rx:-Math.PI/2+(Math.random()-0.5)*0.2,rz:Math.random()*Math.PI,sx:(2+Math.random()*3)*sc,sy:1,sz:(2+Math.random()*3)*sc});
  });
  // 枯草
  place(d2?30:d1?15:5,h=>h>0.5&&h<5,(lx,h,lz)=>{
    const sc=0.7+Math.random()*0.6,gh=(0.15+Math.random()*0.2)*sc;
    B.grass.push({x:lx,y:h+gh*0.5,z:lz,ry:Math.random()*Math.PI*2,sx:sc,sy:gh,sz:sc});
  });
  // 合并入区块
  [[B.popT,popTrunkGeo,trunkMat],[B.popB,popBranchGeo,branchMat],[B.popL,popLeafGeo,leafMat],
   [B.tamT,tamTrunkGeo,tamTrunkMat],[B.tamL,tamLeafGeo,tamLeafMat],
   [B.cac,cactusGeo,cactusMat],[B.cacA,cactusArmGeo,cactusMat],
   [B.dead,deadGeo,deadMat],[B.rock,rockGeo,rockMat],
   [B.salt,saltGeo,saltMat],[B.grass,grassGeo,grassMat]]
  .forEach(([items,geo,mat])=>{const im=makeInstanced(geo,mat,items);if(im)g.add(im);});
  s.add(g);
  return {g,colliders};
}
function updateChunks(){
  if(!ctx.player.pl)return;
  const pcx=Math.floor(ctx.player.pl.p.x/CHUNK),pcz=Math.floor(ctx.player.pl.p.z/CHUNK);
  const need=new Set();
  // 每帧最多新建3个区块:摊平初始化内存尖峰(手机端首次加载不再瞬间爆发81个区块)
  let created=0;
  for(let x=pcx-DIST;x<=pcx+DIST;x++)for(let z=pcz-DIST;z<=pcz+DIST;z++){
    const k=x+','+z;need.add(k);
    if(!chunks.has(k)&&created<3){chunks.set(k,genChunk(x,z));created++;}
  }
  for(const[k,c]of chunks){
    if(!need.has(k)){
      s.remove(c.g);
      c.g.traverse(o=>{
        if(o.isInstancedMesh)o.dispose(); // 释放实例缓冲(共享几何体不动)
        if(o.geometry&&!sharedGeos.has(o.geometry))o.geometry.dispose();
        if(o.material&&o.material!==terrainMat&&o.material!==trunkMat&&o.material!==branchMat&&o.material!==leafMat&&o.material!==tamTrunkMat&&o.material!==tamLeafMat&&o.material!==cactusMat&&o.material!==deadMat&&o.material!==rockMat&&o.material!==saltMat&&o.material!==grassMat)o.material.dispose();
      });
      // 同步移除该区块的碰撞盒,避免幽灵墙与内存泄漏
      if(ctx.scene.bounds)for(const box of c.colliders){const i=ctx.scene.bounds.indexOf(box);if(i>=0)ctx.scene.bounds.splice(i,1);}
      chunks.delete(k);
    }
  }
}

// ===================== 水面(原版 shader,跟随玩家,盐沼洼地即成海) =====================
const waterU={uTime:{value:0},uColor:{value:new THREE.Color(0x5a7a6a)},uOpacity:{value:0.75},uOffset:{value:new THREE.Vector2(0,0)}};
const water=new THREE.Mesh(
  new THREE.PlaneGeometry(400,400,60,60),
  new THREE.ShaderMaterial({
    uniforms:waterU,transparent:true,side:THREE.DoubleSide,
    vertexShader:`
      uniform float uTime;
      uniform vec2 uOffset;
      varying float vElevation;
      void main(){
        vec3 pos=position;
        float worldX=pos.x+uOffset.x;
        float worldZ=-pos.y+uOffset.y;
        float wave=sin(worldX*0.3+uTime*1.2)*0.08
                 +cos(worldZ*0.25+uTime*0.9)*0.08
                 +sin((worldX+worldZ)*0.15+uTime*0.6)*0.05;
        pos.z+=wave;
        vElevation=wave;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
      }`,
    fragmentShader:`
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vElevation;
      void main(){
        vec3 color=uColor+vElevation*0.15;
        float alpha=uOpacity+vElevation*0.06;
        gl_FragColor=vec4(color,alpha);
      }`
  })
);
water.rotation.x=-Math.PI/2;water.position.y=-2.5;
s.add(water);

// ===================== 飞鸟(原版:环绕出生点,半径50~200) =====================
const BIRDS=15;
const birdGeo=new THREE.BufferGeometry();
const birdPos=new Float32Array(BIRDS*3);
const birdData=[];
for(let i=0;i<BIRDS;i++){
  birdPos[i*3]=(Math.random()-0.5)*200;
  birdPos[i*3+1]=25+Math.random()*40;
  birdPos[i*3+2]=(Math.random()-0.5)*200;
  birdData.push({a:Math.random()*Math.PI*2,sp:2+Math.random()*3,r:50+Math.random()*150,y:birdPos[i*3+1],ws:2+Math.random()*3});
}
birdGeo.setAttribute('position',new THREE.BufferAttribute(birdPos,3));
const birds=new THREE.Points(birdGeo,new THREE.PointsMaterial({color:0x3a2a1a,size:0.5,sizeAttenuation:true}));
s.add(birds);

// ===================== 沙暴粒子(原版:200粒,低地更浓) =====================
const SAND=200;
const sandGeo=new THREE.BufferGeometry();
const sandPos=new Float32Array(SAND*3);
const sandSp=new Float32Array(SAND);
for(let i=0;i<SAND;i++){
  sandPos[i*3]=(Math.random()-0.5)*400;
  sandPos[i*3+1]=Math.random()*20;
  sandPos[i*3+2]=(Math.random()-0.5)*400;
  sandSp[i]=8+Math.random()*15;
}
sandGeo.setAttribute('position',new THREE.BufferAttribute(sandPos,3));
const sandMat=new THREE.PointsMaterial({color:0xd4a574,size:0.25,transparent:true,opacity:0.15,sizeAttenuation:true,depthWrite:false});
const sand=new THREE.Points(sandGeo,sandMat);
s.add(sand);

// ===================== 昆仑灯塔(原版:fog:false 的金色信标 + 环绕光尘) =====================
const peakY=getH(KX,KZ);
const beacon=new THREE.Mesh(new THREE.SphereGeometry(2.5,16,16),new THREE.MeshBasicMaterial({color:0xffdd88,fog:false}));
beacon.position.set(KX,peakY+8,KZ);s.add(beacon);
const beaconLight=new THREE.PointLight('#ffaa55',4,400);
beaconLight.position.set(KX,peakY+8,KZ);s.add(beaconLight);
const DUST=40;
const dustGeo=new THREE.BufferGeometry();
const dustPos=new Float32Array(DUST*3);
const dustAngle=[];
for(let i=0;i<DUST;i++){
  dustAngle.push(Math.random()*Math.PI*2);
  dustPos[i*3]=KX+Math.cos(dustAngle[i])*6;
  dustPos[i*3+1]=peakY+6+Math.random()*4;
  dustPos[i*3+2]=KZ+Math.sin(dustAngle[i])*6;
}
dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
const dustMat=new THREE.PointsMaterial({color:0xffeebb,size:0.5,transparent:true,opacity:0.7,sizeAttenuation:true,depthWrite:false,blending:THREE.AdditiveBlending});
const dust=new THREE.Points(dustGeo,dustMat);
s.add(dust);

// ===================== 昆仑罗盘(原版:司南造型,指针恒指昆仑) =====================
const compass=document.createElement('div');
compass.id='kunlunCompass';
compass.title='昆仑罗盘(点击打开设置)';
compass.style.cssText='position:fixed;top:16px;left:16px;width:64px;height:64px;z-index:10;pointer-events:auto;cursor:pointer';
compass.innerHTML='<div style="position:absolute;inset:0;border-radius:50%;border:2.5px solid rgba(160,120,60,0.55);background:radial-gradient(circle at 50% 50%,rgba(30,22,12,0.85) 0%,rgba(18,12,6,0.95) 100%);box-shadow:0 2px 12px rgba(0,0,0,0.6)"></div>'
  +'<div style="position:absolute;left:6px;top:6px;right:6px;bottom:6px;border-radius:50%;border:1px solid rgba(160,120,60,0.25)"></div>'
  +'<div class="cp-needle" style="position:absolute;left:50%;top:50%;width:3px;height:22px;margin-left:-1.5px;margin-top:-22px;background:linear-gradient(to bottom,rgba(230,200,130,0.95) 0%,rgba(180,140,70,0.85) 55%,rgba(160,60,40,0.9) 100%);border-radius:40% 40% 50% 50%;transform-origin:50% 22px;box-shadow:0 0 8px rgba(200,160,90,0.25)"></div>'
  +'<div style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:radial-gradient(circle at 35% 35%,rgba(220,190,130,0.9),rgba(140,100,50,0.9))"></div>'
  +'<div style="position:absolute;left:50%;bottom:-16px;transform:translateX(-50%);color:rgba(200,170,120,0.5);font-size:9px;letter-spacing:3px;white-space:nowrap">昆仑</div>';
document.body.appendChild(compass);
const cpNeedle=compass.querySelector('.cp-needle');


// ===================== 西域天空(原版:纯色渐变背景 + 日/月/星) =====================
const skyBg=new THREE.Color(0xD4C8A0);
s.background=skyBg;
// 太阳/月亮球体(fog:false 防被指数雾吞掉)
const sunMesh=new THREE.Mesh(new THREE.SphereGeometry(2.0,16,16),new THREE.MeshBasicMaterial({color:0xFFF0D0,fog:false}));
s.add(sunMesh);
const moonMesh=new THREE.Mesh(new THREE.SphereGeometry(1.0,16,16),new THREE.MeshBasicMaterial({color:0xF5F0E8,fog:false}));
s.add(moonMesh);
// 600 星点(原版参数,半径100~150)
const STARS=600;
const starGeo=new THREE.BufferGeometry();
const starPos=new Float32Array(STARS*3);
for(let i=0;i<STARS;i++){
  const th=Math.random()*Math.PI*2,ph=Math.acos(1-2*Math.random()),r=100+Math.random()*50;
  starPos[i*3]=r*Math.sin(ph)*Math.cos(th);
  starPos[i*3+1]=r*Math.sin(ph)*Math.sin(th);
  starPos[i*3+2]=r*Math.cos(ph);
}
starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
const starMat=new THREE.PointsMaterial({color:0xfff8e0,size:0.4,transparent:true,opacity:0,sizeAttenuation:true,fog:false});
const stars=new THREE.Points(starGeo,starMat);
s.add(stars);
// 轮廓补光(原版 rimLight)
const rimL=new THREE.DirectionalLight(0xcc9977,0.4);
rimL.position.set(-20,10,-20);s.add(rimL);
// 昼夜调色板(原版)
const skyColorDay=new THREE.Color(0xD4C8A0),skyColorSunset=new THREE.Color(0xE8A070),skyColorNight=new THREE.Color(0x0a0806);
const fogDay=new THREE.Color(0xC8B88A),fogSunset=new THREE.Color(0xD48860),fogNight=new THREE.Color(0x0a0806);
const sunColorDay=new THREE.Color(0xFFF8E7),sunColorSunset=new THREE.Color(0xFF8844),sunColorNight=new THREE.Color(0x1a1510);
const ambDay=new THREE.Color(0xFFF0D0),ambSunset=new THREE.Color(0xFFAA77),ambNight=new THREE.Color(0x1a1510);
const _c1=new THREE.Color();
let lastElev=1;
// 原版 updateDayNight 改造版:背景/雾/日光/星月按原版调色,
// 但环境光夜晚兜底 0.30(建筑/门禁墙任何时刻都清晰可见,不会像上次一样黑没)
function dayNight(hour){
  const sunAngle=((hour-6)/24)*Math.PI*2;
  const sunY=Math.sin(sunAngle),sunX=Math.cos(sunAngle);
  const elev=(sunY+1)/2;lastElev=elev;
  const orbitR=60;
  sunMesh.position.set(sunX*orbitR,sunY*orbitR,-10);
  moonMesh.position.set(-sunX*orbitR,-sunY*orbitR,-10);
  sunMesh.visible=sunY>-0.1;
  moonMesh.visible=sunY<0.1;
  let ambInt,sunInt;
  if(elev<0.25){
    const t=elev/0.25;
    skyBg.copy(_c1.copy(skyColorNight).lerp(skyColorSunset,t));
    s.fog.color.copy(_c1.copy(fogNight).lerp(fogSunset,t));
    sunL.color.copy(_c1.copy(sunColorNight).lerp(sunColorSunset,t));
    ctx.scene.ambL.color.copy(_c1.copy(ambNight).lerp(ambSunset,t));
    ambInt=0.30+t*0.09;sunInt=0.05+t*0.95;
  }else if(elev<0.75){
    const t=(elev-0.25)/0.5;
    skyBg.copy(_c1.copy(skyColorSunset).lerp(skyColorDay,t));
    s.fog.color.copy(_c1.copy(fogSunset).lerp(fogDay,t));
    sunL.color.copy(_c1.copy(sunColorSunset).lerp(sunColorDay,t));
    ctx.scene.ambL.color.copy(_c1.copy(ambSunset).lerp(ambDay,t));
    ambInt=0.39+t*0.06;sunInt=1.0;
  }else{
    skyBg.copy(skyColorDay);s.fog.color.copy(fogDay);sunL.color.copy(sunColorDay);ctx.scene.ambL.color.copy(ambDay);
    ambInt=0.45;sunInt=1.0;
  }
  ctx.scene.ambL.intensity=ambInt;
  ctx.scene.hemiL.intensity=0.15+0.30*elev;
  sunL.intensity=sunInt*1.6; // 无 ACES 环境下略补亮度(原版 1.0 配 ACES1.3)
  sunL.position.set(sunX*orbitR,sunY*orbitR,-10).normalize().multiplyScalar(60);
  rimL.intensity=elev<0.3?0.5:0.3;
  rimL.color.setHex(elev<0.3?0x664433:0x886655);
  let so=0;
  if(elev<0.15)so=1;
  else if(elev<0.35)so=1-(elev-0.15)/0.2;
  starMat.opacity=so;
}

// ===================== 漂移云团(原版:40朵,±250回弹) =====================
// 加性半透明大贴片是弱GPU的填充率杀手(云飘到镜头前会拖停视频):改小改淡,漂移 30Hz 节流
const CLOUDS=40;
const cloudGeo=new THREE.BufferGeometry();
const cloudPos=new Float32Array(CLOUDS*3);
const cloudVel=[];
for(let i=0;i<CLOUDS;i++){
  cloudPos[i*3]=(Math.random()-0.5)*500;
  cloudPos[i*3+1]=35+Math.random()*30;
  cloudPos[i*3+2]=(Math.random()-0.5)*500;
  cloudVel.push({x:(Math.random()-0.5)*3,z:(Math.random()-0.5)*3});
}
cloudGeo.setAttribute('position',new THREE.BufferAttribute(cloudPos,3));
const clouds=new THREE.Points(cloudGeo,new THREE.PointsMaterial({color:0xffeedd,size:6.5,transparent:true,opacity:0.10,sizeAttenuation:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
s.add(clouds);
let cloudAcc=0;

// ===================== 风行粒子(原版:移动时身后拖尾,朝昆仑滑翔变金色) =====================
const WIND=40;
const windGeo=new THREE.BufferGeometry();
const windPos=new Float32Array(WIND*3);
const windVel=new Float32Array(WIND*3);
const windLife=new Float32Array(WIND);
for(let i=0;i<WIND;i++)windLife[i]=Math.random();
windGeo.setAttribute('position',new THREE.BufferAttribute(windPos,3));
const windMat=new THREE.PointsMaterial({color:0xffddaa,size:0.15,transparent:true,opacity:0.5,sizeAttenuation:true,depthWrite:false,blending:THREE.AdditiveBlending});
const wind=new THREE.Points(windGeo,windMat);
s.add(wind);

// ===================== 滑翔迎风粒子(原版:正前方速度线) =====================
const HWIND=60;
const hwindGeo=new THREE.BufferGeometry();
const hwindPos=new Float32Array(HWIND*3);
hwindGeo.setAttribute('position',new THREE.BufferAttribute(hwindPos,3));
const hwindMat=new THREE.PointsMaterial({color:0xffeebb,size:0.08,transparent:true,opacity:0,sizeAttenuation:true,depthWrite:false,blending:THREE.AdditiveBlending});
const hwind=new THREE.Points(hwindGeo,hwindMat);
s.add(hwind);

// ===================== HUD(原版:时间/地形/准星/热浪) =====================
const hudStyle=document.createElement('style');
hudStyle.textContent=`
#desertTimeHud{position:fixed;top:92px;left:16px;z-index:10;pointer-events:none;display:flex;flex-direction:column;gap:4px}
#desertTimeHud .tt{color:rgba(255,240,200,0.9);font-size:13px;font-weight:700;letter-spacing:1px;text-shadow:0 1px 4px rgba(0,0,0,0.9)}
#desertTimeHud .tp{color:rgba(255,200,150,0.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;text-shadow:0 1px 4px rgba(0,0,0,0.9)}
#desertTimeHud .tb{width:100px;height:3px;background:rgba(255,220,150,0.1);border-radius:2px;overflow:hidden;margin-top:2px}
#desertTimeHud .tbf{height:100%;width:0%;background:rgba(255,220,150,0.8);border-radius:2px;transition:width 0.1s linear,background 0.3s}
#desertTerrainHud{position:fixed;top:170px;right:16px;z-index:10;pointer-events:none;text-align:right;display:flex;flex-direction:column;gap:2px}
#desertTerrainHud .tn{color:rgba(255,240,200,0.85);font-size:14px;font-weight:700;letter-spacing:2px;text-shadow:0 1px 4px rgba(0,0,0,0.9)}
#desertTerrainHud .te{color:rgba(255,200,150,0.5);font-size:11px;letter-spacing:1px;text-shadow:0 1px 4px rgba(0,0,0,0.9)}
#desertCross{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:20px;height:20px;z-index:5;pointer-events:none;opacity:0.5}
#desertCross::before{content:'';position:absolute;width:1px;height:20px;left:9.5px;top:0;background:rgba(255,240,200,0.5)}
#desertCross::after{content:'';position:absolute;width:20px;height:1px;left:0;top:9.5px;background:rgba(255,240,200,0.5)}
#desertCross .cd{position:absolute;width:3px;height:3px;background:#ffe4b5;border-radius:50%;left:8.5px;top:8.5px}
#heatShimmer{position:fixed;inset:0;z-index:3;pointer-events:none;background:radial-gradient(ellipse at 50% 80%,transparent 40%,rgba(255,160,60,0.03) 100%);animation:heatWave 3s ease-in-out infinite alternate}
@keyframes heatWave{from{opacity:0.3;transform:scaleY(1)}to{opacity:0.6;transform:scaleY(1.02)}}
.glide-pip{width:4px!important;height:14px!important;border-radius:2px!important;background:rgba(255,220,150,0.12)!important;transition:background 0.3s,box-shadow 0.3s}
.glide-pip.active{background:rgba(255,220,150,0.95)!important;box-shadow:0 0 8px rgba(255,200,100,0.4)!important}
.glide-pip.recharge{animation:pipPulse 0.8s ease-in-out infinite alternate}
@keyframes pipPulse{from{background:rgba(255,220,150,0.3)!important}to{background:rgba(255,220,150,0.7)!important}}
#jumpBtnGlide.gliding{background:rgba(255,248,220,0.95)!important;color:#4a3010!important;border-color:rgba(255,230,180,0.9)!important;box-shadow:0 0 20px rgba(255,200,100,0.35)!important}
`;
document.head.appendChild(hudStyle);
const timeHud=document.createElement('div');
timeHud.id='desertTimeHud';
timeHud.innerHTML='<div class="tt" id="dtText">12:00</div><div class="tp" id="dtPhase">DAY</div><div class="tb"><div class="tbf" id="dtBar"></div></div>';
document.body.appendChild(timeHud);
const terrainHud=document.createElement('div');
terrainHud.id='desertTerrainHud';
terrainHud.innerHTML='<div class="tn" id="dtName">戈壁</div><div class="te" id="dtElev">海拔 0m</div>';
document.body.appendChild(terrainHud);
const cross=document.createElement('div');
cross.id='desertCross';cross.innerHTML='<div class="cd"></div>';
document.body.appendChild(cross);
const shimmer=document.createElement('div');
shimmer.id='heatShimmer';
document.body.appendChild(shimmer);
const dtText=timeHud.querySelector('#dtText'),dtPhase=timeHud.querySelector('#dtPhase'),dtBar=timeHud.querySelector('#dtBar');
const dtName=terrainHud.querySelector('#dtName'),dtElev=terrainHud.querySelector('#dtElev');
function terrainType(h){
  if(h<-1)return'盐沼';if(h<0.5)return'湿沙';if(h<3)return'沙丘';if(h<7)return'戈壁';
  if(h<12)return'雅丹';if(h<20)return'岩崖';if(h<35)return'碎石坡';if(h<60)return'昆仑岩';
  if(h<90)return'雪线';return'昆仑巅';
}

// ===================== 沙漠日光(昼夜系统驱动) =====================
const sunL=new THREE.DirectionalLight('#fff8e7',1.8);
sunL.position.set(40,80,20);s.add(sunL);

// ===================== 更新 =====================
let lastPX=0,lastPZ=0,lastHudT=0;
function update(dt,time){
  updateChunks();
  waterU.uTime.value=time;
  if(ctx.player.pl){
    water.position.x+=(ctx.player.pl.p.x-water.position.x)*dt*2;
    water.position.z+=(ctx.player.pl.p.z-water.position.z)*dt*2;
    waterU.uOffset.value.set(water.position.x,water.position.z);
  }
  const bp=birdGeo.attributes.position.array;
  for(let i=0;i<BIRDS;i++){
    const d=birdData[i];d.a+=d.sp*dt*0.02;
    bp[i*3]=Math.cos(d.a)*d.r;
    bp[i*3+1]=d.y+Math.sin(time*d.ws)*1.5;
    bp[i*3+2]=Math.sin(d.a)*d.r;
  }
  birdGeo.attributes.position.needsUpdate=true;
  if(ctx.player.pl){
    const sp=sandGeo.attributes.position.array;
    for(let i=0;i<SAND;i++){
      sp[i*3]+=sandSp[i]*dt;
      sp[i*3+1]+=Math.sin(sp[i*3]*0.1)*0.5*dt;
      if(sp[i*3]>ctx.player.pl.p.x+200){
        sp[i*3]=ctx.player.pl.p.x-200;
        sp[i*3+1]=Math.random()*15;
        sp[i*3+2]=ctx.player.pl.p.z+(Math.random()-0.5)*400;
      }
    }
    sandGeo.attributes.position.needsUpdate=true;
    sandMat.opacity=getH(ctx.player.pl.p.x,ctx.player.pl.p.z)<8?0.2:0.08;
  }
  // 漂移云团(30Hz 节流,慢速云无视觉差别)
  cloudAcc+=dt;
  if(cloudAcc>0.033){
    const cp=cloudGeo.attributes.position.array;
    for(let i=0;i<CLOUDS;i++){
      cp[i*3]+=cloudVel[i].x*cloudAcc;
      cp[i*3+2]+=cloudVel[i].z*cloudAcc;
      if(Math.abs(cp[i*3])>250)cloudVel[i].x*=-1;
      if(Math.abs(cp[i*3+2])>250)cloudVel[i].z*=-1;
    }
    cloudGeo.attributes.position.needsUpdate=true;
    cloudAcc=0;
  }
  // 风行粒子:移动方向反吹,朝昆仑滑翔时变金色
  if(ctx.player.pl){
    const mvx=(ctx.player.pl.p.x-lastPX)/Math.max(dt,1e-4),mvz=(ctx.player.pl.p.z-lastPZ)/Math.max(dt,1e-4);
    const spd=Math.hypot(mvx,mvz);
    const ratio=Math.min(spd/3.2,1);
    const mdx=spd>0.01?mvx/spd:0,mdz=spd>0.01?mvz/spd:0;
    const wp=windGeo.attributes.position.array;
    const wv=windVel;
    for(let i=0;i<WIND;i++){
      windLife[i]-=dt*(0.5+ratio*0.8);
      if(windLife[i]<=0){
        windLife[i]=1;
        const a=Math.random()*Math.PI*2,ds=2+Math.random()*8;
        wp[i*3]=ctx.player.pl.p.x+Math.cos(a)*ds;
        wp[i*3+1]=ctx.player.pl.p.y+(Math.random()-0.5)*3;
        wp[i*3+2]=ctx.player.pl.p.z+Math.sin(a)*ds;
        const ws=4+ratio*15;
        wv[i*3]=-mdx*ws+(Math.random()-0.5)*3;
        wv[i*3+1]=(Math.random()-0.5)*1.5;
        wv[i*3+2]=-mdz*ws+(Math.random()-0.5)*3;
      }else{
        wp[i*3]+=wv[i*3]*dt;wp[i*3+1]+=wv[i*3+1]*dt;wp[i*3+2]+=wv[i*3+2]*dt;
      }
    }
    windGeo.attributes.position.needsUpdate=true;
    const gdx=KX-ctx.player.pl.p.x,gdz=KZ-ctx.player.pl.p.z,gdl=Math.hypot(gdx,gdz)||1;
    const dot=(-Math.sin(ctx.player.pl.y))*(gdx/gdl)+(-Math.cos(ctx.player.pl.y))*(gdz/gdl);
    if(dot>0.6&&ctx.player.pl.gliding){
      windMat.color.setHex(0xffee55);hwindMat.color.setHex(0xffee55);
      windMat.opacity=Math.min(ratio*0.6+dot*0.2,0.8);
    }else{
      windMat.color.setHex(0xffddaa);hwindMat.color.setHex(0xffeebb);
      windMat.opacity=Math.min(ratio*0.5,0.5);
    }
    // 滑翔迎风粒子
    if(ctx.player.pl.gliding&&ctx.scene.cam){
      hwindMat.opacity=Math.min(hwindMat.opacity+dt*2,0.35);
      const hp=hwindGeo.attributes.position.array;
      const yaw=ctx.player.pl.y,pitch=ctx.player.pl.pi;
      const fx=-Math.sin(yaw)*Math.cos(pitch),fy=Math.sin(pitch),fz=-Math.cos(yaw)*Math.cos(pitch);
      for(let i=0;i<HWIND;i++){
        const ds=3+Math.random()*12;
        hp[i*3]=ctx.scene.cam.position.x+fx*ds+(Math.random()-0.5)*6;
        hp[i*3+1]=ctx.scene.cam.position.y+fy*ds+(Math.random()-0.5)*6;
        hp[i*3+2]=ctx.scene.cam.position.z+fz*ds+(Math.random()-0.5)*6;
      }
      hwindGeo.attributes.position.needsUpdate=true;
    }else{
      hwindMat.opacity*=0.9;
    }
  }
  if(ctx.player.pl){lastPX=ctx.player.pl.p.x;lastPZ=ctx.player.pl.p.z;}
  beaconLight.intensity=3.5+Math.sin(time*2);
  const dp=dustGeo.attributes.position.array;
  for(let i=0;i<DUST;i++){
    dustAngle[i]+=dt*0.5;
    dp[i*3]=KX+Math.cos(dustAngle[i])*(5+Math.sin(time+i));
    dp[i*3+1]=peakY+6+Math.sin(time*1.5+i)*2;
    dp[i*3+2]=KZ+Math.sin(dustAngle[i])*(5+Math.cos(time+i));
  }
  dustGeo.attributes.position.needsUpdate=true;
  dustMat.opacity=0.5+Math.sin(time*2)*0.2;
  // 罗盘指针:相对朝向的昆仑方位角(针尖在红色端,故加 π 修正;曾与小地图反向 180°)
  if(ctx.player.pl){
    const dx=KX-ctx.player.pl.p.x,dz=KZ-ctx.player.pl.p.z;
    const front=-(dx*Math.sin(ctx.player.pl.y)+dz*Math.cos(ctx.player.pl.y));
    const right=dx*Math.cos(ctx.player.pl.y)-dz*Math.sin(ctx.player.pl.y);
    cpNeedle.style.transform='rotate('+(Math.atan2(right,front)+Math.PI)+'rad)';
  }
  // HUD:时间/相位/地形/海拔(降频 200ms)
  if(time-lastHudT>0.2){
    lastHudT=time;
    const hour=ctx.media.dayHour!==undefined?ctx.media.dayHour:12;
    const hh=Math.floor(hour),mm=Math.floor((hour-hh)*60);
    dtText.textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
    let ph='NIGHT';
    if(lastElev>0.65)ph='DAY';else if(lastElev>0.45)ph='DAWN';else if(lastElev>0.25)ph='SUNSET';
    dtPhase.textContent=ph;
    dtBar.style.width=(hour/24*100)+'%';
    dtBar.style.background=lastElev>0.6?'rgba(255,240,200,0.8)':lastElev>0.35?'rgba(255,140,80,0.9)':'rgba(100,80,150,0.8)';
    if(ctx.player.pl){
      const ev=Math.round(ctx.player.pl.p.y-1.6);
      dtElev.textContent='海拔 '+ev+'m';
      dtName.textContent=terrainType(ev);
    }
  }
}

// ===================== 实心山铁律(2026-07-27 主人定) =====================
// 昆仑与沙海是高度场——没有"山里面"可言,任何物体只允许摆在地表之上。
// 所有新增摆放(灵蕴/飞舟/信标/家具/彩蛋物)落地前必须过此校验:y 低于地表即视为"埋进山心",
// 直接报错并弹 toast,绝不静默放行。传送/摆放统一走 groundY/getH,禁止手写海拔。
function assertAboveGround(x,y,z,tag){
  const g=getH(x,z);
  if(y<g-0.3){
    const msg='[实心山铁律] '+(tag||'物体')+' 埋入地形:(x='+x.toFixed(1)+',y='+y.toFixed(1)+',z='+z.toFixed(1)+') 地表='+g.toFixed(1);
    console.error(msg);
    try{ctx.ui.modeToast&&ctx.ui.modeToast('摆放校验失败：'+ (tag||'物体') +' 埋进山心，已拦截');}catch(e){}
    return false;
  }
  return true;
}

ctx.media.desert={getH,update,sunL,kunlun:{x:KX,z:KZ},dayNight,assertAboveGround};
