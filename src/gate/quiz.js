// quiz.js — 温柔度测试（DOM弹窗逻辑 + 3D墙面测试面板）
import * as THREE from 'three';
import {ctx} from '../ctx.js';
import { expose } from '../debug-hooks.js';
const {s,iG}=ctx;

// ===== 温柔度测试逻辑 =====
const gentleQ=[
{q:'看到小猫在阳光下打盹，你会？',o:[{t:'静静看着，不想打扰它',s:20},{t:'轻轻摸一摸它的小脑袋',s:15},{t:'拍照发朋友圈',s:8},{t:'把它叫醒陪自己玩',s:0}]},
{q:'朋友难过时默默流泪，你会？',o:[{t:'静静陪在身边，递上纸巾',s:20},{t:'讲笑话逗她开心',s:15},{t:'帮她分析问题找办法',s:10},{t:'让她自己冷静一会儿',s:5}]},
{q:'你最喜欢的天气是？',o:[{t:'微风拂面的温暖春日',s:20},{t:'细雨绵绵的安静黄昏',s:18},{t:'大雪纷飞的浪漫夜晚',s:15},{t:'阳光明媚的晴朗早晨',s:10}]},
{q:'收到一份手工制作的礼物，你会？',o:[{t:'感动得眼眶湿润',s:20},{t:'仔细珍藏起来',s:16},{t:'马上回赠一份礼物',s:12},{t:'开心地说谢谢',s:8}]},
{q:'看到樱花缓缓飘落，你会想到？',o:[{t:'美好总是短暂，要珍惜当下',s:20},{t:'好美，想永远记住这一刻',s:18},{t:'明年樱花还会再开的',s:12},{t:'落在地上打扫起来好麻烦',s:2}]}
];
let gCur=0,gScore=0,gAns=[];

