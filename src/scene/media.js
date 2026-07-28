// media.js — 2D音乐演奏器（地板Canvas）+ 北墙视频墙(三视频切换) + 第4/5视频系统 + HTML5背景音乐
import * as THREE from 'three';
import {ctx} from '../ctx.js';
const {s,cam,ray,mP2,bW,bD,OT,OBR,aB,onTick}=ctx;

// ============ 2D 音乐演奏器（棕色地板表面） ============
// 创建与地板对齐的Canvas纹理
const mcCanvas=document.createElement('canvas');
mcCanvas.width=1024;mcCanvas.height=1024;
const mcCtx=mcCanvas.getContext('2d');
mcCtx.clearRect(0,0,1024,1024);
const mcTex=new THREE.CanvasTexture(mcCanvas);
mcTex.minFilter=THREE.LinearFilter;
const mcPlaneMat=new THREE.MeshBasicMaterial({
  map:mcTex,transparent:true,opacity:1.0,
  depthWrite:false,blending:THREE.AdditiveBlending
});
const mcPlane=new THREE.Mesh(new THREE.PlaneGeometry(bW*0.97,bD*0.97),mcPlaneMat); // 占室内地板97%
mcPlane.rotation.x=-Math.PI/2;
mcPlane.position.y=0.04;
mcPlane.position.z=(OT+OBR)/2;
s.add(mcPlane);

// 音乐演奏器状态
let mxCtx=null,mxGain=null,mxAnalyser=null,mxReverb=null;
let musicActive=false,mxNotes=new Map();
const PENTA_C=[0,2,4,7,9];
let mxQuantize=true,mxRoot=48;

function initMusicAudio(){
  if(mxCtx)return;
  mxCtx=new(window.AudioContext||window.webkitAudioContext)();
  mxGain=mxCtx.createGain();mxGain.gain.value=0.3;
  mxAnalyser=mxCtx.createAnalyser();mxAnalyser.fftSize=2048;
  mxReverb=createMusicReverb();
  mxGain.connect(mxReverb);mxReverb.connect(mxAnalyser);mxAnalyser.connect(mxCtx.destination);
}
function createMusicReverb(){
  const len=mxCtx.sampleRate*1.5;
  const impulse=mxCtx.createBuffer(2,len,mxCtx.sampleRate);
  for(let c=0;c<2;c++){const ch=impulse.getChannelData(c);for(let i=0;i<len;i++){ch[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.5);}}
  const conv=mxCtx.createConvolver();conv.buffer=impulse;
  const dry=mxCtx.createGain();dry.gain.value=0.6;
  const wet=mxCtx.createGain();wet.gain.value=0.4;
  const out=mxCtx.createGain();
  out.connect(dry);out.connect(wet);wet.connect(conv);conv.connect(out);
  dry.connect(out);return out;
}
function quantizeNote(freq){
  if(!mxQuantize)return freq;
  const note=Math.round(69+12*Math.log2(freq/440));
  const oct=Math.floor((note-mxRoot)/12)*12+mxRoot;
  const deg=(note-oct+12)%12;
  let closest=0,minD=99;
  for(const s of PENTA_C){const d=Math.abs(s-deg);if(d<minD){minD=d;closest=s;}}
  return 440*Math.pow(2,(oct+closest-69)/12);
}
function getNoteName(f){const n=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return n[(Math.round(69+12*Math.log2(f/440))%12+12)%12];}
function startMusicNote(ux,uy){
  initMusicAudio();
  const freq=quantizeNote(130.81*Math.pow(2,ux*4));
  const vol=Math.max(0.1,1-uy);
  const osc=mxCtx.createOscillator();
  const g=mxCtx.createGain();
  const f2=mxCtx.createOscillator();const g2=mxCtx.createGain();
  osc.type='sine';osc.frequency.value=freq;
  f2.type='sine';f2.frequency.value=freq*2;g2.gain.value=0.15;
  g.gain.value=0;g.gain.linearRampToValueAtTime(vol,mxCtx.currentTime+0.02);
  osc.connect(g);f2.connect(g2);g2.connect(g);g.connect(mxGain);
  osc.start();f2.start();
  const id=Date.now()+Math.random();
  mxNotes.set(id,{osc,f2,g,vol,freq,ux,uy,t:Date.now()});
  musicActive=true;
  return id;
}
function updateMusicNote(id,ux,uy){
  const v=mxNotes.get(id);if(!v)return;
  v.freq=quantizeNote(130.81*Math.pow(2,ux*4));
  v.vol=Math.max(0.1,1-uy);
  v.osc.frequency.setTargetAtTime(v.freq,mxCtx.currentTime,0.05);
  v.f2.frequency.setTargetAtTime(v.freq*2,mxCtx.currentTime,0.05);
  v.g.gain.setTargetAtTime(v.vol*0.3,mxCtx.currentTime,0.03);
  v.ux=ux;v.uy=uy;
}
function stopMusicNote(id){
  const v=mxNotes.get(id);if(!v)return;
  v.g.gain.linearRampToValueAtTime(0,mxCtx.currentTime+0.3);
  setTimeout(()=>{try{v.osc.stop();v.f2.stop();}catch(e){}},350);
  mxNotes.delete(id);
  if(mxNotes.size===0)musicActive=false;
}

