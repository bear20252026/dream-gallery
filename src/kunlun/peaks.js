// peaks.js — 昆仑巅彩蛋(2026-07-25 主人定)
// 海拔 ≥90m:播放《登飞来峰》语音一次(music/登飞来峰.m4a)
// 海拔 ≥100m:在玩家正前方生成视频屏,自动播放 videos/1000005388.mp4,播完自隐
// 彩蛋音频/视频播放期间,户外大屏 5 视频循环自动暂停并不再加载(media.js 读 ctx.media.bigScreenHold)
// 降到 80/90m 以下重新武装;不加任何灯(守手机灯光规矩)
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
const {s}=ctx;

let armed90=true,armed100=true;
let vidMesh=null,vidEl=null;

// 热更新清理:语音/彩蛋视频是模块运行期创建的,s.add 捕获不到,需手动收尾
const bag=hotBegin('peaks');
bag.custom.push(()=>{
  try{flyAudio.pause();}catch(e){}
  if(vidMesh){s.remove(vidMesh);vidMesh=null;}
  if(vidEl){try{vidEl.pause();}catch(e){}vidEl=null;}
});

// 大屏挂起/恢复:彩蛋期间 ctx.media.vidEl/v45El 暂停且不加载下一段
function holdBigScreen(on){
  ctx.media.bigScreenHold=on;
  for(const el of [ctx.media.vidEl,ctx.media.v45El]){
    if(!el)continue;
    if(on){if(!el.paused)el.pause();}
    else{if(el.paused&&el.readyState>=2)el.play().catch(function(){});}
  }
}

// 《登飞来峰》语音
const flyAudio=new Audio('music/登飞来峰.m4a');
ctx.kunlun.flyAudio=flyAudio; // 上传提示音需要暂停它
flyAudio.volume=0.85;
flyAudio.preload='auto';
flyAudio.addEventListener('ended',function(){holdBigScreen(false);});
flyAudio.addEventListener('error',function(){holdBigScreen(false);});

// 海拔 100m 视频屏:位置根据人物位置与朝向定,保证当时能看见
function showPeakVideo(){
  if(vidMesh)return;
  const pl=ctx.player.pl;if(!pl)return;
  const fx=-Math.sin(pl.y),fz=-Math.cos(pl.y);
  vidEl=document.createElement('video');
  ctx.kunlun.peakVidEl=vidEl; // 上传提示音需要暂停它(未挂 DOM,querySelectorAll 抓不到)
  vidEl.src='videos/1000005388.mp4';
  vidEl.crossOrigin='anonymous';
  vidEl.playsInline=true;
  vidEl.volume=0.7;
  vidEl.preload='auto';
  const tex=new THREE.VideoTexture(vidEl);
  tex.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshBasicMaterial({map:tex,toneMapped:false,side:THREE.DoubleSide,transparent:true,opacity:0});
  vidMesh=new THREE.Mesh(new THREE.PlaneGeometry(16,9),mat);
  // 玩家前方 14m、眼高 +6,正对玩家
  vidMesh.position.set(pl.p.x+fx*14,pl.p.y+6,pl.p.z+fz*14);
  vidMesh.lookAt(pl.p.x,pl.p.y+1.6,pl.p.z);
  s.add(vidMesh);
  // 淡入
  const t0=performance.now();
  (function fade(){
    const p=Math.min((performance.now()-t0)/800,1);
    mat.opacity=p;
    if(p<1&&vidMesh)requestAnimationFrame(fade);
  })();
  vidEl.play().catch(function(){});
  vidEl.addEventListener('ended',hidePeakVideo);
}
function hidePeakVideo(){
  if(!vidMesh)return;
  const mat=vidMesh.material;
  const t0=performance.now(),m=vidMesh;
  (function fade(){
    const p=Math.min((performance.now()-t0)/800,1);
    mat.opacity=1-p;
    if(p<1){requestAnimationFrame(fade);}
    else{
      s.remove(m);
      if(vidEl){vidEl.pause();vidEl.src='';vidEl=null;}
      if(vidMesh===m)vidMesh=null;
      holdBigScreen(false); // 彩蛋结束,大屏循环恢复
    }
  })();
}

let lastChk=0;
ctx.onTick(function(){
  const now=performance.now();
  if(now-lastChk<250)return;
  lastChk=now;
  const pl=ctx.player.pl;
  if(!pl)return;
  // 空中永恒展厅内不触发(展厅海拔400m,否则会误唤飞来峰语音/彩蛋视频糊进展厅)
  if(ctx.kunlun.eternalKeepOut&&ctx.kunlun.eternalKeepOut(pl.p.x,pl.p.z))return;
  if(ctx.kunlun.flightLock)return; // 飞舟巡礼中(ark.js)不触发海拔彩蛋:航线会穿越90/100m触发线
  const alt=pl.p.y;
  // 90m:登飞来峰语音(期间大屏挂起)
  if(alt>=90&&armed90){
    armed90=false;
    holdBigScreen(true);
    flyAudio.currentTime=0;
    flyAudio.play().catch(function(){holdBigScreen(false);});
  }
  if(alt<80)armed90=true;
  // 100m:彩蛋视频(期间大屏挂起)
  if(alt>=100&&armed100){
    armed100=false;
    holdBigScreen(true);
    showPeakVideo();
  }
  if(alt<90)armed100=true;
});

hotEnd('peaks');
if(import.meta.hot)import.meta.hot.accept();
