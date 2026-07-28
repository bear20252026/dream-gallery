// prologue.js — 冷启动·互动序章(设计文档序幕,2026-07-27 主人定稿落地)
// 只在玩家第一次打开时播放一次(localStorage kunlunPrologueDone);全程约 30 秒:
// 黑屏旁白「三千年了」→ 残镜浮现(古铜边框+蛛网裂纹)→ 镜中四幕回放(女娲碎石→碎末入人间→
// 落入照片信纸→万张照片翻飞)→ 镜面浮现「你愿意让它重新亮起来吗?」+「我愿意/让我再想想」。
// 选「我愿意」:裂痕消退泛起金光 → 淡出 → 自动拉开《心象共鸣》答题卷轴;3 秒无操作视同「我愿意」。
// 选「让我再想想」:序章淡出,右下角留一面暗哑小残镜,随时点开重新选择。
// 无 3D 资产,全 DOM/CSS(与 finale.js 心象投影同工艺);TTS 走 ctx.ui.kunlunSpeak,失败静默。
import {ctx} from '../ctx.js';
import {hotBegin,hotEnd} from '../hot.js';
const bag=hotBegin('prologue');

// 存档键已登记入 store.js(name:'prologueDone');测试/探针可用 ?noprologue 或提前 localStorage 置位跳过
let ov=null,mirrorBtn=null,timers=[],dead=false,ovApi=null;
function later(fn,ms){const t=setTimeout(()=>{if(!dead)fn();},ms);timers.push(t);return t;}
function speak(t){try{ctx.ui.kunlunSpeak&&ctx.ui.kunlunSpeak(t);}catch(e){}}

// ===================== 残镜(SVG:古铜椭圆框 + 蛛网裂纹 + 灰尘) =====================
function mirrorSVG(){
  // 裂纹:从镜心向边缘的 7 条折线
  const cx=100,cy=140;
  const ends=[[100,18],[160,50],[176,140],[150,228],[100,262],[50,228],[24,140],[42,52]];
  let cracks='';
  ends.forEach((e,i)=>{
    const mx=(cx+e[0])/2+(i%2?14:-12),my=(cy+e[1])/2+(i%3?-10:12);
    cracks+='<path d="M'+cx+' '+cy+' L'+mx+' '+my+' L'+e[0]+' '+e[1]+'" stroke="rgba(220,200,170,.55)" stroke-width="1" fill="none"/>';
  });
  return '<svg viewBox="0 0 200 280" style="width:min(46vw,240px);height:auto;display:block;filter:drop-shadow(0 0 40px rgba(160,120,60,.25))">'
    +'<ellipse cx="100" cy="140" rx="86" ry="126" fill="rgba(24,20,16,.92)" stroke="#8a6a3a" stroke-width="7"/>'
    +'<ellipse cx="100" cy="140" rx="78" ry="118" fill="url(#mg)" stroke="rgba(200,170,120,.35)" stroke-width="1.5"/>'
    +'<defs><radialGradient id="mg" cx="50%" cy="42%" r="70%">'
    +'<stop offset="0%" stop-color="rgba(90,80,66,.55)"/><stop offset="60%" stop-color="rgba(40,36,30,.85)"/><stop offset="100%" stop-color="rgba(20,18,15,.95)"/>'
    +'</radialGradient></defs>'
    +'<g class="pl-cracks">'+cracks+'</g>'
    // 灰尘:一层半透明噪点感椭圆
    +'<ellipse cx="100" cy="140" rx="78" ry="118" fill="rgba(120,110,95,.10)"/>'
    +'</svg>';
}

// ===================== 主流程 =====================
function build(){
  ov=document.createElement('div');
  ov.id='prologueOv';
  ov.style.cssText='position:fixed;inset:0;z-index:500;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:inherit;opacity:1;transition:opacity 1.2s';
  document.body.appendChild(ov);
  ovApi=ctx.overlay.register(ov,{touchOnly:true}); // 序章一次性全屏:只进触摸白名单,Esc/收尾自管
  // 跳过(三铁律之退出保障;位置低调,不破坏"没有开始按钮"的氛围)
  const skip=document.createElement('button');
  skip.textContent='跳过序章 ▸';
  skip.style.cssText='position:absolute;right:16px;bottom:14px;z-index:502;background:none;border:none;color:rgba(255,255,255,.28);font-size:11px;letter-spacing:2px;cursor:pointer;font-family:inherit';
  skip.onclick=()=>finish(false);
  ov.appendChild(skip);
}
function onKey(e){if(e.key==='Escape'&&ov){finish(false);}}