// 绘制音乐网格到Canvas
let mxHueShift=0;
let mxIdleFrames=0; // 空闲帧计数:音符消失后再画60帧让尾迹淡出,之后停绘
let mxFFT=null;     // 频谱数组复用,避免每帧分配
function drawMusicCanvas(){
  // 空闲(无活跃音符且未播放)时,尾迹淡出后停止重绘,省掉每帧 1024² 纹理上传
  if(mxNotes.size===0&&!musicActive){
    if(mxIdleFrames>60)return;
    mxIdleFrames++;
  }else mxIdleFrames=0;
  const W=1024,H=1024,c=mcCtx;
  c.fillStyle='rgba(0,0,0,0.08)';c.fillRect(0,0,W,H);
  mxHueShift+=0.3;
  // 音高网格线
  for(let i=0;i<=24;i++){
    const y=H*(i/24);
    c.strokeStyle=`hsla(${(i*15+mxHueShift)%360},60%,50%,0.15)`;
    c.lineWidth=1;c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();
  }
  // 活跃音符
  mxNotes.forEach((v,k)=>{
    const x=v.ux*W,y=v.uy*H;
    const hue=(Math.log2(v.freq/130.81)*30+mxHueShift)%360;
    // 外圈
    c.beginPath();c.arc(x,y,18+Math.sin(Date.now()*0.005+k)*3,0,Math.PI*2);
    const g=c.createRadialGradient(x,y,0,x,y,25);
    g.addColorStop(0,`hsla(${hue},80%,70%,0.6)`);
    g.addColorStop(1,`hsla(${hue},80%,50%,0)`);
    c.fillStyle=g;c.fill();
    // 内亮点
    c.beginPath();c.arc(x,y,6,0,Math.PI*2);
    c.fillStyle=`hsla(${hue},90%,85%,0.9)`;c.fill();
    // 音名
    c.fillStyle=`hsla(${hue},70%,80%,0.8)`;
    c.font='14px sans-serif';c.textAlign='center';
    c.fillText(getNoteName(v.freq),x,y-22);
  });
  // 底部频谱条
  if(musicActive&&mxAnalyser){
    if(!mxFFT)mxFFT=new Uint8Array(mxAnalyser.frequencyBinCount);
    const data=mxFFT;
    mxAnalyser.getByteFrequencyData(data);
    const barW=W/64;
    for(let i=0;i<64;i++){
      const h=(data[i*4]/255)*80;
      const hue=(i*5+mxHueShift)%360;
      c.fillStyle=`hsla(${hue},70%,60%,0.4)`;
      c.fillRect(i*barW,H-h,barW-2,h);
    }
  }
  mcTex.needsUpdate=true;
}

