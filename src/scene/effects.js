// effects.js — 3D烟花系统（四棱锥表面）+ 漂浮粒子
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
hotBegin('effects');
const {s,floorW,floorD,IL,IR,IRT,IRB,OT,OBR,WH,bW,bD,pyrHeight}=ctx;

// ============ 3D 烟花系统（四棱锥表面） ============
// 烟花粒子数据
const fwParticles=[]; // {x,y,z,vx,vy,vz,life,maxLife,size,color,gen}
const fwColors=[
  // 红橙黄
  '#ff0040','#ff3366','#ff5500','#ff7700','#ffaa00','#ffcc00','#ffee00',
  // 黄绿青
  '#aaff00','#66ff00','#00ff44','#00ff88','#00ffcc','#00ffff',
  // 青蓝紫
  '#0088ff','#0044ff','#1100ff','#4400ff','#7700ff','#aa00ff',
  // 紫红粉
  '#ff00ff','#ff00cc','#ff0099','#ff0066','#ff3399','#ff66cc',
  // 白金银
  '#ffffff','#fff8dc','#ffd700','#c0c0c0','#ff69b4','#00fa9a',
  // 霓虹色
  '#39ff14','#ff00ff','#00ffff','#ff1493','#7fff00','#ff4500'
];
let fwFrame=0;

// 四棱锥表面随机点生成（匹配建筑 36×40）
function randomPyramidPoint(){
  const face=Math.floor(Math.random()*4);
  const u=Math.random(),v=Math.random()*(1-u);
  const w2=bW/2,d2=bD/2,h=pyrHeight,cz=(OT+OBR)/2,by=WH;
  let x,y,z;
  // 顶点
  const vx=0,vy=by+h,vz=cz;
  if(face===0){      // 北面 z=-12 边：顶点 → (-18,5,-12) → (18,5,-12)
    x=-w2+(w2*2)*v; y=by+h*(1-u); z=cz-d2;
  }else if(face===1){// 东面 x=18 边：顶点 → (18,5,-12) → (18,5,28)
    x=w2;           y=by+h*(1-u); z=cz-d2+(d2*2)*v;
  }else if(face===2){// 南面 z=28 边：顶点 → (18,5,28) → (-18,5,28)
    x=w2-(w2*2)*v;  y=by+h*(1-u); z=cz+d2;
  }else{             // 西面 x=-18 边：顶点 → (-18,5,28) → (-18,5,-12)
    x=-w2;          y=by+h*(1-u); z=cz+d2-(d2*2)*v;
  }
  return{x:x,y:y,z:z};
}

// 创建烟花
function createFirework(originX,originY,originZ,generation=0){
  const count=generation===0?24:(generation===1?12:6);
  const speed=generation===0?3:(generation===1?2:1.2);
  const life=generation===0?60:(generation===1?45:30);
  const size=generation===0?2.5:(generation===1?1.8:1.2);
  const color=fwColors[Math.floor(Math.random()*fwColors.length)];
  const fwColRGB=new THREE.Color(color); // 创建时解析一次,更新循环不再分配
  for(let i=0;i<count;i++){
    const angle=(Math.PI*2/count)*i+Math.random()*0.5;
    const vel=Math.random()*speed+0.5;
    const pitch=(Math.random()-0.5)*Math.PI*0.5;
    fwParticles.push({
      x:originX,y:originY,z:originZ,
      vx:Math.cos(angle)*Math.cos(pitch)*vel,
      vy:Math.sin(pitch)*vel+1.5,
      vz:Math.sin(angle)*Math.cos(pitch)*vel,
      life:life+Math.random()*15,
      maxLife:life+15,
      size:size+Math.random()*0.5,
      cr:fwColRGB.r,cg:fwColRGB.g,cb:fwColRGB.b,
      gen:generation,
      hasSplit:false
    });
  }
}

// 烟花自动触发
function autoFirework(){
  const p=randomPyramidPoint();
  createFirework(p.x,p.y,p.z,0);
}
setInterval(autoFirework,2800);
setTimeout(autoFirework,800);

// 烟花Points渲染
const fwGeo=new THREE.BufferGeometry();
const fwPosArr=new Float32Array(3000*3);
const fwColArr=new Float32Array(3000*3);
const fwSizeArr=new Float32Array(3000);
fwGeo.setAttribute('position',new THREE.BufferAttribute(fwPosArr,3));
fwGeo.setAttribute('color',new THREE.BufferAttribute(fwColArr,3));
fwGeo.setAttribute('size',new THREE.BufferAttribute(fwSizeArr,1));
// 渲染材质:简单稳定的 PointsMaterial(发光叠加)
const fwPointsMat=new THREE.PointsMaterial({
  color:0xffffff,size:3,transparent:true,opacity:0.85,
  blending:THREE.AdditiveBlending,depthWrite:false,
  sizeAttenuation:true
});
const fwPoints=new THREE.Points(fwGeo,fwPointsMat);
s.add(fwPoints);

// 烟花更新（在an()中调用）
function updateFireworks(){
  fwFrame++;
  let idx=0;
  for(let i=fwParticles.length-1;i>=0;i--){
    const p=fwParticles[i];
    p.vx*=0.98;p.vy*=0.98;p.vz*=0.98;
    p.vy-=0.04;
    p.x+=p.vx;p.y+=p.vy;p.z+=p.vz;
    p.life--;
    const alpha=p.life/p.maxLife;
    if(p.life<=0){fwParticles.splice(i,1);continue;}
    // 分裂：线性增长，每轮只+1个子烟花
    if(p.life<=4&&!p.hasSplit&&p.gen<2){
      p.hasSplit=true;
      createFirework(p.x,p.y,p.z,p.gen+1);
    }
    if(idx<3000){
      fwPosArr[idx*3]=p.x;fwPosArr[idx*3+1]=p.y;fwPosArr[idx*3+2]=p.z;
      fwColArr[idx*3]=p.cr;fwColArr[idx*3+1]=p.cg;fwColArr[idx*3+2]=p.cb;
      fwSizeArr[idx]=p.size*alpha;
      idx++;
    }
  }
  fwGeo.attributes.position.needsUpdate=true;
  fwGeo.attributes.color.needsUpdate=true;
  fwGeo.attributes.size.needsUpdate=true;
  fwGeo.setDrawRange(0,idx);
}

// ===================== 粒子 =====================
const pG=new THREE.BufferGeometry(),pC=400,pPs=new Float32Array(pC*3);
for(let i=0;i<pC;i++){
  let px,pz,ok=false;
  for(let t=0;t<30;t++){
    px=(Math.random()-0.5)*floorW;pz=(Math.random()-0.5)*floorD;
    // 不在内禁区
    const inInner=px>=IL-0.5&&px<=IR+0.5&&pz>=IRT-0.5&&pz<=IRB+0.5;
    if(!inInner){ok=true;break;}
  }
  if(!ok){px=0;pz=OT+2;}
  pPs[i*3]=px;pPs[i*3+1]=0.5+Math.random()*(WH-0.5);pPs[i*3+2]=pz;
}
pG.setAttribute('position',new THREE.BufferAttribute(pPs,3));
s.add(new THREE.Points(pG,new THREE.PointsMaterial({color:'#ffb6c8',size:0.035,transparent:true,opacity:0.4,depthWrite:false,sizeAttenuation:true,blending:THREE.AdditiveBlending})));

Object.assign(ctx.media,{updateFireworks,pG,pC});

hotEnd('effects');
if(import.meta.hot)import.meta.hot.accept();