expose('startGentleTest',function(){
  document.getElementById('gtStart').style.display='none';
  document.getElementById('gtQuiz').style.display='block';
  document.getElementById('gtResult').style.display='none';
  gCur=0;gScore=0;gAns=[];
  renderGQ();
});
expose('nextGentleQ',function(){
  if(gAns[gCur]===undefined)return;
  gCur++;
  if(gCur>=gentleQ.length){showGentleResult();}
  else{renderGQ();}
});
function renderGQ(){
  const qd=document.getElementById('gtQD');
  const q=gentleQ[gCur];
  let h='<div class="gtQ"><div class="gtQL">'+(gCur+1)+'. '+q.q+'</div>';
  q.o.forEach((opt,idx)=>{
    const sel=gAns[gCur]===idx?'sel':'';
    h+='<button class="gtO '+sel+'" onclick="selectGentleO('+idx+','+opt.s+')">'+String.fromCharCode(65+idx)+'. '+opt.t+'</button>';
  });
  h+='</div>';
  qd.innerHTML=h;
  document.getElementById('gtProgF').style.width=((gCur/gentleQ.length)*100)+'%';
  document.getElementById('gtNext').style.display=gAns[gCur]!==undefined?'block':'none';
}
expose('selectGentleO',function(idx,score){
  gAns[gCur]=idx;gScore+=score;
  renderGQ();
};
function showGentleResult(){
  document.getElementById('gtQuiz').style.display='none';
  const rE=document.getElementById('gtResult');
  rE.style.display='block';
  const pct=Math.round((gScore/100)*100);
  document.getElementById('gtScore').textContent=pct;
  const rt=document.getElementById('gtRT'),rd=document.getElementById('gtRD');
  if(pct>=90){rt.textContent='你是温柔本身';rd.textContent='像春风化雨，像暖阳拂面，你的一言一行都浸润着令人心安的温柔。与你相识的人，都会被这份柔软深深治愈。你的温柔不是刻意，而是本能。';document.getElementById('gtRH').textContent='\u{1F338}';}
  else if(pct>=75){rt.textContent='你很温柔，像一杯温热的奶茶';rd.textContent='你的温柔藏在细节里，一句关心的问候，一个体贴的举动，都让人倍感温暖。你是那种会让人想靠近的人。';document.getElementById('gtRH').textContent='\u{1F339}';}
  else if(pct>=55){rt.textContent='你有温柔的一面，像秋天的阳光';rd.textContent='你的温柔不会时时展露，但在重要时刻，你总能给人恰到好处的温暖。学会多表达，你的温柔会更动人。';document.getElementById('gtRH').textContent='\u{1F33A}';}
  else if(pct>=35){rt.textContent='你的温柔藏在心底，等待被发现';rd.textContent='你有柔软的心，只是习惯用坚强包裹自己。试着对身边的人多一些表达，你会发现温柔的力量。';document.getElementById('gtRH').textContent='\u{1F33C}';}
  else{rt.textContent='你是个酷酷的人，温柔是你的另一面';rd.textContent='你的表达方式与众不同，但内心深处同样有柔软。偶尔展露温柔，会让人觉得你更加真实可爱。';document.getElementById('gtRH').textContent='\u{1F33B}';}
  // 动画计数
  let n=0;const t=setInterval(()=>{n+=2;if(n>=pct){n=pct;clearInterval(t);}document.getElementById('gtScore').textContent=n;},30);
}
expose('restartGentleTest',function(){
  document.getElementById('gtResult').style.display='none';
  document.getElementById('gtStart').style.display='block';
});
expose('closeGentleTest',function(){
  const gtP=document.getElementById('gtP');
  gtP.classList.remove('show');
  setTimeout(()=>{gtP.style.display='none';expose('restartGentleTest')();},500);
});

// ===== 3D墙面温柔度测试面板（E厅西墙 x=-8, z=-7.5，面朝东）=====
(function(){
  // 问卷数据
  const qs=[
    {q:'看到小猫在阳光下打盹，你会？',o:['静静看着，不想打扰它','轻轻摸一摸它的小脑袋','拍照发朋友圈','把它叫醒陪自己玩'],s:[20,15,8,0]},
    {q:'朋友难过时默默流泪，你会？',o:['静静陪在身边，递上纸巾','讲笑话逗她开心','帮她分析问题找办法','让她自己冷静一会儿'],s:[20,15,10,5]},
    {q:'你最喜欢的天气是？',o:['微风拂面的温暖春日','细雨绵绵的安静黄昏','大雪纷飞的浪漫夜晚','阳光明媚的晴朗早晨'],s:[20,18,15,10]},
    {q:'收到一份手工制作的礼物，你会？',o:['感动得眼眶湿润','仔细珍藏起来','马上回赠一份礼物','开心地说谢谢'],s:[20,16,12,8]},
    {q:'看到樱花缓缓飘落，你会想到？',o:['美好总是短暂，要珍惜当下','好美，想永远记住这一刻','明年樱花还会再开的','落在地上打扫起来好麻烦'],s:[20,18,12,2]}
  ];
  const W=1024,H=1536;
  let curQ=-1,totalS=0,selIdx=-1;

  // Canvas（高分辨率）
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d');

  // 绘制函数（兼容版，不用roundRect）
  function drawPanel(){
    try{
    // 背景
    x.fillStyle='#1a0a12';x.fillRect(0,0,W,H);
    // 边框
    x.strokeStyle='rgba(255,130,170,0.4)';x.lineWidth=6;x.strokeRect(16,16,W-32,H-32);

    if(curQ===-1){
      // 标题页
      x.fillStyle='#ffb6c8';x.font='bold 72px serif';x.textAlign='center';
      x.fillText('\u2665',W/2,260);
      x.fillStyle='#ffd0d8';x.font='bold 56px "Noto Serif SC",serif';
      x.fillText('温柔度测试',W/2,380);
      x.fillStyle='rgba(255,180,200,0.6)';x.font='28px Arial';
      x.fillText('GENTLENESS TEST',W/2,440);
      x.fillStyle='rgba(255,200,220,0.7)';x.font='32px serif';
      x.fillText('每个人心中都住着一片花园',W/2,600);
      x.fillText('你的温柔，是花开的声音',W/2,660);
      x.fillStyle='rgba(255,180,200,0.4)';x.font='26px Arial';
      x.fillText('共5题 \u00b7 测出你的温柔指数',W/2,800);
      // 开始按钮区域
      x.fillStyle='rgba(255,100,150,0.2)';x.fillRect(260,960,504,120);
      x.strokeStyle='rgba(255,130,170,0.5)';x.lineWidth=4;x.strokeRect(260,960,504,120);
      x.fillStyle='#ff8fab';x.font='bold 36px serif';x.fillText('点击开始',W/2,1040);
    }else if(curQ<qs.length){
      // 题目页
      const q=qs[curQ];
      x.fillStyle='rgba(255,180,200,0.4)';x.font='24px Arial';x.textAlign='center';
      x.fillText('第 '+(curQ+1)+' / '+qs.length+' 题',W/2,76);
      // 进度条
      x.fillStyle='rgba(255,130,170,0.15)';x.fillRect(80,110,W-160,8);
      x.fillStyle='rgba(255,130,170,0.6)';x.fillRect(80,110,(W-160)*((curQ+(selIdx>=0?1:0))/qs.length),8);
      // 题目
      x.fillStyle='#ffd0d8';x.font='bold 36px "Noto Serif SC",serif';x.textAlign='left';
      wrapText(x,q.q,80,220,W-160,52);
      // 选项
      x.textAlign='left';
      for(let i=0;i<q.o.length;i++){
        const y=480+i*230;
        x.fillStyle=selIdx===i?'rgba(255,100,150,0.3)':'rgba(255,130,170,0.08)';
        x.fillRect(70,y-20,W-140,180);
        x.strokeStyle=selIdx===i?'rgba(255,130,170,0.6)':'rgba(255,130,170,0.2)';
        x.lineWidth=3;x.strokeRect(70,y-20,W-140,180);
        x.fillStyle=selIdx===i?'#ff8fab':'rgba(255,180,200,0.6)';
        x.font='bold 40px Arial';
        x.fillText(String.fromCharCode(65+i),110,y+50);
        x.fillStyle=selIdx===i?'#ffe8f0':'#ffe0e8';
        x.font='30px serif';
        wrapText(x,q.o[i],180,y+16,W-280,44);
      }
      // 下一题按钮
      if(selIdx>=0){
        x.fillStyle='rgba(255,100,150,0.25)';x.fillRect(320,1420,384,88);
        x.strokeStyle='rgba(255,130,170,0.5)';x.lineWidth=3;x.strokeRect(320,1420,384,88);
        x.fillStyle='#ff8fab';x.font='bold 30px serif';x.textAlign='center';
        x.fillText(curQ<qs.length-1?'下一题':'查看结果',W/2,1476);
      }
    }else{
      // 结果页
      const pct=Math.min(Math.round((totalS/100)*100),100);
      x.fillStyle='rgba(255,180,200,0.5)';x.font='24px Arial';x.textAlign='center';
      x.fillText('你的温柔指数',W/2,120);
      x.fillStyle='#ff8fab';x.font='bold 160px Arial';
      x.fillText(pct+'',W/2,320);
      x.fillStyle='rgba(255,180,200,0.5)';x.font='32px Arial';
      x.fillText('分',W/2+100,320);
      x.fillStyle='#ffd0d8';x.font='bold 40px serif';
      let ev='',ed='',eh='';
      if(pct>=90){ev='你是温柔本身';ed='像春风化雨，像暖阳拂面，你的一言一行都浸润着令人心安的温柔。';eh='\u{1F338}';}
      else if(pct>=75){ev='你很温柔，像一杯温热的奶茶';ed='你的温柔藏在细节里，一句关心的问候，一个体贴的举动，都让人倍感温暖。';eh='\u{1F339}';}
      else if(pct>=55){ev='你有温柔的一面，像秋天的阳光';ed='你的温柔不会时时展露，但在重要时刻，你总能给人恰到好处的温暖。';eh='\u{1F33A}';}
      else if(pct>=35){ev='你的温柔藏在心底，等待被发现';ed='你有柔软的心，只是习惯用坚强包裹自己。试着对身边的人多一些表达。';eh='\u{1F33C}';}
      else{ev='你是个酷酷的人，温柔是你的另一面';ed='你的表达方式与众不同，但内心深处同样有柔软。偶尔展露温柔，会更可爱。';eh='\u{1F33B}';}
      x.fillText(eh,W/2,400);
      x.fillStyle='#ffb6c8';x.font='bold 36px serif';
      x.fillText(ev,W/2,520);
      x.fillStyle='rgba(255,200,220,0.75)';x.font='28px serif';
      wrapText(x,ed,100,600,W-200,48);
      // 再测一次
      x.fillStyle='rgba(255,100,150,0.2)';x.fillRect(260,1240,504,110);
      x.strokeStyle='rgba(255,130,170,0.4)';x.lineWidth=4;x.strokeRect(260,1240,504,110);
      x.fillStyle='#ff8fab';x.font='bold 32px serif';x.fillText('再测一次',W/2,1310);
    }
    tex.needsUpdate=true;
    }catch(e){console.error('drawPanel error:',e);}
  }

  // 文字换行辅助
  function wrapText(ctx,text,x,y,maxW,lineH){
    const words=text.split('');let line='';
    for(let n=0;n<words.length;n++){
      const testLine=line+words[n];
      const metrics=ctx.measureText(testLine);
      if(metrics.width>maxW&&n>0){ctx.fillText(line,x,y);line=words[n];y+=lineH;}
      else line=testLine;
    }
    ctx.fillText(line,x,y);
  }

  // 处理点击（UV坐标）
  function handleClick(uv){
    const cx=uv.x*W,cy=(1-uv.y)*H;
    // 点击视觉反馈：emissive闪烁
    const oldE=mat.emissiveIntensity;
    mat.emissiveIntensity=0.5;
    setTimeout(()=>{mat.emissiveIntensity=oldE;},150);

    if(curQ===-1){
      // 标题页：点击开始按钮区域（260,960 ~ 764,1080）
      if(cx>260&&cx<764&&cy>960&&cy<1080){curQ=0;selIdx=-1;totalS=0;drawPanel();}
    }else if(curQ<qs.length){
      // 选项点击区域
      if(selIdx<0){
        for(let i=0;i<4;i++){
          const y=480+i*230;
          if(cx>70&&cx<W-70&&cy>y-20&&cy<y+160){selIdx=i;totalS+=qs[curQ].s[i];drawPanel();return;}
        }
      }
      // 下一题按钮（320,1420 ~ 704,1508）
      if(selIdx>=0&&cx>320&&cx<704&&cy>1420&&cy<1508){curQ++;selIdx=-1;drawPanel();}
    }else{
      // 结果页：再测一次（260,1240 ~ 764,1350）
      if(cx>260&&cx<764&&cy>1240&&cy<1350){curQ=-1;selIdx=-1;totalS=0;drawPanel();}
    }
  }

  // 创建面板（2.5x3.5m 大图，填满墙面）
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  tex.minFilter=THREE.LinearFilter;
  const mat=new THREE.MeshStandardMaterial({map:tex,roughness:0.4,metalness:0.1,emissive:'#ff8fab',emissiveIntensity:0.08});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.8),mat);
  mesh.position.set(-8,2.2,-7.5);mesh.rotation.y=Math.PI/2;
  s.add(mesh);
  const pl=new THREE.PointLight('#ff8fab',2,4,1.5);pl.position.set(-7.5,2.2,-7.5);s.add(pl);

  // 标记为问卷面板
  mesh.userData={isWallQuiz:true,handleClick:handleClick};
  iG.push(mesh);

  // 初始绘制
  drawPanel();
})();