// 点击音乐平面
const mxTouches=new Map();
function onMusicClick(cx,cy,isStart){
  if(!mcPlane)return;
  mP2.x=(cx/innerWidth)*2-1;mP2.y=-(cy/innerHeight)*2+1;
  ray.setFromCamera(mP2,cam);
  const hits=ray.intersectObject(mcPlane);
  if(hits.length===0)return false;
  const uv=hits[0].uv;
  const ux=uv.x,uy=1-uv.y;
  if(isStart){
    const id=startMusicNote(ux,uy);
    mxTouches.set(cx+'_'+cy,id);
    // 昆仑灵鉴:首次奏响地板,昆仑开口(一次性)
    if(!onMusicClick.greeted){onMusicClick.greeted=true;ctx.ui.modeToast&&ctx.ui.modeToast('昆仑会唱歌。你听到了吗？');}
    return id; // 返回音符 id(真值),调用方可直接跟踪
  }else{
    // move
    mxNotes.forEach((v,k)=>{
      if(Math.abs(v.ux-ux)<0.1&&Math.abs(v.uy-uy)<0.1){
        updateMusicNote(k,ux,uy);
      }
    });
  }
  return true;
}
function onMusicUp(cx,cy){
  const key=cx+'_'+cy;
  const id=mxTouches.get(key);
  if(id){stopMusicNote(id);mxTouches.delete(key);}
  // 停止所有
  mxNotes.forEach((v,k)=>stopMusicNote(k));
  mxTouches.clear();
}

// 绑定到现有事件系统
// 在音乐平面区域内拦截触摸
document.addEventListener('touchstart',e=>{
  for(let i=0;i<e.changedTouches.length;i++){
    const t=e.changedTouches[i];
    if(onMusicClick(t.clientX,t.clientY,true)){
      // 在音乐平面上，不传播
    }
  }
},{passive:false,capture:true});
document.addEventListener('touchmove',e=>{
  for(let i=0;i<e.changedTouches.length;i++){
    const t=e.changedTouches[i];
    onMusicClick(t.clientX,t.clientY,false);
  }
},{passive:false});
document.addEventListener('touchend',e=>{
  for(let i=0;i<e.changedTouches.length;i++){
    const t=e.changedTouches[i];
    onMusicUp(t.clientX,t.clientY);
  }
});

// 鼠标支持(电脑):与触摸共用命中逻辑,音符 id 直接跟踪,避免抬手位置不匹配
// capture 阶段拦截:命中音乐地板时 stopPropagation,防止误触发视角拖拽
let mxMouseId=null;
document.addEventListener('mousedown',e=>{
  if(e.button!==0||('ontouchstart'in window))return;
  const id=onMusicClick(e.clientX,e.clientY,true);
  if(id){mxMouseId=id;e.stopPropagation();}
},true);
document.addEventListener('mousemove',e=>{
  if(mxMouseId!==null)onMusicClick(e.clientX,e.clientY,false);
});
document.addEventListener('mouseup',()=>{
  if(mxMouseId!==null){stopMusicNote(mxMouseId);mxMouseId=null;}
});