function line(txt,ms,tts){
  return new Promise(res=>{
    if(dead)return res();
    const d=document.createElement('div');
    d.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:84vw;text-align:center;font-size:clamp(20px,5vw,30px);letter-spacing:4px;color:#e8dcc4;text-shadow:0 2px 18px rgba(0,0,0,.9);line-height:2;opacity:0;transition:opacity 1s';
    d.textContent=txt;ov.appendChild(d);
    requestAnimationFrame(()=>{d.style.opacity='1';});
    if(tts)speak(tts);
    later(()=>{d.style.opacity='0';later(()=>{d.remove();res();},1000);},ms);
  });
}

// 镜中四幕回放(文字卡+微粒,约 14 秒)
const SCENES=[
  ['她站在天际，手中托着一块莹白透光的石头','rgba(255,244,214,.9)'],
  ['她震碎石头。碎末如雪，飘向人间','rgba(230,230,255,.85)'],
  ['碎末落入手机屏幕、老照片、泛黄的信纸','rgba(255,220,170,.85)'],
  ['无数张照片，在风中翻飞','rgba(255,200,150,.8)'],
];
function replay(){
  return new Promise(async res=>{
    for(let i=0;i<SCENES.length;i++){
      if(dead)return res();
      const d=document.createElement('div');
      d.style.cssText='position:absolute;left:50%;top:62%;transform:translateX(-50%);width:86vw;text-align:center;font-size:clamp(14px,3.4vw,18px);letter-spacing:2px;color:'+SCENES[i][1]+';text-shadow:0 1px 10px rgba(0,0,0,.9);line-height:1.9;opacity:0;transition:opacity .9s';
      d.textContent=SCENES[i][0];ov.appendChild(d);
      requestAnimationFrame(()=>{d.style.opacity='1';});
      await new Promise(r=>later(r,3200));
      d.style.opacity='0';later(()=>d.remove(),900);
    }
    res();
  });
}

// 抉择:我愿意 / 让我再想想(3 秒无操作自动"我愿意")
function choose(){
  return new Promise(res=>{
    if(dead)return res(true);
    const q=document.createElement('div');
    q.style.cssText='position:absolute;left:50%;top:66%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity 1.2s';
    q.innerHTML='<div style="font-size:clamp(17px,4.4vw,24px);letter-spacing:3px;color:#ffe9c4;text-shadow:0 0 24px rgba(255,200,100,.5);margin-bottom:18px">你愿意让它重新亮起来吗？</div>';
    const row=document.createElement('div');row.style.cssText='display:flex;gap:14px;justify-content:center';
    const yes=document.createElement('button');yes.textContent='我愿意';
    const no=document.createElement('button');no.textContent='让我再想想';
    const bs='padding:12px 30px;border-radius:26px;font-size:15px;letter-spacing:3px;cursor:pointer;font-family:inherit;';
    yes.style.cssText=bs+'border:1px solid rgba(255,214,130,.85);background:rgba(120,80,25,.45);color:#ffe9c4';
    no.style.cssText=bs+'border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:rgba(255,255,255,.75)';
    const bar=document.createElement('div'); // 3 秒自动"我愿意"倒计时细条
    bar.style.cssText='margin:16px auto 0;width:180px;height:2px;background:rgba(255,214,130,.15);position:relative;overflow:hidden;border-radius:2px';
    const fill=document.createElement('div');
    fill.style.cssText='position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(255,214,130,.8);transition:width 3s linear';
    bar.appendChild(fill);
    row.appendChild(yes);row.appendChild(no);q.appendChild(row);q.appendChild(bar);
    ov.appendChild(q);
    requestAnimationFrame(()=>{q.style.opacity='1';fill.style.width='100%';});
    let done=false;
    const fin=v=>{if(done)return;done=true;q.style.opacity='0';later(()=>{q.remove();res(v);},600);};
    yes.onclick=()=>fin(true);
    no.onclick=()=>fin(false);
    later(()=>fin(true),3000); // 文档:3 秒无操作自动进入「我愿意」
  });
}

function glowAndFade(){
  return new Promise(res=>{
    // 裂痕消退 + 金光泛起
    const cr=ov.querySelector('.pl-cracks');
    if(cr){cr.style.transition='opacity 1.2s';cr.style.opacity='0';}
    const glow=document.createElement('div');
    glow.style.cssText='position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:60vmin;height:60vmin;border-radius:50%;background:radial-gradient(circle,rgba(255,214,130,.55),rgba(255,180,80,.18) 55%,transparent 72%);opacity:0;transition:opacity 1.4s;pointer-events:none';
    ov.appendChild(glow);
    requestAnimationFrame(()=>{glow.style.opacity='1';});
    speak('残镜之上，裂痕尽消。昆仑，重新亮起来了。');
    later(res,2200);
  });
}

