// signs.js — 户外3D牌子 + 户外白板入口 + 悬浮音乐播放器入口
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
import { canvasTexture } from '../shared/canvas-texture.js';
hotBegin('signs');
const {s,iG,tL,OR,OT,OBR,onTick}=ctx;

// ============ 户外3D牌子(AI智能 + 元素共鸣准则,并排立于出生点旁) ============
// 正反两面都正:背面加一个旋转180°的同材质面板,从两边看文字都正立(双面单面板背面是镜像)
function upright2(mesh){
  mesh.material.side=THREE.FrontSide;
  const back=new THREE.Mesh(mesh.geometry,mesh.material);
  back.rotation.y=Math.PI;
  mesh.add(back);
}
function makeSign(title,sub,footer,accent){
  // 画布样板统一在 shared/canvas-texture.js(B1 整改):只保留绘制逻辑
  const tex=canvasTexture(512,768,(cx)=>{
  const g=cx.createLinearGradient(0,0,0,768);
  g.addColorStop(0,'#2a1030');g.addColorStop(1,'#1a0a20');
  cx.fillStyle=g;cx.fillRect(0,0,512,768);
  cx.strokeStyle=accent;cx.lineWidth=6;cx.strokeRect(8,8,496,752);
  cx.fillStyle=accent;cx.fillRect(40,60,432,4);
  cx.textAlign='center';
  // 横排大字,版面集中在上半部(牌柱穿过下半部,不挡字)
  cx.fillStyle='#ffe9f0';
  cx.font='bold '+([...title].length<=4?84:64)+'px serif';
  cx.fillText(title,256,210);
  cx.fillStyle='rgba(255,200,220,0.65)';cx.font='28px sans-serif';
  cx.fillText(sub,256,320);
  cx.fillStyle='rgba(255,150,200,0.4)';cx.fillRect(60,380,392,2);
  cx.fillStyle='rgba(255,180,200,0.45)';cx.font='18px sans-serif';
  cx.fillText(footer,256,430);
  // 下半部留装饰纹,柱位无重要内容
  cx.strokeStyle='rgba(255,150,200,0.18)';cx.lineWidth=2;
  for(let i=0;i<3;i++){cx.beginPath();cx.arc(256,590,40+i*28,0,Math.PI*2);cx.stroke();}
  });
  const mat=new THREE.MeshStandardMaterial({map:tex,emissive:'#ff6699',emissiveIntensity:0.15,roughness:0.4,metalness:0.1,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2.8,4.2),mat);
  const post=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,2.8),new THREE.MeshStandardMaterial({color:'#5a3a2a',roughness:0.8,metalness:0.2}));
  const base=new THREE.Mesh(new THREE.BoxGeometry(1,0.12,1),new THREE.MeshStandardMaterial({color:'#4a3525',roughness:0.7,metalness:0.3}));
  upright2(mesh);
  return {mesh,post,base,mat};
}
// 牌子1:AI智能(原 AI 页跳转)
const sign1=makeSign('AI智能','点 击 进 入','DREAM GALLERY · AI','rgba(255,150,200,0.5)');
const signMesh=sign1.mesh,signMat=sign1.mat;
signMesh.position.set(OR+5,2.8,(OT+OBR)/2-1.8);signMesh.rotation.y=-Math.PI/2;
signMesh.userData={isSign:true};s.add(signMesh);
sign1.post.position.set(OR+5,1.4,(OT+OBR)/2-1.8);s.add(sign1.post);
sign1.base.position.set(OR+5,0.06,(OT+OBR)/2-1.8);s.add(sign1.base);
// 牌子2:元素共鸣准则(用户说明书,点击开 guide.html)
const sign2=makeSign('元素共鸣准则','访 客 说 明 书','DREAM GALLERY · GUIDE','rgba(200,170,255,0.55)');
sign2.mesh.position.set(OR+5,2.8,(OT+OBR)/2+1.8);sign2.mesh.rotation.y=-Math.PI/2;
sign2.mesh.userData={isGuide:true};s.add(sign2.mesh);
sign2.post.position.set(OR+5,1.4,(OT+OBR)/2+1.8);s.add(sign2.post);
sign2.base.position.set(OR+5,0.06,(OT+OBR)/2+1.8);s.add(sign2.base);
const signLight=new THREE.PointLight('#ff88aa',3,10,1.5);
signLight.position.set(OR+3.5,4.5,(OT+OBR)/2);s.add(signLight);
// 牌子已创建，iG.push放在iG数组创建之后