// ============ 北墙巨型视频墙 ============
// ========== 三视频切换系统 ==========
// 视频1(60x90): 位置(67.51,46.60,15.97) 播3遍→隐藏
// 视频2(150x90): 同位置 scale.x=2.5 播2遍→隐藏
// 视频3(60x90): 位置(-0.67,46.60,99.99) 播1遍→隐藏→全部结束
// 视频源走 Cloudflare R2 CDN(2026-07-26):根治跨省跨网单流卡顿;源站 videos/ 保留作备份
// 自定义域名已接入 Cloudflare 缓存;R2 直链备用:https://pub-1ab4318b6e184ff98597845fca221764.r2.dev/
const CDN='https://cdn.cloudbear.cloud/';
const vidSources=[CDN+'videos/户外大屏/户外大屏1号.mp4',CDN+'videos/户外大屏/户外大屏2号.mp4',CDN+'videos/户外大屏/hls/户外大屏3号.m3u8'];
// HLS 支持(2026-07-25):3 号长视频切片播放,起播快、可拖进度;hls.js 按需异步加载(不进主包)
// CDN→源站自动回退(2026-07-26):CDN 取流失败时剥掉 CDN 前缀,同源站相对路径继续播,保证永远有视频
function cdnToOrigin(url){return url.startsWith(CDN)?url.slice(CDN.length):url;}
function addCdnFallback(el){
  el.addEventListener('error',()=>{
    const cur=el.currentSrc||el.src||'';
    if(cur.startsWith(CDN)){
      console.warn('[media] CDN 加载失败,回退源站:',cur);
      el.src=cdnToOrigin(cur);el.load();playWhenReady(el);
    }
  });
}
let hlsInst=null;
async function setVidSrc(el,src){
  if(hlsInst){hlsInst.destroy();hlsInst=null;}
  if(/\.m3u8$/.test(src)){
    try{
      const {default:Hls}=await import('hls.js');
      if(Hls.isSupported()){
        hlsInst=new Hls({enableWorker:true});
        hlsInst.on(Hls.Events.ERROR,(ev,data)=>{
          if(data&&data.fatal){
            try{hlsInst.destroy();}catch(e){}
            hlsInst=null;
            console.warn('[media] HLS 失败,回退源站整段 mp4');
            el.src=cdnToOrigin(src).replace('hls/户外大屏3号.m3u8','户外大屏3号.mp4');
            el.load();playWhenReady(el);
          }
        });
        hlsInst.loadSource(src);
        hlsInst.attachMedia(el);
        return;
      }
    }catch(e){}
    // Safari 原生 HLS
    if(el.canPlayType('application/vnd.apple.mpegurl')){el.src=src;return;}
    // 都不行 → 回退整段 mp4
    el.src=src.replace('hls/户外大屏3号.m3u8','户外大屏3号.mp4');
    return;
  }
  el.src=src;
}
// 播放序列(2026-07-26 主人定):普通模式全线下架大屏 2 号(只播 1/3/4/5),特殊模式完整五个
// 清单在 startVidSeq 时按 ctx.mode.siteMode 现取;模式切换从下一轮循环生效
const VID_ALL=[
  {src:CDN+'videos/户外大屏/户外大屏1号.mp4',x:67.51,y:46.60,z:15.97,sx:2.5,mesh3:false,plays:1},
  {src:CDN+'videos/户外大屏/户外大屏2号.mp4',x:67.51,y:46.60,z:15.97,sx:2.5,mesh3:false,plays:2},
  {src:CDN+'videos/户外大屏/hls/户外大屏3号.m3u8',x:-0.67,y:46.60,z:99.99,sx:1,mesh3:true,plays:1},
];
let playlist=VID_ALL;
let currentVidIdx=0;
let vidPlayCount=0;

const vidEl=document.createElement('video');
vidEl.src=vidSources[0];
vidEl.loop=false;
vidEl.crossOrigin='anonymous';
vidEl.playsInline=true;
vidEl.setAttribute('webkit-playsinline','true');
vidEl.preload='auto';
addCdnFallback(vidEl);

const vidTex=new THREE.VideoTexture(vidEl);
vidTex.colorSpace=THREE.SRGBColorSpace;

const vidMat=new THREE.MeshBasicMaterial({map:vidTex,side:THREE.FrontSide,toneMapped:false});
// 正反两面都正:背面各加一个旋转180°的同纹理面板,两边看都是正立画面
function vidUpright2(mesh){
  const back=new THREE.Mesh(mesh.geometry,vidMat);
  back.rotation.y=Math.PI;
  mesh.add(back);
}
// Mesh for video1&2: vertical (facing east)
const vidMesh=new THREE.Mesh(new THREE.PlaneGeometry(60,90),vidMat);
vidMesh.position.set(67.51,46.60,15.97);
vidMesh.rotation.y=Math.PI*1.5;
// Mesh for video3: horizontal (facing north, along x-axis)
const vidMesh3=new THREE.Mesh(new THREE.PlaneGeometry(60,90),vidMat);
vidMesh3.position.set(-0.67,46.60,99.99);
vidMesh3.rotation.y=Math.PI; // 水平展开,面朝北(-z),绕y轴旋转180度
vidMesh3.scale.x=2.8; // x方向(红线)扩大2.8倍
vidMesh3.visible=false;
vidUpright2(vidMesh);
vidUpright2(vidMesh3);
// 视频标记星
const starG=new THREE.OctahedronGeometry(1.5,0);
const starM=new THREE.MeshStandardMaterial({color:'#ffd700',emissive:'#ffaa00',emissiveIntensity:3,transparent:true,opacity:0.9});
const starMesh=new THREE.Mesh(starG,starM);
starMesh.position.set(67.51,56.60,35.97);
s.add(starMesh);
const starL=new THREE.PointLight('#ffd700',6,20,1.5);
starL.position.set(67.51,56.60,35.97);s.add(starL);
onTick(function(){starMesh.rotation.y+=0.02;starMesh.rotation.x+=0.01;});
s.add(vidMesh);
s.add(vidMesh3);