function leaveDimMirror(){
  // 「让我再想想」:右下角留一面暗哑小残镜,点开重新抉择
  mirrorBtn=document.createElement('button');
  mirrorBtn.id='prologueMirror';
  mirrorBtn.textContent='🪞';
  mirrorBtn.title='残镜——它还在等你';
  mirrorBtn.style.cssText='position:fixed;right:14px;bottom:96px;z-index:60;width:44px;height:44px;border-radius:50%;border:1px solid rgba(200,170,120,.4);background:rgba(20,16,12,.75);font-size:20px;cursor:pointer;opacity:.65;filter:grayscale(.6)';
  mirrorBtn.onclick=async ()=>{
    mirrorBtn.style.display='none';
    dead=false; // 重新进入抉择流程,解除终止标记
    document.addEventListener('keydown',onKey);
    ov.style.display='flex';ov.style.opacity='1';
    const ok=await choose();
    if(ok)await accept();else{ov.style.opacity='0';later(()=>{ov.style.display='none';dead=true;timers.forEach(t=>clearTimeout(t));document.removeEventListener('keydown',onKey);},1200);mirrorBtn.style.display='block';}
  };
  document.body.appendChild(mirrorBtn);
}

async function accept(){
  await glowAndFade();
  finish(true);
}

function finish(openQuizAfter){
  if(dead)return;dead=true;
  timers.forEach(t=>clearTimeout(t));
  document.removeEventListener('keydown',onKey);
  const done=()=>{
    if(ovApi){ovApi.unregister();ovApi=null;}
    if(ov){ov.remove();ov=null;}
    if(mirrorBtn&&openQuizAfter!==false){mirrorBtn.remove();mirrorBtn=null;}
    if(openQuizAfter){
      ctx.store.mark('prologueDone');
      ctx.ui.modeToast&&ctx.ui.modeToast('残镜已亮。女娲问心——十问之后，灵蕴自现。');
      // 衔接第一阶段:自动拉开《心象共鸣》答题卷轴(未通过门禁时;dead 已置位,用裸 setTimeout)
      if(!ctx.player.quizPassed&&window.startQuiz)setTimeout(()=>{try{window.startQuiz();}catch(e){}},400);
    }else{
      ctx.ui.modeToast&&ctx.ui.modeToast('序章已跳过——残镜在右下角等你回头。');
      leaveDimMirror();
    }
  };
  if(ov){ov.style.opacity='0';setTimeout(done,1300);}else done();
}

async function run(){
  build();
  document.addEventListener('keydown',onKey);
  await line('三千年了。',2600,'三千年了。');
  if(dead)return;
  // 残镜浮现
  const mir=document.createElement('div');
  mir.style.cssText='position:absolute;left:50%;top:44%;transform:translate(-50%,-50%) scale(.92);opacity:0;transition:opacity 1.6s,transform 1.6s';
  mir.innerHTML=mirrorSVG();
  ov.appendChild(mir);
  requestAnimationFrame(()=>{mir.style.opacity='1';mir.style.transform='translate(-50%,-50%) scale(1)';});
  await new Promise(r=>later(r,1800));
  if(dead)return;
  speak('女娲碎石之前，曾把最后的心愿，封进这面残镜。');
  await replay();
  if(dead)return;
  const ok=await choose();
  if(dead)return;
  if(ok)await accept();
  else{ // 再想想:残镜暗下,序章淡出,留小残镜
    ov.style.opacity='0';
    speak('残镜暗了下去。它不急。它等了你三千年。');
    later(()=>{ov.style.display='none';dead=true;timers.forEach(t=>clearTimeout(t));document.removeEventListener('keydown',onKey);leaveDimMirror();},1300);
  }
}

// 只播一次;测试/探针可用 ?noprologue 或提前 localStorage 置位跳过
if(!ctx.store.flag('prologueDone')&&!/noprologue/.test(location.search)){
  // 法规层优先:三连读(用户协议/隐私指引/社区公约)未签完前序章静候,签完再播;
  // 加载屏 1.2s 退场(见 main.js),序章 2.7s+ 才起,不与 compileAsync 预编译抢主线程
  const waitConsent=()=>{
    if(sessionStorage.getItem('agreementConsented')&&sessionStorage.getItem('privacyConsented')&&sessionStorage.getItem('communityConsented'))later(run,1200);
    else later(waitConsent,1000);
  };
  later(waitConsent,1500);
}

bag.custom.push(()=>{
  dead=true;timers.forEach(t=>clearTimeout(t));
  document.removeEventListener('keydown',onKey);
  if(ov)ov.remove();if(mirrorBtn)mirrorBtn.remove();
});
hotEnd('prologue');
if(import.meta.hot)import.meta.hot.accept();