// ============ 户外白板 ============
const wbC=document.createElement('canvas');wbC.width=512;wbC.height=256;
const wbX=wbC.getContext('2d');
wbX.fillStyle='#fff8e6';wbX.fillRect(0,0,512,256);
wbX.strokeStyle='#f0a500';wbX.lineWidth=10;wbX.strokeRect(5,5,502,246);
wbX.fillStyle='#e07b00';wbX.font='bold 46px sans-serif';wbX.textAlign='center';
wbX.fillText('\u270f\ufe0f 这里是希沃白板',256,110);
wbX.fillStyle='#d4380d';wbX.font='bold 34px sans-serif';
wbX.fillText('点 开 即 开',256,180);
wbX.fillStyle='#999';wbX.font='18px sans-serif';
wbX.fillText('画完点保存,作品自动上展示墙',256,222);
const wbT=new THREE.CanvasTexture(wbC);
// 黄色立方体(本体,替代原来的平面)
const wbCubeMat=new THREE.MeshStandardMaterial({color:'#ffd700',roughness:0.5,metalness:0.2});
const wb=new THREE.Mesh(new THREE.BoxGeometry(6,1.2,3),wbCubeMat);
wb.position.set(0,0.6,42);
s.add(wb);wb.userData={isWB:true};
// 顶面文字贴图
const wbLabel=new THREE.Mesh(new THREE.PlaneGeometry(5.8,2.8),new THREE.MeshBasicMaterial({map:wbT}));
wbLabel.rotation.x=-Math.PI/2;wbLabel.position.set(0,1.21,42);
s.add(wbLabel);
// 玩家碰撞:立方体不可穿行
if(ctx.scene.bounds)ctx.scene.bounds.push({mnX:-3,mxX:3,mnZ:40.5,mxZ:43.5});
// 使用说明牌(立在立方体旁,面向玩家来向)
const guideC=document.createElement('canvas');guideC.width=512;guideC.height=384;
const gx=guideC.getContext('2d');
gx.fillStyle='rgba(20,12,18,0.92)';gx.fillRect(0,0,512,384);
gx.strokeStyle='#f0c040';gx.lineWidth=6;gx.strokeRect(8,8,496,368);
gx.fillStyle='#feca57';gx.font='bold 40px sans-serif';gx.textAlign='center';
gx.fillText('希沃白板 · 使用说明',256,60);
gx.fillStyle='#fff';gx.font='26px sans-serif';gx.textAlign='left';
const steps=['1. 走近这个黄色立方体','2. 点击它,打开白板页面','3. 点「颜色」挑选喜欢的颜色','4. 尽情涂鸦创作','5. 点「保存」,作品自动挂上','   身后的展示墙给大家看'];
steps.forEach((t,i)=>gx.fillText(t,48,125+i*42));
const guideT=new THREE.CanvasTexture(guideC);guideT.colorSpace=THREE.SRGBColorSpace;
const guide=new THREE.Mesh(new THREE.PlaneGeometry(3,2.25),new THREE.MeshBasicMaterial({map:guideT,side:THREE.DoubleSide}));
guide.position.set(4.2,1.7,41.5);guide.rotation.y=-Math.PI/6;s.add(guide);
upright2(guide); // 背面也正立可读
// 呼吸光圈标记(引人注目)
const wbRing=new THREE.Mesh(
  new THREE.RingGeometry(3.8,4.1,48),
  new THREE.MeshBasicMaterial({color:0xffc53d,transparent:true,opacity:0.6,side:THREE.DoubleSide})
);
wbRing.rotation.x=-Math.PI/2;wbRing.position.set(0,0.06,42);s.add(wbRing);
// 呼吸光圈动画
onTick(function(){
  const t=performance.now()*0.003;
  const sc=1+Math.sin(t)*0.08;
  wbRing.scale.set(sc,sc,1);
  wbRing.material.opacity=0.45+Math.sin(t)*0.2;
});

// ============ 悬浮音乐播放器入口 ============
const mpCv=document.createElement('canvas');mpCv.width=512;mpCv.height=256;
const mpCx=mpCv.getContext('2d');
const mpG=mpCx.createLinearGradient(0,0,512,256);
mpG.addColorStop(0,'rgba(30,12,22,0.95)');mpG.addColorStop(1,'rgba(50,20,40,0.95)');
mpCx.fillStyle=mpG;mpCx.fillRect(0,0,512,256);
mpCx.strokeStyle='rgba(255,107,107,0.5)';mpCx.lineWidth=4;
mpCx.beginPath();mpCx.roundRect(8,8,496,240,16);mpCx.stroke();
mpCx.fillStyle='#ff6b6b';mpCx.font='bold 72px serif';mpCx.textAlign='center';
mpCx.fillText('\u266b',128,150);
mpCx.fillStyle='#feca57';mpCx.font='bold 32px sans-serif';
mpCx.fillText('\u97f3\u4e50\u64ad\u653e\u5668',320,110);
mpCx.fillStyle='rgba(255,255,255,0.6)';mpCx.font='18px sans-serif';
mpCx.fillText('\u70b9\u51fb\u641c\u7d22\u7545\u542c',320,150);
mpCx.fillStyle='rgba(255,255,255,0.4)';mpCx.font='14px sans-serif';
mpCx.fillText('JKAPI \u652f\u6301',320,185);
const mpTex=new THREE.CanvasTexture(mpCv);
const mpMat=new THREE.MeshStandardMaterial({map:mpTex,emissive:'#ff6b6b',emissiveIntensity:0.15,roughness:0.4,metalness:0.1,side:THREE.DoubleSide,transparent:true});
const mpMesh=new THREE.Mesh(new THREE.PlaneGeometry(3,1.5),mpMat);
mpMesh.position.set(0,3.2,5.8);mpMesh.rotation.y=Math.PI; // facing south (entrance)
s.add(mpMesh);
// 浮动动画
let mpT=0;
function floatMP(){mpT+=0.015;mpMesh.position.y=3.2+Math.sin(mpT)*0.1;}
onTick(floatMP);
// 粉色点光源
const mpLight=new THREE.PointLight('#ff6b6b',2,6,1.5);
mpLight.position.set(0,3.2,5.5);s.add(mpLight);
mpMesh.userData={isMusic:true};
// iG.push(mpMesh) 在 iG 数组创建之后

Object.assign(ctx.media,{signMesh,signMat,wb,mpMesh,mpMat,guideMesh:sign2.mesh});

hotEnd('signs');
if(import.meta.hot)import.meta.hot.accept();