// 粉色氛围灯
const vL1=new THREE.PointLight('#ff69b4',8,30,1.5);vL1.position.set(67.51,90.60,16.47);s.add(vL1);
const vL2=new THREE.PointLight('#ff69b4',8,30,1.5);vL2.position.set(67.51,2.60,16.47);s.add(vL2);

vidMesh.userData={isVideoWall:true};

// 顺序播放:视频1×1 → 视频2×2 → 视频3×1 → 视频4×1 → 视频5×2 → 循环重播(无暂停)
// 缓冲门:余粮不足时先缓冲再播,把"PPT式卡顿"换成"缓冲后一播到底"
// 起播门槛 6 秒:曾要求 25%(2/3 号长视频要 51s),Chrome 前瞻缓冲到不了那么多 →
// 视频间切换长时间 paused 干等像卡死(2026-07-24 实测 rs=3 但永远不开播)
function playWhenReady(el){
  (function chk(){
    // 昆仑巅彩蛋期间(peaks.js):大屏循环整体挂起,不加载不起播
    if(ctx.media.bigScreenHold){setTimeout(chk,500);return;}
    let b=0;
    try{if(el.buffered&&el.buffered.length)b=el.buffered.end(el.buffered.length-1);}catch(e){}
    const dur=el.duration||0;
    const need=dur?Math.min(dur,6):4;
    if(el.readyState>=4||b>=need){
      // 入场即尝试有声播放(2026-07-25 主人定);浏览器自动播放策略拦截则退回静音先播
      el.play().catch(function(){
        if(!el.muted){el.muted=true;el.play().catch(function(){});}
      });
    }
    else setTimeout(chk,500);
  })();
}
let vidStarted=false;
function startVidSeq(){
  playlist=ctx.mode.siteMode==='special'?VID_ALL:VID_ALL.filter(v=>!v.src.includes('户外大屏2号')); // 普通模式下架 2 号
  currentVidIdx=0;vidPlayCount=0;
  const it=playlist[0];
  setVidSrc(vidEl,it.src);vidEl.load();
  vidMesh.visible=!it.mesh3;vidMesh3.visible=it.mesh3;
  if(!it.mesh3){vidMesh.position.set(it.x,it.y,it.z);vidMesh.scale.set(it.sx,1,1);}
  // 入场即有声(2026-07-25 主人定):不再等首次交互;被自动播放策略拦截时 playWhenReady 自动退回静音
  vidStarted=true;
  vidEl.muted=false;vidEl.volume=0.5;
  playWhenReady(vidEl);
}

// 播放次数追踪
// 注:本文件中 video.play() 的 .catch(function(){}) 是有意静默——
// 浏览器自动播放策略在用户首次交互前会正常拒绝播放,属于预期行为,无需记录。
vidEl.addEventListener('ended',function(){
  // 协议三连读未签完=未真正进展厅(2026-07-27 主人定):只循环第一个视频,不推进轮播;
  // 签完后 community.html 会重载父页,会话标记齐 → 从 1 号开始正常完整轮播
  if(!(sessionStorage.getItem('agreementConsented')&&sessionStorage.getItem('privacyConsented')&&sessionStorage.getItem('communityConsented'))){
    vidEl.currentTime=0;vidEl.play().catch(function(){});
    return;
  }
  vidPlayCount++;
  if(vidPlayCount<playlist[currentVidIdx].plays){
    vidEl.currentTime=0;
    vidEl.play().catch(function(){});
  }else{
    vidPlayCount=0;
    currentVidIdx++;
    if(currentVidIdx<playlist.length){
      // 切换到下一个视频
      vidEl.muted=true;
      vidMesh.visible=false;
      vidMesh3.visible=false;
      vidEl.pause();
      var it=playlist[currentVidIdx];
      setVidSrc(vidEl,it.src);
      vidEl.load();
      setTimeout(function(){
        if(it.mesh3){
          // 视频3: 使用vidMesh3(水平展开,面朝北,scale.x=2.8)
          vidMesh3.visible=true;
          vidMesh.visible=false;
        }else{
          // 其余: 使用vidMesh(垂直)
          vidMesh.position.set(it.x,it.y,it.z);
          vidMesh.scale.set(it.sx,1,1);
          vidMesh.visible=true;
          vidMesh3.visible=false;
        }
        if(vidStarted){vidEl.muted=false;vidEl.volume=0.5;}else{vidEl.muted=true;}
        playWhenReady(vidEl);
        // 移动氛围灯到新位置
        vL1.position.set(it.x,it.y+44,it.z+0.5);
        vL2.position.set(it.x,it.y-44,it.z+0.5);
      },300);
    }else{
      // 前三个视频全部结束 → 启动视频4和5
      vidEl.muted=true;
      vidMesh.visible=false;
      vidMesh3.visible=false;
      vidEl.pause();
      startVideo45();
    }
  }
});

// ========== 第4、5视频系统（在建筑北面 -z 处，面朝南 +z）==========
const v45Sources=[CDN+'videos/户外大屏/户外大屏4号.mp4',CDN+'videos/户外大屏/户外大屏5号.mp4'];
const v45Targets=[1,2]; // 视频4播1遍,视频5播2遍
let v45Idx=0;
let v45Count=0;

const v45El=document.createElement('video');
v45El.src=v45Sources[0];
v45El.loop=false;
v45El.crossOrigin='anonymous';
v45El.playsInline=true;
v45El.setAttribute('webkit-playsinline','true');
v45El.preload='none'; // 不预载:前三个视频播完前不缓冲4/5号,省内存和带宽(播放时再加载)
addCdnFallback(v45El);

const v45Tex=new THREE.VideoTexture(v45El);
v45Tex.colorSpace=THREE.SRGBColorSpace;

const v45Mat=new THREE.MeshBasicMaterial({map:v45Tex,side:THREE.FrontSide,toneMapped:false});
// 底边中心点(0.58,1.60,-100.02), y=1.60+45=46.60, 面朝南(+z)
const v45Mesh=new THREE.Mesh(new THREE.PlaneGeometry(60,90),v45Mat);
v45Mesh.position.set(0.58,46.60,-100.02);
v45Mesh.rotation.y=0; // 面朝南(+z),面向建筑物
v45Mesh.scale.x=2.5; // 宽度×2.5,高度不变(2026-07-25 主人定:视频4同视频1/2宽幅)
v45Mesh.visible=false;
// 背面也正立
(function(){const back=new THREE.Mesh(v45Mesh.geometry,v45Mat);back.rotation.y=Math.PI;v45Mesh.add(back);})();
s.add(v45Mesh);

// 粉色氛围灯
const v45L1=new THREE.PointLight('#ff69b4',10,40,1.5);
v45L1.position.set(0.58,90.60,-99.52);s.add(v45L1);
const v45L2=new THREE.PointLight('#ff69b4',10,40,1.5);
v45L2.position.set(0.58,2.60,-99.52);s.add(v45L2);

v45Mesh.userData={isVideo45:true};
// iG.push(v45Mesh) 在 iG 数组创建之后

v45El.addEventListener('ended',function(){
  v45Count++;
  if(v45Count<v45Targets[v45Idx]){
    v45El.currentTime=0;
    v45El.play().catch(function(){});
  }else{
    v45Count=0;
    v45Idx++;
    if(v45Idx<v45Sources.length){
      // 切换到视频5
      v45El.muted=true;
      v45Mesh.visible=false;
      v45El.pause();
      v45El.src=v45Sources[v45Idx];
      v45El.load();
      setTimeout(function(){
        v45Mesh.visible=true;
        if(vidStarted){v45El.muted=false;v45El.volume=0.5;}else{v45El.muted=true;}
        playWhenReady(v45El);
      },300);
    }else{
      // 全部播完 → 循环回视频1,继续按序播放
      v45El.muted=true;
      v45Mesh.visible=false;
      v45El.pause();
      startVidSeq();
    }
  }
});

function startVideo45(){
  v45Idx=0;v45Count=0;
  v45El.src=v45Sources[0];
  v45El.load();
  v45Mesh.visible=true;
  if(vidStarted){v45El.muted=false;v45El.volume=0.5;}else{v45El.muted=true;}
  playWhenReady(v45El);
}

// 加载即开始顺序播放(未交互前静音自动播,远处就能看到画面)
// 等 siteconfig 到达再开首轮(普通模式要下架 2 号;10 秒兜底按普通模式开播,模式后到者下一轮生效)
(function waitMode(){
  if(ctx.mode.siteMode){startVidSeq();return;}
  waitMode.n=(waitMode.n||0)+1;
  if(waitMode.n>20)startVidSeq();else setTimeout(waitMode,500);
})();
// 用户首次交互后开启声音
// 用户首次交互后强制开声音(vidStarted 只作标签,不挡开声;曾被它挡住导致全程无声)
function tryPlayVid(){if(!vidEl.muted)return;vidEl.muted=false;vidEl.volume=0.5;vidEl.play().catch(function(){});}
document.addEventListener('click',tryPlayVid,{once:true});
document.addEventListener('touchstart',tryPlayVid,{once:true});

// 昆仑灵鉴:户外大屏氛围小字(右下角,不抢戏)
const skyNote=document.createElement('div');
skyNote.textContent='昆仑没有日夜。你来了，天就亮了。';
skyNote.style.cssText='position:fixed;right:12px;bottom:12px;z-index:15;color:rgba(255,200,220,0.35);font-size:10px;letter-spacing:2px;pointer-events:none;font-family:inherit';
document.body.appendChild(skyNote);

// 昆仑灵鉴 TTS:昆仑开口(经 /api/tts 代理,edge-tts 中文女声;失败静默,不打扰页面)
function kunlunSpeak(text){
  try{
    if(!text)return;
    const a=new Audio('/api/tts?text='+encodeURIComponent(text));
    a.play().catch(()=>{});
  }catch(e){}
}

// 昆仑灵鉴:开场欢迎语——浏览器禁止无交互发声,故挂在首次点按上(每会话一次)
if(!sessionStorage.getItem('kunlunWelcomed')){
  document.addEventListener('pointerdown',function(){
    sessionStorage.setItem('kunlunWelcomed','1');
    kunlunSpeak('凡人一念，可补天缺。欢迎来到梦幻画廊·昆仑灵鉴。');
  },{once:true});
}

// ===================== 音乐（HTML5 Audio 播放MP3）=====================
// 懒加载:首次点击按钮时才设置 src 发起请求,避免页面加载就下载整个音频
let mA=new Audio(),mOn=false,mAReady=false,mIdx2=0;
function ensureMusic(){
  if(mAReady)return;
  mAReady=true;mA.src='music/background.mp3';mA.loop=true;mA.volume=0.5;mA.preload='auto';
  // 拉取音乐目录:background.mp3 播完后,循环播放上传的其他音乐(后台上传立即生效)
  fetch('/api/files?dir=music').then(function(r){return r.json()}).then(function(d){
    const others=(d.music||[]).map(function(f){return f.url}).filter(function(u){return u!=='/music/background.mp3'});
    if(!others.length)return;
    mA.loop=false;
    mA.addEventListener('ended',function(){
      mA.src=others[mIdx2%others.length];mIdx2++;
      mA.play().catch(function(){});
    });
  }).catch(function(){});
}
aB.addEventListener('click',()=>{
  ensureMusic();
  if(!mOn){
    mA.play().then(()=>{
      mOn=true;aB.textContent='音乐播放中';aB.classList.add('p');
    }).catch(e=>{alert('音乐播放失败: '+((e&&e.name)||e)+'\n请把这条提示告诉开发者');});
  }else{
    if(mA.paused){mA.play();aB.textContent='音乐播放中';aB.classList.add('p');}
    else{mA.pause();aB.textContent='音乐已暂停';aB.classList.remove('p');}
  }
});

Object.assign(ctx.media,{drawMusicCanvas,vidEl,vidTex,vidMesh,v45El,v45Tex,v45Mesh,mA}); // mA:背景音乐,上传提示音需要暂停它
ctx.ui.kunlunSpeak=kunlunSpeak;
// 诊断钩子:性能探针(perf-probe.js)读取视频丢帧数据用
window.__vidEl=vidEl;window.__v45El=v45El;
